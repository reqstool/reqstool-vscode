// Copyright © reqstool

import * as vscode from 'vscode'

type Req = {
    type: 'requirement'
    id: string; urn: string; title: string; significance: string
    description: string; rationale: string; revision: string
    lifecycle: { state: string; reason: string }
    categories: string[]; implementation: string; references: string[]
    implementations: { element_kind: string; fqn: string }[]
    svcs: { id: string; urn: string; title: string; verification: string }[]
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
    if (state === 'active' || state === 'ACTIVE') { return '' }
    const color = state.toLowerCase().includes('deprecated') ? 'var(--vscode-statusBarItem-warningBackground)' : 'var(--vscode-statusBarItem-errorBackground)'
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
            d.implementations.map(i => [esc(i.element_kind), `<code>${esc(i.fqn)}</code>`])))

    const svcs = section('Software Verification Cases',
        table(['ID', 'Title', 'Verification'],
            d.svcs.map(s => [esc(s.id), esc(s.title), esc(s.verification)])))

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
            d.requirement_ids.map(r => [esc(r.id), esc(r.title), esc(r.lifecycle_state)])))

    const results = section('Test Results',
        table(['FQN', 'Status'],
            d.test_results.map(t => [`<code>${esc(t.fqn)}</code>`, statusIcon(t.status)])))

    const mvrs = section('Manual Verification Results',
        table(['ID', 'Passed', 'Comment'],
            d.mvrs.map(m => [esc(m.id), m.passed ? '✓' : '✗', esc(m.comment)])))

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
            d.svc_ids.map(s => [esc(s.id), `<code>${esc(s.urn)}</code>`])))

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
            { enableScripts: false }
        )
        DetailsPanel.current = new DetailsPanel(panel)
        DetailsPanel.current._update(data)
    }

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel
        this._panel.onDidDispose(() => { DetailsPanel.current = undefined })
    }

    private _update(data: Record<string, unknown>): void {
        this._panel.title = `reqstool: ${data['id'] ?? 'Details'}`
        this._panel.webview.html = DetailsPanel._html(data as unknown as DetailsData)
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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <style>${CSS}</style>
</head>
<body>${body}</body>
</html>`
    }
}
