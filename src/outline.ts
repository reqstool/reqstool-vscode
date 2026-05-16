// Copyright © reqstool

import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

type Scope = "project" | "file";

type ListData = {
  requirements: { id: string; title: string; lifecycle_state: string }[];
  svcs: {
    id: string;
    title: string;
    lifecycle_state: string;
    verification: string;
  }[];
  mvrs: { id: string; passed: boolean }[];
};

// ── Outline WebviewView ───────────────────────────────────────────────────────

export class OutlineProvider implements vscode.WebviewViewProvider {
  static readonly viewId = "reqstool.outlineView";

  private _view?: vscode.WebviewView;
  private _scope: Scope = "project";
  private _activeUri: vscode.Uri | undefined;

  constructor(private readonly _client: LanguageClient) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._html();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === "openDetails") {
        await vscode.commands.executeCommand("reqstool.openDetails", {
          id: msg.id,
          type: msg.type,
        });
      }
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) void this._refresh();
    });
    void this._refresh();
  }

  setScope(scope: Scope): void {
    this._scope = scope;
    void vscode.commands.executeCommand(
      "setContext",
      "reqstool.outlineScope",
      scope,
    );
    void this._refresh();
  }

  refresh(): void {
    void this._refresh();
  }

  onEditorChange(editor: vscode.TextEditor | undefined): void {
    if (this._scope !== "file") return;
    this._activeUri = editor?.document.uri;
    void this._refresh();
  }

  private async _refresh(): Promise<void> {
    if (!this._view?.visible) return;
    this._view.webview.postMessage({ type: "loading" });
    const data = await this._loadData();
    if (!this._view?.visible) return;
    this._view.webview.postMessage({ type: "data", data, scope: this._scope });
  }

  private _html(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: transparent;
    overflow-x: hidden;
  }

  .filter-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    position: sticky;
    top: 0;
    background: var(--vscode-sideBar-background, var(--vscode-panel-background));
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
    z-index: 10;
  }
  input {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 3px 6px;
    font-family: inherit;
    font-size: inherit;
    outline: none;
    min-width: 0;
  }
  input:focus { border-color: var(--vscode-focusBorder); }
  input::placeholder { color: var(--vscode-input-placeholderForeground); }
  button {
    cursor: pointer;
    background: none;
    border: none;
    color: var(--vscode-foreground);
    opacity: 0.6;
    font-size: 13px;
    padding: 0 2px;
    line-height: 1;
    flex-shrink: 0;
  }
  button:hover { opacity: 1; }

  .section-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    cursor: pointer;
    font-weight: 600;
    color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
    background: var(--vscode-sideBarSectionHeader-background, transparent);
    user-select: none;
  }
  .section-header:hover { background: var(--vscode-list-hoverBackground); }
  .toggle { font-size: 10px; width: 12px; display: inline-block; }

  .item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px 2px 24px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item:hover { background: var(--vscode-list-hoverBackground); }
  .item:active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot.pass    { background: var(--vscode-testing-iconPassed, #73c991); }
  .dot.draft   { border: 1.5px solid currentColor; background: transparent; opacity: 0.6; }
  .dot.warning { background: var(--vscode-editorWarning-foreground, #cca700); }
  .dot.error   { background: var(--vscode-editorError-foreground, #f14c4c); }

  .item-label { overflow: hidden; text-overflow: ellipsis; }

  .message {
    padding: 8px;
    opacity: 0.6;
    font-style: italic;
  }
</style>
</head>
<body>
<div class="filter-bar">
  <input id="filter" type="text" placeholder="Filter (e.g. WEB, CLI, port)" autocomplete="off" spellcheck="false">
  <button id="clear" hidden title="Clear filter">✕</button>
</div>
<div id="list"><div class="message">Loading…</div></div>
<script>
(function() {
  const vscode = acquireVsCodeApi();
  const listEl = document.getElementById('list');
  const filterEl = document.getElementById('filter');
  const clearBtn = document.getElementById('clear');

  let allData = null;

  // ── Messaging ──────────────────────────────────────────────────────────────
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'loading') {
      listEl.innerHTML = '<div class="message">Loading…</div>';
    } else if (msg.type === 'data') {
      allData = msg.data;
      render();
    }
  });

  // ── Filter ─────────────────────────────────────────────────────────────────
  filterEl.addEventListener('input', () => {
    clearBtn.hidden = !filterEl.value;
    render();
  });
  clearBtn.addEventListener('click', () => {
    filterEl.value = '';
    clearBtn.hidden = true;
    render();
    filterEl.focus();
  });

  function getFilter() { return filterEl.value.trim().toLowerCase(); }
  function match(id, title) {
    const f = getFilter();
    return !f || id.toLowerCase().includes(f) || (title || '').toLowerCase().includes(f);
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function escAttr(s) { return s.replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function dotHtml(cls) {
    return '<span class="dot ' + cls + '"></span>';
  }

  function lifecycleIcon(state) {
    const s = (state || '').toLowerCase();
    if (s.includes('effective') || s.includes('active')) return 'pass';
    if (s.includes('draft')) return 'draft';
    if (s.includes('deprecated')) return 'warning';
    if (s.includes('obsolete')) return 'error';
    return 'draft';
  }

  function renderSection(type, label, items) {
    const bodyId = 'sec-' + type;
    const rows = items.length === 0
      ? '<div class="message">No items</div>'
      : items.map(item => {
          const isReq = type === 'requirement', isSvc = type === 'svc', isMvr = type === 'mvr';
          const icon = isMvr ? (item.passed ? 'pass' : 'error') : lifecycleIcon(item.lifecycle_state);
          const lbl = isMvr ? item.id : item.id + ': ' + item.title;
          return '<div class="item" data-id="' + escAttr(item.id) + '" data-type="' + type + '">'
            + dotHtml(icon)
            + '<span class="item-label">' + escHtml(lbl) + '</span>'
            + '</div>';
        }).join('');

    return '<div class="section">'
      + '<div class="section-header" data-section="' + type + '">'
      + '<span class="toggle">▾</span>' + escHtml(label)
      + '</div>'
      + '<div class="section-body" id="' + bodyId + '">' + rows + '</div>'
      + '</div>';
  }

  function render() {
    if (!allData) { listEl.innerHTML = '<div class="message">No data</div>'; return; }
    const f = getFilter();
    const reqs = allData.requirements.filter(r => match(r.id, r.title));
    const svcs = allData.svcs.filter(s => match(s.id, s.title));
    const mvrs = allData.mvrs.filter(m => match(m.id));
    const lbl = (name, shown, total) => f ? name + ' (' + shown + ' / ' + total + ')' : name + ' (' + total + ')';
    listEl.innerHTML =
      renderSection('requirement', lbl('Requirements', reqs.length, allData.requirements.length), reqs) +
      renderSection('svc', lbl('SVCs', svcs.length, allData.svcs.length), svcs) +
      renderSection('mvr', lbl('MVRs', mvrs.length, allData.mvrs.length), mvrs);
    restoreCollapsed();
  }

  // ── Collapse state ─────────────────────────────────────────────────────────
  const collapsed = new Set();

  function restoreCollapsed() {
    collapsed.forEach(type => {
      const body = document.getElementById('sec-' + type);
      const header = listEl.querySelector('[data-section="' + type + '"]');
      if (body) body.style.display = 'none';
      if (header) header.querySelector('.toggle').textContent = '▸';
    });
  }

  // ── Clicks ─────────────────────────────────────────────────────────────────
  listEl.addEventListener('click', e => {
    const header = e.target.closest('.section-header');
    if (header) {
      const type = header.dataset.section;
      const body = document.getElementById('sec-' + type);
      const toggle = header.querySelector('.toggle');
      if (body) {
        const isCollapsed = body.style.display === 'none';
        body.style.display = isCollapsed ? '' : 'none';
        toggle.textContent = isCollapsed ? '▾' : '▸';
        if (isCollapsed) collapsed.delete(type); else collapsed.add(type);
      }
      return;
    }
    const item = e.target.closest('.item[data-id]');
    if (item) {
      vscode.postMessage({ command: 'openDetails', id: item.dataset.id, type: item.dataset.type });
    }
  });
})();
</script>
</body>
</html>`;
  }

  private async _loadData(): Promise<ListData | undefined> {
    if (this._scope === "project") {
      const urnEntries = await this._client
        .sendRequest<{ urn: string }[]>("reqstool/list-urns", {})
        .catch(() => null);
      if (!urnEntries) {
        return undefined;
      }

      const perUrn = await Promise.all(
        urnEntries.map(({ urn }) =>
          this._client
            .sendRequest<ListData | null>("reqstool/list", { urn })
            .then((d) => ({ urn, data: d }))
            .catch(() => null),
        ),
      );

      const all: ListData = { requirements: [], svcs: [], mvrs: [] };
      for (const entry of perUrn) {
        if (!entry?.data) {
          continue;
        }
        const { urn, data } = entry;
        all.requirements.push(
          ...data.requirements.map((r) => ({ ...r, id: `${urn}:${r.id}` })),
        );
        all.svcs.push(
          ...data.svcs.map((s) => ({ ...s, id: `${urn}:${s.id}` })),
        );
        all.mvrs.push(
          ...data.mvrs.map((m) => ({ ...m, id: `${urn}:${m.id}` })),
        );
      }
      return all;
    }

    const uri = this._activeUri ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      return { requirements: [], svcs: [], mvrs: [] };
    }

    const lenses =
      (await vscode.commands.executeCommand<vscode.CodeLens[]>(
        "vscode.executeCodeLensProvider",
        uri,
      )) ?? [];

    const reqIds = new Set<string>();
    const svcIds = new Set<string>();
    for (const lens of lenses) {
      const args = lens.command?.arguments?.[0] as
        | { ids?: string[]; type?: string }
        | undefined;
      if (!args?.ids || !args?.type) {
        continue;
      }
      if (args.type === "requirement") {
        args.ids.forEach((id) => reqIds.add(id));
      }
      if (args.type === "svc") {
        args.ids.forEach((id) => svcIds.add(id));
      }
    }

    const [reqs, svcs] = await Promise.all([
      Promise.all(
        [...reqIds].map((id) =>
          this._client
            .sendRequest<{
              id: string;
              urn: string;
              title: string;
              lifecycle: { state: string };
            } | null>("reqstool/details", { id, type: "requirement" })
            .then((d) =>
              d
                ? {
                    id: `${d.urn}:${d.id}`,
                    title: d.title,
                    lifecycle_state: d.lifecycle?.state ?? "",
                  }
                : null,
            ),
        ),
      ),
      Promise.all(
        [...svcIds].map((id) =>
          this._client
            .sendRequest<{
              id: string;
              urn: string;
              title: string;
              lifecycle: { state: string };
              verification: string;
            } | null>("reqstool/details", { id, type: "svc" })
            .then((d) =>
              d
                ? {
                    id: `${d.urn}:${d.id}`,
                    title: d.title,
                    lifecycle_state: d.lifecycle?.state ?? "",
                    verification: d.verification,
                  }
                : null,
            ),
        ),
      ),
    ]);

    return {
      requirements: reqs.filter((r): r is NonNullable<typeof r> => r !== null),
      svcs: svcs.filter((s): s is NonNullable<typeof s> => s !== null),
      mvrs: [],
    };
  }
}
