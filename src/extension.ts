// Copyright © reqstool

import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, RevealOutputChannelOn, ServerOptions, TransportKind } from 'vscode-languageclient/node'

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
        options: { env: { ...process.env, PYTHONUNBUFFERED: '1' } }
    }

    const outputChannel = vscode.window.createOutputChannel('reqstool')
    const traceOutputChannel = vscode.window.createOutputChannel('reqstool Trace')

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
        },
        outputChannel,
        traceOutputChannel,
        revealOutputChannelOn: RevealOutputChannelOn.Error,
        middleware: {
            // Allow command: URIs in hover markdown (e.g. go-to-definition links from the server)
            provideHover: async (document, position, token, next) => {
                const hover = await next(document, position, token)
                if (hover) {
                    for (const content of hover.contents) {
                        if (content instanceof vscode.MarkdownString) {
                            content.isTrusted = true
                        }
                    }
                }
                return hover
            }
        },
    }

    client = new LanguageClient('reqstool', 'reqstool', serverOptions, clientOptions)

    // reqstool.refresh is advertised in server's executeCommandProvider — vscode-languageclient
    // registers and routes it automatically via ExecuteCommandFeature. No manual registration needed.

    context.subscriptions.push(
        vscode.commands.registerCommand('reqstool.openDetails', async (args: { id: string; type: string } | undefined) => {
            if (!args?.id || !args?.type) {
                vscode.window.showInformationMessage('reqstool: Open Details must be invoked from a hover link.')
                return
            }
            if (!client) { return }
            try {
                const data = await client.sendRequest<Record<string, unknown> | null>('reqstool/details', args)
                if (!data) {
                    vscode.window.showWarningMessage(`reqstool: no details found for ${args.id}`)
                    return
                }
                const { DetailsPanel } = await import('./details.js')
                DetailsPanel.show(data)
            } catch (err) {
                vscode.window.showErrorMessage(`reqstool: failed to load details for ${args.id}: ${err}`)
            }
        })
    )

    const { registerSnippets } = await import('./snippets.js')
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
