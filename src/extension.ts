// Copyright © reqstool

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, RevealOutputChannelOn, ServerOptions, TransportKind } from 'vscode-languageclient/node'
import { DetailsViewProvider } from './details.js'
import { OutlineProvider } from './outline.js'

let client: LanguageClient | undefined

type ServerSource = 'system' | 'managed' | 'configured'

function logServerInfo(
    channel: vscode.OutputChannel,
    version: string | undefined,
    source: ServerSource,
    executablePath: string,
): void {
    const ts = new Date().toISOString()
    channel.appendLine(`[${ts}] reqstool ${version ?? 'unknown'} (source: ${source}, path: ${executablePath})`)
}

export async function activate(context: vscode.ExtensionContext) {
    const cfg = vscode.workspace.getConfiguration('reqstool')
    const timeout = cfg.get<number>('startupTimeout', 5000)
    const bundledVersion = (context.extension.packageJSON.reqstoolVersion as string | undefined)?.trim() || undefined

    // Register the source picker command early so it's always available (even if server fails to start)
    context.subscriptions.push(
        vscode.commands.registerCommand('reqstool.selectServerSource', async () => {
            const sysVer = await getInstalledVersion('reqstool', timeout)
            const managedBinPath = getManagedBinPath(context)
            const mgrVer = fs.existsSync(managedBinPath)
                ? await getInstalledVersion(managedBinPath, timeout)
                : undefined
            await showServerSourcePicker(sysVer, mgrVer, bundledVersion)
            vscode.window.showInformationMessage(
                'reqstool server source updated. Reload window to apply.',
                'Reload'
            ).then(a => { if (a === 'Reload') vscode.commands.executeCommand('workbench.action.reloadWindow') })
        })
    )

    // If user explicitly configured serverCommand, skip all source-selection logic
    const cmdInsp = cfg.inspect<string[]>('serverCommand')
    const isCommandConfigured = !!(cmdInsp?.globalValue || cmdInsp?.workspaceValue || cmdInsp?.workspaceFolderValue)

    let systemVersion: string | undefined
    let managedBin: string | undefined

    if (!isCommandConfigured) {
        systemVersion = await getInstalledVersion('reqstool', timeout)

        // Show source picker on first activation (serverSource never explicitly chosen)
        const sourceInsp = cfg.inspect<string>('serverSource')
        const neverChosen = !sourceInsp?.globalValue && !sourceInsp?.workspaceValue && !sourceInsp?.workspaceFolderValue
        if (neverChosen) {
            const managedBinPath = getManagedBinPath(context)
            const managedBinVersion = fs.existsSync(managedBinPath)
                ? await getInstalledVersion(managedBinPath, timeout)
                : undefined
            await showServerSourcePicker(systemVersion, managedBinVersion, bundledVersion)
        }

        const source = cfg.get<string>('serverSource', 'auto')
        if (source === 'managed') {
            managedBin = await ensureManagedVenv(context)
        } else if (source === 'auto' && !systemVersion) {
            managedBin = await ensureManagedVenv(context)
        }
        // source === 'system', or 'auto' with system available → managedBin stays undefined → PATH fallback
    }

    const [executable, serverArgs] = resolveServerCommand(isCommandConfigured, managedBin)
    const activeSource: ServerSource = isCommandConfigured
        ? 'configured'
        : managedBin
            ? 'managed'
            : 'system'

    // Guard: inform user if reqstool is not installed
    if (!await checkServerInstalled(executable, timeout)) {
        const action = await vscode.window.showErrorMessage(
            'reqstool is not installed or not found. Install: pipx install "reqstool"',
            'Open Docs'
        )
        if (action === 'Open Docs') {
            vscode.env.openExternal(vscode.Uri.parse('https://reqstool.github.io'))
        }
        return
    }

    const activeVersion = await getInstalledVersion(executable, timeout)

    // Warn if system reqstool is older than the version bundled with this extension
    if (!isCommandConfigured && bundledVersion && systemVersion && semverLt(systemVersion, bundledVersion)) {
        vscode.window.showWarningMessage(
            `System reqstool ${systemVersion} is older than the version bundled with this extension (${bundledVersion}). ` +
            `Consider upgrading: pipx upgrade reqstool`,
            'Change Source', 'Dismiss'
        ).then(action => {
            if (action === 'Change Source') {
                vscode.commands.executeCommand('reqstool.selectServerSource')
            }
        })
    }

    const serverOptions: ServerOptions = {
        command: executable,
        args: serverArgs,
        transport: TransportKind.stdio,
        options: { env: { ...process.env, PYTHONUNBUFFERED: '1' } }
    }

    const outputChannel = vscode.window.createOutputChannel('reqstool')
    const traceOutputChannel = vscode.window.createOutputChannel('reqstool Trace')

    logServerInfo(outputChannel, activeVersion, activeSource, executable)

    const langStatus = vscode.languages.createLanguageStatusItem('reqstool.status', { language: '*' })
    langStatus.severity = vscode.LanguageStatusSeverity.Information
    langStatus.text = '$(tools) reqstool'
    langStatus.detail = `${activeVersion ?? 'unknown'} (${activeSource})`
    langStatus.busy = true
    langStatus.command = { command: 'reqstool.selectServerSource', title: 'Select Server Source' }
    context.subscriptions.push(langStatus)

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
    statusBar.command = 'reqstool.selectServerSource'
    statusBar.tooltip = new vscode.MarkdownString(
        'reqstool — click to change server source\n\nClick **{}** in the status bar to view project stats',
        true
    )
    statusBar.text = 'reqstool'
    statusBar.show()
    context.subscriptions.push(statusBar)

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
            },
            // Guard against the server returning symbols with empty names, which VS Code rejects
            provideDocumentSymbols: async (document, token, next) => {
                try {
                    return await next(document, token)
                } catch {
                    return []
                }
            },
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
        vscode.window.createTreeView('reqstool.outlineView', {
            treeDataProvider: outlineProvider,
            showCollapseAll: true,
        }),
        vscode.commands.registerCommand('reqstool.outline.scopeProject', () => outlineProvider.setScope('project')),
        vscode.commands.registerCommand('reqstool.outline.scopeFile',    () => outlineProvider.setScope('file')),
        vscode.commands.registerCommand('reqstool.outline.filter', async () => {
            await vscode.commands.executeCommand('reqstool.outlineView.focus')
            await vscode.commands.executeCommand('list.find')
        }),
        vscode.window.onDidChangeActiveTextEditor(e => outlineProvider.onEditorChange(e))
    )

    // reqstool.refresh is advertised in server's executeCommandProvider — vscode-languageclient
    // registers and routes it automatically via ExecuteCommandFeature. No manual registration needed.

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'reqstool.openDetails',
            // Code lenses pass { ids: string[], type } (plural); hover/outline pass { id: string, type }.
            async (args: { id?: string; ids?: string[]; type: string } | undefined) => {
                const id = args?.id ?? args?.ids?.[0]
                if (!id || !args?.type) {
                    vscode.window.showInformationMessage('reqstool: Open Details must be invoked from a code lens or hover link.')
                    return
                }
                if (!client) { return }
                try {
                    const data = await client.sendRequest<Record<string, unknown> | null>(
                        'reqstool/details', { id, type: args.type }
                    )
                    if (!data) {
                        vscode.window.showWarningMessage(`reqstool: no details found for ${id}`)
                        return
                    }
                    DetailsViewProvider.instance?.show(data)
                } catch (err) {
                    vscode.window.showErrorMessage(`reqstool: failed to load details for ${id}: ${err}`)
                }
            }
        )
    )

    const { registerSnippets } = await import('./snippets.js')
    context.subscriptions.push(registerSnippets())

    await client.start()
    context.subscriptions.push(client)

    // Use the version the LSP server reports — now accurate as of dev14.
    // Falls back to the binary version we detected before starting.
    const serverVersion = client.initializeResult?.serverInfo?.version ?? activeVersion

    if (serverVersion && serverVersion !== activeVersion) {
        langStatus.detail = `${serverVersion} (${activeSource})`
        const ts = new Date().toISOString()
        outputChannel.appendLine(`[${ts}] reqstool server version: ${serverVersion}`)
    }

    // Lazy-load project stats into the language status item and output channel
    void loadStatusStats(client, langStatus, outputChannel, serverVersion, activeSource)
}

type UrnInfo = { urn: string; title: string; variant: string | null }
type ListData = { requirements: { id: string }[]; svcs: { id: string }[]; mvrs: { id: string }[] }

async function loadStatusStats(
    lspClient: LanguageClient,
    item: vscode.LanguageStatusItem,
    channel: vscode.OutputChannel,
    version: string | undefined,
    source: string,
): Promise<void> {
    try {
        const [urns, list] = await Promise.all([
            lspClient.sendRequest<UrnInfo[]>('reqstool/list-urns', {}),
            lspClient.sendRequest<ListData>('reqstool/list', {}),
        ])
        item.detail = [
            `${version ?? 'unknown'} (${source})`,
            `${urns.length} URN${urns.length !== 1 ? 's' : ''}`,
            `${list.requirements.length} reqs`,
            `${list.svcs.length} SVCs`,
            `${list.mvrs.length} MVRs`,
        ].join(' · ')

        const ts = new Date().toISOString()
        channel.appendLine(`[${ts}] URNs loaded: ${urns.map(u => u.urn).join(', ')}`)
    } catch {
        // server not ready yet — leave busy spinner, user can refresh
    } finally {
        item.busy = false
    }
}

export async function deactivate(): Promise<void> {
    if (client) {
        await client.stop()
    }
}

async function showServerSourcePicker(
    systemVersion: string | undefined,
    managedBinVersion: string | undefined,
    bundledVersion: string | undefined,
): Promise<void> {
    const fallbackVersion = bundledVersion ?? managedBinVersion

    const items: vscode.QuickPickItem[] = [
        {
            label: 'Auto',
            description: '(Recommended)',
            detail: 'Use system reqstool if installed; otherwise fall back to the version packaged with this extension.',
        },
        {
            label: 'System installed',
            description: systemVersion ?? 'not found',
            detail: systemVersion
                ? 'Use the reqstool found on PATH.'
                : 'reqstool was not found on PATH. Install with: pipx install reqstool',
        },
        {
            label: 'Packaged with extension',
            description: fallbackVersion ?? 'unknown',
            detail: 'Use the reqstool version bundled and managed by this extension.',
        },
    ]

    const picked = await vscode.window.showQuickPick(items, {
        title: 'reqstool: Select Server Source',
        placeHolder: 'Choose which reqstool binary the extension uses',
    })

    if (!picked) { return }

    const valueMap: Record<string, string> = {
        'Auto': 'auto',
        'System installed': 'system',
        'Packaged with extension': 'managed',
    }
    const value = valueMap[picked.label]
    if (value) {
        await vscode.workspace.getConfiguration('reqstool')
            .update('serverSource', value, vscode.ConfigurationTarget.Global)
    }
}

function getManagedBinPath(context: vscode.ExtensionContext): string {
    const envDir = path.join(context.globalStorageUri.fsPath, 'env')
    const bin = process.platform === 'win32' ? 'Scripts' : 'bin'
    const exe = process.platform === 'win32' ? 'reqstool.exe' : 'reqstool'
    return path.join(envDir, bin, exe)
}

async function ensureManagedVenv(context: vscode.ExtensionContext): Promise<string | undefined> {
    const envDir = path.join(context.globalStorageUri.fsPath, 'env')
    const reqstoolBin = getManagedBinPath(context)

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
                    const bin = process.platform === 'win32' ? 'Scripts' : 'bin'
                    await run(python, ['-m', 'venv', envDir])
                    const pip = path.join(envDir, bin, process.platform === 'win32' ? 'pip.exe' : 'pip')
                    const reqstoolVersion = context.extension.packageJSON.reqstoolVersion as string | undefined
                    const packageSpec = reqstoolVersion ? `reqstool==${reqstoolVersion}` : 'reqstool'
                    await run(pip, ['install', packageSpec])
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

function resolveServerCommand(isCommandConfigured: boolean, managedBin?: string): [string, string[]] {
    const cfg = vscode.workspace.getConfiguration('reqstool')

    if (isCommandConfigured) {
        const cmd = cfg.get<string[]>('serverCommand', ['reqstool', 'lsp']).filter(s => s.trim().length > 0)
        const [command, ...args] = cmd.length > 0 ? cmd : ['reqstool', 'lsp']
        return [command, args]
    }

    if (managedBin) { return [managedBin, ['lsp']] }

    return ['reqstool', ['lsp']]
}

// PEP 440-ish version: release (x.y[.z[.w]]), optional pre-release (a1/b2/rc3),
// optional dev/post (.dev4/.post5), optional local segment (+abc.def).
const VERSION_RE = /(\d+(?:\.\d+){1,3}(?:(?:[abc]|rc)\d*)?(?:\.(?:dev|post)\d*)?(?:\+[\w.]+)?)/

export function parseVersionFromVersionOutput(stdout: string): string | undefined {
    const match = stdout.match(VERSION_RE)
    return match ? match[1] : undefined
}

async function getInstalledVersion(executable: string, timeout: number): Promise<string | undefined> {
    const { execFile } = await import('node:child_process')
    return new Promise(resolve =>
        execFile(executable, ['--version'], { timeout }, (err, stdout) => {
            if (err) { resolve(undefined); return }
            resolve(parseVersionFromVersionOutput(stdout))
        }))
}

async function checkServerInstalled(executable: string, timeout: number): Promise<boolean> {
    return (await getInstalledVersion(executable, timeout)) !== undefined
}

function semverLt(a: string, b: string): boolean {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) < (pb[i] ?? 0)) { return true }
        if ((pa[i] ?? 0) > (pb[i] ?? 0)) { return false }
    }
    return false
}
