import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFile } from 'node:child_process'

// --- dsh ---

/** Marker path that identifies a deepseek-harness source checkout. */
export const DSH_CLI_BIN = path.join('apps', 'cli', 'src', 'bin.ts')

/** dsh ≥ this version opens the system browser on its own; the launcher then passes `--no-open`. */
export const DSH_NO_OPEN_MIN_VERSION = '0.1.0-rc.8'

// --- Timing (ms) ---

export const PORT_PROBE_TIMEOUT_MS = 500
export const PORT_POLL_INTERVAL_MS = 500
export const STOP_POLL_INTERVAL_MS = 200
export const STOP_POLL_ATTEMPTS = 10
export const STOP_POLL_PROBE_MS = 300
export const DETECTION_CACHE_TTL_MS = 8_000
export const HTTP_PROBE_TIMEOUT_MS = 2_000
export const NODE_PROBE_TIMEOUT_MS = 8_000
export const MODULE_PROGRESS_EVERY = 500
export const LOG_TAIL_POLL_MS = 500

// --- Limits ---

export const ACTIVITY_MAX_LINES = 200
export const LOG_RELOAD_LINES = 50

// --- dsh home ---

/**
 * The DSH user-data root (matches dsh-home-paths precedence: `$DSH_HOME`,
 * else `~/.dsh`).
 */
export function resolveDshHome(): string {
  const env = process.env.DSH_HOME
  if (env && env.trim() !== '') return env
  return path.join(os.homedir(), '.dsh')
}

// --- Pure helpers ---

/** Compare dsh versions like '0.1.0-rc.8' numerically (rc.10 > rc.9, rc.8 > rc.7). */
export function dshVersionAtLeast(version: string, target: string): boolean {
  const parts = (v: string): (number | string)[] => v.split(/[-.]/).map((p) => (/^\d+$/.test(p) ? Number(p) : p))
  const a = parts(version)
  const b = parts(target)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return false
    if (y === undefined) return true
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x > y
    } else {
      const sx = String(x)
      const sy = String(y)
      if (sx !== sy) return sx > sy
    }
  }
  return true
}

/** Strip non-ASCII characters and trailing parentheticals to yield an English name. */
export function toEnglish(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whether a process id is still alive. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Quote a single token for cmd.exe (only when it contains special characters). */
export function quoteCmdArg(arg: string): string {
  return /[\s"&|<>^]/.test(arg) ? `"${arg}"` : arg
}

/** Escape a value for a PowerShell single-quoted string literal ('' doubles a quote). */
export function psQuote(value: string): string {
  return value.replace(/'/g, "''")
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Run a command without a shell (no cmd window flash on Windows); `timeoutMs` bounds a hung probe. */
export function runFile(command: string, args: string[], timeoutMs = 0): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: timeoutMs > 0 ? timeoutMs : undefined }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout ?? '', stderr: stderr ?? '' })
    })
  })
}

// --- pnpm dlx cache ---

/**
 * The pnpm cache root for the current platform (pnpm's default cache-dir).
 * dlx downloads live under <cache>/dlx.
 */
export function pnpmCacheRoot(
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
  home: string = os.homedir(),
): string | undefined {
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA && env.LOCALAPPDATA.trim() !== '' ? env.LOCALAPPDATA : path.join(home, 'AppData', 'Local')
    return path.join(base, 'pnpm-cache')
  }
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches', 'pnpm')
  const base = env.XDG_CACHE_HOME && env.XDG_CACHE_HOME.trim() !== '' ? env.XDG_CACHE_HOME : path.join(home, '.cache')
  return path.join(base, 'pnpm')
}

/**
 * The best @deepseek-ai/dsh version found under a pnpm dlx cache root
 * (dlx/<hash>/<tmp>/node_modules/@deepseek-ai/dsh/package.json).
 */
export function bestDshVersionInDlxCache(dlxRoot: string): string | undefined {
  let best: string | undefined
  try {
    for (const entry of fs.readdirSync(dlxRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const hashDir = path.join(dlxRoot, entry.name)
      let slots: fs.Dirent[]
      try {
        slots = fs.readdirSync(hashDir, { withFileTypes: true })
      } catch {
        continue // unreadable dlx entry
      }
      for (const slot of slots) {
        if (!slot.isDirectory()) continue
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(hashDir, slot.name, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8')) as { version?: string }
          const v = pkg?.version
          if (v && (best === undefined || dshVersionAtLeast(v, best))) best = v
        } catch {
          // no dsh package in this dlx slot
        }
      }
    }
  } catch {
    // no dlx cache
  }
  return best
}

/** Candidate pnpm.cmd shim locations on Windows (npm global bin, pnpm standalone installer). */
export function windowsPnpmCandidates(env: Record<string, string | undefined>): string[] {
  const out: string[] = []
  if (env.APPDATA) out.push(path.join(env.APPDATA, 'npm', 'pnpm.cmd'))
  if (env.LOCALAPPDATA) out.push(path.join(env.LOCALAPPDATA, 'pnpm', 'pnpm.cmd'))
  return out
}

/**
 * Resolve the pnpm command: PATH first (bare `pnpm` on Windows, so cmd's
 * PATHEXT picks pnpm.cmd), then the known Windows shim locations.
 */
export async function findPnpm(): Promise<string | undefined> {
  const onPath = await findOnPath('pnpm')
  if (onPath) return process.platform === 'win32' ? 'pnpm' : onPath
  if (process.platform !== 'win32') return undefined
  for (const candidate of windowsPnpmCandidates(process.env)) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // unreadable location
    }
  }
  return undefined
}

/** Resolve a command on PATH (returns the first match, or undefined). */
export async function findOnPath(cmd: string): Promise<string | undefined> {
  const which = process.platform === 'win32' ? 'where' : 'which'
  const result = await runFile(which, [cmd], 8_000)
  if (!result.ok) return undefined
  const first = result.stdout.trim().split(/\r?\n/)[0]
  return first || undefined
}

/** Abbreviate a path for display: keep the drive and the last segment, mask the middle. */
export function maskPath(p: string): string {
  if (!p) return ''
  const segs = p.split(/[\\/]+/).filter(Boolean)
  if (segs.length <= 3) return p
  if (/^[A-Za-z]:$/.test(segs[0])) return segs[0] + '\\…\\' + segs[segs.length - 1]
  return '…/' + segs[segs.length - 1]
}
