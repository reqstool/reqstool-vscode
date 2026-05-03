#!/usr/bin/env node
// Derives the package version from the nearest git tag.
//
// Priority:
//   1. Exact tag on HEAD      → use that tag (strip leading 'v')
//   2. git describe output    → e.g. 0.1.0-rc8-3-gabcdef
//   3. Fallback               → "0.0.0-dev"

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function git(cmd) {
    try {
        return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString().trim()
    } catch {
        return ''
    }
}

const exactTag = git('git tag --points-at HEAD --sort=-version:refname')
    .split('\n').find(t => t.length > 0) ?? ''

const raw = exactTag || git('git describe --tags --long --abbrev=7')

const version = raw ? raw.replace(/^v/, '') : '0.0.0-dev'

process.stdout.write(version)
