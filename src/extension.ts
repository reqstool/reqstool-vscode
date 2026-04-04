// Copyright © reqstool

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, RevealOutputChannelOn, ServerOptions, TransportKind } from 'vscode-languageclient/node'
import { DetailsViewProvider } from './details.js'
import { OutlineProvider } from './outline.js'

let client: LanguageClient | undefined

export async function activate(context: vscode.ExtensionContext) {
    const cfg = vscode.workspace.getConfiguration('reqstool')

    // Use managed venv unless user has explicitly configured serverCommand
    const insp = cfg.inspect<string[]>('serverCommand')
    const isUserConfigured = !!(insp?.globalValue || insp?.workspaceValue || insp?.workspaceFolderValue)
    const managedBin = isUserConfigured ? undefined : await ensureManagedVenv(context)

    const [executable, serverArgs] = resolveServerCommand(managedBin)

    // Guard: inform user if reqstool is not installed
    if (!await checkServerInstalled(executable, cfg.get<number>('startupTimeout', 5000))) {
        const action = await vscode.window.showErrorMessage(
            'reqstool is not installed or not found. Install: pipx install "reqstool"',
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

async function ensureManagedVenv(context: vscode.ExtensionContext): Promise<string | undefined> {
    const envDir = path.join(context.globalStorageUri.fsPath, 'env')
    const bin = process.platform === 'win32' ? 'Scripts' : 'bin'
    const exe = process.platform === 'win32' ? 'reqstool.exe' : 'reqstool'
    const reqstoolBin = path.join(envDir, bin, exe)

    // Invalidate venv on extension version upgrade
    const storedVersion = context.globalState.get<string>('envVersion')
    const currentVersion = context.extension.packageJSON.version as string
    if (storedVersion !== currentVersion && fs.existsSync(envDir)) {
        await fs.promises.rm(envDir, { recursive: true })
    }

    if (!fs.existsSync(reqstoolBin)) {
        const python = await findPython()
        if (!python) { return undefined }

        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'reqstool: installing…', cancellable: false },
                async () => {
                    const { execFile } = await import('node:child_process')
                    const run = (cmd: string, args: string[]) =>
                        new Promise<void>((res, rej) =>
                            execFile(cmd, args, { timeout: 120000 }, err => err ? rej(err) : res()))
                    await run(python, ['-m', 'venv', envDir])
                    const pip = path.join(envDir, bin, process.platform === 'win32' ? 'pip.exe' : 'pip')
                    await run(pip, ['install', 'reqstool'])
                }
            )
            await context.globalState.update('envVersion', currentVersion)
        } catch {
            return undefined
        }
    }

    return fs.existsSync(reqstoolBin) ? reqstoolBin : undefined
}

async function findPython(): Promise<string | undefined> {
    const { execFile } = await import('node:child_process')
    for (const candidate of ['python3', 'python']) {
        const found = await new Promise<boolean>(resolve =>
            execFile(candidate, ['--version'], { timeout: 3000 }, err => resolve(!err)))
        if (found) { return candidate }
    }
    return undefined
}

function resolveServerCommand(managedBin?: string): [string, string[]] {
    const cfg = vscode.workspace.getConfiguration('reqstool')

    // If user explicitly configured serverCommand, always use it
    const insp = cfg.inspect<string[]>('serverCommand')
    const isUserConfigured = !!(insp?.globalValue || insp?.workspaceValue || insp?.workspaceFolderValue)
    if (isUserConfigured) {
        const cmd = cfg.get<string[]>('serverCommand', ['reqstool', 'lsp']).filter(s => s.trim().length > 0)
        const [command, ...args] = cmd.length > 0 ? cmd : ['reqstool', 'lsp']
        return [command, args]
    }

    // Use managed venv if available
    if (managedBin) { return [managedBin, ['lsp']] }

    // PATH fallback
    return ['reqstool', ['lsp']]
}

async function checkServerInstalled(executable: string, timeout: number): Promise<boolean> {
    const { execFile } = await import('node:child_process')
    return new Promise(resolve => execFile(executable, ['--version'], { timeout }, err => resolve(!err)))
}
