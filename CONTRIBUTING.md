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

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded.

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

1. Build and install the `.vsix`:

    ```bash
    npm run build
    code --install-extension reqstool-*.vsix
    ```

2. Open a workspace containing a `requirements.yml` file.
3. Hover over a `@Requirements("REQ-001")` annotation in Python or Java — a tooltip should appear.
4. Press `Ctrl+Shift+O` in a requirements YAML file — the Outline view should show symbols.
5. Introduce an unknown ID → the Problems panel should show a diagnostic.
6. Open the Command Palette and run **reqstool: Refresh**.

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
