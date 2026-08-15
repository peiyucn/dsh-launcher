import * as fs from 'node:fs'
import * as vscode from 'vscode'
import { ensureRunning, getLogPath, readConfig, stopServer, uiUrl } from './server'

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

let starting = false

/** Start (or reuse) the server, then open the browser. */
export async function actionStart(): Promise<void> {
  if (starting) return
  starting = true
  try {
    const cfg = readConfig()
    const ok = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Launching DeepSeek Harness…' },
      async () => ensureRunning(cfg),
    )
    if (!ok) {
      void vscode.window.showWarningMessage(
        'DeepSeek Harness is taking a while to start — watch the panel for when it is ready.',
      )
      return
    }
    // Always (re)open the browser — DSH is fine with multiple pages, and this
    // way a closed tab can always be reopened by clicking again.
    await openUrl(uiUrl())
  } finally {
    starting = false
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

export async function actionLogs(): Promise<void> {
  const file = getLogPath()
  if (fs.existsSync(file)) {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
    await vscode.window.showTextDocument(doc, { preview: false })
  } else {
    void vscode.window.showInformationMessage(`No log file yet: ${file}`)
  }
}

export async function actionSetBrowser(value: string): Promise<void> {
  await vscode.workspace.getConfiguration('dsh').update('browser', value, vscode.ConfigurationTarget.Global)
}
