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

export class OutlineProvider implements vscode.TreeDataProvider<OutlineNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>()
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event

    private _scope: Scope = 'project'
    private _cache: ListData | undefined
    private _activeUri: vscode.Uri | undefined

    constructor(private readonly _client: LanguageClient) {}

    setScope(scope: Scope): void {
        this._scope = scope
        vscode.commands.executeCommand('setContext', 'reqstool.outlineScope', scope)
        this.refresh()
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

        if (!this._cache) {
            this._cache = await this._loadData()
        }
        const data = this._cache
        if (!data) { return [] }

        if (!node) {
            // Root: return section nodes with counts
            return [
                { kind: 'section', type: 'requirement', label: `Requirements (${data.requirements.length})` },
                { kind: 'section', type: 'svc',         label: `SVCs (${data.svcs.length})` },
                { kind: 'section', type: 'mvr',         label: `MVRs (${data.mvrs.length})` },
            ]
        }

        // Children of a section
        if (node.type === 'requirement') {
            return data.requirements.map(r => ({
                kind: 'item' as const,
                id: r.id,
                type: 'requirement' as const,
                label: `${r.id}: ${r.title}`,
                icon: lifecycleIcon(r.lifecycle_state),
            }))
        }
        if (node.type === 'svc') {
            return data.svcs.map(s => ({
                kind: 'item' as const,
                id: s.id,
                type: 'svc' as const,
                label: `${s.id}: ${s.title}`,
                icon: lifecycleIcon(s.lifecycle_state),
            }))
        }
        if (node.type === 'mvr') {
            return data.mvrs.map(m => ({
                kind: 'item' as const,
                id: m.id,
                type: 'mvr' as const,
                label: m.id,
                icon: m.passed ? 'pass-filled' : 'error',
            }))
        }
        return []
    }

    private async _loadData(): Promise<ListData | undefined> {
        if (this._scope === 'project') {
            return this._client.sendRequest<ListData | null>('reqstool/list', {}).then(d => d ?? undefined)
        }

        // File scope: extract IDs from code lenses for the active file
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
                this._client.sendRequest<{ id: string; title: string; lifecycle: { state: string } } | null>(
                    'reqstool/details', { id, type: 'requirement' }
                ).then(d => d ? { id: d.id, title: d.title, lifecycle_state: d.lifecycle?.state ?? '' } : null)
            )),
            Promise.all([...svcIds].map(id =>
                this._client.sendRequest<{ id: string; title: string; lifecycle: { state: string }; verification: string } | null>(
                    'reqstool/details', { id, type: 'svc' }
                ).then(d => d ? { id: d.id, title: d.title, lifecycle_state: d.lifecycle?.state ?? '', verification: d.verification } : null)
            )),
        ])

        return {
            requirements: reqs.filter((r): r is NonNullable<typeof r> => r !== null),
            svcs: svcs.filter((s): s is NonNullable<typeof s> => s !== null),
            mvrs: [],   // MVRs not annotated in source files
        }
    }
}
