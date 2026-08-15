import * as vscode from 'vscode'
import { ensureRunning, readConfig, stopServer, uiUrl } from './server'

/** Open a URL per dsh.browser: built-in Simple Browser (with fallback) or external. */
export async function openUrl(url: string): Promise<void> {
  const browser = vscode.workspace.getConfiguration('dsh').get<string>('browser') ?? 'built-in'
  if (browser === 'external') {
    await vscode.env.openExternal(vscode.Uri.parse(url))
    return
  }
  try {
    await vscode.commands.executeCommand('simpleBrowser.show', url)
  } catch {
    void vscode.window.showInformationMessage('VS Code built-in browser is unavailable; opened the system browser instead.')
    await vscode.env.openExternal(vscode.Uri.parse(url))
  }
}

// Re-entrancy guard for the start action. (Distinct from server.ts's
// `starting` status flag, which reflects the spawn/poll lifecycle.)
let startInFlight = false

/** Start (or reuse) the server, then open the browser. */
export async function actionStart(): Promise<void> {
  if (startInFlight) return
  startInFlight = true
  try {
    const cfg = readConfig()
    // No launch notification: the dashboard already shows the live status
    // and console, so start silently and let the panel report progress.
    const ok = await ensureRunning(cfg)
    if (!ok) return
    // Always (re)open the browser — DSH is fine with multiple pages, and this
    // way a closed tab can always be reopened by clicking again.
    await openUrl(uiUrl())
  } finally {
    startInFlight = false
  }
}

export async function actionStop(): Promise<void> {
  const stopped = await stopServer()
  if (stopped) {
    void vscode.window.showInformationMessage('DeepSeek Harness stopped.')
  } else {
    void vscode.window.showWarningMessage('DeepSeek Harness was not running, or could not be stopped.')
  }
}

export async function actionSetBrowser(value: string): Promise<void> {
  await vscode.workspace.getConfiguration('dsh').update('browser', value, vscode.ConfigurationTarget.Global)
}
