// Copyright © reqstool

import * as assert from 'assert'
import * as vscode from 'vscode'

describe('Extension smoke tests', () => {
    it('extension is registered', () => {
        const ext = vscode.extensions.getExtension('reqstool.reqstool')
        assert.ok(ext, 'Extension reqstool.reqstool not found')
    })

    it('reqstool.refresh command is registered', async () => {
        const commands = await vscode.commands.getCommands(true)
        assert.ok(commands.includes('reqstool.refresh'), 'reqstool.refresh command not registered')
    })
})
