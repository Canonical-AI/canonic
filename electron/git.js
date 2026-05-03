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
    return { path: workspacePath, alreadyExists: true, isExternal: true }
  }

  await git.init({ fs, dir: workspacePath, defaultBranch: 'main' })

  const filesToCommit = []

  // Write template files
  try {
    if (template === 'pm-framework') {
      const pmFiles = getPMFrameworkFiles()
      for (const [relPath, content] of Object.entries(pmFiles)) {
        const fullPath = path.join(workspacePath, relPath)
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, content, 'utf-8')
        filesToCommit.push(relPath)
      }
    } else if (template === 'canonic-demo') {
      const demoFiles = getCanonicdemoFiles()
      for (const [relPath, content] of Object.entries(demoFiles)) {
        const fullPath = path.join(workspacePath, relPath)
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, content, 'utf-8')
        filesToCommit.push(relPath)
      }
    }

    const readmePath = 'README.md'
    fs.writeFileSync(path.join(workspacePath, readmePath), getReadmeContent(), 'utf-8')
    filesToCommit.push(readmePath)
  } catch (err) {
    throw new Error(`Failed to create template files: ${err.message}`)
  }

  // Stage all files
  try {
    for (const filepath of filesToCommit) {
      await git.add({ fs, dir: workspacePath, filepath })
    }
  } catch (err) {
    throw new Error(`Failed to stage files: ${err.message}`)
  }

  const message = template === 'pm-framework'
    ? 'Initialize PM Framework workspace'
    : template === 'canonic-demo'
      ? 'Initialize canonic demo workspace'
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
    // Save state of any files already staged (head !== stage) that aren't our target.
    // We'll restore them after committing so we don't bundle external staged changes.
    const matrix = await git.statusMatrix({ fs, dir: workspacePath })
    const externallyStaged = matrix
      .filter(([f, head, , stage]) => f !== filePath && stage !== head)
      .map(([f]) => f)

    for (const f of externallyStaged) {
      await git.resetIndex({ fs, dir: workspacePath, filepath: f })
    }

    await git.add({ fs, dir: workspacePath, filepath: filePath })
    const oid = await git.commit({
      fs,
      dir: workspacePath,
      message: message || 'Update document',
      author: getAuthor()
    })

    // Re-stage what we temporarily unstaged
    for (const f of externallyStaged) {
      await git.add({ fs, dir: workspacePath, filepath: f })
    }

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
    // Detached HEAD: no current branch. If 'main' exists use it, else first branch, else null.
    const resolved = current || (allBranches.includes('main') ? 'main' : allBranches[0] || null)
    return { branches: allBranches, current: resolved, detached: !current }
  } catch (err) {
    return { branches: [], current: null, detached: true }
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

async function fileStatus(workspacePath, filePath) {
  try {
    const matrix = await git.statusMatrix({ fs, dir: workspacePath, filepaths: [filePath] })
    if (!matrix.length) return { isNew: true, isUncommitted: true }
    const [, head, workdir] = matrix[0]
    return { isNew: head === 0, isUncommitted: head !== workdir }
  } catch {
    return { isNew: false, isUncommitted: false }
  }
}

async function logAllBranches(workspacePath, filePath, branchList) {
  const allCommits = new Map()
  const branchTips = {}

  for (const branch of branchList) {
    try {
      let commits = []

      // filepath-filtered log (fast path)
      try {
        commits = await git.log({ fs, dir: workspacePath, ref: branch, filepath: filePath })
      } catch {}

      // If filepath filter returned nothing, walk branch and check blob existence per commit
      if (commits.length === 0) {
        try {
          const all = await git.log({ fs, dir: workspacePath, ref: branch })
          for (const c of all) {
            if ((c.commit.parent || []).length > 1) { commits.push(c); continue }
            try {
              await git.readBlob({ fs, dir: workspacePath, oid: c.oid, filepath: filePath })
              commits.push(c)
            } catch {}
          }
        } catch {}
      }

      if (commits.length > 0) branchTips[branch] = commits[0].oid
      for (const c of commits) {
        if (allCommits.has(c.oid)) continue
        allCommits.set(c.oid, {
          oid: c.oid,
          message: c.commit.message.trim(),
          author: c.commit.author.name,
          timestamp: c.commit.author.timestamp * 1000,
          parents: c.commit.parent || [],
          isMerge: (c.commit.parent || []).length > 1,
          branchTips: []
        })
      }
    } catch {}
  }

  // Fallback: workspace in detached HEAD state (no named branches) — use HEAD directly
  if (allCommits.size === 0) {
    try {
      const headCommits = await git.log({ fs, dir: workspacePath, filepath: filePath })
      for (const c of headCommits) {
        allCommits.set(c.oid, {
          oid: c.oid,
          message: c.commit.message.trim(),
          author: c.commit.author.name,
          timestamp: c.commit.author.timestamp * 1000,
          parents: c.commit.parent || [],
          isMerge: (c.commit.parent || []).length > 1,
          branchTips: []
        })
      }
    } catch {}
  }

  for (const [branchName, tipOid] of Object.entries(branchTips)) {
    const c = allCommits.get(tipOid)
    if (c) c.branchTips.push(branchName)
  }

  return Array.from(allCommits.values()).sort((a, b) => b.timestamp - a.timestamp)
}

async function deleteBranch(workspacePath, branchName) {
  try {
    await git.deleteBranch({ fs, dir: workspacePath, ref: branchName })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

function getCanonicdemoFiles() {
  return {
    'Vision/product-vision.md': `# Product Vision

> What we're building and why it matters.

## Vision Statement

Canonic is a local-first document editor for product managers — built on Git — that makes version control, peer review, and AI-assisted thinking feel native to how good PMs already work.

## Problem We're Solving

Product managers write documents — PRDs, strategies, roadmaps — in tools that treat them as ephemeral notes. Notion, Google Docs, and Confluence have no concept of history, branching, or review. Decisions get made in comments that disappear. "Final_v3_APPROVED.docx" is still the state of the art.

The real problem isn't the format. It's that there's no shared ritual for saying "this document is ready to build from." Engineers have PRs. PMs have Slack threads.

## Why Now

Three things converged:

1. **Remote-first teams normalized async review.** The "walk over and ask" fallback is gone. Docs need to stand alone.
2. **AI can now act as a thinking partner.** The bottleneck isn't writing speed — it's thinking quality. Claude can challenge your reasoning before you've committed to it.
3. **Local-first is having a moment.** Developers are exhausted by SaaS tools that hold their data hostage. PMs are starting to feel the same way.

## Who This Is For

B2B product managers at 20–500 person companies who ship software. They write documents before building things. They collaborate with engineers and designers. They care about their decisions aging well — they want to look back at why they decided something, not just what.

Not for: enterprise PMOs, agencies, or anyone who needs a PM tool to also be a project tracker.
`,
    'Vision/north-star-metric.md': `# North Star Metric

> The one metric that best captures whether we're delivering value.

## Our North Star

**Committed docs per active workspace per month** — the number of documents a user saves a checkpoint commit on, per workspace they actively use.

Current baseline: 0 (pre-launch). Target by end of Q3: 3+ per workspace per month.

## Why This Metric

A commit is a meaningful act. It means the user trusted the document enough to snapshot it. It's the PM equivalent of merging a PR. If users aren't committing, they're using Canonic like a notes app — which means we haven't solved the alignment problem, we've just replaced Notion.

High commit frequency signals: the user understands the value of version control, they have something worth preserving, and they're developing a habit.

## Leading Indicators

- Files opened per session (are they coming back?)
- Time-to-first-commit per new workspace (are they getting it?)
- Comments added per doc (are they collaborating?)
- AI chat messages per session (are they thinking harder before committing?)
`,
    'Strategy/strategy.md': `# Strategy

> How we'll achieve the vision given our constraints.

## Strategic Bets

**1. Win the solo PM first.** No collaboration features required to get value. The version history alone is better than anything a PM has today. Land here, then expand to teams.

**2. Git vocabulary, PM framing.** Don't hide the model — explain it. "Branch" is a draft. "Commit" is a checkpoint. PMs who understand the metaphor become evangelists. PMs who don't get confused and churn. The README in every workspace explains this.

**3. AI as thinking partner, not ghostwriter.** Every other AI writing tool competes on output quality. We compete on decision quality. The AI asks questions, challenges assumptions, points out what's missing. It doesn't write your PRD — it makes your PRD worth building from.

**4. Open source → paid hosting.** Release the desktop app free and open. Sell the infrastructure (hosted relay, sync server, team access management) later. This keeps the core trustworthy and gives us a credible enterprise path without VC pressure to monetize day one.

## What We're NOT Doing

- Building a project tracker. Canonic is for pre-build alignment, not sprint management.
- Building a web app. Local-first means local-first. The desktop app is the product.
- Replacing GitHub for engineers. This is PM-layer tooling. It sits above the code.
- Supporting real-time collaborative editing (v1). Async review is the model.

## Key Assumptions

- PMs will adopt a new tool if it solves version history — the pain is high enough.
- The Git mental model is learnable by non-engineers if the UI explains it clearly.
- AI that pushes back is more valuable than AI that agrees with you.
- Open source creates enough trust and distribution to make the hosted tier viable.
`,
    'Strategy/competitive-analysis.md': `# Competitive Analysis

## Landscape Overview

The PM document space is dominated by general-purpose collaboration tools (Notion, Google Docs, Confluence) and task managers that bolt on docs (Linear, Jira). Nobody is building for the specific problem of document versioning and pre-build alignment.

## Competitors

| Competitor | Strengths | Weaknesses | Our Differentiation |
|---|---|---|---|
| **Notion** | Flexible, widely adopted, good for wikis | No version history, comments get lost, no branching | Git-native history + named versions + branch drafts |
| **Google Docs** | Real-time collab, version history exists | Version history is useless (auto-saves every few seconds), no structured review | Meaningful commits you choose, not noise |
| **Confluence** | Enterprise adoption, structured | Terrible UX, no AI, nobody actually reads Confluence | Modern editor, AI that challenges, not just stores |
| **Linear** | Excellent for eng workflow | Docs are second-class, no deep PM tooling | Documents as first-class artifacts with full git history |
| **Obsidian** | Local-first, powerful, markdown | No collaboration, no PM templates, no AI | Collaboration + PM-specific structure + AI thinking partner |

## Where We Win

Git under the hood means a real history model — branching, merging, named versions, diffs. No other PM tool has this because they built on databases, not files.

The AI angle is genuinely different: we tune the system prompt to ask questions, not generate answers. Most AI writing tools make you lazier. We're trying to make PMs think harder.

Local-first is a real differentiator for privacy-conscious teams and orgs that can't put product strategy in a SaaS tool.
`,
    'Planning/roadmap.md': `# Roadmap

> What we're building and roughly when.

## Now (Q2 2026)

Active work — these are in flight or next up.

- [x] Git version control: commit, branch, merge per document
- [x] Named versions with restore (snapshot any commit as "v1.0", "approved", etc.)
- [x] Fork document (create a branch draft)
- [x] History panel with diff view
- [x] AI chat (thinking partner, not ghostwriter)
- [x] Inline comments anchored to selected text
- [x] Sharing via Cloudflare Tunnel (token-secured links)
- [x] Demo mode with mock peer data
- [ ] Show uncommitted changes indicator in editor
- [ ] Collapsible sidebar

## Next (Q3 2026)

Committed, not yet started. Building toward team collaboration.

- [ ] Peer document sync — view a teammate's workspace read-only, synced via git fetch
- [ ] Agent web search — AI can pull in external research on demand
- [ ] Agent inline suggestions — ghost diff lines the user can accept or reject
- [ ] Terminal pane — run CLI commands in workspace context
- [ ] Claude Code integration — "update the app to reflect this PRD" launches a Claude Code session

## Later

Directional, subject to change.

- Hosted relay (paid) — team sync without self-hosting
- Team access management — share workspaces with ACLs
- Mobile read-only client
- Git hooks for document quality (e.g., require filled sections before commit)

## Deprioritized

- Real-time collaborative editing: async review is the right model for pre-build docs; Google Docs already does real-time better than we could
- Web app: local-first is the differentiator; a web app would require us to store data, which breaks the trust model
- Integrations (Jira, Linear, Notion export): distraction until core loop is loved
`,
    'Discovery/problem-statement.md': `# Problem Statement

> A crisp definition of the problem we're solving.

## The Problem

Product managers struggle to create a shared, authoritative version of a document that the team trusts enough to build from, because the tools they use treat documents as living notes rather than versioned artifacts — which means engineering teams often start building before the PM is done thinking, and alignment is achieved through Slack threads instead of reviewed documents.

## Evidence

- "Final_v3_APPROVED.docx" is a real naming convention used at companies with $1B+ ARR
- Notion's version history records every keystroke, making it useless for "what did we decide"
- Engineers regularly describe getting requirements mid-sprint via Slack DM
- In interviews: "I can tell you what the doc says today but I can't tell you what changed last week or why"

## Current Workarounds

- Manual version naming in the filename (v1, v2, FINAL, FINAL_APPROVED)
- Google Docs "version history" — exists but not actionable (no branches, no named snapshots)
- Printing to PDF at key moments and attaching to Jira tickets
- Duplicate documents ("Strategy_old.md") kept as informal archives

## Success Criteria

A PM opens Canonic, writes a requirements doc, commits it at two different stages of review, and can show an engineer the exact diff between "first draft" and "approved" — without any of those words being in the filename.
`,
    'Discovery/user-research.md': `# User Research

> What we've learned directly from users.

## Research Questions

1. How do PMs currently manage document versions and track decisions over time?
2. What does "this document is ready to build from" mean to them — and how do they signal it?

## Methods Used

Founder interviews (10 PMs at B2B SaaS companies, 20–400 employees), alongside survey of 40 PMs in a product community Slack.

## Key Findings

### Finding 1: Version history is the #1 unmet need

Every PM interviewed had a story about a decision they couldn't reconstruct. "I know we changed this requirement but I can't find where we landed or why." None of them trusted their current tool's version history. Google Docs' history was described as "too noisy to be useful."

### Finding 2: The "draft → review → approved" ritual is informal and fragile

Most teams have an implicit flow but no tooling that enforces it. Approval happens via a Slack message or a "LGTM" comment. There's no authoritative moment of "this is the committed version."

### Finding 3: PMs are open to Git concepts if explained in their language

"Branch" and "commit" land if you call them "draft" and "checkpoint." Three of ten PMs in initial interviews said they'd wanted something like this for years but assumed it didn't exist.

### Finding 4: AI skepticism is high, but the framing matters

Most PMs have tried AI writing tools and found them underwhelming — they produce generic output that still needs heavy editing. When we described AI that asks questions instead of writes answers, the reaction was universally positive. "That's actually what I need."

## What This Means for the Product

The core loop is: write → commit → review → approve. Everything we build should make that loop faster and more trustworthy. The AI should be inserted at the review step, not the writing step.
`,
  }
}

module.exports = {
  setAuthor,
  initWorkspace,
  listFiles,
  commit,
  log,
  logAllBranches,
  fileStatus,
  branches,
  createBranch,
  checkout,
  merge,
  diff,
  readCommit,
  status,
  deleteBranch
}
