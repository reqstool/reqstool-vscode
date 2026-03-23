// Copyright © reqstool

import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, RevealOutputChannelOn, ServerOptions, TransportKind } from 'vscode-languageclient/node'
import { DetailsViewProvider } from './details.js'
import { OutlineProvider } from './outline.js'

let client: LanguageClient | undefined

export async function activate(context: vscode.ExtensionContext) {
    const cfg = vscode.workspace.getConfiguration('reqstool')
    const [executable, serverArgs] = resolveServerCommand()

    // Guard: inform user if reqstool is not installed
    if (!await checkServerInstalled(executable, cfg.get<number>('startupTimeout', 5000))) {
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
        command: executable,
        args: serverArgs,
        transport: TransportKind.stdio,
        options: { env: { ...process.env, PYTHONUNBUFFERED: '1' } }
    }

    const outputChannel = vscode.window.createOutputChannel('reqstool')
    const traceOutputChannel = vscode.window.createOutputChannel('reqstool Trace')

    const clientOptions: LanguageClientOptions = {
        documentSelector: cfg.get<string[]>('languages',
            ['python', 'java', 'javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'yaml']
        ).map(lang => ({ scheme: 'file', language: lang })),
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher(
                cfg.get<string>('fileWatchPattern',
                    '**/{requirements,software_verification_cases,manual_verification_results,reqstool_config}.yml')
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

    const detailsProvider = new DetailsViewProvider()
    DetailsViewProvider.instance = detailsProvider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('reqstool.detailsView', detailsProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    )

    const outlineProvider = new OutlineProvider(client)
    vscode.commands.executeCommand('setContext', 'reqstool.outlineScope', 'project')
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('reqstool.outlineView', outlineProvider),
        vscode.commands.registerCommand('reqstool.outline.scopeProject', () => outlineProvider.setScope('project')),
        vscode.commands.registerCommand('reqstool.outline.scopeFile',    () => outlineProvider.setScope('file')),
        vscode.window.onDidChangeActiveTextEditor(e => outlineProvider.onEditorChange(e))
    )

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
                DetailsViewProvider.instance?.show(data)
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

function resolveServerCommand(): [string, string[]] {
    const cmd = vscode.workspace.getConfiguration('reqstool')
        .get<string[]>('serverCommand', ['reqstool', 'lsp'])
        .filter(s => s.trim().length > 0)
    const [command, ...args] = cmd.length > 0 ? cmd : ['reqstool', 'lsp']
    return [command, args]
}

async function checkServerInstalled(executable: string, timeout: number): Promise<boolean> {
    const { execFile } = await import('node:child_process')
    return new Promise(resolve => execFile(executable, ['--version'], { timeout }, err => resolve(!err)))
}
