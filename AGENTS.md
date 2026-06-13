# Retirement Tool — Agent Context

## What this is

A single-page personal retirement planning tool. No backend, no build step, no framework. Three files:

- `index.html` — HTML structure only
- `app.css` — all styles
- `app.js` — all JavaScript (constants, engine, UI, charts)

Live site: **https://eliezer15.github.io/retirement-tool/**

## How to run locally

Open `index.html` directly in a browser — `file://` works fine for local use.
For accurate localStorage behavior, serve it:
```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deployment

Push to `main` on `eliezer15/retirement-tool`. GitHub Actions (`.github/workflows/deploy.yml`) automatically deploys to GitHub Pages on every push.

```bash
git push origin main
```

The `origin` remote uses an SSH key alias (`github-eliezer15` in `~/.ssh/config`) with the key at `~/.ssh/retirement_tool`. This is specific to the development machine and does not require any secrets in CI — the workflow uses GitHub's built-in Pages deployment actions.

## Architecture

Everything is in `app.js`, organized into clearly marked sections:

| Section | Responsibility |
|---------|---------------|
| `// === CONSTANTS ===` | 2026 MFJ tax brackets, standard deduction, LTCG thresholds (IRS Rev. Proc. 2025-32) |
| `// === AGE ANCHORS ===` | `resolveAge()` and `ageAnchorSelect()` — symbolic age references for interval fields |
| `// === ENGINE ===` | Pure simulation functions: `applyBrackets`, `computeAnnualTax`, `validateConfig`, `simulate` |
| `// === UI STATE ===` | `DEFAULT_CONFIG`, `persistConfig`, `loadPersistedConfig`, `migrateConfig` |
| `// === SAVE / LOAD ===` | `saveConfig`, `loadConfigFromText` |
| `// === RENDER UI ===` | All control-rendering functions and mutators |
| `// === RENDER OUTPUTS ===` | Chart.js chart rendering, summary panel, detail table |
| `// === MAIN LOOP ===` | `runSim()` (validate + simulate + render, no DOM rebuild), `onConfigChange()` (full rebuild + sim) |

## Key design decisions

**Config object** — all state lives in a single `config` object, persisted to `localStorage` on every change. Loaded on startup; missing fields are migrated automatically by `migrateConfig()`.

**Two update paths** — `runSim()` only re-runs the simulation and redraws outputs (preserves focus). `onConfigChange()` also rebuilds all control DOM (used after structural changes like add/remove interval or reorder).

**Simulation** — monthly stepping for compound interest accuracy. Taxes tallied annually. Engine is a pure function; no DOM access.

**Age anchors** — interval `startAge`/`endAge` fields store either a plain number or a symbolic string (`'startAge'`, `'retirementAge'`, `'endAge'`). `resolveAge()` converts to a number at sim time, so changing the global retirement age automatically updates all linked intervals.

**Withdrawal order** — `withdrawalOrder` array in config. Supports four entries: `'traditional'`, `'roth-basis'` (Roth contributions only, penalty-free), `'roth'` (Roth gains), `'taxable'`.

**Tax model** — 2026 MFJ only, federal only. Standard deduction applied before ordinary brackets. LTCG stacks on top of ordinary taxable income. 10% early withdrawal penalty for pre-59.5 withdrawals from Traditional (full amount) and Roth (gains portion only). Taxes are display-only — not deducted from balances.

**Chart library** — Chart.js 4.x via CDN. No build step.

## Docs

Design specs and implementation plans are in `docs/superpowers/`.
