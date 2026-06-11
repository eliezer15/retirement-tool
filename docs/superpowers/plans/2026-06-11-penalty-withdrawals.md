# Early Withdrawal Penalties + Roth Basis Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model 10% early withdrawal penalties for pre-age-60 retirement account withdrawals, track Roth contribution basis to allow penalty-free Roth basis withdrawals, and surface penalty as a separate column in the table and a separate bar in the tax chart.

**Architecture:** All changes are in `index.html`. Engine changes add `rothBasis` state tracking and `yearPenaltyBase` accumulation inside `simulate()`. UI changes add a Roth basis input in `renderBuckets()`, a Penalty column in `renderTable()`, a third dataset in `renderCharts()`, and an updated legend. The penalty threshold (age 60) is hardcoded. Old saved configs load without changes — `roth.startBasis` defaults to `roth.startBalance` if absent.

**Tech Stack:** Vanilla JS, single `index.html`.

---

## File Structure

| File | Changes |
|------|---------|
| `index.html` | Engine: rothBasis tracking, penaltyBase accumulation, penaltyTax computation. UI: Roth basis input, Penalty table column, third chart dataset + legend entry. Config: DEFAULT_CONFIG gains `roth.startBasis`. |

---

### Task 1: Add Roth startBasis to config + UI input

**Files:**
- Modify: `index.html` — DEFAULT_CONFIG and `renderBuckets()`

- [ ] **Step 1: Add `startBasis` to the Roth bucket in DEFAULT_CONFIG**

Find this block in `index.html`:
```js
  const DEFAULT_CONFIG = {
    version: 1,
    startAge: 35,
    retirementAge: 65,
    endAge: 95,
    buckets: {
      traditional: { startBalance: 100000 },
      roth:        { startBalance: 50000 },
      taxable:     { startBalance: 80000, startBasis: 70000 }
    },
```

Replace it with:
```js
  const DEFAULT_CONFIG = {
    version: 1,
    startAge: 35,
    retirementAge: 65,
    endAge: 95,
    buckets: {
      traditional: { startBalance: 100000 },
      roth:        { startBalance: 50000, startBasis: 50000 },
      taxable:     { startBalance: 80000, startBasis: 70000 }
    },
```

(Default basis = full balance = no embedded gains in the Roth starting balance, matching the conservative taxable default.)

- [ ] **Step 2: Add Roth basis input row to `renderBuckets()`**

Find this block inside `renderBuckets()`:
```js
      <div class="bucket-row">
        <span class="bucket-dot dot-roth"></span>
        <span class="bucket-name">Roth</span>
        <input type="number" id="b-roth" value="${config.buckets.roth.startBalance}" min="0">
      </div>
      <div class="bucket-row">
        <span class="bucket-dot dot-taxable"></span>
```

Replace it with:
```js
      <div class="bucket-row">
        <span class="bucket-dot dot-roth"></span>
        <span class="bucket-name">Roth</span>
        <input type="number" id="b-roth" value="${config.buckets.roth.startBalance}" min="0">
      </div>
      <div class="bucket-row bucket-basis">
        <span class="bucket-name" style="color:#94a3b8;font-size:11px">└ Basis</span>
        <input type="number" id="b-roth-basis" value="${config.buckets.roth.startBasis ?? config.buckets.roth.startBalance}" min="0">
      </div>
      <div class="bucket-row">
        <span class="bucket-dot dot-taxable"></span>
```

- [ ] **Step 3: Wire the new Roth basis input listener**

Find these four listener lines at the end of `renderBuckets()`:
```js
    document.getElementById('b-trad').addEventListener('input', e => { config.buckets.traditional.startBalance = +e.target.value; runSim(); });
    document.getElementById('b-roth').addEventListener('input', e => { config.buckets.roth.startBalance = +e.target.value; runSim(); });
    document.getElementById('b-tax-bal').addEventListener('input', e => { config.buckets.taxable.startBalance = +e.target.value; runSim(); });
    document.getElementById('b-tax-basis').addEventListener('input', e => { config.buckets.taxable.startBasis = +e.target.value; runSim(); });
```

Replace with:
```js
    document.getElementById('b-trad').addEventListener('input', e => { config.buckets.traditional.startBalance = +e.target.value; runSim(); });
    document.getElementById('b-roth').addEventListener('input', e => { config.buckets.roth.startBalance = +e.target.value; runSim(); });
    document.getElementById('b-roth-basis').addEventListener('input', e => { config.buckets.roth.startBasis = +e.target.value; runSim(); });
    document.getElementById('b-tax-bal').addEventListener('input', e => { config.buckets.taxable.startBalance = +e.target.value; runSim(); });
    document.getElementById('b-tax-basis').addEventListener('input', e => { config.buckets.taxable.startBasis = +e.target.value; runSim(); });
```

- [ ] **Step 4: Verify Roth basis input renders**

```bash
open index.html
```

Expected: The Starting Balances card now shows a `└ Basis` row under Roth, identical in style to the one under Taxable. Changing the value doesn't break anything (sim still runs).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add Roth startBasis config field and UI input"
```

---

### Task 2: Engine — Roth basis tracking during accumulation

**Files:**
- Modify: `index.html` — inside `simulate()`, accumulation phase

- [ ] **Step 1: Initialize `rothBasis` state variable**

Find this line inside `simulate()`:
```js
    let taxableBasis = cfg.buckets.taxable.startBasis ?? cfg.buckets.taxable.startBalance;
```

Add the line immediately after it:
```js
    let rothBasis = cfg.buckets.roth.startBasis ?? cfg.buckets.roth.startBalance;
```

- [ ] **Step 2: Increment `rothBasis` during accumulation**

Find this block in the accumulation phase:
```js
          bal[b] = bal[b] * (1 + r / 12) + contrib;
          if (b === 'taxable') taxableBasis += contrib;
```

Replace it with:
```js
          bal[b] = bal[b] * (1 + r / 12) + contrib;
          if (b === 'taxable') taxableBasis += contrib;
          if (b === 'roth')    rothBasis    += contrib;
```

- [ ] **Step 3: Verify with Node.js**

```bash
node -e "
// Simulate 2 months of Roth accumulation
let rothBasis = 40000;
const contrib = 500;
const r = 0.07;
// month 1
let bal = 50000;
bal = bal * (1 + r/12) + contrib;
rothBasis += contrib;
// month 2
bal = bal * (1 + r/12) + contrib;
rothBasis += contrib;
console.log('bal:', Math.round(bal));       // Expected: ~51292
console.log('rothBasis:', rothBasis);       // Expected: 41000 (40000 + 500 + 500)
"
```

Expected:
```
bal: 51292
rothBasis: 41000
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: track Roth basis during accumulation phase"
```

---

### Task 3: Engine — penalty computation during spend phase

**Files:**
- Modify: `index.html` — inside `simulate()`, spend phase and year boundary

- [ ] **Step 1: Add `yearPenaltyBase` accumulator**

Find the year accumulator declarations inside `simulate()`:
```js
    let yearOrdinaryIncome = 0;
    let yearCapGainsRealized = 0;
    let yearWithdrawn = 0;
    let currentYear = 0; // years elapsed since startAge
```

Replace with:
```js
    let yearOrdinaryIncome = 0;
    let yearCapGainsRealized = 0;
    let yearWithdrawn = 0;
    let yearPenaltyBase = 0; // sum of penalized withdrawal amounts for the year
    let currentYear = 0; // years elapsed since startAge
```

- [ ] **Step 2: Compute penalty amounts per withdrawal in the spend phase**

Find the withdrawal loop comment and Traditional/Roth/Taxable handling inside the spend phase:
```js
          if (b === 'traditional') {
            yearOrdinaryIncome += withdrawal;
          } else if (b === 'taxable') {
            // Proportional basis method: gains% = (balance_before - basis) / balance_before
            const balanceBefore = bal[b] + withdrawal;
            const gainsFrac = balanceBefore > 0
              ? Math.max(0, (balanceBefore - taxableBasis) / balanceBefore)
              : 0;
            const gainsWithdrawn = withdrawal * gainsFrac;
            const basisWithdrawn = withdrawal - gainsWithdrawn;
            taxableBasis = Math.max(0, taxableBasis - basisWithdrawn);
            yearCapGainsRealized += gainsWithdrawn;
          }
          // roth: no taxable income
```

Replace with:
```js
          // isPenalty: age recorded at year-end is Math.floor(ageFloat)+1 approximation;
          // use ageFloat directly — penalty applies when the person is under 60 at time of withdrawal.
          const isPenalty = ageFloat < 60;

          if (b === 'traditional') {
            yearOrdinaryIncome += withdrawal;
            // All traditional withdrawals are penalized pre-60 (all pre-tax, no basis)
            if (isPenalty) yearPenaltyBase += withdrawal;
          } else if (b === 'taxable') {
            // Proportional basis method: gains% = (balance_before - basis) / balance_before
            const balanceBefore = bal[b] + withdrawal;
            const gainsFrac = balanceBefore > 0
              ? Math.max(0, (balanceBefore - taxableBasis) / balanceBefore)
              : 0;
            const gainsWithdrawn = withdrawal * gainsFrac;
            const basisWithdrawn = withdrawal - gainsWithdrawn;
            taxableBasis = Math.max(0, taxableBasis - basisWithdrawn);
            yearCapGainsRealized += gainsWithdrawn;
            // Taxable account: no early withdrawal penalty (not a retirement account)
          } else if (b === 'roth') {
            // Roth: basis can be withdrawn penalty-free; only gains are penalized pre-60.
            const rothBalBefore = bal[b] + withdrawal;
            const rothGainsFrac = rothBalBefore > 0
              ? Math.max(0, (rothBalBefore - rothBasis) / rothBalBefore)
              : 0;
            const rothBasisWithdrawn = withdrawal * (1 - rothGainsFrac);
            rothBasis = Math.max(0, rothBasis - rothBasisWithdrawn);
            if (isPenalty) yearPenaltyBase += withdrawal * rothGainsFrac;
            // Roth withdrawals are never ordinary income (no tax, only possible penalty on gains)
          }
```

- [ ] **Step 3: Compute penaltyTax at year boundary and include in year result**

Find the year boundary block where results are pushed:
```js
        const { ordinaryTax, capGainsTax } = computeAnnualTax(yearOrdinaryIncome, yearCapGainsRealized);
        const totalBalance = bal.traditional + bal.roth + bal.taxable;
        years.push({
          age,
          balances: { traditional: bal.traditional, roth: bal.roth, taxable: bal.taxable },
          totalBalance,
          withdrawn: yearWithdrawn,
          ordinaryIncome: yearOrdinaryIncome,
          capGainsRealized: yearCapGainsRealized,
          ordinaryTax,
          capGainsTax,
          totalTax: ordinaryTax + capGainsTax,
          netSpendable: yearWithdrawn - (ordinaryTax + capGainsTax),
        });
        yearOrdinaryIncome = 0;
        yearCapGainsRealized = 0;
        yearWithdrawn = 0;
        currentYear = newYear;
```

Replace with:
```js
        const { ordinaryTax, capGainsTax } = computeAnnualTax(yearOrdinaryIncome, yearCapGainsRealized);
        const penaltyTax = yearPenaltyBase * 0.10;
        const totalBalance = bal.traditional + bal.roth + bal.taxable;
        years.push({
          age,
          balances: { traditional: bal.traditional, roth: bal.roth, taxable: bal.taxable },
          totalBalance,
          withdrawn: yearWithdrawn,
          ordinaryIncome: yearOrdinaryIncome,
          capGainsRealized: yearCapGainsRealized,
          ordinaryTax,
          capGainsTax,
          penaltyTax,
          totalTax: ordinaryTax + capGainsTax + penaltyTax,
          netSpendable: yearWithdrawn - (ordinaryTax + capGainsTax + penaltyTax),
        });
        yearOrdinaryIncome = 0;
        yearCapGainsRealized = 0;
        yearWithdrawn = 0;
        yearPenaltyBase = 0;
        currentYear = newYear;
```

- [ ] **Step 4: Verify penalty math with Node.js**

```bash
node -e "
// Simulate one year of pre-60 spending: Traditional + Roth withdrawal
// Traditional: 5000/mo * 12 = 60000 → 100% penalized
// Roth: balance=50000, basis=30000 → gainsFrac = (50000-30000)/50000 = 0.4
//       withdrawal 2000/mo * 12 = 24000 → penalized portion = 24000 * 0.4 = 9600

let yearPenaltyBase = 0;
const isPenalty = true; // age < 60

// Traditional
const tradWithdrawal = 60000;
if (isPenalty) yearPenaltyBase += tradWithdrawal;

// Roth
let rothBasis = 30000;
let rothBal = 50000 + 24000; // bal before withdrawal
const withdrawal = 24000;
rothBal -= withdrawal;
const rothBalBefore = rothBal + withdrawal; // = 50000+24000
const rothGainsFrac = Math.max(0, (rothBalBefore - rothBasis) / rothBalBefore);
const rothBasisWithdrawn = withdrawal * (1 - rothGainsFrac);
rothBasis = Math.max(0, rothBasis - rothBasisWithdrawn);
if (isPenalty) yearPenaltyBase += withdrawal * rothGainsFrac;

const penaltyTax = yearPenaltyBase * 0.10;
console.log('yearPenaltyBase:', yearPenaltyBase); // Expected: 60000 + 9600 = 69600
console.log('penaltyTax:', penaltyTax);           // Expected: 6960
console.log('rothBasis after:', Math.round(rothBasis)); // Expected: 30000 - (24000*0.6) = 15600
"
```

Expected:
```
yearPenaltyBase: 69600
penaltyTax: 6960
rothBasis after: 15600
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: compute early withdrawal penalty in simulation engine"
```

---

### Task 4: UI — Penalty column in table + third chart dataset

**Files:**
- Modify: `index.html` — `renderTable()` and `renderCharts()`

- [ ] **Step 1: Add Penalty column to `renderTable()`**

Find the table header and row template inside `renderTable()`:
```js
    document.getElementById('detail-table').innerHTML = `
      <thead><tr>
        <th>Age</th><th>Traditional</th><th>Roth</th><th>Taxable</th><th>Total</th>
        <th>Withdrawn</th><th>Ord. Tax</th><th>CG Tax</th><th>Total Tax</th><th>Net Spendable</th>
      </tr></thead>
      <tbody>${rows}</tbody>`;
```

Replace with:
```js
    document.getElementById('detail-table').innerHTML = `
      <thead><tr>
        <th>Age</th><th>Traditional</th><th>Roth</th><th>Taxable</th><th>Total</th>
        <th>Withdrawn</th><th>Ord. Tax</th><th>CG Tax</th><th>Penalty</th><th>Total Tax</th><th>Net Spendable</th>
      </tr></thead>
      <tbody>${rows}</tbody>`;
```

Find the row template inside `renderTable()` (the `result.years.map` block):
```js
    const rows = result.years.map(y => `
      <tr>
        <td class="${isRetireYear(y) ? 'retire-age' : ''}">${y.age}${isRetireYear(y) ? ' ★' : ''}</td>
        <td>${fmt(y.balances.traditional)}</td>
        <td>${fmt(y.balances.roth)}</td>
        <td>${fmt(y.balances.taxable)}</td>
        <td class="total-val">${fmt(y.totalBalance)}</td>
        <td>${isSpend(y) ? fmt(y.withdrawn) : '<span class="dash">—</span>'}</td>
        <td class="${isSpend(y) && y.ordinaryTax > 0 ? 'tax-val' : 'dash'}">${isSpend(y) ? fmt(y.ordinaryTax) : '—'}</td>
        <td class="${isSpend(y) && y.capGainsTax > 0 ? 'cg-val' : 'dash'}">${isSpend(y) ? fmt(y.capGainsTax) : '—'}</td>
        <td class="${isSpend(y) && y.totalTax > 0 ? 'tax-val' : 'dash'}">${isSpend(y) ? fmt(y.totalTax) : '—'}</td>
        <td class="${isSpend(y) ? 'net-val' : 'dash'}">${isSpend(y) ? fmt(y.netSpendable) : '—'}</td>
      </tr>`).join('');
```

Replace with:
```js
    const rows = result.years.map(y => `
      <tr>
        <td class="${isRetireYear(y) ? 'retire-age' : ''}">${y.age}${isRetireYear(y) ? ' ★' : ''}</td>
        <td>${fmt(y.balances.traditional)}</td>
        <td>${fmt(y.balances.roth)}</td>
        <td>${fmt(y.balances.taxable)}</td>
        <td class="total-val">${fmt(y.totalBalance)}</td>
        <td>${isSpend(y) ? fmt(y.withdrawn) : '<span class="dash">—</span>'}</td>
        <td class="${isSpend(y) && y.ordinaryTax > 0 ? 'tax-val' : 'dash'}">${isSpend(y) ? fmt(y.ordinaryTax) : '—'}</td>
        <td class="${isSpend(y) && y.capGainsTax > 0 ? 'cg-val' : 'dash'}">${isSpend(y) ? fmt(y.capGainsTax) : '—'}</td>
        <td class="${isSpend(y) && y.penaltyTax > 0 ? 'penalty-val' : 'dash'}">${isSpend(y) ? fmt(y.penaltyTax) : '—'}</td>
        <td class="${isSpend(y) && y.totalTax > 0 ? 'tax-val' : 'dash'}">${isSpend(y) ? fmt(y.totalTax) : '—'}</td>
        <td class="${isSpend(y) ? 'net-val' : 'dash'}">${isSpend(y) ? fmt(y.netSpendable) : '—'}</td>
      </tr>`).join('');
```

- [ ] **Step 2: Add `.penalty-val` CSS class**

Find this line in the `<style>` block:
```css
    td.net-val    { color: #10b981; font-weight: 600; }
```

Add the penalty style immediately after it:
```css
    td.penalty-val { color: #f97316; }
```

- [ ] **Step 3: Add Penalty dataset to the tax chart in `renderCharts()`**

Find the tax chart datasets array:
```js
        datasets: [
          { label: 'Ordinary Income Tax', data: retYears.map(y => Math.round(y.ordinaryTax)), backgroundColor: 'rgba(244,63,94,0.75)' },
          { label: 'Capital Gains Tax',   data: retYears.map(y => Math.round(y.capGainsTax)), backgroundColor: 'rgba(245,158,11,0.75)' },
        ]
```

Replace with:
```js
        datasets: [
          { label: 'Ordinary Income Tax',       data: retYears.map(y => Math.round(y.ordinaryTax)),  backgroundColor: 'rgba(244,63,94,0.75)'  },
          { label: 'Capital Gains Tax',          data: retYears.map(y => Math.round(y.capGainsTax)), backgroundColor: 'rgba(245,158,11,0.75)' },
          { label: 'Early Withdrawal Penalty',   data: retYears.map(y => Math.round(y.penaltyTax)),  backgroundColor: 'rgba(249,115,22,0.75)' },
        ]
```

- [ ] **Step 4: Add Penalty entry to the tax chart HTML legend**

Find the tax chart legend builder:
```js
    document.getElementById('legend-tax').innerHTML =
      `<span><span class="legend-swatch" style="background:#f43f5e"></span>Ordinary Income Tax</span>` +
      `<span><span class="legend-swatch" style="background:#f59e0b"></span>Capital Gains Tax</span>`;
```

Replace with:
```js
    document.getElementById('legend-tax').innerHTML =
      `<span><span class="legend-swatch" style="background:#f43f5e"></span>Ordinary Income Tax</span>` +
      `<span><span class="legend-swatch" style="background:#f59e0b"></span>Capital Gains Tax</span>` +
      `<span><span class="legend-swatch" style="background:#f97316"></span>Early Withdrawal Penalty</span>`;
```

- [ ] **Step 5: Verify syntax and open in browser**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
try { new Function(m[1]); console.log('JS syntax OK'); } catch(e) { console.log('ERROR:', e.message); }
"
open index.html
```

Expected: `JS syntax OK`

In the browser, verify:
- Starting Balances card shows `└ Basis` under both Roth and Taxable
- If retirement age is set below 60 (e.g., set to 50 with start age 35), the table shows non-zero Penalty column values for ages 50–59, and `—` from age 60 onward
- The tax breakdown chart shows three stacked colors when there are penalty years
- At retirement age ≥ 60 (default config), penalty column is all `—` and third chart bar is invisible (zero)
- `totalTax` in the table equals `ordinaryTax + capGainsTax + penaltyTax`
- Net Spendable equals `withdrawn − totalTax`

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: early withdrawal penalty — table column, chart dataset, orange legend entry"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|-----------------|------|
| `roth.startBasis` config field (optional, defaults to startBalance) | Task 1 |
| Roth basis input in UI, styled like taxable basis | Task 1 |
| Roth basis increments during accumulation per contribution | Task 2 |
| `rothBasis` initialized from `cfg.buckets.roth.startBasis ?? startBalance` | Task 2 |
| Traditional pre-60: full withdrawal penalized | Task 3 |
| Roth pre-60: only gains portion penalized, basis portion free | Task 3 |
| Roth basis reduced by basis portion of each withdrawal | Task 3 |
| Taxable: no penalty | Task 3 |
| Penalty = flat 10% on `yearPenaltyBase` | Task 3 |
| Age threshold: `ageFloat < 60` → penalized | Task 3 |
| `penaltyTax` added to `totalTax` | Task 3 |
| `yearPenaltyBase` reset at year boundary | Task 3 |
| `netSpendable` updated to include penalty | Task 3 |
| Penalty column in table (between CG Tax and Total Tax) | Task 4 |
| Penalty column styled orange `#f97316` | Task 4 |
| Third stacked bar dataset in tax chart (orange) | Task 4 |
| Orange legend entry in tax chart header | Task 4 |
| Old saved configs load fine (backward compatible) | Task 1 (defaults) |
| Summary lifetime tax includes penalty (via totalTax sum) | Task 3 (implicit) |

All spec requirements covered.

### Placeholder scan

No TBD, TODO, or vague steps. All code blocks are complete.

### Type consistency

- `penaltyTax` (number) added to year result in Task 3, read in Task 4 as `y.penaltyTax` — consistent.
- `yearPenaltyBase` declared and reset in Task 3 — no other references.
- `rothBasis` declared in Task 2, used in Task 3 — consistent.
- `cfg.buckets.roth.startBasis` read in Task 2 and defaulted in Task 1 — consistent.
- `isPenalty` is a `const` local to the withdrawal iteration — no cross-scope issues.
- `rothGainsFrac` is computed inside the Roth branch only — no name collision with taxable's `gainsFrac`.
