// Copyright © reqstool

import * as vscode from 'vscode'

const snippets = [
    {
        label: 'Requirement YAML block',
        insertText: new vscode.SnippetString(
            [
                '- id: ${1:SYS-REQ-001}',
                '  title: ${2:Title}',
                '  description: ${3:Description}',
                '  rationale: ${4:Rationale}',
                '  significance: ${5|shall,should,may|}',
                '  categories: ',
                '  references: ',
                '    requirement_ids: ',
                '  revision: ${6:0.0.1}',
            ].join('\n')
        ),
        kind: vscode.CompletionItemKind.Snippet,
        detail: 'Inserts an empty Requirement YAML block',
    },
    {
        label: 'SVC YAML block',
        insertText: new vscode.SnippetString(
            [
                '- id: ${1:SYS-SVC-001}',
                '  title: ${2:Title}',
                '  requirement_ids: ',
                '  description: ${3:Description}',
                '  verification: ${4|automated,manual|}',
                '  instructions: ${5:Instructions}',
                '  revision: ${6:0.0.1}',
            ].join('\n')
        ),
        kind: vscode.CompletionItemKind.Snippet,
        detail: 'Inserts an empty software verification case YAML block',
    },
    {
        label: 'MVR YAML block',
        insertText: new vscode.SnippetString(
            [
                '- id: ${1:SYS-MVR-001}',
                '  svc_ids: ',
                '  comment: ${2:Comment}',
                '  pass: ${3|true,false|}',
            ].join('\n')
        ),
        kind: vscode.CompletionItemKind.Snippet,
        detail: 'Inserts an empty manual verification results YAML block',
    },
]

/**
 * Adds autocomplete snippets to YAML files
 * @returns a disposable that should be pushed to the context.subscriptions of the activate function.
 */
export function registerSnippets(): vscode.Disposable {
    return vscode.languages.registerCompletionItemProvider(
        { language: 'yaml' },
        {
            provideCompletionItems() {
                return snippets.map((snippet) => {
                    const item = new vscode.CompletionItem(snippet.label, snippet.kind)
                    item.insertText = snippet.insertText
                    item.documentation = new vscode.MarkdownString(snippet.detail)
                    return item
                })
            },
        }
    )
}
