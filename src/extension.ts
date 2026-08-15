import * as os from 'node:os'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { actionStart } from './actions'
import { DshPanelProvider } from './panel'
import { currentStatus, dbg, setLogPath } from './server'

export function activate(context: vscode.ExtensionContext): void {
  setLogPath(path.join(os.tmpdir(), 'dsh-launcher-vscode.log'))
  dbg('activated')

  const panelProvider = new DshPanelProvider(context.extension.packageJSON.version ?? '0.0.0')
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DshPanelProvider.viewType, panelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  )

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  statusBar.command = 'dsh.start'
  statusBar.show()

  const SPIN_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let spinnerTimer: ReturnType<typeof setInterval> | undefined
  const stopSpinner = (): void => {
    if (spinnerTimer) {
      clearInterval(spinnerTimer)
      spinnerTimer = undefined
    }
  }

  const refreshStatusBar = async (): Promise<void> => {
    const status = await currentStatus()
    if (status.running) {
      stopSpinner()
      statusBar.text = '🐳\uFE0E DSH'
      statusBar.color = '#4D6BFE'
      statusBar.tooltip = `DeepSeek Harness running at ${status.url} — click to open`
    } else if (status.starting) {
      statusBar.color = undefined
      statusBar.tooltip = 'DeepSeek Harness starting — click to open when ready'
      if (!spinnerTimer) {
        let i = 0
        statusBar.text = '🐳\uFE0E DSH ⠋'
        spinnerTimer = setInterval(() => {
          statusBar.text = `🐳\uFE0E DSH ${SPIN_CHARS[i++ % SPIN_CHARS.length]}`
        }, 150)
      }
    } else {
      stopSpinner()
      statusBar.text = '🐳\uFE0E DSH'
      statusBar.color = undefined
      statusBar.tooltip = 'DeepSeek Harness stopped — click to start & open'
    }
  }

  void refreshStatusBar()
  const statusTimer = setInterval(() => void refreshStatusBar(), 4000)

  context.subscriptions.push(
    statusBar,
    { dispose: () => { clearInterval(statusTimer); stopSpinner() } },
    vscode.commands.registerCommand('dsh.start', () => actionStart()),
  )
}

export function deactivate(): void {
  // The server is intentionally left running. Stop it from the panel or command palette.
}
