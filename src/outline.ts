// Copyright © reqstool

import * as vscode from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'

type Scope = 'project' | 'file'

type ListData = {
    requirements: { id: string; title: string; lifecycle_state: string }[]
    svcs:         { id: string; title: string; lifecycle_state: string; verification: string }[]
    mvrs:         { id: string; passed: boolean }[]
}


export class OutlineProvider implements vscode.WebviewViewProvider {
    static readonly viewId = 'reqstool.outlineView'

    private _view: vscode.WebviewView | undefined
    private _scope: Scope = 'project'
    private _activeUri: vscode.Uri | undefined

    constructor(private readonly _client: LanguageClient) {}

    setScope(scope: Scope): void {
        this._scope = scope
        vscode.commands.executeCommand('setContext', 'reqstool.outlineScope', scope)
        this._reload()
    }

    refresh(): void { this._reload() }

    onEditorChange(editor: vscode.TextEditor | undefined): void {
        if (this._scope !== 'file') { return }
        this._activeUri = editor?.document.uri
        this._reload()
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this._view = webviewView
        webviewView.webview.options = { enableScripts: true }
        webviewView.webview.html = OutlineProvider._shell()
        webviewView.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'ready') { this._reload() }
            if (msg.command === 'openDetails') {
                vscode.commands.executeCommand('reqstool.openDetails', { id: msg.id, type: msg.type })
            }
        })
    }

    private async _reload(): Promise<void> {
        if (!this._view) { return }
        this._view.webview.postMessage({ command: 'loading' })
        const data = await this._loadData()
        this._view.webview.postMessage({ command: 'data', payload: data })
    }

    private async _loadData(): Promise<ListData | null> {
        if (this._scope === 'project') {
            const urnEntries = await this._client.sendRequest<{ urn: string }[]>('reqstool/list-urns', {})
                .catch(() => null)
            if (!urnEntries) { return null }

            const perUrn = await Promise.all(
                urnEntries.map(({ urn }) =>
                    this._client.sendRequest<ListData | null>('reqstool/list', { urn })
                        .then(d => ({ urn, data: d }))
                        .catch(() => null)
                )
            )

            const all: ListData = { requirements: [], svcs: [], mvrs: [] }
            for (const entry of perUrn) {
                if (!entry?.data) { continue }
                const { urn, data } = entry
                all.requirements.push(...data.requirements.map(r => ({ ...r, id: `${urn}:${r.id}` })))
                all.svcs.push(        ...data.svcs.map(s =>        ({ ...s, id: `${urn}:${s.id}` })))
                all.mvrs.push(        ...data.mvrs.map(m =>        ({ ...m, id: `${urn}:${m.id}` })))
            }
            return all
        }

        const uri = this._activeUri ?? vscode.window.activeTextEditor?.document.uri
        if (!uri) { return { requirements: [], svcs: [], mvrs: [] } }

        const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
            'vscode.executeCodeLensProvider', uri
        ) ?? []

        const reqIds = new Set<string>()
        const svcIds = new Set<string>()
        for (const lens of lenses) {
            const args = lens.command?.arguments?.[0] as { ids?: string[]; type?: string } | undefined
            if (!args?.ids || !args?.type) { continue }
            if (args.type === 'requirement') { args.ids.forEach(id => reqIds.add(id)) }
            if (args.type === 'svc')         { args.ids.forEach(id => svcIds.add(id)) }
        }

        const [reqs, svcs] = await Promise.all([
            Promise.all([...reqIds].map(id =>
                this._client.sendRequest<{ id: string; urn: string; title: string; lifecycle: { state: string } } | null>(
                    'reqstool/details', { id, type: 'requirement' }
                ).then(d => d ? { id: `${d.urn}:${d.id}`, title: d.title, lifecycle_state: d.lifecycle?.state ?? '' } : null)
            )),
            Promise.all([...svcIds].map(id =>
                this._client.sendRequest<{ id: string; urn: string; title: string; lifecycle: { state: string }; verification: string } | null>(
                    'reqstool/details', { id, type: 'svc' }
                ).then(d => d ? { id: `${d.urn}:${d.id}`, title: d.title, lifecycle_state: d.lifecycle?.state ?? '', verification: d.verification } : null)
            )),
        ])

        return {
            requirements: reqs.filter((r): r is NonNullable<typeof r> => r !== null),
            svcs: svcs.filter((s): s is NonNullable<typeof s> => s !== null),
            mvrs: [],
        }
    }

    private static _shell(): string {
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
    display: flex; flex-direction: column; height: 100vh; overflow: hidden;
  }
  #filter-bar {
    display: flex; align-items: center; gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.2));
    flex-shrink: 0;
    background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
  }
  #filter {
    flex: 1; background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px; padding: 2px 6px;
    font-family: inherit; font-size: inherit; outline: none;
  }
  #filter:focus { border-color: var(--vscode-focusBorder); }
  #filter::placeholder { color: var(--vscode-input-placeholderForeground); }
  #clear-btn {
    cursor: pointer; background: none; border: none; color: var(--vscode-foreground);
    opacity: 0.5; font-size: 14px; padding: 0 2px; line-height: 1;
  }
  #clear-btn:hover { opacity: 1; }
  #list { flex: 1; overflow-y: auto; }
  .section-hdr {
    padding: 4px 8px; font-size: 0.8em; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-descriptionForeground));
    background: var(--vscode-sideBarSectionHeader-background);
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.2));
    position: sticky; top: 0; z-index: 1; cursor: default;
    user-select: none;
  }
  .item {
    padding: 3px 8px 3px 20px; cursor: pointer; display: flex;
    align-items: center; gap: 5px; white-space: nowrap; overflow: hidden;
  }
  .item:hover { background: var(--vscode-list-hoverBackground); }
  .item-label { overflow: hidden; text-overflow: ellipsis; flex: 1; }
  .item.hidden { display: none; }
  .empty-msg { padding: 8px; color: var(--vscode-descriptionForeground); font-style: italic; }
  #loading { padding: 8px; color: var(--vscode-descriptionForeground); }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { display: inline-block; animation: spin 1s linear infinite; margin-right: 4px; }
</style>
</head>
<body>
<div id="filter-bar">
  <input id="filter" type="text" placeholder="Filter (e.g. WEB, CLI, port)" autocomplete="off" spellcheck="false">
  <button id="clear-btn" title="Clear filter" hidden>✕</button>
</div>
<div id="list"><div id="loading"><span class="spin">⟳</span>Loading…</div></div>
<script>
const vscode = acquireVsCodeApi();
vscode.postMessage({ command: 'ready' });

const filterEl = document.getElementById('filter');
const clearBtn = document.getElementById('clear-btn');
const listEl   = document.getElementById('list');

filterEl.addEventListener('input', () => {
    const q = filterEl.value.toLowerCase();
    clearBtn.hidden = !q;
    document.querySelectorAll('.item').forEach(el => {
        const match = !q || (el.dataset.label ?? '').toLowerCase().includes(q);
        el.classList.toggle('hidden', !match);
    });
    document.querySelectorAll('.section-hdr').forEach(hdr => {
        const sec = hdr.dataset.section;
        const visible = listEl.querySelectorAll('.item[data-section="' + sec + '"]:not(.hidden)').length;
        const total   = listEl.querySelectorAll('.item[data-section="' + sec + '"]').length;
        hdr.textContent = sectionLabel(hdr.dataset.label, visible, total, q);
        hdr.classList.toggle('hidden', q !== '' && visible === 0);
    });
});

clearBtn.addEventListener('click', () => {
    filterEl.value = '';
    clearBtn.hidden = true;
    filterEl.dispatchEvent(new Event('input'));
    filterEl.focus();
});

window.addEventListener('message', ({ data: msg }) => {
    if (msg.command === 'loading') {
        listEl.innerHTML = '<div id="loading"><span class="spin">⟳</span>Loading…</div>';
        filterEl.value = ''; clearBtn.hidden = true;
    } else if (msg.command === 'data') {
        render(msg.payload);
    }
});

function sectionLabel(name, shown, total, q) {
    if (q && shown < total) return name + ' (' + shown + ' / ' + total + ')';
    return name + ' (' + total + ')';
}

function render(d) {
    if (!d) { listEl.innerHTML = '<div class="empty-msg">No project loaded.</div>'; return; }
    const sections = [
        { key: 'requirements', label: 'Requirements', items: d.requirements, type: 'requirement',
          icon: i => stateIcon(i.lifecycle_state), row: i => i.id + ': ' + i.title },
        { key: 'svcs',         label: 'SVCs',         items: d.svcs,         type: 'svc',
          icon: i => stateIcon(i.lifecycle_state), row: i => i.id + ': ' + i.title },
        { key: 'mvrs',         label: 'MVRs',         items: d.mvrs,         type: 'mvr',
          icon: i => (i.passed ? '✓' : '✗'),          row: i => i.id },
    ];
    const q = filterEl.value.toLowerCase();
    listEl.innerHTML = sections.map(s => {
        const shown = q ? s.items.filter(i => s.row(i).toLowerCase().includes(q)).length : s.items.length;
        const hdrHidden = q !== '' && shown === 0 ? ' hidden' : '';
        const hdr = '<div class="section-hdr' + hdrHidden + '" data-section="' + s.key + '" data-label="' + esc(s.label) + '">' +
                    sectionLabel(s.label, shown, s.items.length, q) + '</div>';
        const rows = s.items.map(i => {
            const lbl = s.row(i);
            const rowHidden = q && !lbl.toLowerCase().includes(q) ? ' hidden' : '';
            return '<div class="item' + rowHidden + '" data-id="' + esc(i.id) + '" data-type="' + s.type + '" data-label="' + esc(lbl) + '" data-section="' + s.key + '">' +
                   '<span class="icon">' + s.icon(i) + '</span><span class="item-label">' + esc(lbl) + '</span></div>';
        }).join('');
        return hdr + rows;
    }).join('');
    listEl.querySelectorAll('.item').forEach(el => {
        el.addEventListener('click', () => {
            vscode.postMessage({ command: 'openDetails', id: el.dataset.id, type: el.dataset.type });
        });
    });
}

function stateIcon(state) {
    const s = (state ?? '').toLowerCase();
    if (s.includes('effective') || s.includes('active')) return '●';
    if (s.includes('draft'))      return '○';
    if (s.includes('deprecated')) return '▲';
    if (s.includes('obsolete'))   return '✗';
    return '○';
}
function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
</script>
</body>
</html>`
    }
}
