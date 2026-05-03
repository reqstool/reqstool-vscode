// Copyright © reqstool

import * as assert from 'assert'
import * as vscode from 'vscode'
import { parseVersionFromVersionOutput } from '../extension.js'

describe('Extension smoke tests', () => {
    it('extension is registered', () => {
        const ext = vscode.extensions.getExtension('reqstool.reqstool')
        assert.ok(ext, 'Extension reqstool.reqstool not found')
    })

    it('reqstool.selectServerSource command is registered', async () => {
        const commands = await vscode.commands.getCommands(true)
        assert.ok(commands.includes('reqstool.selectServerSource'), 'reqstool.selectServerSource command not registered')
    })
})

describe('parseVersionFromVersionOutput', () => {
    const cases: [string, string | undefined][] = [
        ['0.9.1\n        # JSON Schema version: v1\n', '0.9.1'],
        ['0.9.1.dev10\n        # JSON Schema version: v1\n', '0.9.1.dev10'],
        ['0.9.1.post1\n', '0.9.1.post1'],
        ['1.0.0rc1\n', '1.0.0rc1'],
        ['1.0.0a3\n', '1.0.0a3'],
        ['1.0.0+abc.def\n', '1.0.0+abc.def'],
        ['1.0.0.dev5+sha.abc123\n', '1.0.0.dev5+sha.abc123'],
        ['reqstool, version 0.9.1.dev10\n', '0.9.1.dev10'],
        ['', undefined],
        ['no version here\n', undefined],
    ]
    for (const [input, expected] of cases) {
        it(`parses ${JSON.stringify(input)}`, () => {
            assert.strictEqual(parseVersionFromVersionOutput(input), expected)
        })
    }
})
