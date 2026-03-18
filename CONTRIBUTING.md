# Contributing to reqstool VS Code Extension

## Prerequisites

- Node.js 24
- npm
- VS Code
- reqstool with LSP support: `pipx install "reqstool[lsp]"`

## Setup

```bash
git clone https://github.com/reqstool/reqstool-vscode
cd reqstool-vscode
npm install
```

## Development

### Compile

```bash
npm run compile
```

### Watch mode (recompile on change)

```bash
npm run watch
```

### Lint

```bash
npm run lint
```

### Run the extension locally

Two options:

**Option A — F5 (Extension Development Host)**

1. `npm run compile` (or `npm run watch` to recompile on change)
2. Press `F5` in VS Code — a new Extension Development Host window opens with the extension loaded.
3. In the host window, open a workspace containing a `requirements.yml` file.

**Option B — Install the `.vsix`**

```bash
npm run build                                   # produces reqstool-0.1.0.vsix
code --install-extension reqstool-*.vsix        # installs into your main VS Code
# Reload VS Code, then open a workspace with requirements.yml
```

Uninstall when done:

```bash
code --uninstall-extension reqstool.reqstool
```

## Testing

### Headless unit tests

```bash
npm run test-with-report
```

### UI tests (requires a display)

```bash
xvfb-run --auto-servernum npm run test:ui
```

Or on a machine with a display:

```bash
npm run test:ui
```

### Manual integration test

1. Launch the extension via Option A (F5) or Option B (vsix install) above.
2. Open a workspace containing a `requirements.yml` file — the extension activates automatically.
3. Check **Output → reqstool** — LSP handshake messages should be visible.
4. Hover over a `@Requirements("REQ-001")` annotation in Python or Java — a tooltip should appear.
5. Press `Ctrl+Shift+O` in a requirements YAML file — the Outline view should show symbols.
6. Type `Req` in a YAML file — a snippet should appear in IntelliSense.
7. Introduce an unknown ID → the Problems panel should show a diagnostic.
8. Open the Command Palette and run **reqstool: Refresh**.

### Testing the "server not installed" code path

1. Temporarily rename the reqstool binary: `mv $(which reqstool) $(which reqstool).bak`
2. Open VS Code with the extension loaded → expect an error notification with an **Open Docs** button.
3. Restore: `mv $(which reqstool).bak $(which reqstool)`

## Build

```bash
npm run build
```

This produces a `.vsix` file in the project root.

## Architecture

The extension is a thin LSP client. All language intelligence (hover, completion, go-to-definition, outline, diagnostics) is handled server-side by `reqstool lsp` over stdio. The client only:

1. Locates and starts the `reqstool lsp` process.
2. Registers the `reqstool.refresh` command.
3. Provides YAML structural snippets.

## Commit Style

Follow [Conventional Commits](https://www.conventionalcommits.org/) for all commits.
All commits must include a DCO sign-off (`git commit -s`).

## Branching and PRs

- Always work on a branch (never push directly to `main`).
- Open a pull request for all changes.
- PR titles must follow Conventional Commits.

## Publishing

Publishing to Open VSX and the VS Marketplace is automated via the `publish_vscode_ext.yml` workflow when a GitHub Release is created. Requires the `OPEN_VSX_TOKEN` and `VS_MARKETPLACE_TOKEN` secrets to be configured in the repository.
