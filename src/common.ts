import * as os from 'node:os'
import * as path from 'node:path'
import { execFile } from 'node:child_process'

// --- dsh ---

/** Official npx method: npx resolves from the registry on every run. */
export const NPX_RUN_COMMAND = 'npx @deepseek-ai/dsh web'

/** Marker path that identifies a deepseek-harness source checkout. */
export const DSH_CLI_BIN = path.join('apps', 'cli', 'src', 'bin.ts')

// --- Timing (ms) ---

/** How long to wait for the server to open its port after spawning. */
export const START_TIMEOUT_MS = 120_000
export const PORT_PROBE_TIMEOUT_MS = 500
export const PORT_PROBE_FAST_MS = 400
export const PORT_POLL_INTERVAL_MS = 500
export const STOP_POLL_INTERVAL_MS = 200
export const STOP_POLL_ATTEMPTS = 10
export const STOP_POLL_PROBE_MS = 300
export const DETECTION_CACHE_TTL_MS = 8_000

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

/** Run a command without a shell (no cmd window flash on Windows). */
export function runFile(command: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true }, (error, stdout) => {
      resolve({ ok: !error, stdout: stdout ?? '' })
    })
  })
}

/** Resolve a command on PATH (returns the first match, or undefined). */
export async function findOnPath(cmd: string): Promise<string | undefined> {
  const which = process.platform === 'win32' ? 'where' : 'which'
  const result = await runFile(which, [cmd])
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
