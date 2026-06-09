# Contributing to Canonic

First off, thank you for considering contributing to Canonic! It's people like you that make the open-source community such an amazing place to learn, inspire, and create.

## Code of Conduct

By participating in this project, you are expected to treat all maintainers and contributors with respect and professionalism. We are committed to providing a welcoming and inspiring community for all.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* Use a clear and descriptive title.

* Provide specific examples or screenshots to demonstrate the steps.

* Describe the behavior you observed and point out what exactly is the problem with that behavior.

* Explain which behavior you expected to see instead.

* Describe the exact steps to reproduce the problem.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please provide:

* A clear and descriptive title.

* A step-by-step description of the suggested enhancement.

* A description of the current behavior and how your suggestion differs.

* Any mockups or visual representations if applicable.

### Pull Requests

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs or features, update the documentation (`docs/REQUIREMENTS.md` or `README.md`).
4. Ensure the application runs locally without errors.
5. Make sure your code follows the coding standards.
6. Issue that pull request!

## Coding Standards

We aim to follow the latest and greatest best practices for Vue, JavaScript/Node, and Tauri/Rust development. Please ensure your code aligns with these standards:

### 1. General JavaScript

* **Formatting:** We recommend using [Prettier](https://prettier.io/) for code formatting to keep styling consistent.

* **Linting:** Use [ESLint](https://eslint.org/) to catch bugs and enforce style.

* **Modern Syntax:** Use modern ES6+ features (e.g., `let`/`const`, arrow functions, destructuring, optional chaining).

* **Naming Conventions:**

  * `camelCase` for variables, functions, and object properties.

  * `PascalCase` for classes and Vue components.

  * `UPPER_SNAKE_CASE` for global constants.

### 2. Vue 3 Guidelines

* Follow the essential rules of the official [Vue 3 Style Guide](https://vuejs.org/style-guide/).

* **Composition API:** We prefer the `<script setup>` syntax and the Composition API over the Options API for new components.

* **State Management:** Use [Pinia](https://pinia.vuejs.org/) for global state. Avoid deep prop-drilling.

* **Component Naming:** Multi-word component names are mandatory (e.g., `DocumentEditor.vue`, not `Editor.vue`) to prevent conflicts with native HTML elements.

### 3. Git & Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages. This leads to more readable messages and makes it easier to track the project's history.

Format:

```
<type>[optional scope]: <description>
```

Common types:

* `feat`: A new feature

* `fix`: A bug fix

* `docs`: Documentation only changes

* `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc.)

* `refactor`: A code change that neither fixes a bug nor adds a feature

* `test`: Adding missing tests or correcting existing tests

* `chore`: Changes to the build process or auxiliary tools

*Example:* *`feat(editor): add support for mermaid diagrams`*

### 4. Architecture & Product Requirements

Before building a major feature, familiarize yourself with `docs/REQUIREMENTS.md`. It serves as the source of truth for product decisions and architectures.

* Product decisions live in the requirements document, not just in code comments.

* If a requirement changes as part of your PR, update `REQUIREMENTS.md` first, then the tests, and finally the code.

* Mark criteria `[DONE]` or `[PARTIAL]` in the document if your PR completes them.

## Releases & CI

Canonic ships through two GitHub Actions workflows. Understanding them helps you know what happens when a PR merges.

### PR validation

Every pull request to `main` or `dev` runs the full test suite across **Linux (x64 + arm64), Windows, and macOS** (`.github/workflows/pr-validate.yml`). Tests are cheap and catch platform-specific bugs — path-separator differences, file-locking races — that a single OS would silently pass. No packaged build runs on PRs; the build happens only at release time, where the version number exists.

### Release pipeline

Releases are driven by `.github/workflows/release.yml`, triggered when a PR is merged into `main` (or manually via **workflow_dispatch**). The pipeline is **build-then-commit**: the version is bumped *only if every platform builds successfully*.

1. **compute-version** — derive the next version from the bump label. Nothing is committed yet.
2. **build matrix** — mac, win, linux-x64, linux-arm64: set the computed version, run tests, build with `--publish never`, and upload the artifacts.
3. **finalize** — runs *only if all four builds pass*: commit the version bump, tag it, push to `main`, and create the GitHub release from the built artifacts (autoupdate `latest*.yml` files included).
4. **update-brew** — bump the Homebrew cask to the new version.

If any build fails, `finalize` never runs — so `main` is never bumped, and no tag or release is created. The build runs **once**; its artifacts are attached to the release, so there's no duplicate build.

### Choosing the version bump

Apply a label to the PR before merging:

| Label | Result |
|-------|--------|
| `major` | `x.0.0` |
| `minor` | `0.x.0` |
| _(none)_ | patch — `0.0.x` |

If the `PRERELEASE_TAG` repository variable is set (e.g. `alpha`), it's appended as a prerelease suffix (`0.0.6-alpha`).

### Skipping a release

Add the **`no-release`** label to a PR to merge it *without* triggering any build or release — use this for CI changes, docs, or anything that doesn't need a new version. Create the label once with:

```bash
gh label create no-release --description "Skip version bump + release build"
```

### Manual release

Trigger **Release** from the Actions tab (workflow_dispatch) and choose the bump type (`patch` / `minor` / `major`).

## Getting Started Locally

See the [README.md](./README.md) for instructions on setting up your local development environment.
