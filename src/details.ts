// Copyright © reqstool

import * as vscode from 'vscode'

type Req = {
    type: 'requirement'
    id: string; urn: string; title: string; significance: string
    description: string; rationale: string; revision: string
    lifecycle: { state: string; reason: string }
    categories: string[]; implementation: string; references: string[]
    implementations: { element_kind: string; fqn: string }[]
    svcs: {
        id: string; urn: string; title: string; verification: string
        lifecycle_state: string
        test_summary: { passed: number; failed: number; skipped: number; missing: number }
    }[]
}

type Svc = {
    type: 'svc'
    id: string; urn: string; title: string; description: string
    verification: string; instructions: string; revision: string
    lifecycle: { state: string; reason: string }
    requirement_ids: { id: string; urn: string; title: string; lifecycle_state: string }[]
    test_annotations: { element_kind: string; fqn: string }[]
    test_results: { fqn: string; status: string }[]
    test_summary: { passed: number; failed: number; skipped: number; missing: number }
    mvrs: { id: string; urn: string; passed: boolean; comment: string }[]
}

type Mvr = {
    type: 'mvr'
    id: string; urn: string; passed: boolean; comment: string
    svc_ids: { id: string; urn: string }[]
}

type DetailsData = Req | Svc | Mvr

function esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function badge(text: string, color = 'var(--vscode-badge-background)'): string {
    return `<span style="background:${color};color:var(--vscode-badge-foreground);padding:2px 6px;border-radius:3px;font-size:0.8em;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">${esc(text)}</span>`
}

function lifecycleBadge(state: string): string {
    const s = state.toLowerCase()
    const color = s.includes('obsolete')   ? 'var(--vscode-statusBarItem-errorBackground)'
                : s.includes('deprecated') ? 'var(--vscode-statusBarItem-warningBackground)'
                : s.includes('draft')      ? 'var(--vscode-debugIcon-startForeground)'
                : s.includes('effective') || s.includes('active') ? 'var(--vscode-testing-iconPassed)'
                :                            'var(--vscode-descriptionForeground)'
    return `<p>${badge(state, color)}</p>`
}

function section(title: string, content: string): string {
    if (!content.trim()) { return '' }
    return `<section><h2>${esc(title)}</h2>${content}</section>`
}

function table(headers: string[], rows: string[][]): string {
    if (rows.length === 0) { return '' }
    const head = headers.map(h => `<th>${esc(h)}</th>`).join('')
    const body = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function prose(text: string): string {
    if (!text) { return '' }
    return `<p>${esc(text)}</p>`
}

function detailsLink(id: string, type: 'requirement' | 'svc' | 'mvr'): string {
    return `<a class="cmd-link" data-id="${esc(id)}" data-type="${type}" href="#">${esc(id)}</a>`
}

function statusIcon(status: string): string {
    switch (status.toLowerCase()) {
        case 'passed': return '✓'
        case 'failed': return '✗'
        case 'skipped': return '⊘'
        default: return '?'
    }
}

function renderRequirement(d: Req): string {
    const meta = [
        d.categories.length ? `<strong>Categories:</strong> ${d.categories.map(esc).join(', ')}` : '',
        d.implementation ? `<strong>Implementation:</strong> ${esc(d.implementation)}` : '',
        d.references.length ? `<strong>References:</strong> ${d.references.map(esc).join(', ')}` : '',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ')

    const impls = section('Implementations',
        table(['Kind', 'FQN'],
            d.implementations.map(i => [esc(i.element_kind), `<code class="fqn-link" data-fqn="${esc(i.fqn)}" data-kind="${esc(i.element_kind)}">${esc(i.fqn)}</code>`])))

    const svcs = section('Software Verification Cases',
        table(['ID', 'Title', 'Verification', 'Tests'],
            d.svcs.map(s => {
                const ts = s.test_summary
                const testCell = ts.passed + ts.failed + ts.skipped + ts.missing === 0
                    ? '—'
                    : `${statusIcon('passed')} ${ts.passed} ${statusIcon('failed')} ${ts.failed} ${statusIcon('skipped')} ${ts.skipped}`
                const svcLink = detailsLink(s.id, 'svc')
                const stateBadge = s.lifecycle_state && s.lifecycle_state.toLowerCase() !== 'effective' && s.lifecycle_state.toLowerCase() !== 'active'
                    ? ` ${badge(s.lifecycle_state)}`
                    : ''
                return [svcLink + stateBadge, esc(s.title), esc(s.verification), testCell]
            })))

    return `
        <header>
            ${badge('requirement')} <span class="title">${esc(d.title)}</span>
            <div class="sub"><code>${esc(d.id)}</code> &nbsp;·&nbsp; ${esc(d.significance)} &nbsp;·&nbsp; ${esc(d.revision)}</div>
        </header>
        ${lifecycleBadge(d.lifecycle.state)}
        ${section('Description', prose(d.description))}
        ${section('Rationale', prose(d.rationale))}
        ${meta ? `<p class="meta">${meta}</p>` : ''}
        ${impls}
        ${svcs}
    `
}

function renderSvc(d: Svc): string {
    const s = d.test_summary
    const testSummary = `<p>${statusIcon('passed')} ${s.passed} passed &nbsp; ${statusIcon('failed')} ${s.failed} failed &nbsp; ${statusIcon('skipped')} ${s.skipped} skipped &nbsp; ${statusIcon('missing')} ${s.missing} missing</p>`

    const reqs = section('Requirements',
        table(['ID', 'Title', 'Lifecycle'],
            d.requirement_ids.map(r => [detailsLink(r.id, 'requirement'), esc(r.title), esc(r.lifecycle_state)])))

    const results = section('Test Results',
        table(['FQN', 'Status'],
            d.test_results.map(t => [`<code>${esc(t.fqn)}</code>`, statusIcon(t.status)])))

    const mvrs = section('Manual Verification Results',
        table(['ID', 'Passed', 'Comment'],
            d.mvrs.map(m => [detailsLink(m.id, 'mvr'), m.passed ? '✓' : '✗', esc(m.comment)])))

    return `
        <header>
            ${badge('svc')} <span class="title">${esc(d.title)}</span>
            <div class="sub"><code>${esc(d.id)}</code> &nbsp;·&nbsp; ${esc(d.verification)} &nbsp;·&nbsp; ${esc(d.revision)}</div>
        </header>
        ${lifecycleBadge(d.lifecycle.state)}
        ${section('Description', prose(d.description))}
        ${section('Instructions', prose(d.instructions))}
        ${reqs}
        ${section('Test Summary', testSummary)}
        ${results}
        ${mvrs}
    `
}

function renderMvr(d: Mvr): string {
    const passedBadge = d.passed
        ? badge('passed', 'var(--vscode-testing-iconPassed)')
        : badge('failed', 'var(--vscode-testing-iconFailed)')

    const svcs = section('SVCs',
        table(['ID', 'URN'],
            d.svc_ids.map(s => [detailsLink(s.id, 'svc'), `<code>${esc(s.urn)}</code>`])))

    return `
        <header>
            ${badge('mvr')} <span class="title">${esc(d.id)}</span> ${passedBadge}
        </header>
        ${section('Comment', prose(d.comment))}
        ${svcs}
    `
}

const CSS = `
    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 16px 24px;
        line-height: 1.5;
    }
    header { margin-bottom: 12px; }
    .title { font-size: 1.2em; font-weight: 600; margin-left: 6px; }
    .sub { color: var(--vscode-descriptionForeground); margin-top: 4px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    h2 { font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.05em;
         color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-widget-border);
         padding-bottom: 4px; margin-top: 20px; }
    section { margin-bottom: 16px; }
    p { margin: 6px 0; }
    table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
    th { text-align: left; padding: 4px 8px; color: var(--vscode-descriptionForeground);
         border-bottom: 1px solid var(--vscode-widget-border); }
    td { padding: 4px 8px; border-bottom: 1px solid var(--vscode-widget-border, #333); }
    code { font-family: var(--vscode-editor-font-family); font-size: 0.9em;
           background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
    a.cmd-link { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; }
    a.cmd-link:hover { text-decoration: underline; }
    code.fqn-link { cursor: pointer; color: var(--vscode-textLink-foreground); }
    code.fqn-link:hover { text-decoration: underline; }
`

export class DetailsPanel {
    static current: DetailsPanel | undefined

    private readonly _panel: vscode.WebviewPanel

    static show(data: Record<string, unknown>): void {
        if (DetailsPanel.current) {
            DetailsPanel.current._panel.reveal()
            DetailsPanel.current._update(data)
            return
        }
        const panel = vscode.window.createWebviewPanel(
            'reqstoolDetails',
            'reqstool Details',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        )
        DetailsPanel.current = new DetailsPanel(panel)
        DetailsPanel.current._update(data)
    }

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel
        this._panel.onDidDispose(() => { DetailsPanel.current = undefined })
        this._panel.webview.onDidReceiveMessage(async msg => {
            if (msg.command === 'openDetails') {
                vscode.commands.executeCommand('reqstool.openDetails', { id: msg.id, type: msg.type })
            } else if (msg.command === 'openFqn') {
                const fqn: string = msg.fqn
                const kind: string = (msg.kind ?? '').toUpperCase()
                const segments = fqn.split(/[.#]/).filter(Boolean)
                // METHOD/FIELD: search by class name (Java LS indexes types, not members)
                const isMethodOrField = kind === 'METHOD' || kind === 'FIELD'
                const classIdx = isMethodOrField ? segments.length - 2 : segments.length - 1
                const searchSymbol = segments[classIdx] ?? segments[segments.length - 1]
                const memberName = isMethodOrField ? segments[segments.length - 1] : undefined

                const results = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                    'vscode.executeWorkspaceSymbolProvider', searchSymbol
                )
                const match = results?.find(r => r.name === searchSymbol)
                if (match) {
                    const editor = await vscode.window.showTextDocument(match.location.uri)
                    if (memberName) {
                        const docSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                            'vscode.executeDocumentSymbolProvider', match.location.uri
                        )
                        const sym = DetailsPanel._findSymbol(docSymbols ?? [], memberName)
                        if (sym) {
                            editor.selection = new vscode.Selection(sym.range.start, sym.range.start)
                            editor.revealRange(sym.range, vscode.TextEditorRevealType.InCenter)
                        }
                    }
                } else {
                    await vscode.commands.executeCommand('workbench.action.quickOpen', `#${searchSymbol}`)
                }
            }
        })
    }

    private _update(data: Record<string, unknown>): void {
        this._panel.title = `reqstool: ${data['id'] ?? 'Details'}`
        this._panel.webview.html = DetailsPanel._html(data as unknown as DetailsData)
    }

    static _findSymbol(symbols: vscode.DocumentSymbol[], name: string): vscode.DocumentSymbol | undefined {
        for (const s of symbols) {
            if (s.name === name) { return s }
            const found = DetailsPanel._findSymbol(s.children, name)
            if (found) { return found }
        }
        return undefined
    }

    private static _html(data: DetailsData): string {
        let body: string
        if (data.type === 'requirement') {
            body = renderRequirement(data)
        } else if (data.type === 'svc') {
            body = renderSvc(data)
        } else {
            body = renderMvr(data)
        }
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <style>${CSS}</style>
</head>
<body>${body}
<script>
const vscode = acquireVsCodeApi();
document.querySelectorAll('.cmd-link').forEach(el => {
    el.addEventListener('click', e => {
        e.preventDefault();
        vscode.postMessage({ command: 'openDetails', id: el.dataset.id, type: el.dataset.type });
    });
});
document.querySelectorAll('.fqn-link').forEach(el => {
    el.addEventListener('click', () => {
        vscode.postMessage({ command: 'openFqn', fqn: el.dataset.fqn, kind: el.dataset.kind });
    });
});
</script>
</body>
</html>`
    }
}
