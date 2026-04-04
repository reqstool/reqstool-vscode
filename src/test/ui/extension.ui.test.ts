// Copyright © reqstool

import * as assert from 'assert'
import { VSBrowser, ActivityBar, ExtensionsViewSection, Workbench } from 'vscode-extension-tester'

describe('reqstool Extension UI Tests', () => {
    before(async function () {
        this.timeout(15000)
        await VSBrowser.instance.waitForWorkbench()
    })

    it('extension activates without errors', async function () {
        this.timeout(10000)
        const notifications = await new Workbench().getNotifications()
        const errors = (await Promise.all(
            notifications.map(async (n) => (await n.getType() === 'error' ? await n.getMessage() : null))
        )).filter(Boolean)
        assert.strictEqual(errors.length, 0, `Unexpected errors: ${errors.join(', ')}`)
    })

    it('extension is installed', async function () {
        this.timeout(15000)
        const control = await new ActivityBar().getViewControl('Extensions')
        assert.ok(control)
        const view = await control.openView()
        const section = (await view.getContent().getSection('Installed')) as ExtensionsViewSection
        const names = await Promise.all((await section.getVisibleItems()).map((e) => e.getTitle()))
        assert.ok(names.some((n) => n.toLowerCase().includes('reqstool')))
    })
})
