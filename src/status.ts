// Copyright © reqstool

import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'

type ListData = {
    requirements: { id: string }[]
    svcs: { id: string }[]
    mvrs: { id: string }[]
}

export class StatusViewProvider implements vscode.WebviewViewProvider {
    static readonly viewId = 'reqstool.statusView'

    private _view: vscode.WebviewView | undefined
    private _version: string | undefined
    private _source: string | undefined
    private _client: LanguageClient | undefined

    setServerInfo(version: string | undefined, source: string): void {
        this._version = version
        this._source = source
        this._refresh()
    }

    setClient(client: LanguageClient): void {
        this._client = client
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView
        webviewView.webview.options = { enableScripts: true }
        webviewView.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'load') { this._loadData() }
        })
        webviewView.webview.html = this._html(undefined)
    }

    private _refresh(): void {
        if (!this._view) { return }
        this._view.webview.html = this._html(undefined)
    }

    private async _loadData(): Promise<void> {
        if (!this._view || !this._client) { return }
        try {
            const data = await this._client.sendRequest<ListData | null>('reqstool/list', {})
            this._view.webview.postMessage({ command: 'data', payload: data ?? null })
        } catch {
            this._view.webview.postMessage({ command: 'error' })
        }
    }

    private _html(_data: ListData | null | undefined): string {
        const version = this._version ?? 'unknown'
        const source = this._source ?? 'unknown'
        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-panel-background);
    padding: 12px 16px;
  }
  h2 {
    font-size: 1em;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--vscode-panelTitle-activeForeground);
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2));
  }
  .row:last-child { border-bottom: none; }
  .label { opacity: .8; }
  .value {
    font-weight: 600;
    color: var(--vscode-textLink-foreground);
  }
  .spinner {
    text-align: center;
    padding: 20px 0;
    opacity: .6;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { display: inline-block; animation: spin 1s linear infinite; }
</style>
</head>
<body>
<h2>reqstool</h2>
<div id="static">
  <div class="row"><span class="label">Version</span><span class="value" id="ver">${_esc(version)}</span></div>
  <div class="row"><span class="label">Source</span><span class="value" id="src">${_esc(source)}</span></div>
</div>
<div id="dynamic"><div class="spinner"><span class="spin">⟳</span> Loading…</div></div>
<script>
const vscode = acquireVsCodeApi();
vscode.postMessage({ command: 'load' });
window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.command === 'data') { render(msg.payload); }
  if (msg.command === 'error') { document.getElementById('dynamic').innerHTML = '<div class="row" style="opacity:.6">Could not load project data</div>'; }
});
function render(d) {
  if (!d) { document.getElementById('dynamic').innerHTML = '<div class="row" style="opacity:.6">No project loaded</div>'; return; }
  const urns = [...new Set(d.requirements.map(r => r.id.split(':')[0]).filter(Boolean))];
  document.getElementById('dynamic').innerHTML = [
    row('URNs',         urns.length),
    row('Requirements', d.requirements.length),
    row('SVCs',         d.svcs.length),
    row('MVRs',         d.mvrs.length),
  ].join('');
}
function row(label, value) {
  return '<div class="row"><span class="label">' + label + '</span><span class="value">' + value + '</span></div>';
}
</script>
</body>
</html>`
    }
}

function _esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
