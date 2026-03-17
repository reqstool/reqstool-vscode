// Copyright © reqstool

import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node'

let client: LanguageClient | undefined

export async function activate(context: vscode.ExtensionContext) {
    const serverPath = resolveServerPath()

    // Guard: inform user if reqstool is not installed
    if (!await checkServerInstalled(serverPath)) {
        const action = await vscode.window.showErrorMessage(
            'reqstool is not installed or not found. Install: pipx install "reqstool[lsp]"',
            'Open Docs'
        )
        if (action === 'Open Docs') {
            vscode.env.openExternal(vscode.Uri.parse('https://reqstool.github.io'))
        }
        return
    }

    const serverOptions: ServerOptions = {
        command: serverPath,
        args: ['lsp'],
        transport: TransportKind.stdio,
        options: { env: { ...process.env } }
    }

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'python' },
            { scheme: 'file', language: 'java' },
            { scheme: 'file', language: 'javascript' },
            { scheme: 'file', language: 'typescript' },
            { scheme: 'file', language: 'javascriptreact' },
            { scheme: 'file', language: 'typescriptreact' },
            { scheme: 'file', language: 'yaml' },
        ],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher(
                '**/{requirements,software_verification_cases,manual_verification_results,reqstool_config}.yml'
            )
        }
    }

    client = new LanguageClient('reqstool', 'reqstool', serverOptions, clientOptions)

    context.subscriptions.push(
        vscode.commands.registerCommand('reqstool.refresh', () => {
            client?.sendRequest('workspace/executeCommand', { command: 'reqstool.refresh' })
        })
    )

    const { registerSnippets } = await import('./snippets')
    context.subscriptions.push(registerSnippets())

    await client.start()
    context.subscriptions.push(client)
}

export async function deactivate(): Promise<void> {
    if (client) {
        await client.stop()
    }
}

function resolveServerPath(): string {
    const cfg = vscode.workspace.getConfiguration('reqstool').get<string>('serverPath', '').trim()
    return cfg.length > 0 ? cfg : 'reqstool'
}

async function checkServerInstalled(executable: string): Promise<boolean> {
    const { execFile } = await import('node:child_process')
    return new Promise(resolve => execFile(executable, ['--version'], { timeout: 5000 }, err => resolve(!err)))
}
