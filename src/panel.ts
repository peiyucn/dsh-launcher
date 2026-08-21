import * as vscode from 'vscode'
import { actionSetBrowser, actionStart, actionStop, openUrl } from './actions'
import { addActivity, applyMode, clearConsole, clearRequirementsCaches, currentStatus, dbg, fetchDshBalance, finishBusy, getActivity, getDsStatus, getDshBalance, hasDeepSeekModel, readConfig, runDshUpdate, type ServerStatus } from './server'

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length))
  return out
}

const REFRESH_INTERVAL_MS = 4_000

export class DshPanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'dsh.panel'

  private view: vscode.WebviewView | undefined
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly version: string) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    dbg(`view resolved, visible=${view.visible}`)
    view.webview.options = { enableScripts: true }
    view.webview.html = this.getHtml()
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

  private getHtml(): string {
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
  .mode-toggle { display: flex; flex-direction: column; align-items: stretch; margin-left: auto; background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 2px; gap: 2px; flex: none; }
  .mode-option { border: none; border-radius: 8px; padding: 3px 12px; background: transparent; color: var(--vscode-descriptionForeground); cursor: pointer; font-size: 11px; font-weight: 600; font-family: inherit; text-align: center; transition: background .12s, color .12s; }
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
  .log-files { margin-top: 6px; display: flex; flex-direction: column; gap: 3px; }
  .log-file-row { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .log-size { color: var(--vscode-descriptionForeground); font-size: 10px; opacity: .65; flex: none; }
  .console-header { display: flex; align-items: center; gap: 6px; }
  .console-title { font-weight: 600; font-size: 11px; }
  .debug-pill { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 0 8px; font-size: 10px; font-weight: 600; line-height: 18px; cursor: pointer; background: transparent; color: var(--vscode-descriptionForeground); flex: none; font-family: inherit; }
  .debug-pill.on { color: #2ea043; border-color: rgba(46,160,67,.4); background: rgba(46,160,67,.12); }
  .console-header .mini-btn { flex: none; }
  .req-header { display: flex; align-items: center; gap: 6px; }
  .req-title { font-weight: 600; }
  .req-hint { color: var(--vscode-descriptionForeground); font-size: 10px; margin-left: auto; }
  .icon-btn { background: transparent; border: none; border-radius: 4px; color: var(--vscode-foreground); cursor: pointer; padding: 2px 4px; font-size: 12px; flex: none; }
  .icon-btn:hover { color: var(--vscode-textLink-foreground); }
  .icon-btn.spinning { animation: spin 1s linear infinite; }
  .spin { display: inline-block; width: 1em; text-align: center; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-overlay { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: var(--vscode-editor-background); z-index: 10; transition: opacity .2s ease; }
  .loading-overlay.hidden { opacity: 0; pointer-events: none; }
  .loading-spinner { width: 28px; height: 28px; border: 3px solid var(--vscode-panel-border); border-top-color: #4D6BFE; border-radius: 50%; animation: spin 1s linear infinite; }
  .loading-text { color: var(--vscode-descriptionForeground); font-size: 12px; }
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
  .ds-pricing { flex: none; font-size: 10px; padding: 0 5px; border-radius: 4px; line-height: 16px; }
  .ds-pricing.peak { color: #f85149; background: rgba(248,81,73,.12); }
  .ds-pricing.offpeak { color: #2ea043; background: rgba(46,160,67,.12); }
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
  .footer { border-top: 1px solid var(--vscode-panel-border); padding-top: 6px; display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--vscode-descriptionForeground); }
  .setting { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .setting select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; padding: 2px 6px; font-family: inherit; font-size: 12px; }
  .balance-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 4px; padding: 2px 10px; font-size: 11px; font-family: inherit; cursor: pointer; flex: none; }
  .balance-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .balance-btn:disabled { opacity: .6; cursor: progress; }
  .version-row { display: flex; justify-content: flex-end; }
  .plugin-version { font-size: 10px; color: var(--vscode-descriptionForeground); opacity: .65; }
</style>
</head>
<body>
  <div class="loading-overlay" id="loadingOverlay">
    <div class="loading-spinner"></div>
    <div class="loading-text">Loading…</div>
  </div>
  <div class="card">
    <div class="status">
      <span class="dot" id="dot"></span>
      <div class="status-text">
        <span class="status-main" id="statusText">Checking…</span>
        <span class="status-sub" id="statusSub"></span>
      </div>
      <div class="mode-toggle" id="modeToggle">
        <button class="mode-option" data-mode="pnpm">pnpm</button>
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
      <button class="icon-btn" id="refreshBtn" title="Re-check Node / pnpm / DSH / updates">⟳</button>
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
      <span class="ds-pricing" id="dsPricing" title=""></span>
      <button class="ds-open" id="dsOpenBtn" title="status.deepseek.com (official DeepSeek status)">↗</button>
    </div>
    <div class="ds-components" id="dsComponents"></div>
    <div class="balance-row">
      <button class="balance-btn" id="balanceBtn" title="Query DeepSeek account balance">Balance</button>
      <span class="balance-value" id="balanceValue"></span>
    </div>
    <div class="ds-incidents" id="dsIncidents"></div>
  </div>
  <div class="console-header">
    <span class="console-title">Console</span>
    <button class="debug-pill" id="debugToggle" title="Toggle NODE_DEBUG=module in source mode">debug off</button>
    <button class="mini-btn" id="clearConsoleBtn" title="Clear console log">Clear</button>
  </div>
  <pre class="console" id="log"></pre>
  <div class="log-files">
    <div class="log-file-row">
      <span class="runtime-path" id="launcherLogPath" data-log="1"></span>
      <span class="log-size" id="launcherLogSize"></span>
    </div>
    <div class="log-file-row">
      <span class="runtime-path" id="serverLogPath" data-log="1"></span>
      <span class="log-size" id="serverLogSize"></span>
    </div>
  </div>
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
    const LOADING_TIMEOUT_MS = 6000
    const REFRESH_HINT_MS = 2000
    const SPIN_INTERVAL_MS = 150
    const ELAPSED_INTERVAL_MS = 1000
    let gotUpdate = false
    setTimeout(() => {
      if (!gotUpdate) {
        const st = document.getElementById('statusText')
        if (st && st.textContent === 'Checking…') st.textContent = '⚠ No status updates received'
      }
      document.getElementById('loadingOverlay').classList.add('hidden')
    }, LOADING_TIMEOUT_MS)

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
      // Stop must be reachable while starting too, so a slow start can be
      // interrupted (server.ts bails out of waitForPort when it sees the stop).
      document.querySelectorAll('.when-running').forEach((b) => { b.style.display = (running || starting) ? '' : 'none' })
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
        statusText.textContent = 'Starting DeepSeek Harness Web UI…'
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
      const mode = status.mode === 'source' ? 'source' : 'pnpm'
      document.querySelectorAll('.mode-option').forEach((b) => {
        b.classList.toggle('active', b.dataset.mode === mode)
      })
      // data is always shown (top row); the path row only exists in source
      // mode and stays hidden under pnpm, where there is no local checkout.
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
      const dshMissingText = status.dsh === 'missing' ? (status.mode === 'pnpm' ? 'pnpm not found' : 'not found') : '—'
      document.getElementById('dshVersion').textContent = status.dshVersion ? ('v' + status.dshVersion) : dshMissingText
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

    function renderLogFiles(status) {
      status = status || {}
      const launcher = document.getElementById('launcherLogPath')
      const server = document.getElementById('serverLogPath')
      if (launcher) {
        launcher.textContent = status.consoleLogPathShort || ''
        launcher.title = status.consoleLogPath || ''
      }
      if (server) {
        server.textContent = status.serverLogPathShort || ''
        server.title = status.serverLogPath || ''
      }
      const launcherSize = document.getElementById('launcherLogSize')
      const serverSize = document.getElementById('serverLogSize')
      if (launcherSize) launcherSize.textContent = fmtSize(status.consoleLogSize)
      if (serverSize) serverSize.textContent = fmtSize(status.serverLogSize)
    }

    function renderDebug(status) {
      const pill = document.getElementById('debugToggle')
      if (!pill) return
      // NODE_DEBUG=module only applies to source mode; hide the pill under pnpm.
      if (status && status.mode !== 'source') {
        pill.style.display = 'none'
        return
      }
      pill.style.display = ''
      const on = !!(status && status.sourceDebug)
      pill.textContent = on ? 'debug on' : 'debug off'
      pill.className = 'debug-pill' + (on ? ' on' : '')
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
      list.innerHTML = html || '<div class="ds-empty">' + (ds.state === 'unknown' ? 'Status unavailable — check your network' : 'No component data') + '</div>'
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

    function renderPricing() {
      const el = document.getElementById('dsPricing')
      const now = new Date()
      const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes()
      const peak = (utcMin >= 60 && utcMin < 240) || (utcMin >= 360 && utcMin < 600)
      el.textContent = peak ? 'Peak' : 'Off-peak'
      el.className = 'ds-pricing ' + (peak ? 'peak' : 'offpeak')
      const local = (h) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0))
        return String(d.getHours()).padStart(2, '0') + ':00'
      }
      el.title = 'Peak: 01:00–04:00, 06:00–10:00 UTC (your time ' + local(1) + '–' + local(4) + ', ' + local(6) + '–' + local(10) + '); off-peak is half the peak rate'
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
    document.getElementById('debugToggle').addEventListener('click', () => vscode.postMessage({ command: 'toggleDebug' }))
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
        if (!full) return
        if (el.dataset.log) vscode.postMessage({ command: 'openLog', value: full })
        else vscode.postMessage({ command: 'revealPath', value: full })
      })
    })

    let refreshingReqs = false
    let refreshHintTimer = undefined
    function showRefreshHint(text, persistent) {
      const el = document.getElementById('refreshHint')
      el.textContent = text
      if (refreshHintTimer) clearTimeout(refreshHintTimer)
      if (!persistent) refreshHintTimer = setTimeout(() => { el.textContent = '' }, REFRESH_HINT_MS)
    }
    document.getElementById('refreshBtn').addEventListener('click', () => {
      if (refreshingReqs) return
      refreshingReqs = true
      document.getElementById('refreshBtn').classList.add('spinning')
      vscode.postMessage({ command: 'refreshRequirements' })
    })
    let refreshingBalance = false
    document.getElementById('balanceBtn').addEventListener('click', () => {
      refreshingBalance = true
      document.getElementById('balanceBtn').disabled = true
      document.getElementById('balanceValue').textContent = 'querying…'
      vscode.postMessage({ command: 'balance' })
    })

    let since = 0
    let elapsedTimer = undefined
    function stopElapsed() {
      if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = undefined }
    }
    const SPIN_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    let spinIdx = 0
    let spinTimer = undefined
    function startSpin() {
      if (spinTimer) return
      spinTimer = setInterval(() => {
        const c = SPIN_CHARS[spinIdx++ % SPIN_CHARS.length]
        document.querySelectorAll('.spin').forEach((el) => { el.textContent = c })
      }, SPIN_INTERVAL_MS)
    }
    function stopSpin() {
      if (spinTimer) { clearInterval(spinTimer); spinTimer = undefined }
    }
    function startElapsed() {
      if (elapsedTimer) return false
      since = Date.now()
      elapsedTimer = setInterval(() => {
        const e = document.getElementById('statusSub')
        if (e) e.textContent = 'Waited ' + Math.round((Date.now() - since) / 1000) + 's'
      }, ELAPSED_INTERVAL_MS)
      return true
    }

    window.addEventListener('message', (e) => {
      const m = e.data
      if (!m || m.type !== 'update') return
      gotUpdate = true
      document.getElementById('loadingOverlay').classList.add('hidden')
      if (refreshingReqs) {
        refreshingReqs = false
        document.getElementById('refreshBtn').classList.remove('spinning')
        showRefreshHint('✓', false)
      }
      if (refreshingBalance) {
        refreshingBalance = false
        document.getElementById('balanceBtn').disabled = false
      }
      document.getElementById('browserSelect').value = m.browser || 'built-in'
      const log = document.getElementById('log')
      const entries = Array.isArray(m.activity) ? m.activity : []
      const newline = String.fromCharCode(10)
      const text = entries.map((e) => e.text).join(newline)
      const hasNew = log.dataset.activity !== text
      log.dataset.activity = text
      let logHtml = entries.map((e) => {
        const txt = esc(e.text)
        if (!e.busy) return txt
        // Swap the leading icon (the char right after the timestamp) for a spinner.
        const close = txt.indexOf('] ')
        if (close === -1) return txt
        return txt.slice(0, close + 2) + '<span class="spin">⠋</span>' + txt.slice(close + 3)
      }).join(newline)
      if (entries.some((e) => e.busy)) startSpin()
      else stopSpin()
      log.innerHTML = logHtml || '(no activity yet)'
      if (hasNew) log.scrollTop = log.scrollHeight
      const dsCard = document.getElementById('dsCard')
      if (dsCard) dsCard.style.display = m.showDs === false ? 'none' : ''
      renderRunning(m.status)
      renderRequirements(m.status)
      renderLogFiles(m.status)
      renderDebug(m.status)
      renderDs(m.dsStatus)
      renderBalance(m.balance)
      renderPricing()
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
        addActivity('↻ Re-checking requirements…', true)
        await this.refresh()
        await clearRequirementsCaches()
        {
          const st = await currentStatus()
          const node = st.node === 'ok' ? 'v' + st.nodeVersion : 'missing'
          const dsh = st.dsh === 'ok' ? 'v' + st.dshVersion : st.dsh === 'missing' ? 'missing' : 'not installed'
          const upd = st.update && st.update.hasUpdate ? ' · update → ' + st.update.label : ''
          addActivity(`✓ Re-checked: Node ${node} · DSH ${dsh}${upd}`)
        }
        finishBusy()
        break
      case 'setMode':
        if (message.value === 'pnpm' || message.value === 'source') {
          const st = await currentStatus()
          if (st.running) {
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
            // A start may be in flight with the old mode: interrupt it so the
            // new mode takes effect on the next Start.
            if (st.starting) await actionStop()
            await applyMode(message.value)
          }
        }
        break
      case 'revealPath':
        if (message.value) void vscode.env.openExternal(vscode.Uri.file(message.value))
        break
      case 'openLog':
        if (message.value) {
          const uri = vscode.Uri.file(message.value)
          try {
            await vscode.window.showTextDocument(uri, { preview: true })
          } catch {
            void vscode.env.openExternal(uri)
          }
        }
        break
      case 'balance':
        addActivity('↻ Querying DeepSeek balance…', true)
        await fetchDshBalance()
        {
          const b = getDshBalance()
          if (b?.balance) addActivity(`✓ Balance: ${b.balance.total} ${b.balance.currency}`)
          else addActivity(`⚠ Balance: ${b?.error ?? 'no balance data'}`)
        }
        finishBusy()
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
      case 'toggleDebug': {
        const cfg = vscode.workspace.getConfiguration('dsh')
        const cur = cfg.get<boolean>('sourceDebug') ?? false
        await cfg.update('sourceDebug', !cur, vscode.ConfigurationTarget.Global)
        await this.refresh()
        break
      }
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
    this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS)
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
      const balance = showDs ? getDshBalance() : undefined
      await this.view.webview.postMessage({ type: 'update', status, activity, browser, dsStatus, balance, showDs })
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
        consoleLogPath: '',
        consoleLogPathShort: '',
        serverLogPath: '',
        serverLogPathShort: '',
        consoleLogSize: 0,
        serverLogSize: 0,
        sourceDebug: false,
      }
      try {
        await this.view.webview.postMessage({
          type: 'update',
          status: fallback,
          activity: [{ text: `✗ Status refresh failed: ${msg}`, busy: false }],
          browser: 'built-in',
          balance: undefined,
        })
      } catch {
        // Webview is gone; nothing more to do.
      }
    }
  }
}
