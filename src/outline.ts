// Copyright © reqstool

import * as vscode from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'

type Scope = 'project' | 'file'

type ListData = {
    requirements: { id: string; title: string; lifecycle_state: string }[]
    svcs:         { id: string; title: string; lifecycle_state: string; verification: string }[]
    mvrs:         { id: string; passed: boolean }[]
}

type SectionNode = { kind: 'section'; type: 'requirement' | 'svc' | 'mvr'; label: string }
type ItemNode    = { kind: 'item'; id: string; label: string; type: 'requirement' | 'svc' | 'mvr'; icon: string }
type OutlineNode = SectionNode | ItemNode

function lifecycleIcon(state: string | undefined): string {
    const s = (state ?? '').toLowerCase()
    if (s.includes('effective') || s.includes('active')) { return 'pass-filled' }
    if (s.includes('draft'))      { return 'circle-outline' }
    if (s.includes('deprecated')) { return 'warning' }
    if (s.includes('obsolete'))   { return 'error' }
    return 'circle-outline'
}

// ── Filter input WebviewView ──────────────────────────────────────────────────

export class OutlineFilterProvider implements vscode.WebviewViewProvider {
    static readonly viewId = 'reqstool.filterView'

    private _onFilter = new vscode.EventEmitter<string>()
    readonly onFilter = this._onFilter.event

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        webviewView.webview.options = { enableScripts: true }
        webviewView.webview.html = this._html()
        webviewView.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'filter') { this._onFilter.fire(msg.query ?? '') }
        })
    }

    private _html(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--vscode-sideBar-background);
    padding: 4px 8px;
    display: flex; align-items: center; gap: 4px;
  }
  input {
    flex: 1; background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px; padding: 3px 6px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    outline: none;
  }
  input:focus { border-color: var(--vscode-focusBorder); }
  input::placeholder { color: var(--vscode-input-placeholderForeground); }
  button {
    cursor: pointer; background: none; border: none;
    color: var(--vscode-foreground); opacity: 0.5;
    font-size: 13px; padding: 0 2px; line-height: 1;
  }
  button:hover { opacity: 1; }
</style>
</head>
<body>
<input id="f" type="text" placeholder="Filter (e.g. WEB, CLI, port)" autocomplete="off" spellcheck="false">
<button id="x" hidden title="Clear">✕</button>
<script>
const vscode = acquireVsCodeApi();
const f = document.getElementById('f');
const x = document.getElementById('x');
let t;
f.addEventListener('input', () => {
    x.hidden = !f.value;
    clearTimeout(t);
    t = setTimeout(() => vscode.postMessage({ command: 'filter', query: f.value }), 150);
});
x.addEventListener('click', () => {
    f.value = ''; x.hidden = true;
    vscode.postMessage({ command: 'filter', query: '' });
    f.focus();
});
</script>
</body>
</html>`
    }
}

// ── Outline TreeDataProvider ──────────────────────────────────────────────────

export class OutlineProvider implements vscode.TreeDataProvider<OutlineNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>()
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event

    private _scope: Scope = 'project'
    private _cache: ListData | undefined
    private _activeUri: vscode.Uri | undefined
    private _filter = ''

    constructor(private readonly _client: LanguageClient) {}

    setScope(scope: Scope): void {
        this._scope = scope
        vscode.commands.executeCommand('setContext', 'reqstool.outlineScope', scope)
        this.refresh()
    }

    setFilter(query: string): void {
        this._filter = query.trim().toLowerCase()
        this._onDidChangeTreeData.fire()
    }

    onEditorChange(editor: vscode.TextEditor | undefined): void {
        if (this._scope !== 'file') { return }
        this._activeUri = editor?.document.uri
        this.refresh()
    }

    refresh(): void {
        this._cache = undefined
        this._onDidChangeTreeData.fire()
    }

    getTreeItem(node: OutlineNode): vscode.TreeItem {
        if (node.kind === 'section') {
            const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded)
            item.contextValue = 'reqstoolSection'
            return item
        }
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None)
        item.iconPath = new vscode.ThemeIcon(node.icon)
        item.command = {
            command: 'reqstool.openDetails',
            title: 'Open Details',
            arguments: [{ id: node.id, type: node.type }],
        }
        item.tooltip = node.id
        return item
    }

    async getChildren(node?: OutlineNode): Promise<OutlineNode[]> {
        if (node?.kind === 'item') { return [] }

        if (!this._cache) { this._cache = await this._loadData() }
        const data = this._cache
        if (!data) { return [] }

        const f = this._filter
        const match = (id: string, title?: string) =>
            !f || id.toLowerCase().includes(f) || (title ?? '').toLowerCase().includes(f)

        if (!node) {
            const reqs = data.requirements.filter(r => match(r.id, r.title))
            const svcs = data.svcs.filter(s => match(s.id, s.title))
            const mvrs = data.mvrs.filter(m => match(m.id))
            const lbl = (name: string, shown: number, total: number) =>
                f ? `${name} (${shown} / ${total})` : `${name} (${total})`
            return [
                { kind: 'section', type: 'requirement', label: lbl('Requirements', reqs.length, data.requirements.length) },
                { kind: 'section', type: 'svc',         label: lbl('SVCs',         svcs.length, data.svcs.length) },
                { kind: 'section', type: 'mvr',         label: lbl('MVRs',         mvrs.length, data.mvrs.length) },
            ]
        }

        if (node.type === 'requirement') {
            return data.requirements.filter(r => match(r.id, r.title)).map(r => ({
                kind: 'item' as const, id: r.id, type: 'requirement' as const,
                label: `${r.id}: ${r.title}`, icon: lifecycleIcon(r.lifecycle_state),
            }))
        }
        if (node.type === 'svc') {
            return data.svcs.filter(s => match(s.id, s.title)).map(s => ({
                kind: 'item' as const, id: s.id, type: 'svc' as const,
                label: `${s.id}: ${s.title}`, icon: lifecycleIcon(s.lifecycle_state),
            }))
        }
        if (node.type === 'mvr') {
            return data.mvrs.filter(m => match(m.id)).map(m => ({
                kind: 'item' as const, id: m.id, type: 'mvr' as const,
                label: m.id, icon: m.passed ? 'pass-filled' : 'error',
            }))
        }
        return []
    }

    private async _loadData(): Promise<ListData | undefined> {
        if (this._scope === 'project') {
            const urnEntries = await this._client.sendRequest<{ urn: string }[]>('reqstool/list-urns', {})
                .catch(() => null)
            if (!urnEntries) { return undefined }

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
}
