import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import * as vscode from 'vscode'
import {
  ACTIVITY_MAX_LINES,
  DETECTION_CACHE_TTL_MS,
  DSH_CLI_BIN,
  LOG_RELOAD_LINES,
  NPX_RUN_COMMAND,
  PORT_PROBE_TIMEOUT_MS,
  PORT_POLL_INTERVAL_MS,
  STOP_POLL_ATTEMPTS,
  STOP_POLL_INTERVAL_MS,
  STOP_POLL_PROBE_MS,
  findOnPath,
  isProcessAlive,
  maskPath,
  psQuote,
  quoteCmdArg,
  resolveDshHome,
  runFile,
  sleep,
} from './common'

// Re-export DeepSeek status/balance for the panel (kept in ds.ts so this
// module stays focused on server lifecycle).
export { fetchDshBalance, getDshBalance, getDsStatus, hasDeepSeekModel } from './ds'

export type DshMode = 'npx' | 'source'

/** dsh binds loopback only; the launcher probes and opens this fixed host. */
const LOOPBACK_HOST = '127.0.0.1'

/** Resolved extension settings (dsh.*). */
export interface DshConfig {
  mode: DshMode
  path: string
  nodePath: string
  port: number
  /** Print module-loading progress in source mode (NODE_DEBUG=module). */
  sourceDebug: boolean
}

export type ConditionState = 'unknown' | 'ok' | 'missing'

export interface ServerStatus {
  running: boolean
  starting: boolean
  url: string
  node: ConditionState
  dsh: ConditionState
  dshVersion: string
  dshSource: string
  dshPath: string
  dshHome: string
  dshPathShort: string
  dshHomeShort: string
  nodeVersion: string
  mode: 'npx' | 'source'
  update: DshUpdate | undefined
  /** Launcher activity log + server stdout/stderr log (full and masked paths). */
  consoleLogPath: string
  consoleLogPathShort: string
  serverLogPath: string
  serverLogPathShort: string
}

export interface DshUpdate {
  hasUpdate: boolean
  label: string
}

let trackedChild: ChildProcess | undefined
let trackedPid: number | undefined
let logPath = ''
let consolePath = ''
let busy: Promise<boolean> | undefined
/** One line in the panel activity feed; `busy` marks an in-progress operation. */
interface ActivityEntry {
  text: string
  busy: boolean
}

const activity: ActivityEntry[] = []
let nodeState: ConditionState = 'unknown'
let dshState: ConditionState = 'unknown'
let starting = false
let logTailWatcher: fs.FSWatcher | undefined
let logTailTimer: ReturnType<typeof setInterval> | undefined
let logTailOffset = 0
let logTailBuffer = ''
let moduleLoadCount = 0
let dshVersion = ''
let dshSource: '' | 'npx' | 'source' = ''
let dshPath = ''
let nodeVersion = ''

export function readConfig(): DshConfig {
  // Read the persisted settings every time: dsh.mode is the single source
  // of truth, so both the panel toggle and the Settings UI stay in sync.
  const c = vscode.workspace.getConfiguration('dsh')
  return {
    mode: c.get<string>('mode') === 'source' ? 'source' : 'npx',
    path: c.get<string>('path') ?? '',
    nodePath: c.get<string>('nodePath') ?? '',
    port: c.get<number>('port') ?? 3080,
    sourceDebug: c.get<boolean>('sourceDebug') ?? false,
  }
}

/** Persist the run mode chosen in the panel toggle and apply it immediately. */
export async function applyMode(mode: 'npx' | 'source'): Promise<void> {
  detectionCache = undefined
  await vscode.workspace.getConfiguration('dsh').update('mode', mode, vscode.ConfigurationTarget.Global)
}

/** Invalidate caches when dsh settings change outside the panel (Settings UI, sync, …). */
export function registerConfigWatcher(): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('dsh')) {
      detectionCache = undefined
      updateCache = undefined
    }
  })
}

export function uiUrl(cfg: DshConfig = readConfig()): string {
  return `http://${LOOPBACK_HOST}:${cfg.port}`
}

export function setLogPath(value: string): void {
  // Separate files: the launcher's own activity log and the server's output
  // log. The server redirects to the latter (holding it open), so keeping
  // them distinct avoids the launcher's writes being lost to file locks.
  consolePath = value
  logPath = value.replace(/\.log$/, '-server.log')
  try {
    if (fs.existsSync(consolePath)) {
      const lines = fs.readFileSync(consolePath, 'utf8').split(/\r?\n/).filter((l) => l.length > 0)
      for (const line of lines.slice(-LOG_RELOAD_LINES)) {
        if (line.includes('[dbg]')) continue
        pushActivity(line)
      }
    }
  } catch {
    // best effort
  }
}

/** Append one entry to the console log file (best effort). */
function appendLog(entry: string): void {
  if (!consolePath) return
  try {
    fs.appendFileSync(consolePath, entry + '\n')
  } catch {
    // best effort
  }
}

/** Append a diagnostic line to the log file only (kept out of the console feed). */
export function dbg(line: string): void {
  appendLog(`[${new Date().toLocaleTimeString()}] [dbg] ${line}`)
}

function pushActivity(entry: string, isBusy = false): void {
  activity.push({ text: entry, busy: isBusy })
  if (activity.length > ACTIVITY_MAX_LINES) activity.splice(0, activity.length - ACTIVITY_MAX_LINES)
}

/** Append one line to the panel activity feed + the log file. */
export function addActivity(line: string, isBusy = false): void {
  const entry = `[${new Date().toLocaleTimeString()}] ${line}`
  pushActivity(entry, isBusy)
  appendLog(entry)
}

/** Append one server-output line to the activity feed only (already in the log file). */
function displayLine(line: string): void {
  const trimmed = line.trimEnd()
  if (!trimmed) return
  // NODE_DEBUG=module is extremely verbose; keep individual lines out of the
  // console feed (they stay in the server log file), but surface a periodic
  // count so a slow source startup still shows progress.
  if (/^MODULE\s/.test(trimmed)) {
    moduleLoadCount++
    if (moduleLoadCount % 500 === 0) {
      pushActivity(`[${new Date().toLocaleTimeString()}] ℹ Loading modules… (${moduleLoadCount})`)
    }
    return
  }
  pushActivity(`[${new Date().toLocaleTimeString()}] ${trimmed}`)
}

/** Append one raw server output line to the activity feed + log file. */
function appendOutput(line: string): void {
  displayLine(line)
  const trimmed = line.trimEnd()
  if (!trimmed) return
  fs.appendFile(logPath, trimmed + '\n', () => {})
}

/** The panel activity feed (Start/Stop command dynamics), newest last. */
export function getActivity(): ActivityEntry[] {
  return activity
}

/** Mark the most recent busy entry as finished (its operation completed). */
export function finishBusy(): void {
  for (let i = activity.length - 1; i >= 0; i--) {
    if (activity[i].busy) {
      activity[i].busy = false
      return
    }
  }
}

/** Size of the persisted console log in bytes (0 when absent). */
export function getConsoleSize(): number {
  if (!consolePath) return 0
  try {
    return fs.statSync(consolePath).size
  } catch {
    return 0
  }
}

/** Non-destructive port probe; resolves without throwing. */
function isPortOpen(host: string, port: number, timeoutMs = PORT_PROBE_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    let socket: net.Socket
    try {
      socket = new net.Socket()
    } catch {
      resolve(false)
      return
    }
    let settled = false
    const finish = (open: boolean): void => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {
        // already closed
      }
      resolve(open)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    try {
      socket.connect(port, host)
    } catch {
      finish(false)
    }
  })
}

/** Whether the web server is serving (an HTTP request succeeds), not just bound. */
async function isHttpReady(host: string, port: number, timeoutMs: number): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(`http://${host}:${port}/`, { signal: controller.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

/** Whether Node.js is present and satisfies the harness engines range (^22.19 || >=24). */
async function checkNode(cfg: DshConfig): Promise<{ ok: boolean; version: string }> {
  const result = await runFile(cfg.nodePath || 'node', ['--version'])
  const version = result.ok ? result.stdout.trim().replace(/^v/, '') : ''
  if (!result.ok) return { ok: false, version: '' }
  const match = /^v?(\d+)\.(\d+)/.exec(result.stdout.trim())
  if (!match) return { ok: false, version }
  const major = Number(match[1])
  const minor = Number(match[2])
  return { ok: major >= 24 || (major === 22 && minor >= 19), version }
}

/** Read the newest @deepseek-ai/dsh version cached under the npx cache. */
function npxCachedDshVersion(): string | undefined {
  const cacheRoot = process.platform === 'win32'
    ? (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'npm-cache') : undefined)
    : path.join(os.homedir(), '.npm')
  if (!cacheRoot) return undefined
  let best: string | undefined
  try {
    for (const entry of fs.readdirSync(path.join(cacheRoot, '_npx'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(cacheRoot, '_npx', entry.name, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8')) as { version?: string }
        const v = pkg?.version
        if (v && (best === undefined || v > best)) best = v
      } catch {
        // no dsh package in this npx slot
      }
    }
  } catch {
    // no npx cache
  }
  return best
}

/** Resolve the latest published @deepseek-ai/dsh version (undefined on failure). */
async function latestDshVersion(): Promise<string | undefined> {
  const result = process.platform === 'win32'
    ? await runFile('cmd', ['/c', 'npm', 'view', '@deepseek-ai/dsh', 'version'], 10_000)
    : await runFile('npm', ['view', '@deepseek-ai/dsh', 'version'], 10_000)
  if (!result.ok) return undefined
  return result.stdout.trim().split(/\r?\n/).pop()?.trim() || undefined
}

/** Prepare the npx start: verify the registry when a download is required, and announce installs. Returns false to abort. */
async function prepareNpxInstall(): Promise<boolean> {
  const cached = npxCachedDshVersion()
  if (cached === undefined) {
    // Nothing cached: npx must download dsh, so verify the registry is
    // reachable first; a network outage should fail fast, not hang the start.
    const latest = await latestDshVersion()
    if (!latest) {
      dshState = 'missing'
      addActivity('✗ dsh is not installed and the npm registry is unreachable — check your network and try again')
      void vscode.window.showErrorMessage('DeepSeek Harness: unable to reach the npm registry to install dsh. Check your network connection.')
      return false
    }
    addActivity(`ℹ dsh v${latest} — npx will install it on first run; this can take a while, please wait`)
    return true
  }
  // Cached: optionally announce an upgrade (best-effort, non-blocking).
  void (async () => {
    const latest = await latestDshVersion()
    if (latest && latest !== cached) {
      addActivity(`ℹ dsh v${latest} is available (cached: v${cached}) — npx will update it before starting; this can take a while`)
    }
  })()
  return true
}
/** Whether `dir` is a deepseek-harness source checkout (or the cli package itself). */
function isDshCheckout(dir: string | undefined): boolean {
  if (!dir) return false
  try {
    if (fs.existsSync(path.join(dir, DSH_CLI_BIN))) return true
    // Also accept pointing directly at the cli package (e.g. .../apps/cli).
    if (fs.existsSync(path.join(dir, 'src', 'bin.ts')) && /apps[\\/]cli$/.test(dir)) return true
    return false
  } catch {
    return false
  }
}

/**
 * Locate a source checkout from the explicit `dsh.path` setting only. A git
 * clone can live anywhere on disk, so the path (or the source-mode folder
 * picker) is the authoritative answer; we do not scan the workspace.
 */
function findSourceCheckout(cfg: DshConfig): string | undefined {
  if (isDshCheckout(cfg.path)) return cfg.path
  return undefined
}

/** Persist the picked dsh path into the dsh.path setting (idempotent). */
async function saveDshPath(value: string): Promise<void> {
  const c = vscode.workspace.getConfiguration('dsh')
  if ((c.get<string>('path') ?? '') !== value) {
    await c.update('path', value, vscode.ConfigurationTarget.Global)
  }
}

/** Ask the user to pick the checkout folder once, then remember it in dsh.path. */
async function pickRepoFolder(): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Select deepseek-harness repo',
    title: 'Select the deepseek-harness source checkout (must contain apps/cli/src/bin.ts)',
  })
  const dir = picked?.[0]?.fsPath
  if (!dir) return undefined
  if (!isDshCheckout(dir)) {
    void vscode.window.showWarningMessage('The selected folder is not a deepseek-harness checkout (missing apps/cli/src/bin.ts).')
    return undefined
  }
  await saveDshPath(dir)
  return dir
}

/** Detect the local dsh version: a source checkout (source mode), else the installed package. */
function detectDshVersion(cfg: DshConfig): void {
  if (cfg.mode === 'source') {
    const checkout = findSourceCheckout(cfg)
    if (!checkout) {
      // No checkout configured: dsh is 'missing', so drop any stale version.
      dshVersion = ''
      return
    }
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(checkout, 'apps', 'cli', 'package.json'), 'utf8'))
      if (pkg?.version) {
        dshVersion = pkg.version
        return
      }
    } catch {
      // fall through to installed package
    }
  }
  // npx mode: only the npx cache counts (npx reinstalls from the registry on demand).
  if (cfg.mode === 'npx') {
    dshVersion = npxCachedDshVersion() ?? ''
    return
  }
  try {
    const link = path.join(resolveDshHome(), 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
    const pkg = JSON.parse(fs.readFileSync(link, 'utf8'))
    if (pkg?.version) {
      dshVersion = pkg.version
      return
    }
  } catch {
    // leave empty
  }
  // Nothing readable anywhere: clear the value instead of showing a stale one.
  dshVersion = ''
}

interface DshDetection {
  state: ConditionState
  source: '' | 'npx' | 'source'
  path: string
}

/** Detect dsh: source mode uses a checkout; npx uses the official npx method. */
async function detectDsh(cfg: DshConfig): Promise<DshDetection> {
  if (cfg.mode === 'source') {
    const checkout = findSourceCheckout(cfg)
    if (checkout) return { state: 'ok', source: 'source', path: checkout }
    return { state: 'missing', source: '', path: '' }
  }
  if (!(await findOnPath('npx'))) return { state: 'missing', source: '', path: '' }
  // npx present: 'ok' only when dsh is already cached; otherwise the first
  // start will download it, so mark it 'unknown' (version stays empty).
  return npxCachedDshVersion() !== undefined
    ? { state: 'ok', source: 'npx', path: '' }
    : { state: 'unknown', source: 'npx', path: '' }
}

/** Run a command in a visible VS Code terminal (used for updates). */
async function runInTerminal(title: string, command: string): Promise<boolean> {
  const task = new vscode.Task(
    { type: 'dsh-shell' },
    vscode.TaskScope.Global,
    title,
    'DeepSeek Harness',
    new vscode.ShellExecution(command),
  )
  const execution = await vscode.tasks.executeTask(task)
  return new Promise<boolean>((resolve) => {
    const disposable = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution === execution) {
        disposable.dispose()
        resolve(event.exitCode === 0)
      }
    })
  })
}

/**
 * Stream the DSH log file (written via cmd redirection by the hidden-console
 * launcher) into the dashboard activity feed as it grows.
 */
function startLogTail(): void {
  stopLogTail()
  logTailBuffer = ''
  try {
    // Ensure the log file exists before watching it, otherwise fs.watch dies
    // on ENOENT and never recovers when cmd later creates the file.
    fs.closeSync(fs.openSync(logPath, 'a'))
    // Stream only output written after this point (the file is appended to).
    logTailOffset = fs.statSync(logPath).size
  } catch {
    logTailOffset = 0
    return
  }
  const pump = (): void => {
    let size: number
    try {
      size = fs.statSync(logPath).size
    } catch {
      return
    }
    if (size < logTailOffset) logTailOffset = 0 // file truncated by a fresh start
    if (size <= logTailOffset) return
    let fd: number | undefined
    try {
      fd = fs.openSync(logPath, 'r')
      const buf = Buffer.alloc(size - logTailOffset)
      const read = fs.readSync(fd, buf, 0, buf.length, logTailOffset)
      logTailOffset += read
      logTailBuffer += buf.subarray(0, read).toString()
      const lines = logTailBuffer.split(/\r?\n/)
      logTailBuffer = lines.pop() ?? ''
      for (const line of lines) displayLine(line)
    } catch {
      // File may be locked mid-write; retry on the next change event.
    } finally {
      if (fd !== undefined) fs.closeSync(fd)
    }
  }
  pump()
  logTailWatcher = fs.watch(logPath, () => pump())
  logTailWatcher.on('error', () => {})
  // fs.watch can miss appends on Windows; poll as a reliable fallback.
  logTailTimer = setInterval(() => pump(), 500)
}

function stopLogTail(): void {
  if (logTailTimer) {
    clearInterval(logTailTimer)
    logTailTimer = undefined
  }
  logTailWatcher?.close()
  logTailWatcher = undefined
  if (logTailBuffer) {
    const trimmed = logTailBuffer.trimEnd()
    if (trimmed) addActivity(trimmed)
    logTailBuffer = ''
  }
}

/**
 * Spawn the DSH server inside a hidden console on Windows. A hidden console
 * (SW_HIDE via Start-Process -WindowStyle Hidden) lets the tool subprocesses
 * DSH spawns (bash/pwsh) attach to it without flashing their own cmd windows,
 * unlike `windowsHide` (CREATE_NO_WINDOW), which leaves them console-less and
 * forces each child to create a new visible window.
 *
 * The server itself runs as `cmd /c ... > log 2>&1` so output lands in the log
 * file that the tailer streams into the dashboard; Start-Process must NOT use
 * -RedirectStandardOutput/Error, because that keeps the parent PowerShell alive
 * until the child exits (a PowerShell quirk with long-running children).
 * `-PassThru` echoes the cmd.exe PID, which stays alive for the server's
 * lifetime (cmd /c blocks on the server process).
 */
function spawnHiddenViaPowerShell(cmd: string, args: string[], cwd: string | undefined, env?: Record<string, string>): void {
  const program = quoteCmdArg(cmd)
  const rest = args.map(quoteCmdArg).join(' ')
  let run = rest ? `${program} ${rest}` : program
  if (env) {
    const setEnv = Object.entries(env).map(([k, v]) => `set ${k}=${v}`).join('&& ')
    run = `${setEnv}&& ${run}`
  }
  const inner = `${run} >> ${quoteCmdArg(logPath)} 2>&1`
  const wd = cwd ? `-WorkingDirectory '${psQuote(cwd)}' ` : ''
  const script =
    `$p = Start-Process -FilePath 'cmd.exe' ${wd}-ArgumentList '/d','/s','/c','${psQuote(inner)}' ` +
    `-WindowStyle Hidden -PassThru; Write-Output "DSH_PID=$($p.Id)"`

  startLogTail()

  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    // NOTE: no `detached` here — on Windows it breaks powershell's stdio and
    // Start-Process (empirically verified). The server survives regardless,
    // because Start-Process launches it as an independent process.
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.unref()
  trackedChild = child

  let pidBuf = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    pidBuf += chunk.toString()
    const m = /DSH_PID=(\d+)/.exec(pidBuf)
    if (m && trackedChild === child) trackedPid = Number(m[1])
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim()
    if (text) addActivity(text)
  })

  child.once('error', (error) => {
    void vscode.window.showErrorMessage(`DeepSeek Harness: failed to start (${error.message}).`)
  })
  child.once('exit', () => {
    trackedChild = undefined
  })
}

/**
 * Spawn the DSH server with no console window (Windows) and stream its
 * stdout/stderr into the dashboard activity feed + log file.
 */
function spawnServer(cmd: string, args: string[], cwd: string | undefined, shell = false, env?: Record<string, string>): void {
  trackedPid = undefined
  starting = true
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  // Each start gets a fresh server log (dsh.clearServerLogOnStart, default on)
  // — otherwise output from every previous run accumulates (NODE_DEBUG=module
  // alone produced a ~90MB file) and mixes with the current run.
  if (vscode.workspace.getConfiguration('dsh').get<boolean>('clearServerLogOnStart') ?? true) {
    try {
      fs.writeFileSync(logPath, '')
    } catch {
      // Best effort: a just-stopped server may still hold the file open.
    }
  }

  const hideConsole = vscode.workspace.getConfiguration('dsh').get<boolean>('hideConsole') ?? true

  if (process.platform === 'win32' && hideConsole) {
    spawnHiddenViaPowerShell(cmd, args, cwd, env)
    return
  }

  const child = spawn(cmd, args, {
    cwd,
    shell,
    windowsHide: hideConsole,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env ? { ...process.env, ...env } : undefined,
  })
  child.unref()
  trackedChild = child

  let outBuffer = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    outBuffer += chunk.toString()
    const lines = outBuffer.split(/\r?\n/)
    outBuffer = lines.pop() ?? ''
    for (const line of lines) appendOutput(line)
  })
  let errBuffer = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    errBuffer += chunk.toString()
    const lines = errBuffer.split(/\r?\n/)
    errBuffer = lines.pop() ?? ''
    for (const line of lines) appendOutput(line)
  })

  child.once('error', (error) => {
    void vscode.window.showErrorMessage(`DeepSeek Harness: failed to start (${error.message}).`)
  })
  child.once('exit', () => {
    trackedChild = undefined
  })
}

/** Source mode: run a checkout via `node --import tsx/esm apps/cli/src/bin.ts web`. */
function spawnSource(repoPath: string, cfg: DshConfig): void {
  const node = cfg.nodePath || 'node'
  dshState = 'ok'
  addActivity('✓ dsh detected (source run)')
  addActivity('ℹ source 启动会用 tsx 即时转译 TypeScript，首次启动较慢，请耐心等待')
  addActivity(`▶ Start: ${node} --import tsx/esm apps/cli/src/bin.ts web --port ${cfg.port}`, true)
  const env = cfg.sourceDebug ? { NODE_DEBUG: 'module' } : undefined
  spawnServer(node, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--port', String(cfg.port)], repoPath, false, env)
}

/** npx mode: run the official `npx @deepseek-ai/dsh web` command. */
function spawnNpm(cfg: DshConfig): void {
  dshState = 'ok'
  addActivity('✓ dsh detected (npx run)')
  addActivity(`▶ Start: ${NPX_RUN_COMMAND} --port ${cfg.port}`, true)
  // Windows: npx is a .cmd shim, so run it through the shell.
  // `--loglevel=http` makes npm print each package fetch (with timing) so
  // a long install is visible in the console instead of looking frozen.
  spawnServer('npx', ['--loglevel', 'http', '-y', '@deepseek-ai/dsh', 'web', '--port', String(cfg.port)], undefined, process.platform === 'win32')
}

/** Poll the port until it opens, the spawned process dies, or the user stops. */
async function waitForPort(cfg: DshConfig): Promise<boolean> {
  const startedAt = Date.now()
  // No hard timeout: the first start of a new dsh version installs many
  // packages and can take several minutes. The fail-fast below still reports
  // a dead spawn, and Stop stays available from the panel.
  while (true) {
    await sleep(PORT_POLL_INTERVAL_MS)
    // The port binds before the web app finishes booting; wait for an HTTP
    // response so the browser doesn't open onto a blank page.
    if (await isHttpReady(LOOPBACK_HOST, cfg.port, 2_000)) {
      starting = false
      const secs = Math.round((Date.now() - startedAt) / 1000)
      const dur = secs >= 60 ? `${Math.floor(secs / 60)}m${secs % 60}s` : `${secs}s`
      addActivity(`✓ Server started ${uiUrl(cfg)} in ${dur}`)
      finishBusy()
      return true
    }
    // Fail fast when the spawned process already exited (e.g. port already in use).
    if (trackedPid !== undefined && !isProcessAlive(trackedPid)) {
      starting = false
      addActivity('✗ Server exited before opening the port (see the log above)')
      finishBusy()
      return false
    }
  }
}

/**
 * Serialize server lifecycle operations so rapid clicks can't start two
 * servers or interleave stop/start.
 */
function exclusive(task: () => Promise<boolean>): Promise<boolean> {
  if (busy) return busy
  busy = task().finally(() => {
    busy = undefined
  })
  return busy
}

/** Whether a checkout has its dependencies installed (`tsx` is the source-launch hook). */
function checkoutReady(checkout: string): boolean {
  return fs.existsSync(path.join(checkout, 'node_modules', 'tsx'))
    || fs.existsSync(path.join(checkout, 'node_modules', '.bin', 'tsx'))
}

/** Whether the checkout's installed deps predate its lockfile (a stale install). */
function checkoutDepsStale(checkout: string): boolean {
  try {
    const lock = fs.statSync(path.join(checkout, 'pnpm-lock.yaml')).mtimeMs
    const installed = fs.statSync(path.join(checkout, 'node_modules', '.pnpm', 'lock.yaml')).mtimeMs
    return lock > installed
  } catch {
    // Can't compare (missing marker): treat as not stale.
    return false
  }
}

/** Prompt to set up a fresh checkout, then run `pnpm install` + `pnpm run build`. */
async function ensureCheckoutReady(checkout: string): Promise<boolean> {
  const stale = checkoutDepsStale(checkout)
  if (checkoutReady(checkout) && !stale) return true
  const pick = await vscode.window.showInformationMessage(
    stale
      ? 'This deepseek-harness checkout has outdated dependencies. Run `pnpm install` and `pnpm run build`?'
      : 'This deepseek-harness checkout is not set up. Run `pnpm install` and `pnpm run build`?',
    'Setup now',
    'Cancel',
  )
  if (pick !== 'Setup now') return false
  addActivity(`▶ Setup: pnpm --dir "${checkout}" install`)
  const installOk = await runInTerminal('Setup deepseek-harness (pnpm install)', `pnpm --dir "${checkout}" install --frozen-lockfile`)
  if (!installOk) {
    addActivity('✗ pnpm install failed')
    void vscode.window.showErrorMessage('DeepSeek Harness: pnpm install failed. Check the terminal output.')
    return false
  }
  addActivity(`▶ Setup: pnpm --dir "${checkout}" run build`)
  const buildOk = await runInTerminal('Setup deepseek-harness (pnpm run build)', `pnpm --dir "${checkout}" run build`)
  if (!buildOk) {
    addActivity('✗ pnpm run build failed')
    void vscode.window.showErrorMessage('DeepSeek Harness: pnpm run build failed. Check the terminal output.')
    return false
  }
  return checkoutReady(checkout)
}

/** Make sure the server is running (no re-entrancy guard). */
async function ensureRunningUnlocked(cfg: DshConfig): Promise<boolean> {
  detectDshVersion(cfg)
  if (await isPortOpen(LOOPBACK_HOST, cfg.port)) {
    nodeState = 'ok'
    dshState = 'ok'
    addActivity(`✓ Server already running ${uiUrl(cfg)}`)
    return true
  }

  const nodeCheck = await checkNode(cfg)
  if (!nodeCheck.ok) {
    nodeState = 'missing'
    addActivity('✗ Node.js not found (need 22.19+ or >=24)')
    void vscode.window.showErrorMessage(
      'DeepSeek Harness requires Node.js 22.19+ (or >= 24). Install it from https://nodejs.org and restart VS Code.',
    )
    return false
  }
  nodeState = 'ok'
  addActivity('✓ Node.js detected')

  if (cfg.mode === 'source') {
    let repoPath = findSourceCheckout(cfg)
    if (!repoPath) {
      // A git clone can live anywhere on disk, so ask once and remember it.
      repoPath = await pickRepoFolder()
      if (!repoPath) {
        dshState = 'missing'
        addActivity('✗ No source checkout found — set dsh.path or pick the repo folder')
        void vscode.window.showErrorMessage(
          'DeepSeek Harness: no source checkout found. Pick the repo folder containing apps/cli/src/bin.ts, or set dsh.path.',
        )
        return false
      }
    }
    if (!(await ensureCheckoutReady(repoPath))) {
      dshState = 'missing'
      return false
    }
    spawnSource(repoPath, cfg)
    return waitForPort(cfg)
  }

  // npx (and legacy auto) both use the official npx method (source needs explicit opt-in)
  if (!(await prepareNpxInstall())) return false
  spawnNpm(cfg)
  return waitForPort(cfg)
}

/**
 * Make sure the server is running. Resolution: a source checkout (git clone)
 * or the official `npx @deepseek-ai/dsh web` method. Concurrent calls
 * coalesce onto the in-flight run.
 */
export function ensureRunning(cfg: DshConfig = readConfig()): Promise<boolean> {
  return exclusive(() => ensureRunningUnlocked(cfg))
}

/** PID of the process listening on `port`, if any. Windows uses netstat, POSIX uses lsof. */
async function findPortOwner(port: number): Promise<number | undefined> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      execFile('netstat', ['-ano'], { windowsHide: true }, (error, stdout) => {
        if (error) {
          resolve(undefined)
          return
        }
        const re = new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`)
        for (const line of stdout.split(/\r?\n/)) {
          const match = re.exec(line)
          if (match) {
            resolve(Number(match[1]))
            return
          }
        }
        resolve(undefined)
      })
    })
  }
  return new Promise((resolve) => {
    execFile('lsof', ['-ti', `tcp:${port}`], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(undefined)
        return
      }
      const pid = Number(stdout.trim().split(/\r?\n/)[0])
      resolve(Number.isFinite(pid) && pid > 0 ? pid : undefined)
    })
  })
}

function killPid(pid: number): void {
  try {
    process.kill(pid)
  } catch {
    // Process already exited.
  }
}

/** Stop the server, killing the tracked child and/or whatever owns the port (no guard). */
async function stopServerUnlocked(): Promise<boolean> {
  const cfg = readConfig()
  const pids: number[] = []
  if (trackedPid) {
    pids.push(trackedPid)
    killPid(trackedPid)
    trackedPid = undefined
  }
  if (trackedChild?.pid) {
    pids.push(trackedChild.pid)
    killPid(trackedChild.pid)
    trackedChild = undefined
  }
  const owner = await findPortOwner(cfg.port)
  if (owner && owner !== process.pid) {
    pids.push(owner)
    killPid(owner)
  }
  starting = false
  stopLogTail()
  if (pids.length === 0) {
    addActivity('■ Server not running')
    return false
  }
  addActivity('■ Stopping server…')
  for (let i = 0; i < STOP_POLL_ATTEMPTS; i++) {
    await sleep(STOP_POLL_INTERVAL_MS)
    if (!(await isPortOpen(LOOPBACK_HOST, cfg.port, STOP_POLL_PROBE_MS))) {
      addActivity('■ Server stopped')
      return true
    }
  }
  const stillOpen = await isPortOpen(LOOPBACK_HOST, cfg.port, STOP_POLL_PROBE_MS)
  addActivity(stillOpen ? '⚠ Could not stop the server — the port is still in use' : '■ Server stopped')
  return !stillOpen
}

export function stopServer(): Promise<boolean> {
  return exclusive(stopServerUnlocked)
}

/** Whether the dsh server port is open (fast probe). */
export async function isServerRunning(): Promise<boolean> {
  const cfg = readConfig()
  return isPortOpen(LOOPBACK_HOST, cfg.port)
}

/** Check for a newer dsh version (source mode only: git commits ahead of upstream). */
async function checkDshUpdateStatus(cfg: DshConfig): Promise<DshUpdate> {
  if (cfg.mode !== 'source') return { hasUpdate: false, label: '' }
  const checkout = findSourceCheckout(cfg)
  if (!checkout) return { hasUpdate: false, label: '' }
  await runFile('git', ['-C', checkout, 'fetch'])
  const r = await runFile('git', ['-C', checkout, 'rev-list', '--count', 'HEAD..@{upstream}'])
  if (!r.ok) return { hasUpdate: false, label: '' }
  const count = Number(r.stdout.trim())
  if (!Number.isFinite(count) || count <= 0) return { hasUpdate: false, label: '' }
  // Prefer the upstream version number; fall back to the commit count.
  let label = `${count} commit${count === 1 ? '' : 's'}`
  const v = await runFile('git', ['-C', checkout, 'show', '@{upstream}:apps/cli/package.json'])
  if (v.ok) {
    try {
      const pkg = JSON.parse(v.stdout)
      if (pkg?.version) label = `v${pkg.version}`
    } catch {
      // keep the commit-count label
    }
  }
  return { hasUpdate: true, label }
}

/** Update dsh (source mode only): pull the configured checkout. */
export async function runDshUpdate(): Promise<void> {
  const cfg = readConfig()
  if (cfg.mode !== 'source') {
    addActivity('↑ No update needed (npx mode resolves latest)')
    return
  }
  const checkout = findSourceCheckout(cfg)
  if (!checkout) {
    addActivity('↑ No source checkout configured (set dsh.path)')
    return
  }
  addActivity('↑ Updating dsh (git pull)…')
  const ok = await runInTerminal('Update DeepSeek Harness', `git -C "${checkout}" pull`)
  addActivity(ok ? '↑ dsh updated' : '↑ dsh update failed')
  if (ok) updateCache = undefined
}

let detectionCache: { node: ConditionState; dsh: DshDetection; at: number } | undefined
let updateCache: { update: DshUpdate; at: number } | undefined

export async function currentStatus(): Promise<ServerStatus> {
  const cfg = readConfig()
  let running = false
  try {
    running = await isPortOpen(LOOPBACK_HOST, cfg.port)
  } catch {
    running = false
  }

  // Periodically probe node/dsh so the panel reflects reality without a start.
  const now = Date.now()
  if (!detectionCache || now - detectionCache.at > DETECTION_CACHE_TTL_MS) {
    const [nodeCheck, dshDet] = await Promise.all([checkNode(cfg), detectDsh(cfg)])
    nodeState = nodeCheck.ok ? 'ok' : 'missing'
    nodeVersion = nodeCheck.version
    dshState = dshDet.state
    dshSource = dshDet.source
    dshPath = dshDet.path
    detectionCache = { node: nodeState, dsh: dshDet, at: now }
    detectDshVersion(cfg)
  }

  if (running) {
    nodeState = 'ok'
    dshState = 'ok'
  }

  const dshHome = resolveDshHome()
  return {
    running,
    starting,
    url: uiUrl(cfg),
    node: nodeState,
    dsh: dshState,
    dshVersion,
    dshSource,
    dshPath,
    dshHome,
    dshPathShort: maskPath(dshPath),
    dshHomeShort: maskPath(dshHome),
    nodeVersion,
    mode: cfg.mode === 'source' ? 'source' : 'npx',
    update: updateCache?.update,
    consoleLogPath: consolePath,
    consoleLogPathShort: maskPath(consolePath),
    serverLogPath: logPath,
    serverLogPathShort: maskPath(logPath),
  }
}

/** Force the next refresh to re-probe node/dsh and re-check for dsh updates. */
export async function clearRequirementsCaches(): Promise<void> {
  detectionCache = undefined
  updateCache = undefined
  const update = await checkDshUpdateStatus(readConfig())
  updateCache = { update, at: Date.now() }
}

/** Clear the console log (in-memory feed and the persisted file). */
export function clearConsole(): void {
  activity.length = 0
  for (const file of [consolePath, logPath]) {
    if (!file) continue
    try {
      fs.writeFileSync(file, '')
    } catch {
      // best effort (the server may hold its log open)
    }
  }
}
