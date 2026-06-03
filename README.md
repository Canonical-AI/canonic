<div align="center">

<img src="build/icons/icon.png" alt="Canonic" width="80" height="80" />

# Canonic

**Local-first document editor for product teams — powered by Git.**

[Documentation](docs/HOWTO.md) · [Install](#install) · [Canonic Skills](#canonic-skill) · [Build From Source](#build-from-source) · [Report a Bug](https://github.com/Canonical-AI/canonic/issues)

***

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.0.20--alpha-orange.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](#install)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00.svg?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/johnjazzi)

</div>

***

> **Write first. Build second.**
> Canonic is a markdown editor for product managers that keeps your artifacts organized, versioned, and always on your machine — with an AI assistant designed to help you *think*, not to think for you.

<div align="center">

![Canonic demo](docs/canonic-demo.gif)

![Canonic Editor](docs/screenshot.png)

</div>

***

## Why Canonic

Product work lives in too many places. strategy in Notion, specs in Confluence, decisions in Slack threads, and history nowhere. Canonic brings it together in one local-first workspace, backed by Git so nothing is ever lost.

* **Local-first.** Plain markdown files on your machine. Open them in any editor; sync them however you want.

* **Git under the hood.** Every workspace is a Git repo. Save checkpoints, branch per document, view full history — no terminal required.

* **AI autocomplete, not autopilot.** Optional ghost-text completions as you type — `Tab` to accept. No ghostwriting your docs.

* **Run coding agents in-app.** Drive Claude Code, Codex, Gemini CLI, OpenCode, or Pi from the Agent panel — they see your open docs and can read, edit, and comment via a local MCP server that wires itself up.

* **Built for product work.** Inline comments, peer sharing, GFM tables, mermaid diagrams, wiki-links, find & replace across the workspace.

* **Works with your repos.** Drop Canonic on an existing `.git` folder and it adapts.

***

## Documentation

Full usage guide, keyboard shortcuts, and feature walkthroughs:

**➜** **[docs/HOWTO.md](docs/HOWTO.md)**

<br />

***

## Install

### One-liner (macOS & Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/Canonical-AI/canonic/main/install.sh | sh
```

Detects your OS and architecture, downloads the right build, and installs it.

- **macOS** (Apple Silicon) → `/Applications/Canonic.app`
- **Linux** (x64 / arm64) → `~/.local/bin/canonic` (AppImage)

To pin a specific version: `curl -fsSL ... | sh -s -- --version v0.1.2-alpha`

<br />

### macOS (Homebrew)

```bash
brew tap Canonical-AI/tap
brew install --cask canonic
```

### Linux

**AppImage**

```bash
chmod +x canonic-*.AppImage
./canonic-*.AppImage
```

**Flatpak** (recommended on Alpine-based / postmarketOS):

```bash
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install --user canonic-*.flatpak
flatpak run ai.canonic.app
```

**Pacman** (Arch / postmarketOS):

```bash
sudo pacman -U canonic-*.pacman
```

### Direct download (all platforms)

Grab the latest build for your platform from the [Releases](https://github.com/Canonical-AI/canonic/releases) page:

* **macOS** — `.dmg` (Apple Silicon / Intel)
* **Windows** — `.exe`
* **Linux x64** — `.AppImage`, `.flatpak`, `.deb`, `.pacman`, `.tar.gz`
* **Linux arm64** — `.AppImage`, `.flatpak`, `.deb`, `.pacman`, `.tar.gz` (ARM Arch, postmarketOS, PinePhone, Raspberry Pi)

<br />

***

## Coding Agents (AI Control)

The **Implementation** panel runs an external coding agent's own CLI inside an embedded terminal — start and steer engineering work without leaving Canonic. Supported: **Claude Code, Codex, Gemini CLI, OpenCode, Pi**, or any custom CLI.

* **Just install the agent's CLI** (`claude`, `codex`, `gemini`, `opencode`, `pi`). Canonic shows install status per agent.
* **MCP wires itself up.** Canonic runs a local, loopback-only MCP server and registers itself into the agent's MCP config on first run — no `AGENTS.md` edits, no skills to install. The agent sees your focused doc and open tray and can read, edit, comment on, and create docs.
* **Sessions are tracked** — history with one-click resume, plus a pop-out to your real OS terminal.

> Pi doesn't use MCP; it gets the same workspace context inline via its system prompt.

See **[docs/HOWTO.md → Coding Agents](docs/HOWTO.md)** for details.

<br />

***

## Canonic Skill

**[canonic-skill](https://github.com/Canonical-AI/canonic-skill)** is a separate companion repo — an agent CLI extension that lets coding agents (Claude Code, Gemini CLI, etc.) hand off design and requirements work to Canonic. The agent opens a markdown doc in Canonic, waits for you to review or edit it, then resumes with your changes as source of truth.

Install in your agent of choice:

**Claude Code**

```bash
npx skills add Canonical-AI/canonic-skill --local
```

**Gemini CLI**

```bash
gemini extensions install https://github.com/Canonical-AI/canonic-skill --auto-update
```

Other agents: see [canonic-skill/INSTALL.md](https://github.com/Canonical-AI/canonic-skill/blob/main/INSTALL.md).

<br />

### Usage

Once installed, invoke from your agent:

```bash
/canonic init               # bootstrap a vision.md in a Canonic workspace
/canonic review path/to/doc.md   # open a doc in Canonic, wait for human review
```

A useful pattern is to create a `.docs` folder in your code repo with:

```bash
/canonic init .docs/
```

Add `.docs` to `.gitignore` unless you want to commit docs to your repo. Alternatively, create a separate repo just for docs — that's what I do.

***

<br />

## Build From Source

Requirements: Node 20+ and `npm`.

```bash
git clone https://github.com/Canonical-AI/canonic.git
cd canonic
npm install
```

### Run in development

Starts Vite dev server + Electron with hot reload:

```bash
npm run dev
```

### Production build

```bash
npm run build           # current platform
npm run build:mac       # macOS .dmg + .zip
npm run build:win       # Windows .exe
npm run build:linux     # Linux .AppImage / .deb / .pacman / .flatpak / .tar.gz
```

Output lands in `dist-electron/`. Canonic packages via [electron-builder](https://www.electron.build/) and distributes via GitHub Releases with background updates.

### Testing

Two-tier suite:

| Command            | What                                                                     | Where                               | When                                |
| ------------------ | ------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------- |
| `npm test`         | Vitest unit + integration (pure logic, store actions, mocked IPC)        | `tests/unit/`, `tests/integration/` | Every PR via CI                     |
| `npm run test:e2e` | Playwright + real Electron (slash menu, table ops, real ProseMirror DOM) | `tests/e2e/`                        | Local only (requires built `dist/`) |

Run `npm test` before committing — all unit tests must pass. E2e is opt-in and slower (\~25 s per test) but catches schema and integration issues unit tests can't.

### Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for branching conventions, commit message style, the spec-driven development rule, the demo-mode rule, and how the CI / release pipeline works (PR test matrix, build-then-commit releases, version-bump labels, and the `no-release` skip label).

Quick rules:

* Always target the `dev` branch in PRs, never `main`

* Run `npm test` before pushing — all tests must pass

* Every new feature gets a Given / When / Then spec in `docs/specs/REQUIREMENTS.md`

* Every new feature must work in demo mode (`src/demo/config.json`)

***

## Tech Stack

| Layer            | Technology                                                              |
| ---------------- | ----------------------------------------------------------------------- |
| UI Framework     | [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/)               |
| Desktop Shell    | [Electron](https://www.electronjs.org/)                                 |
| Editor           | [Milkdown](https://milkdown.dev/) (ProseMirror)                         |
| Version Control  | [isomorphic-git](https://isomorphic-git.org/)                           |
| State Management | [Pinia](https://pinia.vuejs.org/)                                       |
| Search           | [FlexSearch](https://github.com/nextapps-de/flexsearch)                 |
| AI               | Any OpenAI-compatible provider via OpenRouter, OpenAI, Mistral, Groq, … |

***

## Support

Canonic is free and open source. If it's useful to you, you can support development here:

<a href="https://buymeacoffee.com/johnjazzi"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00.svg?logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee" /></a>

***

## License

MIT — see [LICENSE](LICENSE).

***

<div align="center">

Built with care for people who think before they build.

</div>
