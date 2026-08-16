import * as vscode from 'vscode'
import { actionSetBrowser, actionStart, actionStop, openUrl } from './actions'
import { applyMode, clearConsole, clearRequirementsCaches, currentStatus, dbg, fetchDshBalance, getActivity, getConsoleSize, getDsStatus, getDshBalance, hasDeepSeekModel, isServerRunning, readConfig, runDshUpdate, type ServerStatus } from './server'

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length))
  return out
}

export class DshPanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'dsh.panel'

  private view: vscode.WebviewView | undefined
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly version: string) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    dbg(`view resolved, visible=${view.visible}`)
    view.webview.options = { enableScripts: true }
    view.webview.html = this.getHtml(view.webview)
    view.webview.onDidReceiveMessage((message: { command?: string; value?: string }) => {
      dbg(`message from webview: ${JSON.stringify(message)}`)
      if (message && message.command === 'ready') {
        void this.refresh()
        return
      }
      void this.onMessage(message)
    })
    view.onDidChangeVisibility(() => {
      dbg(`visibility changed, visible=${view.visible}`)
      if (view.visible) this.startTimer()
      else this.stopTimer()
    })
    view.onDidDispose(() => this.stopTimer())
    if (view.visible) this.startTimer()
    void this.refresh()
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce()
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  html, body { height: 100%; }
  body { font-family: var(--vscode-font-family); font-size: 12px; color: var(--vscode-foreground); padding: 10px; margin: 0; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; overflow-y: auto; }
  .card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
  .status { display: flex; align-items: center; gap: 8px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #c00; flex: none; }
  .dot.running { background: #2ea043; box-shadow: 0 0 0 3px rgba(46,160,67,.16); }
  .dot.working { background: #d29922; animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .3; } }
  .status-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .status-main { font-weight: 600; }
  .status-sub { color: var(--vscode-descriptionForeground); font-size: 11px; word-break: break-all; }
  .mode-toggle { display: flex; margin-left: auto; background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px; gap: 2px; flex: none; }
  .mode-option { border: none; border-radius: 999px; padding: 3px 10px; background: transparent; color: var(--vscode-descriptionForeground); cursor: pointer; font-size: 11px; font-weight: 600; font-family: inherit; transition: background .12s, color .12s; }
  .mode-option.active { background: #4D6BFE; color: #fff; }
  .runtime-path-block { border-top: 1px solid var(--vscode-panel-border); padding-top: 6px; display: flex; flex-direction: column; gap: 3px; }
  .runtime-row { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .runtime-label { flex: none; width: 30px; color: var(--vscode-descriptionForeground); font-size: 10px; opacity: .65; }
  .runtime-path, .runtime-data { font-size: 11px; color: var(--vscode-descriptionForeground); word-break: break-all; font-family: var(--vscode-editor-font-family); min-width: 0; cursor: pointer; }
  .runtime-path:hover, .runtime-data:hover { color: var(--vscode-textLink-foreground); text-decoration: underline; }
  .runtime-path.missing { color: #d29922; }
  .buttons { display: flex; gap: 8px; }
  button { border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 600; transition: background .12s, border-color .12s, color .12s; }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); flex: 1; }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button.primary:disabled:hover { background: var(--vscode-button-background); }
  button.secondary { background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-panel-border); }
  button.secondary:hover { background: var(--vscode-toolbar-hoverBackground); }
  button.danger:hover { border-color: #f85149; color: #f85149; background: rgba(248,81,73,.1); }
  .console { height: 200px; margin: 0; padding: 8px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; overflow: auto; white-space: pre-wrap; word-break: break-all; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); font-size: 11px; }
  .console-header { display: flex; align-items: center; gap: 6px; }
  .console-title { font-weight: 600; font-size: 11px; }
  .console-size { color: var(--vscode-descriptionForeground); font-size: 10px; margin-left: auto; }
  .console-header .mini-btn { flex: none; }
  .req-header { display: flex; align-items: center; gap: 6px; }
  .req-title { font-weight: 600; }
  .req-hint { color: var(--vscode-descriptionForeground); font-size: 10px; margin-left: auto; }
  .icon-btn { background: transparent; border: none; border-radius: 4px; color: var(--vscode-foreground); cursor: pointer; padding: 2px 4px; font-size: 12px; flex: none; }
  .icon-btn:hover { color: var(--vscode-textLink-foreground); }
  .icon-btn.spinning { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .req-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .req-name { width: 56px; flex: none; color: var(--vscode-descriptionForeground); }
  .req-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vscode-foreground); }
  .req-mark { width: 16px; text-align: center; flex: none; }
  .req-mark.ok { color: #3fb950; }
  .req-mark.missing { color: #f85149; }
  .mini-btn { background: transparent; border: 1px solid var(--vscode-panel-border); border-radius: 4px; color: var(--vscode-foreground); cursor: pointer; padding: 0 6px; font-size: 10px; font-weight: 500; flex: none; }
  .mini-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
  .ds-header { display: flex; align-items: center; gap: 6px; }
  .ds-title { font-weight: 600; }
  .ds-open { background: transparent; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; padding: 0; font-size: 11px; flex: none; text-decoration: none; margin-left: auto; }
  .ds-open:hover { text-decoration: underline; }
  .ds-components { display: flex; flex-direction: column; gap: 4px; }
  .ds-comp { display: flex; align-items: center; gap: 6px; font-size: 11px; }
  .ds-comp-name { flex: 1; min-width: 0; color: var(--vscode-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cdot { width: 8px; height: 8px; margin: 0 4px; border-radius: 50%; background: #888; flex: none; }
  .cdot.ok { background: #2ea043; }
  .cdot.degraded { background: #d29922; }
  .cdot.down { background: #f85149; }
  .cdot.maintenance { background: #316dca; }
  .ds-incidents { display: flex; flex-direction: column; gap: 3px; }
  .ds-incident { font-size: 11px; color: #f85149; word-break: break-all; }
  .ds-empty { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .balance-row { border-top: 1px solid var(--vscode-panel-border); padding-top: 6px; margin-top: 2px; display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .balance-value { color: var(--vscode-foreground); }
  .update-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .footer { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--vscode-descriptionForeground); }
  .setting { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .setting select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; padding: 2px 6px; font-family: inherit; font-size: 12px; }
  .version-row { display: flex; justify-content: flex-end; }
  .plugin-version { font-size: 10px; color: var(--vscode-descriptionForeground); opacity: .65; }
</style>
</head>
<body>
  <div class="card">
    <div class="status">
      <span class="dot" id="dot"></span>
      <div class="status-text">
        <span class="status-main" id="statusText">Checking…</span>
        <span class="status-sub" id="statusSub"></span>
      </div>
      <div class="mode-toggle" id="modeToggle">
        <button class="mode-option" data-mode="npx">npx</button>
        <button class="mode-option" data-mode="source">source</button>
      </div>
    </div>
    <div class="runtime-path-block" id="runtimePathBlock">
      <div class="runtime-row" id="runtimeDataRow">
        <span class="runtime-label">data</span>
        <span class="runtime-data" id="runtimeData"></span>
      </div>
      <div class="runtime-row" id="runtimePathRow">
        <span class="runtime-label">path</span>
        <span class="runtime-path" id="runtimePath"></span>
      </div>
    </div>
  </div>
  <div class="buttons">
    <button id="startBtn" data-cmd="start" class="primary" title="Start dsh and open the browser (or open a new tab when already running)">▶ Start</button>
    <button data-cmd="stop" class="secondary danger when-running" title="Stop the local dsh server">■ Stop</button>
  </div>
  <div class="card">
    <div class="req-header">
      <span class="req-title">Requirements</span>
      <span class="req-hint" id="refreshHint"></span>
      <button class="icon-btn" id="refreshBtn" title="Re-check Node / DSH / updates">⟳</button>
    </div>
    <div class="req-row">
      <span class="req-name">Node</span>
      <span class="req-value" id="nodeVersion">—</span>
      <span class="req-mark" id="req-node">·</span>
    </div>
    <div class="req-row">
      <span class="req-name">DSH</span>
      <span class="req-value" id="dshVersion">—</span>
      <span class="req-mark" id="req-dsh">·</span>
    </div>
    <div class="update-row" id="updateRow" style="display:none">
      <span class="req-name">Update</span>
      <button class="mini-btn" id="updateBtn" title="Pull dsh update">Update</button>
    </div>
  </div>
  <div class="card" id="dsCard">
    <div class="ds-header">
      <span class="ds-title">DeepSeek API Status</span>
      <button class="ds-open" id="dsOpenBtn" title="status.deepseek.com (official DeepSeek status)">↗</button>
    </div>
    <div class="ds-components" id="dsComponents"></div>
    <div class="balance-row">
      <button class="mini-btn" id="balanceBtn" title="Query DeepSeek account balance">Balance</button>
      <span class="balance-value" id="balanceValue"></span>
    </div>
    <div class="ds-incidents" id="dsIncidents"></div>
  </div>
  <div class="console-header">
    <span class="console-title">Console</span>
    <span class="console-size" id="consoleSize"></span>
    <button class="mini-btn" id="clearConsoleBtn" title="Clear console log">Clear</button>
  </div>
  <pre class="console" id="log"></pre>
  <div class="footer">
    <button class="icon-btn" id="settingsBtn" title="Open extension settings">⚙ Settings</button>
    <div class="setting">
      <span>Browser</span>
      <select id="browserSelect">
        <option value="built-in">Built-in</option>
        <option value="external">External</option>
      </select>
    </div>
  </div>
  <div class="version-row">
    <span class="plugin-version" id="pluginVersion">v${this.version}</span>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    vscode.postMessage({ command: 'ready' })
    let gotUpdate = false
    setTimeout(() => {
      if (!gotUpdate) {
        const st = document.getElementById('statusText')
        if (st && st.textContent === 'Checking…') st.textContent = '⚠ No status updates received'
      }
    }, 6000)

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    }
    function compStateClass(st) {
      return st === 'operational' ? 'ok' : st === 'degraded' ? 'degraded' : st === 'maintenance' ? 'maintenance' : (st === 'partial_outage' || st === 'full_outage') ? 'down' : ''
    }
    function incidentLabel(st) {
      return { investigating: 'Investigating', identified: 'Identified', monitoring: 'Monitoring', resolved: 'Resolved' }[st] || st || ''
    }
    function fmtSize(bytes) {
      if (!bytes || bytes <= 0) return ''
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    }
    function setMark(id, state) {
      const el = document.getElementById(id)
      let txt = '·'; let cls = 'req-mark'
      if (state === 'ok') { txt = '✓'; cls = 'req-mark ok' }
      else if (state === 'missing') { txt = '✗'; cls = 'req-mark missing' }
      el.textContent = txt
      el.className = cls
    }

    function renderRunning(status) {
      status = status || {}
      const running = !!(status.running)
      const starting = !!(status.starting)
      document.querySelectorAll('.when-running').forEach((b) => { b.style.display = running ? '' : 'none' })
      const dot = document.getElementById('dot')
      const statusText = document.getElementById('statusText')
      const statusSub = document.getElementById('statusSub')
      const startBtn = document.getElementById('startBtn')
      const runtimePathRow = document.getElementById('runtimePathRow')
      const runtimePath = document.getElementById('runtimePath')
      const runtimeData = document.getElementById('runtimeData')
      if (starting) {
        const justStarted = startElapsed()
        if (justStarted) statusSub.textContent = 'Waited 0s'
        dot.className = 'dot working'
        statusText.textContent = 'Starting DeepSeek Harness…'
        startBtn.textContent = 'Starting…'
        startBtn.disabled = true
      } else {
        stopElapsed()
        startBtn.disabled = false
        dot.className = 'dot' + (running ? ' running' : '')
        statusText.textContent = running ? 'Running' : 'Stopped'
        statusSub.textContent = running ? (status.url || '') : ''
        startBtn.textContent = running ? '↗ New Tab' : '▶ Start'
      }
      const mode = status.mode === 'source' ? 'source' : 'npx'
      document.querySelectorAll('.mode-option').forEach((b) => {
        b.classList.toggle('active', b.dataset.mode === mode)
      })
      // data is always shown (top row); the path row only exists in source
      // mode and stays hidden under npx, where there is no local checkout.
      runtimeData.textContent = status.dshHomeShort || '—'
      runtimeData.title = status.dshHome || ''
      if (mode === 'source') {
        runtimePathRow.style.display = ''
        if (!status.dshPath) {
          // No checkout configured: invite the user to configure it
          // (clicking opens the extension settings).
          runtimePath.textContent = 'click to set dsh.path'
          runtimePath.title = 'Open extension settings'
          runtimePath.classList.add('missing')
          runtimePath.dataset.openSettings = '1'
        } else {
          runtimePath.textContent = status.dshPathShort || ''
          runtimePath.title = status.dshPath || ''
          runtimePath.classList.remove('missing')
          delete runtimePath.dataset.openSettings
        }
      } else {
        runtimePathRow.style.display = 'none'
      }
    }

    function renderRequirements(status) {
      status = status || {}
      document.getElementById('nodeVersion').textContent = status.nodeVersion || (status.node === 'missing' ? 'not found' : '—')
      document.getElementById('dshVersion').textContent = status.dshVersion ? ('v' + status.dshVersion) : (status.dsh === 'missing' ? 'not found' : '—')
      setMark('req-node', status.node)
      setMark('req-dsh', status.dsh)

      const upd = status.update
      const updateRow = document.getElementById('updateRow')
      const updateBtn = document.getElementById('updateBtn')
      if (upd && upd.hasUpdate) {
        updateRow.style.display = ''
        updateBtn.textContent = 'Update to ' + upd.label
      } else {
        updateRow.style.display = 'none'
      }
    }

    function renderDs(ds) {
      ds = ds || {}
      const list = document.getElementById('dsComponents')
      const comps = ds.components || []
      let html = ''
      for (const c of comps) {
        const st = c.status || 'operational'
        const stCls = compStateClass(st)
        html += '<div class="ds-comp"><span class="ds-comp-name" title="' + esc(c.name) + '">' + esc(c.name) + '</span><span class="cdot' + (stCls ? ' ' + stCls : '') + '"></span></div>'
      }
      list.innerHTML = html || '<div class="ds-empty">No component data</div>'
      const inc = document.getElementById('dsIncidents')
      const incs = ds.incidents || []
      inc.innerHTML = incs.map((i) => '<div class="ds-incident">⚠ ' + esc(i.title) + (i.status ? ' · ' + incidentLabel(i.status) : '') + '</div>').join('')
      inc.style.display = incs.length ? '' : 'none'
    }

    function renderBalance(bal) {
      const val = document.getElementById('balanceValue')
      if (!bal) { val.textContent = ''; return }
      if (bal.balance) {
        val.textContent = bal.balance.total + ' ' + bal.balance.currency
      } else if (bal.error) {
        val.textContent = '⚠ ' + bal.error
      }
    }

    document.querySelectorAll('button[data-cmd]').forEach((b) => {
      b.addEventListener('click', () => {
        // Gray the Start button instantly; the next status update re-enables it.
        if (b.dataset.cmd === 'start') b.disabled = true
        vscode.postMessage({ command: b.dataset.cmd })
      })
    })
    document.getElementById('updateBtn').addEventListener('click', () => vscode.postMessage({ command: 'updateDsh' }))
    document.getElementById('dsOpenBtn').addEventListener('click', () => vscode.postMessage({ command: 'openStatus' }))
    document.getElementById('settingsBtn').addEventListener('click', () => vscode.postMessage({ command: 'openSettings' }))
    document.getElementById('clearConsoleBtn').addEventListener('click', () => vscode.postMessage({ command: 'clearConsole' }))
    document.getElementById('browserSelect').addEventListener('change', (e) => {
      vscode.postMessage({ command: 'setBrowser', value: e.target.value })
    })
    document.querySelectorAll('.mode-option').forEach((b) => {
      b.addEventListener('click', () => {
        // No optimistic highlight: the pill only moves once the mode is
        // actually applied (confirmed), via the next status update.
        vscode.postMessage({ command: 'setMode', value: b.dataset.mode })
      })
    })
    document.querySelectorAll('.runtime-path, .runtime-data').forEach((el) => {
      el.addEventListener('click', () => {
        if (el.dataset.openSettings) {
          vscode.postMessage({ command: 'openSettings' })
          return
        }
        const full = el.getAttribute('title')
        if (full) vscode.postMessage({ command: 'revealPath', value: full })
      })
    })

    let refreshingReqs = false
    let refreshHintTimer = undefined
    function showRefreshHint(text, persistent) {
      const el = document.getElementById('refreshHint')
      el.textContent = text
      if (refreshHintTimer) clearTimeout(refreshHintTimer)
      if (!persistent) refreshHintTimer = setTimeout(() => { el.textContent = '' }, 2000)
    }
    document.getElementById('refreshBtn').addEventListener('click', () => {
      refreshingReqs = true
      document.getElementById('refreshBtn').classList.add('spinning')
      vscode.postMessage({ command: 'refreshRequirements' })
    })
    let refreshingBalance = false
    document.getElementById('balanceBtn').addEventListener('click', () => {
      refreshingBalance = true
      document.getElementById('balanceBtn').classList.add('spinning')
      vscode.postMessage({ command: 'balance' })
    })

    let since = 0
    let elapsedTimer = undefined
    function stopElapsed() {
      if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = undefined }
    }
    function startElapsed() {
      if (elapsedTimer) return false
      since = Date.now()
      elapsedTimer = setInterval(() => {
        const e = document.getElementById('statusSub')
        if (e) e.textContent = 'Waited ' + Math.round((Date.now() - since) / 1000) + 's'
      }, 1000)
      return true
    }

    window.addEventListener('message', (e) => {
      const m = e.data
      if (!m || m.type !== 'update') return
      gotUpdate = true
      if (refreshingReqs) {
        refreshingReqs = false
        document.getElementById('refreshBtn').classList.remove('spinning')
        showRefreshHint('✓', false)
      }
      if (refreshingBalance) {
        refreshingBalance = false
        document.getElementById('balanceBtn').classList.remove('spinning')
      }
      document.getElementById('browserSelect').value = m.browser || 'built-in'
      document.getElementById('consoleSize').textContent = fmtSize(m.consoleSize)
      const log = document.getElementById('log')
      log.textContent = m.activity || '(no activity yet)'
      log.scrollTop = log.scrollHeight
      const dsCard = document.getElementById('dsCard')
      if (dsCard) dsCard.style.display = m.showDs === false ? 'none' : ''
      renderRunning(m.status)
      renderRequirements(m.status)
      renderDs(m.dsStatus)
      renderBalance(m.balance)
    })
  </script>
</body>
</html>`
  }

  private async onMessage(message: { command?: string; value?: string }): Promise<void> {
    switch (message.command) {
      case 'start':
        await actionStart()
        break
      case 'stop':
        await actionStop()
        break
      case 'updateDsh':
        await runDshUpdate()
        break
      case 'refreshRequirements':
        await clearRequirementsCaches()
        break
      case 'setMode':
        if (message.value === 'npx' || message.value === 'source') {
          const wasRunning = await isServerRunning()
          if (wasRunning) {
            // Confirm before switching so that cancelling keeps the current mode.
            const pick = await vscode.window.showInformationMessage(
              `DeepSeek Harness is running — restart with ${message.value} mode?`,
              'Restart',
              'Cancel',
            )
            if (pick !== 'Restart') break
            await applyMode(message.value)
            await actionStop()
            await actionStart()
          } else {
            await applyMode(message.value)
          }
        }
        break
      case 'revealPath':
        if (message.value) void vscode.env.openExternal(vscode.Uri.file(message.value))
        break
      case 'balance':
        await fetchDshBalance()
        break
      case 'setBrowser':
        if (message.value) await actionSetBrowser(message.value)
        break
      case 'openStatus':
        await openUrl('https://status.deepseek.com/')
        break
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:peiyucn.dsh-launcher-panel')
        break
      case 'clearConsole':
        clearConsole()
        break
      default:
        break
    }
    await this.refresh()
  }

  private startTimer(): void {
    this.stopTimer()
    this.timer = setInterval(() => void this.refresh(), 4000)
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  async refresh(): Promise<void> {
    if (!this.view) {
      dbg('refresh skipped (no view)')
      return
    }
    try {
      const status = await currentStatus()
      const activity = getActivity()
      const browser = vscode.workspace.getConfiguration('dsh').get<string>('browser') ?? 'built-in'
      const showDs = hasDeepSeekModel()
      const dsStatus = showDs ? await getDsStatus() : undefined
      const consoleSize = getConsoleSize()
      const balance = showDs ? getDshBalance() : undefined
      await this.view.webview.postMessage({ type: 'update', status, activity, browser, dsStatus, consoleSize, balance, showDs })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[dsh-launcher-panel] refresh failed:', error)
      // Typed fallback so it stays in sync with ServerStatus (no drifting fields).
      const cfg = readConfig()
      const fallback: ServerStatus = {
        running: false,
        starting: false,
        url: '',
        node: 'unknown',
        dsh: 'unknown',
        dshVersion: '',
        dshSource: '',
        dshPath: '',
        dshHome: '',
        dshPathShort: '',
        dshHomeShort: '',
        nodeVersion: '',
        mode: cfg.mode,
        update: undefined,
      }
      try {
        await this.view.webview.postMessage({
          type: 'update',
          status: fallback,
          activity: `✗ Status refresh failed: ${msg}`,
          browser: 'built-in',
          consoleSize: 0,
          balance: undefined,
        })
      } catch {
        // Webview is gone; nothing more to do.
      }
    }
  }
}
