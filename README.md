# reqstool — VS Code Extension

VS Code extension for [reqstool](https://reqstool.github.io), providing full Language Server Protocol (LSP) integration for requirements traceability.

reqstool links requirements, software verification cases, and manual verification results directly to your source code. This extension brings that traceability into the editor — hover over any annotated identifier to see its requirement, navigate to definitions, get inline diagnostics, and browse the full requirements outline without leaving VS Code.

## Features

| Feature | How to access |
|---|---|
| Hover tooltips | Hover over annotated identifiers in source files |
| IntelliSense completion | Triggered automatically in YAML files |
| Go to definition | `F12` or right-click → Go to Definition |
| Outline view | `Ctrl+Shift+O` or the Outline panel in the Explorer |
| Diagnostics | Problems panel (`Ctrl+Shift+M`) |
| Refresh | Command Palette → **reqstool: Refresh** |
| YAML snippets | Type `Requirement`, `SVC`, or `MVR` in a YAML file |
| Select server source | Command Palette → **reqstool: Select Server Source** |

<!-- Screenshots: add images to the images/ directory and uncomment below -->
<!--
![Hover tooltip showing requirement details](images/hover.png)
![Outline view listing requirements](images/outline.png)
![Inline diagnostics in the Problems panel](images/diagnostics.png)
-->

## Installation

This extension is distributed via **[Open VSX Registry](https://open-vsx.org/extension/reqstool/reqstool)** and as a **VSIX file attached to each [GitHub Release](https://github.com/reqstool/reqstool-vscode/releases)**.

We do not currently publish to the Visual Studio Marketplace — it requires a Microsoft publisher account, an Azure DevOps organisation, and a credit card, which is unnecessary friction for an open-source project.

### Open VSX (VSCodium and open-source editors)

[VSCodium](https://vscodium.com), Gitpod, Eclipse Theia, and other open-source editors use Open VSX by default. Search for **reqstool** in the Extensions panel and install directly.

### VSIX file (standard VS Code)

Standard VS Code is hardcoded to Microsoft's Marketplace and cannot use Open VSX without unsupported workarounds. Install via VSIX instead:

1. Download `reqstool-<version>.vsix` from the [latest GitHub Release](https://github.com/reqstool/reqstool-vscode/releases/latest).
2. Install it:
   - **Command line:** `code --install-extension reqstool-<version>.vsix`
   - **VS Code UI:** Open the Extensions panel → `···` menu → **Install from VSIX…**

## Getting Started

1. Install the extension (see [Installation](#installation) above).
2. Open a workspace that contains a `requirements.yml` file.
3. On first activation a picker appears — choose which reqstool to use:

| Option | Description |
|---|---|
| **Auto** *(default)* | Use system reqstool if installed; otherwise fall back to the version packaged with this extension. |
| **System installed** | Always use the `reqstool` found on PATH (version shown). |
| **Packaged with extension** | Always use the version bundled and managed by this extension (version shown). |

Your choice is saved globally and will not be asked again. To change it later, run **reqstool: Select Server Source** from the Command Palette.

> **Note:** The packaged option requires Python (`python3` or `python`) on your `PATH` for the one-time install. If Python is not available and reqstool is not on PATH, install reqstool manually (`pipx install reqstool`) and restart VS Code.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `reqstool.serverSource` | `"auto"` | Which reqstool to use: `auto` (system if available, otherwise managed), `system` (PATH), `managed` (bundled). Use **reqstool: Select Server Source** to pick interactively. |
| `reqstool.serverCommand` | — | Override the full server command (array). Takes priority over `serverSource`. See [Custom server command](#custom-server-command). |
| `reqstool.trace.server` | `"off"` | LSP communication tracing. Set to `"messages"` or `"verbose"` to debug. |
| `reqstool.startupTimeout` | `5000` | Milliseconds to wait when checking if reqstool is available. |
| `reqstool.symbolLookupDelay` | `500` | Milliseconds to wait after opening a file before querying document symbols. |
| `reqstool.fileWatchPattern` | `**/{requirements,...}.yml` | Glob pattern for reqstool YAML files to watch for changes. |
| `reqstool.languages` | all supported | Language IDs for which the LSP client is active (checkbox list in Settings UI). |

### Custom server command

For most users, `reqstool.serverSource` is sufficient. `reqstool.serverCommand` is for advanced cases where you need full control over the command and arguments — it takes priority over `serverSource` when set.

**Use a specific binary on PATH:**
```json
{
    "reqstool.serverCommand": ["reqstool", "lsp"]
}
```

**Use an absolute path:**
```json
{
    "reqstool.serverCommand": ["/home/user/.local/bin/reqstool", "lsp"]
}
```

**Use a specific virtual environment:**
```json
{
    "reqstool.serverCommand": ["/home/user/.venv/bin/reqstool", "lsp"]
}
```

**Use a specific Python interpreter:**
```json
{
    "reqstool.serverCommand": ["python", "-m", "reqstool", "lsp"]
}
```

**Enable debug logging:**
```json
{
    "reqstool.serverCommand": ["reqstool", "lsp", "--log-level", "debug"]
}
```

When `reqstool.serverCommand` is set, both `reqstool.serverSource` and the managed virtual environment are bypassed entirely.

## Supported Languages

The LSP server provides hover, completion, go-to-definition, and diagnostics for:

- Python
- Java
- JavaScript / TypeScript
- JSX / TSX
- YAML (requirements, SVCs, MVRs)

## Requirements

- VS Code 1.109.0 or later
- Python (`python3` or `python`) on your `PATH` for auto-install — or configure `reqstool.serverCommand` to point to an existing installation

## Troubleshooting

**Extension shows "reqstool is not installed or not found"**

- Run **reqstool: Select Server Source** and choose **Packaged with extension** to let the extension install reqstool automatically (requires Python on PATH), or **System installed** if you have reqstool on PATH.
- To install manually: `pipx install reqstool`, then restart VS Code.
- Run `reqstool --version` in a terminal to confirm a manual installation is working.

**Extension warns that the system reqstool is too old**

- The extension requires reqstool 0.8.0 or later.
- Upgrade with `pipx upgrade reqstool`, or run **reqstool: Select Server Source** and choose **Packaged with extension** to use the bundled version instead.

**Enable LSP tracing**

Set `reqstool.trace.server` to `"verbose"` and open the **Output** panel → select **reqstool** from the dropdown.
