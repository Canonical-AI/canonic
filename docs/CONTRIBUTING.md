# Contributing to Canonic

First off, thank you for considering contributing to Canonic! It's people like you that make the open-source community such an amazing place to learn, inspire, and create.

## Code of Conduct

By participating in this project, you are expected to treat all maintainers and contributors with respect and professionalism. We are committed to providing a welcoming and inspiring community for all.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* Use a clear and descriptive title.

* Describe the exact steps to reproduce the problem.

* Provide specific examples or screenshots to demonstrate the steps.

* Describe the behavior you observed and point out what exactly is the problem with that behavior.

* Explain which behavior you expected to see instead.

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

We aim to follow the latest and greatest best practices for Vue, JavaScript/Node, and Electron development. Please ensure your code aligns with these standards:

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

## Getting Started Locally

See the [README.md](./README.md) for instructions on setting up your local development environment.
