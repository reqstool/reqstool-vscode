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

## Requirements

reqstool must be installed and available on your `PATH`:

```bash
pipx install "reqstool[lsp]"
```

Verify the installation:

```bash
reqstool --version
```

## Getting Started

1. Install the extension from the VS Code Marketplace or Open VSX Registry.
2. Install reqstool: `pipx install "reqstool[lsp]"`
3. Open a workspace that contains a `requirements.yml` file — the extension activates automatically.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `reqstool.serverPath` | `""` | Path to the `reqstool` executable. Leave empty to use the system `PATH`. |
| `reqstool.trace.server` | `"off"` | LSP communication tracing. Set to `"messages"` or `"verbose"` to debug. |

### Using a custom reqstool path

If `reqstool` is not on your `PATH`, set the full path in your workspace or user settings:

```json
{
    "reqstool.serverPath": "/home/user/.local/bin/reqstool"
}
```

## Supported Languages

The LSP server provides hover, completion, go-to-definition, and diagnostics for:

- Python
- Java
- JavaScript / TypeScript
- JSX / TSX
- YAML (requirements, SVCs, MVRs)

## Troubleshooting

**Extension shows "reqstool is not installed or not found"**

- Run `reqstool --version` in a terminal to confirm it is installed and on `PATH`.
- If installed via pipx, ensure the pipx bin directory (`~/.local/bin`) is on your `PATH`.
- Set `reqstool.serverPath` to the absolute path of the executable.

**Enable LSP tracing**

Set `reqstool.trace.server` to `"verbose"` and open the **Output** panel → select **reqstool** from the dropdown.
