#!/usr/bin/env node
// Build the VSIX with version derived from the git tag.
// Temporarily patches package.json, runs vsce package, then restores.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkgPath = join(root, 'package.json')
const original = readFileSync(pkgPath, 'utf8')

const version = execSync('node scripts/get-version.mjs', { cwd: root }).toString().trim()
console.log(`Building reqstool ${version}`)

const pkg = JSON.parse(original)
pkg.version = version
writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n')

try {
    execSync('vsce package', { cwd: root, stdio: 'inherit' })
} finally {
    writeFileSync(pkgPath, original)
}
