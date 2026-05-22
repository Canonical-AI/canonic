# Antigravity — Developer Instructions & Guidelines

This document defines the automated instruction set and rules for **Antigravity** when contributing to the Canonic codebase. This extends the project standard defined in [CLAUDE.md](file:///Users/johnazzinaro/Coding/canonic-local/CLAUDE.md).

---

## 1. Core Workflow Rules (CRITICAL)

### Direct Development on `dev`
- **DO NOT create branches or Pull Requests** unless explicitly requested by the user.
- **Always commit and push directly to the `dev` branch** of the `origin` remote.
- Ensure that the local `dev` branch is always up to date with `origin/dev` before starting any modifications.

### Conventional Commits
- Use standard conventional commit formats (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `style:`).
- Commit messages should be clear, concise, and professional.

### Testing Prior to Commit
- Always execute the full Vitest suite before pushing:
  ```bash
  npm test
  ```
- **Ensure all 225+ assertions across 22 test files are 100% green before committing.**

---

## 2. Architectural Guidelines & Contracts

### Spec-Driven Development Rule
- **Every new feature** must first be defined in the master requirements specification:
  - **Spec File**: [docs/specs/REQUIREMENTS.md](file:///Users/johnazzinaro/Coding/canonic-local/docs/specs/REQUIREMENTS.md)
  - **Format**: Simple GIVEN / WHEN / THEN statements.
  - **Motto**: Simple, readable, testable.
- Write alignment tests corresponding directly to the spec changes in the unit/integration suites.

### Demo Mode Compliance
- **Every new feature must be represented in Demo Mode.**
- **Demo configuration**: Update [public/demo/config.json](file:///Users/johnazzinaro/Coding/canonic-local/public/demo/config.json) with realistic sample data.
- **Store / UI Integrations**:
  - Leverages Pinia's `store.isDemoMode` ref (`true` if no workspace is active).
  - Use `v-if="store.isDemoMode"` branches to display fake data or mock actions in demo state.

### Modern Node.js Mocking Rules
- Modern Node environments shadow global variables and Happy DOM contexts, which can leave `window.localStorage` undefined.
- **For all integration tests**, stub `localStorage` and `window.localStorage` securely:
  ```javascript
  const mockLocalStorage = {
    store: {},
    getItem(key) { return this.store[key] || null; },
    setItem(key, val) { this.store[key] = String(val); },
    removeItem(key) { delete this.store[key]; },
    clear() { this.store = {}; }
  };
  vi.stubGlobal("localStorage", mockLocalStorage);
  vi.stubGlobal("window", { canonic: mockApi, localStorage: mockLocalStorage });
  ```

### Port Collision Protection
- P2P and websocket sharing instances in tests run concurrently in parallel processes.
- **Port Allocation**: Always assign ports in the wide range `13800` to `23799` to eliminate `EADDRINUSE` errors on parallel test runs:
  ```javascript
  const PORT = 13800 + Math.floor(Math.random() * 10000);
  ```

---

## 3. Reference Commands

- **Run Dev Server**: `npm run dev`
- **Run All Tests**: `npm test`
- **Run Single Test**: `npm test <path>` (e.g. `npm test tests/integration/split-panels.test.js`)
- **Build Desktop App Bundle**: `npm run build`
