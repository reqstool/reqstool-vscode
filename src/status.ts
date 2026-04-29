// Copyright © reqstool

import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node'

type ListData = {
    requirements: { id: string }[]
    svcs: { id: string }[]
    mvrs: { id: string }[]
}

export class StatusPanel {
    private _panel: vscode.WebviewPanel | undefined
    private _version: string | undefined
    private _source: string | undefined
    private _client: LanguageClient | undefined
    private _context: vscode.ExtensionContext

    constructor(context: vscode.ExtensionContext) {
        this._context = context
    }

    setServerInfo(version: string | undefined, source: string): void {
        this._version = version
        this._source = source
        if (this._panel) {
            this._panel.webview.html = this._html()
        }
    }

    setClient(client: LanguageClient): void {
        this._client = client
    }

    toggle(): void {
        if (this._panel) {
            this._panel.dispose()
            return
        }
        this._panel = vscode.window.createWebviewPanel(
            'reqstool.status',
            'reqstool',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        )
        this._panel.webview.html = this._html()
        this._panel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'load') { this._loadData() }
        }, undefined, this._context.subscriptions)
        this._panel.onDidDispose(() => { this._panel = undefined }, undefined, this._context.subscriptions)
    }

    private async _loadData(): Promise<void> {
        if (!this._panel || !this._client) {
            this._panel?.webview.postMessage({ command: 'error', reason: 'not-ready' })
            return
        }
        try {
            const data = await this._client.sendRequest<ListData | null>('reqstool/list', {})
            this._panel.webview.postMessage({ command: 'data', payload: data ?? null })
        } catch {
            this._panel?.webview.postMessage({ command: 'error', reason: 'request-failed' })
        }
    }

    private _html(): string {
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
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    padding: 16px;
    min-width: 220px;
  }
  h2 {
    font-size: 1.05em;
    font-weight: 600;
    margin-bottom: 14px;
    color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));
    letter-spacing: .02em;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 0;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,.15));
  }
  .row:last-child { border-bottom: none; }
  .label { opacity: .75; }
  .value {
    font-weight: 600;
    color: var(--vscode-textLink-foreground);
  }
  .loading {
    text-align: center;
    padding: 16px 0;
    opacity: .55;
    font-style: italic;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { display: inline-block; animation: spin 1s linear infinite; margin-right: 4px; }
</style>
</head>
<body>
<h2>reqstool</h2>
<div id="static">
  <div class="row"><span class="label">Version</span><span class="value">${_esc(version)}</span></div>
  <div class="row"><span class="label">Source</span><span class="value">${_esc(source)}</span></div>
</div>
<div id="dynamic"><div class="loading"><span class="spin">⟳</span>Loading…</div></div>
<script>
const vscode = acquireVsCodeApi();
vscode.postMessage({ command: 'load' });
window.addEventListener('message', ({ data: msg }) => {
  if (msg.command === 'data') { render(msg.payload); }
  if (msg.command === 'error') {
    document.getElementById('dynamic').innerHTML =
      '<div class="loading">' + (msg.reason === 'not-ready' ? 'Server not ready yet' : 'Could not load project data') + '</div>';
  }
});
function render(d) {
  if (!d) {
    document.getElementById('dynamic').innerHTML = '<div class="loading">No project loaded</div>';
    return;
  }
  const urns = [...new Set(d.requirements.map(r => {
    const colon = r.id.indexOf(':');
    return colon > 0 ? r.id.slice(0, colon) : null;
  }).filter(Boolean))];
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
