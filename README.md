<div align="center">

<img src="build/icons/icon.png" alt="Canonic" width="80" height="80" />

# Canonic

**Local-first document editor for product teams — powered by Git.**

[Documentation](docs/HOWTO.md) · [Install](#install) · [Canonic Skills](#canonic-skills) · [Build From Source](#build-from-source) · [Report a Bug](https://github.com/Canonical-AI/canonic/issues)

***

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.0.20--alpha-orange.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](#install)

</div>

***

> **Write first. Build second.**
> Canonic is a markdown editor for product managers that keeps your artifacts organized, versioned, and always on your machine — with an AI assistant designed to help you *think*, not to think for you.

<div align="center">

![Canonic Editor](docs/screenshot.png)

</div>

***

## Why Canonic

Product work lives in too many places. strategy in Notion, specs in Confluence, decisions in Slack threads, and history nowhere. Canonic brings it together in one local-first workspace, backed by Git so nothing is ever lost.

* **Local-first.** Plain markdown files on your machine. Open them in any editor; sync them however you want.

* **Git under the hood.** Every workspace is a Git repo. Save checkpoints, branch per document, view full history — no terminal required.

* **AI that asks, not writes.** The built-in assistant brainstorms and challenges; it doesn't ghostwrite your docs.

* **Built for product work.** Inline comments, peer sharing, GFM tables, mermaid diagrams, wiki-links, find & replace across the workspace.

* **Works with your repos.** Drop Canonic on an existing `.git` folder and it adapts.

***

## Documentation

Full usage guide, keyboard shortcuts, and feature walkthroughs:

**➜** **[docs/HOWTO.md](docs/HOWTO.md)**

<br />

***

## Install

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

## Canonic Skills

**[Canonic Skills](https://github.com/Canonical-AI/canonic-skills)** is a separate companion repo of optional plugins and templates — slash commands, structured prompts, PM workflows — you can drop into a Canonic workspace.

Install (in your Canonic workspace folder):

```bash
git clone https://github.com/Canonical-AI/canonic-skills.git .canonic/skills
```

Then enable individual skills in **Settings → Skills** inside the app.

See the [canonic-skills README](https://github.com/Canonical-AI/canonic-skills#readme) for the full skill catalog and authoring guide.

<br />

A useful pattern is to create a `.docs` folder in your code repo with :

```
/canonic init .docs/
```

add `.docs` to your `.gitignore`unless you want to commit docs to your repo. alternatively you can create a separate repo just for dos. Thats what I do!

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

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for branching conventions, commit message style, the spec-driven development rule, and the demo-mode rule.

Quick rules:

* Always target the `dev` branch in PRs, never `main`

* Run `npm test` before pushing — all tests must pass

* Every new feature gets a Given / When / Then spec in `docs/specs/REQUIREMENTS.md`

* Every new feature must work in demo mode (`public/demo/config.json`)

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

## License

MIT — see [LICENSE](LICENSE).

***

<div align="center">

Built with care for people who think before they build.

</div>
