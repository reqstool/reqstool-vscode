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

Use this when you want to test the extension exactly as an end user would — installed into your main VS Code instance, not a sandboxed host. This is useful for testing activation, the LSP handshake, and UI behaviour against a real workspace.

1. Build the package:

    ```bash
    npm run build
    ```

    This compiles the TypeScript and produces `reqstool-0.1.0.vsix` in the project root.

2. Install it into VS Code:

    ```bash
    code --install-extension reqstool-*.vsix
    ```

3. Reload VS Code when prompted (or run **Developer: Reload Window** from the Command Palette).

4. Open a workspace that contains a `requirements.yml` file — the extension activates automatically when that file is detected.

5. To verify activation: open the **Output** panel (`Ctrl+Shift+U`) and select **reqstool** from the dropdown. You should see LSP handshake messages.

Uninstall when done:

```bash
code --uninstall-extension reqstool.reqstool
```

> **Note:** Option B installs the built output (`out/`), not the TypeScript source. If you make code changes, re-run `npm run build` and reinstall the new `.vsix`. Option A (F5) is faster for iterative development since `npm run watch` recompiles automatically.

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

## Release flow

No version is stored in `package.json` — the version is derived from the git tag at build time.

### Triggering a release

1. Go to **Actions → Release → Run workflow**
2. Enter the version (e.g. `1.2.3` or `1.2.3-rc.1`)
   - Must be valid [npm semver](https://semver.org/) — no `v` prefix
   - `PATCH` for bug fixes, `MINOR` for new features, `MAJOR` for breaking changes
3. Click **Run workflow**

### What happens automatically

```
Release workflow (workflow_dispatch)
  ├─ validates semver
  ├─ creates and pushes git tag
  ├─ generates changelog with git-cliff
  └─ creates DRAFT GitHub Release with changelog body
       ↓
       human reviews and edits the draft in the GitHub UI
       ↓ clicks Publish
       └─ triggers Publish workflow (publish_vscode_ext.yml)
            ├─ check-release   validates tag is valid npm semver
            ├─ build           runs tests, builds VSIX
            └─ publish         stamps VSIX with tag version, publishes to VS Marketplace
```

The draft is the review gate — the marketplace publish only happens after you approve it.

### Publish workflow trigger matrix

| Event | check-release | build | dry-run | publish |
|-------|:---:|:---:|:---:|:---:|
| Push to `main` | | ✓ | ✓ | |
| Release published (via draft approval) | ✓ | ✓ | | ✓ |
| `workflow_dispatch` | | ✓ | ✓ | |

Requires the `VS_MARKETPLACE_TOKEN` secret (and `OPEN_VSX_TOKEN` when Open VSX publishing is enabled) to be configured in the repository.
