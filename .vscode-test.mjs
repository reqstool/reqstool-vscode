import { defineConfig } from '@vscode/test-cli'

export default defineConfig({
    files: 'out/test/*.test.js',
    launchArgs: ['--headless', '--disable-gpu'],
    mocha: {
        reporter: 'mocha-junit-reporter',
    },
})
