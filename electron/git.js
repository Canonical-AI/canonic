const git = require('isomorphic-git')
const fs = require('fs')
const path = require('path')
const os = require('os')
const configService = require('./config')

let _author = null

function getAuthor() {
  if (_author) return _author
  const cfg = configService.read()
  if (cfg?.displayName) {
    _author = { name: cfg.displayName, email: `${cfg.displayName.replace(/\s+/g, '.')}@canonic.local` }
  } else {
    _author = { name: os.userInfo().username, email: `${os.userInfo().username}@canonic.local` }
  }
  return _author
}

function setAuthor(author) {
  _author = author
}

async function initWorkspace(workspacePath, template = 'blank') {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true })
  }

  // Check if already a git repo
  const gitDir = path.join(workspacePath, '.git')
  if (fs.existsSync(gitDir)) {
    return { path: workspacePath, alreadyExists: true }
  }

  await git.init({ fs, dir: workspacePath, defaultBranch: 'main' })

  const filesToCommit = []

  if (template === 'pm-framework') {
    const pmFiles = getPMFrameworkFiles()
    for (const [relPath, content] of Object.entries(pmFiles)) {
      const fullPath = path.join(workspacePath, relPath)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content, 'utf-8')
      filesToCommit.push(relPath)
    }
  }

  // Always create README
  const readmePath = 'README.md'
  fs.writeFileSync(path.join(workspacePath, readmePath), getReadmeContent(), 'utf-8')
  filesToCommit.push(readmePath)

  for (const filepath of filesToCommit) {
    await git.add({ fs, dir: workspacePath, filepath })
  }

  const message = template === 'pm-framework'
    ? 'Initialize PM Framework workspace'
    : 'Initialize workspace'

  await git.commit({ fs, dir: workspacePath, message, author: getAuthor() })

  return { path: workspacePath, template, filesCreated: filesToCommit }
}

function getReadmeContent() {
  return `# My Canonic Workspace

A local-first document workspace powered by Canonic.

## Git concepts in Canonic

| Git term | What it means here |
|---|---|
| **Branch** | A working draft or experiment — work here without affecting \`main\` |
| **Commit** | A saved checkpoint — like saving a version you can return to |
| **Merge** | Bring a branch's changes back into \`main\` when ready |

Start writing in any document. Use the branch selector in the toolbar to create drafts.
`
}

function getPMFrameworkFiles() {
  return {
    'Vision/product-vision.md': `# Product Vision

> What we're building and why it matters.

## Vision Statement

_Write a one or two sentence aspirational statement describing the future state you want to create._

## Problem We're Solving

_Describe the core problem from the user's perspective. Who feels this pain? How often? How severely?_

## Why Now

_What has changed in the market, technology, or user behavior that makes this the right time to build?_

## Who This Is For

_Describe your primary user. Be specific — a narrow, vivid description beats a broad one._
`,
    'Vision/north-star-metric.md': `# North Star Metric

> The one metric that best captures whether we're delivering value.

## Our North Star

_State the metric and its current value._

## Why This Metric

_Explain why this metric — not others — is the best proxy for user value._

## Leading Indicators

_What smaller metrics predict movement in the North Star before it shows up?_

-
-
-
`,
    'Strategy/strategy.md': `# Strategy

> How we'll achieve the vision given our constraints.

## Strategic Bets

_What are the 2–4 big moves we're making? Each bet should be specific and falsifiable._

1.
2.
3.

## What We're NOT Doing

_Explicitly stating non-priorities prevents scope creep and keeps the team focused._

-
-

## Key Assumptions

_What must be true for this strategy to work? These are your biggest risks._

-
-
`,
    'Strategy/competitive-analysis.md': `# Competitive Analysis

## Landscape Overview

_Brief description of the competitive space._

## Competitors

| Competitor | Strengths | Weaknesses | Our Differentiation |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |

## Where We Win

_What can we do that alternatives cannot? Be honest — if the answer is "nothing yet," write that._
`,
    'Planning/roadmap.md': `# Roadmap

> What we're building and roughly when.

## Now (current quarter)

_Active work. Should be specific enough that the team knows what done looks like._

- [ ]
- [ ]

## Next (next quarter)

_Committed but not yet started. High confidence._

-
-

## Later (future)

_Directional. Subject to change based on what we learn._

-
-

## Deprioritized

_Things we've considered and actively chosen not to do yet. Write the reason._

-
`,
    'Planning/okrs.md': `# OKRs

> Objectives and Key Results for the current period.

**Period:** _Q? 20??_

## Objective 1

_Aspirational, qualitative, memorable._

- KR1: _Measurable outcome_ — **Current: ? / Target: ?**
- KR2: _Measurable outcome_ — **Current: ? / Target: ?**

## Objective 2

_Aspirational, qualitative, memorable._

- KR1: _Measurable outcome_ — **Current: ? / Target: ?**
- KR2: _Measurable outcome_ — **Current: ? / Target: ?**
`,
    'Discovery/user-research.md': `# User Research

> What we've learned directly from users.

## Research Questions

_What did we set out to learn?_

1.
2.

## Methods Used

_How did we gather data? (interviews, surveys, usability tests, analytics, etc.)_

## Key Findings

_What did we learn? Be specific — name patterns, quote users, cite data._

### Finding 1:

### Finding 2:

## What This Means for the Product

_How do these findings change what we build or how we prioritize?_
`,
    'Discovery/problem-statement.md': `# Problem Statement

> A crisp definition of the problem we're solving.

## The Problem

_Complete this sentence: "[User type] struggle to [do thing] because [root cause], which means [impact]."_

## Evidence

_What data or observations confirm this is a real and significant problem?_

-
-

## Current Workarounds

_How do users solve this today? Understanding workarounds reveals the true shape of the problem._

## Success Criteria

_How will we know we've solved it? What does the user experience look like after?_
`,
    'Implementation/technical-spec.md': `# Technical Specification

> How we're building it.

## Overview

_One paragraph describing what this is and what it does._

## Requirements

_What must be true when this is done?_

-
-

## Design Decisions

_Key technical choices and the reasoning behind them. Include rejected alternatives._

| Decision | Chosen approach | Rejected alternatives | Reason |
|---|---|---|---|
|  |  |  |  |

## Open Questions

_Technical unknowns that need answers before or during implementation._

- [ ]

## Out of Scope

_Explicitly list what is NOT being built in this iteration._
`,
    'Implementation/launch-checklist.md': `# Launch Checklist

> Verification steps before shipping.

## Pre-Launch

- [ ] Feature works end-to-end in staging
- [ ] Edge cases tested (empty states, errors, limits)
- [ ] Copy reviewed and approved
- [ ] Analytics events firing correctly
- [ ] Rollback plan documented

## Launch Day

- [ ] Feature flag / rollout configured
- [ ] Team notified
- [ ] Support team briefed on expected questions

## Post-Launch (48h)

- [ ] Key metrics moving as expected
- [ ] No spike in errors or support tickets
- [ ] Captured learnings for next iteration
`,
    'Monitoring/metrics-dashboard.md': `# Metrics Dashboard

> Key indicators to watch after launch.

## Health Metrics

| Metric | Baseline | Target | Current | Status |
|---|---|---|---|---|
|  |  |  |  |  |
|  |  |  |  |  |

## Alerts

_What conditions should trigger investigation?_

-
-

## Review Cadence

_When and how often are these metrics reviewed?_
`,
    'Monitoring/incident-log.md': `# Incident Log

> Record of issues, their impact, and what we learned.

## Log

_Add new entries at the top._

---

### [DATE] — Incident Title

**Severity:** Low / Medium / High
**Duration:**
**Impact:**
**Root cause:**
**Resolution:**
**Prevention:**
`
  }
}

async function listFiles(workspacePath) {
  if (!fs.existsSync(workspacePath)) return []

  const entries = []
  const scanDir = (dirPath, prefix = '') => {
    const items = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const item of items) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue
      const relPath = prefix ? `${prefix}/${item.name}` : item.name
      if (item.isDirectory()) {
        entries.push({ name: item.name, path: relPath, type: 'directory', children: [] })
        scanDir(path.join(dirPath, item.name), relPath)
      } else if (item.name.endsWith('.md')) {
        const stat = fs.statSync(path.join(dirPath, item.name))
        entries.push({
          name: item.name.replace('.md', ''),
          path: relPath,
          type: 'file',
          modified: stat.mtimeMs
        })
      }
    }
  }
  scanDir(workspacePath)

  // Build tree structure
  return buildTree(entries)
}

function buildTree(flatList) {
  const root = []
  const map = {}

  for (const item of flatList) {
    map[item.path] = { ...item, children: item.type === 'directory' ? [] : undefined }
  }

  for (const item of flatList) {
    const parts = item.path.split('/')
    if (parts.length === 1) {
      root.push(map[item.path])
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      if (map[parentPath]) {
        map[parentPath].children = map[parentPath].children || []
        map[parentPath].children.push(map[item.path])
      }
    }
  }

  return root
}

async function commit(workspacePath, filePath, message) {
  try {
    await git.add({ fs, dir: workspacePath, filepath: filePath })
    const oid = await git.commit({
      fs,
      dir: workspacePath,
      message: message || 'Update document',
      author: getAuthor()
    })
    return { success: true, oid }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function log(workspacePath, filePath) {
  try {
    const commits = await git.log({ fs, dir: workspacePath, filepath: filePath })
    return commits.map(c => ({
      oid: c.oid,
      message: c.commit.message,
      author: c.commit.author.name,
      timestamp: c.commit.author.timestamp * 1000
    }))
  } catch (err) {
    return []
  }
}

async function branches(workspacePath) {
  try {
    const allBranches = await git.listBranches({ fs, dir: workspacePath })
    const current = await git.currentBranch({ fs, dir: workspacePath })
    return { branches: allBranches, current }
  } catch (err) {
    return { branches: ['main'], current: 'main' }
  }
}

async function createBranch(workspacePath, branchName) {
  try {
    await git.branch({ fs, dir: workspacePath, ref: branchName, checkout: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function checkout(workspacePath, branchName) {
  try {
    await git.checkout({ fs, dir: workspacePath, ref: branchName })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function merge(workspacePath, fromBranch, message) {
  try {
    const result = await git.merge({
      fs,
      dir: workspacePath,
      ours: 'main',
      theirs: fromBranch,
      message: message || `Merge branch '${fromBranch}' into main`,
      author: getAuthor(),
      fastForward: false
    })
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message, conflict: err.code === 'MergeConflictError' }
  }
}

async function diff(workspacePath, filePath, oid) {
  try {
    // Get content at commit oid vs HEAD
    const commitContent = await readCommit(workspacePath, filePath, oid)
    const currentPath = path.join(workspacePath, filePath)
    const currentContent = fs.existsSync(currentPath) ? fs.readFileSync(currentPath, 'utf-8') : ''
    return { before: commitContent, after: currentContent }
  } catch (err) {
    return { before: '', after: '' }
  }
}

async function readCommit(workspacePath, filePath, oid) {
  try {
    const { blob } = await git.readBlob({
      fs,
      dir: workspacePath,
      oid,
      filepath: filePath
    })
    return Buffer.from(blob).toString('utf-8')
  } catch (err) {
    // Try walking the commit tree
    try {
      const { commit } = await git.readCommit({ fs, dir: workspacePath, oid })
      const treeOid = commit.tree
      const { blob } = await git.readBlob({
        fs,
        dir: workspacePath,
        oid: treeOid,
        filepath: filePath
      })
      return Buffer.from(blob).toString('utf-8')
    } catch (e) {
      return ''
    }
  }
}

async function status(workspacePath) {
  try {
    const statusMatrix = await git.statusMatrix({ fs, dir: workspacePath })
    const modified = statusMatrix
      .filter(([, head, workdir]) => head !== workdir)
      .map(([filepath]) => filepath)
    return { modified }
  } catch (err) {
    return { modified: [] }
  }
}

module.exports = {
  setAuthor,
  initWorkspace,
  listFiles,
  commit,
  log,
  branches,
  createBranch,
  checkout,
  merge,
  diff,
  readCommit,
  status
}
