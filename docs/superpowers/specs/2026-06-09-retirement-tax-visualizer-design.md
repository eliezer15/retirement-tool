# Retirement & Tax Scenario Visualizer — Design Spec

**Date:** 2026-06-09  
**Status:** Approved  
**Purpose:** Personal-use single-page app to visualize retirement savings accumulation and drawdown across three tax-advantaged account types, with simple tax estimation.

---

## Overview

A single self-contained `index.html` file using vanilla JavaScript and Chart.js (loaded from CDN). No build step, no server, no database. Open in any browser on localhost. All state lives in a plain JavaScript config object. Save = download as JSON; Load = upload a file or paste JSON into a textarea.

The simulation runs one continuous timeline from a user-defined start age to end age. The user defines a retirement age that splits the timeline into an **accumulation phase** (contributions in) and a **spend phase** (withdrawals out). The simulation steps **monthly** for compound-interest accuracy and tallies taxes **annually**.

---

## Architecture

Three logical layers, all in one file:

| Layer | Responsibility |
|-------|---------------|
| **Config/UI** | Renders all controls, reads inputs into the config object, handles save/load/validation |
| **Simulation engine** | Pure function `simulate(config) → yearlyResults[]`. No DOM access. |
| **Render** | Consumes `yearlyResults`, draws charts, populates table, updates summary panel |

The engine is a pure function so its math can be reasoned about independently of the UI.

---

## Data Model (Config JSON Schema)

This is the exact object saved to disk and restored on load.

```jsonc
{
  "version": 1,
  "startAge": 35,
  "endAge": 95,
  "retirementAge": 65,

  "buckets": {
    "traditional": { "startBalance": 50000 },
    "roth":        { "startBalance": 20000 },
    "taxable":     { "startBalance": 80000, "startBasis": 60000 }
    // startBasis only on taxable; traditional and roth don't track basis
  },

  // Each interval targets ONE bucket. No two intervals for the same bucket may overlap in age range.
  "contributionIntervals": [
    { "bucket": "taxable",     "startAge": 35, "endAge": 40, "monthly": 2000, "annualRate": 0.055 },
    { "bucket": "taxable",     "startAge": 40, "endAge": 50, "monthly": 1000, "annualRate": 0.035 },
    { "bucket": "traditional", "startAge": 35, "endAge": 65, "monthly": 1500, "annualRate": 0.06 }
  ],

  // Each spend interval covers all 3 buckets. No two spend intervals may overlap in age range.
  "spendIntervals": [
    {
      "startAge": 65, "endAge": 75, "monthlySpend": 10000,
      "rates": { "traditional": 0.04, "roth": 0.05, "taxable": 0.03 }
    },
    {
      "startAge": 75, "endAge": 95, "monthlySpend": 7000,
      "rates": { "traditional": 0.03, "roth": 0.04, "taxable": 0.03 }
    }
  ],

  // Cascade order: pull from index 0 first; overflow to index 1, then 2
  "withdrawalOrder": ["taxable", "traditional", "roth"]
}
```

**Coverage rules:**
- A bucket with no contribution interval covering a given age accumulates at 0% growth with $0 contribution for that span. The UI shows a visible warning for gaps so they are not silent.
- Spend intervals must cover the full span from `retirementAge` to `endAge` without gaps (warning if uncovered).
- **Hard error** on overlap: if two contribution intervals for the same bucket overlap, or two spend intervals overlap, the simulation refuses to run and displays an error until fixed.

---

## Simulation Engine

### Accumulation phase (age < retirementAge)

Each month, for each bucket:
1. Find the active contribution interval for this bucket at the current age (or none).
2. Apply monthly growth: `balance *= (1 + annualRate / 12)`.
3. Add the monthly contribution to `balance`. For `taxable`, also add to `basis`.

### Spend phase (age >= retirementAge)

Each month:
1. Find the active spend interval. Apply monthly growth per-bucket using per-bucket rates from the interval: `balance *= (1 + rates[bucket] / 12)`.
2. Pull `monthlySpend` from buckets in `withdrawalOrder` order, cascading when one empties.
   - For `traditional` withdrawals: record to `yearOrdinaryIncome`.
   - For `taxable` withdrawals: compute `gainsFraction = (balance − basis) / balance` before the withdrawal; `gainsWithdrawn = withdrawal * gainsFraction`; `basisWithdrawn = withdrawal − gainsWithdrawn`. Reduce `basis` by `basisWithdrawn`. Record `gainsWithdrawn` to `yearCapGainsRealized`.
   - For `roth` withdrawals: no taxable income generated.
3. If all buckets are $0 and more spend was requested, the remaining spend is recorded as unmet; the chart flatlines at $0.

### Annual tax calculation (at end of each calendar year)

**Ordinary income tax (Traditional withdrawals):**
```
taxableOrdinaryIncome = max(0, yearOrdinaryIncome − STANDARD_DEDUCTION_MFJ)
ordinaryTax = apply2026MFJBrackets(taxableOrdinaryIncome)
```

**Capital gains tax (Taxable account gains, stacked on top of ordinary income):**

LTCG brackets are applied to the portion of total income that is capital gains, stacked on top of ordinary income. The key insight is that capital gains fill the income stack from where ordinary income leaves off.

```
stackedIncomeBase = taxableOrdinaryIncome  // where ordinary income leaves off
ltcgTax = applyStackedLTCGBrackets(yearCapGainsRealized, stackedIncomeBase)
```

`applyStackedLTCGBrackets` works by:
1. Determining how much of the 0% LTCG band is unused above `stackedIncomeBase`.
2. The first `unusedZeroBand` dollars of gains are taxed at 0%.
3. Next dollars up to the 15%/20% threshold are taxed at 15%.
4. Remaining at 20%.

**Taxes are display-only.** They are never deducted from account balances.

**Annual output record:**
```jsonc
{
  "age": 66,
  "balances": { "traditional": 420000, "roth": 180000, "taxable": 95000 },
  "totalBalance": 695000,
  "withdrawn": 120000,         // total gross withdrawal for the year
  "ordinaryIncome": 80000,     // traditional withdrawals
  "capGainsRealized": 8400,    // taxable gains portion
  "ordinaryTax": 9200,
  "capGainsTax": 1260,
  "totalTax": 10460,
  "netSpendable": 109540       // withdrawn − totalTax
}
```

### Summary output
```jsonc
{
  "peakNetWorth": 1240000,
  "peakNetWorthAge": 65,
  "totalLifetimeTax": 187000,
  "ageMoneyRunsOut": null,     // null means "never within endAge"
  "endingBalance": 320000
}
```

---

## Tax Constants (2026, Married Filing Jointly)

Source: IRS Rev. Proc. 2025-32 via Tax Foundation, published 2026.

### Standard Deduction
```
$32,200
```

### Ordinary Income Brackets (MFJ)
| Taxable Income (MFJ) | Rate |
|----------------------|------|
| $0 – $24,800         | 10%  |
| $24,801 – $100,800   | 12%  |
| $100,801 – $211,400  | 22%  |
| $211,401 – $403,550  | 24%  |
| $403,551 – $512,450  | 32%  |
| $512,451 – $768,700  | 35%  |
| $768,701+            | 37%  |

### Long-Term Capital Gains Brackets (MFJ, stacked on top of ordinary income)
| Total Stacked Income | LTCG Rate |
|----------------------|-----------|
| $0 – $98,900         | 0%        |
| $98,901 – $613,700   | 15%       |
| $613,701+            | 20%       |

---

## Excluded from Scope (v1)

- Required Minimum Distributions (RMDs)
- Social Security income
- Early-withdrawal penalties (pre-59.5)
- State income tax
- Net Investment Income Tax (NIIT) / other surtaxes
- Inflation adjustment of tax brackets over time (2026 values are fixed constants)
- AMT

---

## UI Layout

### Controls (top section)
1. **Global settings row:** Start Age, End Age, Retirement Age (number inputs).
2. **Buckets section:**
   - Traditional: Start Balance
   - Roth: Start Balance
   - Taxable: Start Balance + Start Basis (two inputs)
3. **Withdrawal order:** Three bucket labels with Up/Down buttons to reorder the cascade.
4. **Contribution intervals:** Repeatable list. Each row: Bucket (dropdown), Start Age, End Age, Monthly $, Annual Rate %. Add/Remove buttons.
5. **Spend intervals:** Repeatable list. Each row: Start Age, End Age, Monthly Spend $, Traditional Rate %, Roth Rate %, Taxable Rate %. Add/Remove buttons.
6. **Save/Load bar:** Download JSON button, Upload JSON file picker, paste-JSON textarea + Apply button.
7. **Validation banner:** Shows errors (overlaps, hard errors) or warnings (coverage gaps) after every input change.

### Outputs (bottom section)
8. **Main chart:** Stacked area (Traditional / Roth / Taxable) by age, total balance line on top, vertical marker at retirement age.
9. **Tax chart:** Bar chart per year, bars split into ordinary-income tax (one color) vs. capital-gains tax (another color).
10. **Summary panel:** Peak net worth & age | Total lifetime taxes | Age money runs out (or "never") | Ending balance.
11. **Year-by-year table:** Scrollable. Columns: Age | Traditional | Roth | Taxable | Total | Withdrawn | Ordinary Tax | Cap Gains Tax | Total Tax | Net Spendable.

### Recalculation
Live: every input change re-runs `simulate()` and redraws all outputs. No submit button.

---

## Save / Load

- **Download JSON:** Serializes the current config object to `retirement-config.json` and triggers a browser download.
- **Upload JSON:** File picker; on file select, parses JSON, validates schema version, populates all controls, re-runs simulation.
- **Paste textarea:** User pastes JSON text; "Apply" button parses and loads it.
- On load errors (invalid JSON, missing fields), show a clear error message; do not partially apply.

---

## Tech Stack

- Single `index.html` file, no build step.
- Vanilla JavaScript (ES2020+).
- [Chart.js](https://www.chartjs.org/) loaded from CDN for charts.
- No frameworks, no npm, no server required.
- Open with `open index.html` or any static file server (`python3 -m http.server`).
