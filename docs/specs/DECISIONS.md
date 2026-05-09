# Decisions

Architectural and technical decisions with rationale.

---

## Windows distribution: NSIS installer (not portable exe)

electron-builder supports both `nsis` (installer) and `portable` (single `.exe`, no install).

We use NSIS because it supports `electron-updater` auto-update. The portable target does not — it can't replace files in place. If we drop auto-update in the future, portable is simpler for users (no UAC prompt, no wizard).

Current config in `package.json` under `build.win`:
```json
{ "target": "nsis", "arch": ["x64"] }
```

---
