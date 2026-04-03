# reqstool — VS Code Extension

VS Code extension for [reqstool](https://reqstool.github.io), providing full Language Server Protocol (LSP) integration for requirements traceability.

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

## Getting Started

1. Install the extension from the VS Code Marketplace or Open VSX Registry.
2. Open a workspace that contains a `requirements.yml` file.

reqstool is installed automatically into a managed virtual environment on first activation. No manual setup required.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `reqstool.serverCommand` | `["reqstool", "lsp"]` | Command to start the reqstool LSP server. See [Custom server command](#custom-server-command). |
| `reqstool.trace.server` | `"off"` | LSP communication tracing. Set to `"messages"` or `"verbose"` to debug. |
| `reqstool.startupTimeout` | `5000` | Milliseconds to wait when checking if reqstool is available. |
| `reqstool.symbolLookupDelay` | `500` | Milliseconds to wait after opening a file before querying document symbols. |
| `reqstool.fileWatchPattern` | `**/{requirements,...}.yml` | Glob pattern for reqstool YAML files to watch for changes. |
| `reqstool.languages` | all supported | Language IDs for which the LSP client is active (checkbox list in Settings UI). |

### Custom server command

By default the extension auto-installs reqstool and manages the server for you. If you want to use a specific installation, set `reqstool.serverCommand` in your user or workspace settings:

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

When `reqstool.serverCommand` is set, the managed virtual environment is bypassed entirely.

## Supported Languages

The LSP server provides hover, completion, go-to-definition, and diagnostics for:

- Python
- Java
- JavaScript / TypeScript
- JSX / TSX
- YAML (requirements, SVCs, MVRs)

## Troubleshooting

**Extension shows "reqstool is not installed or not found"**

- The auto-install requires Python (`python3` or `python`) to be available on your `PATH`.
- If Python is not found, install reqstool manually and set `reqstool.serverCommand`.
- Run `reqstool --version` in a terminal to confirm a manual installation is working.

**Enable LSP tracing**

Set `reqstool.trace.server` to `"verbose"` and open the **Output** panel → select **reqstool** from the dropdown.
