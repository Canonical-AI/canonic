# Canonic

A local-first markdown document editor with Git versioning, built for seamless documentation. Canonic features a built-in AI assistant to help you think through requirements and ideas, without writing them for you. designed for people who want to do their own thinking first before building. inspire by the beauty of git, the tactileness of Zed and Atom before it, the sharing p2p sharing of local send

## Features

- **Local-first Architecture**: All your files stay on your machine.
- **Git Version Control**: Document versioning built-in. Every workspace is a Git repository, allowing branching, history, and conflict resolution directly within the app.
- **AI Assistant**: Context-aware AI assistant designed to help you brainstorm and review, configurable with different models (requires an LLM API key).
- **Workspace Templates**: Start with a blank canvas or jumpstart your projects with structured templates like the PM Framework.
- **Sharing Scope & Permissions**: Share securely via token-secured links with granular access controls (file, directory, or workspace level).
- **Inline Comments**: Anchor comments to specific document selections to collaborate effectively.
- **Featureful editor**: allows for refs, tags, tracking, and other fun stuff help you keep track of interdependencies

## Tech Stack

- **Framework:** [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/)
- **Desktop Environment:** [Electron](https://www.electronjs.org/)
- **Editor:** [Milkdown](https://milkdown.dev/)
- **Version Control:** [isomorphic-git](https://isomorphic-git.org/)
- **State Management:** [Pinia](https://pinia.vuejs.org/)
- **Search:** [FlexSearch](https://github.com/nextapps-de/flexsearch)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- npm or yarn

### Installation

1. Clone the repository
   ```bash
   git clone <repository-url>
   cd canonic-local
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Run the application in development mode
   ```bash
   npm run dev
   ```
   This will start both the Vite development server and the Electron application concurrently.

### Build for Production

To create a production-ready application executable:

```bash
npm run build
```
The output will be placed in the `dist-electron` directory.

## Deployment & Updates

Canonic is packaged and distributed using [electron-builder](https://www.electronjs.org/docs/latest/tutorial/deployment).

### Deployment Flow

1.  **Build**: Run `npm run build` to generate the production-ready assets and the Electron executable.
2.  **Publish**: The CI/CD pipeline (or manual run) pushes the generated artifacts to **GitHub Releases** as defined in `package.json`.
    - Provider: `github`
    - Repository: `Canonical-AI/canonic`

### Update Mechanism

Updates are handled automatically via [electron-updater](https://www.electronjs.org/docs/latest/tutorial/updates).

-   **Check on Launch**: Every time the app starts, it checks for a new version on GitHub.
-   **User Notification**: If a new version is found and downloaded, a banner appears at the bottom of the screen prompting the user to "Restart & Update."
-   **Silent Backgrounding**: Downloads happen in the background to avoid interrupting the user's flow.

### Planned Improvements

-   **Interactive Check on Open**: Instead of just silent checks, explicitly prompt the user if an update is found immediately after launch.
-   **Periodic Checks**: Regularly check for updates while the app is open (e.g., every 4 hours).
-   **Ask Before Close**: If an update is ready but hasn't been installed, prompt the user to "Update and Close" when they try to exit the app.
-   **Manual Check**: Add a "Check for Updates" button in the Settings menu.
-   **Download Progress**: Show a progress bar for background downloads to keep the user informed.

## Project Structure

- `src/` - Vue frontend source code
- `electron/` - Electron main process and IPC handlers
- `docs/` - Project documentation and requirements (e.g., `REQUIREMENTS.md`)
- `public/` - Static assets

## Architecture Notes

- Configuration, such as user preferences and API keys, is stored locally in `~/.canonic/config.json`.
- Comments are persisted locally at `~/.canonic/comments/`.
- Git commands are executed transparently via `isomorphic-git`, meaning no terminal interaction is required for typical version control workflows.

## Documentation

For a detailed breakdown of product requirements, architecture, and testing strategy, refer to [docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md).
