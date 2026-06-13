# Generic Income Streams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable recurring income streams (e.g. Social Security, pension, part-time work) that offset account withdrawals during the spend phase and are taxed as 100% ordinary income.

**Architecture:** Three-task build. Task 1 adds `incomeStreams` to config/migration/DEFAULT_CONFIG. Task 2 updates the engine to resolve income stream ages, sum active monthly income, offset withdrawals, and record `extraIncome` in the year result. Task 3 adds the UI card and table column.

**Tech Stack:** Vanilla JS, `app.js` + `app.css` + `index.html`.

---

## File Structure

| File | Changes |
|------|---------|
| `app.js` | Config: `incomeStreams` in DEFAULT_CONFIG + migrateConfig. Engine: resolve income streams, `getActiveIncome`, `yearExtraIncome` accumulator, updated `netSpendable`. UI: `renderIncomeStreams()` + mutators, table column. |
| `app.css` | One new CSS class: `td.income-val { color: #0d9488; }` |
| `index.html` | New `ctrl-income` card div between Spend Intervals and Summary strip. |

---

### Task 1: Config — add incomeStreams field

**Files:**
- Modify: `app.js` — `DEFAULT_CONFIG` and `migrateConfig`

- [ ] **Step 1: Add `incomeStreams` to `DEFAULT_CONFIG`**

Find:
```js
  withdrawalOrder: ['taxable', 'traditional', 'roth-basis', 'roth']
};
```

Replace with:
```js
  withdrawalOrder: ['taxable', 'traditional', 'roth-basis', 'roth'],
  incomeStreams: []
};
```

- [ ] **Step 2: Add migration for old configs missing `incomeStreams`**

Find in `migrateConfig`:
```js
  // configs before custom anchors feature
  if (!cfg.customAnchors) {
    cfg.customAnchors = [
      { key: 'anchor1', label: '', age: null },
      { key: 'anchor2', label: '', age: null },
    ];
  }
  return cfg;
```

Replace with:
```js
  // configs before custom anchors feature
  if (!cfg.customAnchors) {
    cfg.customAnchors = [
      { key: 'anchor1', label: '', age: null },
      { key: 'anchor2', label: '', age: null },
    ];
  }
  // configs before income streams feature
  if (!cfg.incomeStreams) {
    cfg.incomeStreams = [];
  }
  return cfg;
```

- [ ] **Step 3: Verify**

```bash
node -e "
const fs = require('fs');
const js = fs.readFileSync('app.js', 'utf8');
try { new Function(js); console.log('JS syntax OK'); } catch(e) { console.log('ERROR:', e.message); }
"
```

Expected: `JS syntax OK`

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: add incomeStreams to config schema with migration"
```

---

### Task 2: Engine — income stream offset and year result

**Files:**
- Modify: `app.js` — inside `simulate()`

- [ ] **Step 1: Resolve income stream ages alongside contribution/spend intervals**

Find these two resolution blocks near the top of `simulate()`:
```js
  const resolvedContribIntervals = (cfg.contributionIntervals || []).map(ci => ({
    ...ci,
    startAge: resolveAge(ci.startAge),
    endAge:   resolveAge(ci.endAge),
  }));
  const resolvedSpendIntervals = (cfg.spendIntervals || []).map(si => ({
    ...si,
    startAge: resolveAge(si.startAge),
    endAge:   resolveAge(si.endAge),
  }));
```

Replace with:
```js
  const resolvedContribIntervals = (cfg.contributionIntervals || []).map(ci => ({
    ...ci,
    startAge: resolveAge(ci.startAge),
    endAge:   resolveAge(ci.endAge),
  }));
  const resolvedSpendIntervals = (cfg.spendIntervals || []).map(si => ({
    ...si,
    startAge: resolveAge(si.startAge),
    endAge:   resolveAge(si.endAge),
  }));
  const resolvedIncomeStreams = (cfg.incomeStreams || []).map(s => ({
    ...s,
    startAge: resolveAge(s.startAge),
    endAge:   resolveAge(s.endAge),
  }));
```

- [ ] **Step 2: Add `getActiveIncome` helper alongside the other helpers**

Find:
```js
  // Helper: find active spend interval at a given age
  function getSpendInterval(age) {
    return resolvedSpendIntervals.find(
      i => age >= i.startAge && age < i.endAge
    ) || null;
  }
```

Add immediately after it:
```js
  // Helper: sum monthly income from all active income streams at a given age
  function getActiveIncome(age) {
    return resolvedIncomeStreams
      .filter(s => age >= s.startAge && age < s.endAge)
      .reduce((sum, s) => sum + s.monthly, 0);
  }
```

- [ ] **Step 3: Add `yearExtraIncome` accumulator**

Find:
```js
  let yearPenaltyBase = 0;    // sum of penalized withdrawal amounts for the year
  let yearTradWithdrawn = 0;  // Traditional withdrawals this year (for RMD shortfall check)
  let currentYear = 0;        // years elapsed since startAge
```

Replace with:
```js
  let yearPenaltyBase = 0;    // sum of penalized withdrawal amounts for the year
  let yearTradWithdrawn = 0;  // Traditional withdrawals this year (for RMD shortfall check)
  let yearExtraIncome = 0;    // income stream cash received this year (offsets withdrawals)
  let currentYear = 0;        // years elapsed since startAge
```

- [ ] **Step 4: Apply income offset in the spend phase**

Find:
```js
      // Growth applied before withdrawal; balanceBefore in basis calc includes this month's growth.
      // Pull withdrawals in order
      let remaining = monthlySpend;
```

Replace with:
```js
      // Growth applied before withdrawal; balanceBefore in basis calc includes this month's growth.
      // Income streams offset spend — pull less from buckets this month.
      const monthlyIncome = getActiveIncome(ageFloat);
      yearOrdinaryIncome += monthlyIncome; // 100% taxable as ordinary income
      yearExtraIncome    += monthlyIncome;
      // Pull withdrawals in order
      let remaining = Math.max(0, monthlySpend - monthlyIncome);
```

- [ ] **Step 5: Add `extraIncome` to year result and update `netSpendable`**

Find:
```js
        rmdRequired,  // IRS-mandated minimum (0 if age < 73)
        rmdActual,    // extra forced withdrawal on top of planned withdrawals
        totalTax: ordinaryTax + capGainsTax + penaltyTax,
        netSpendable: yearWithdrawn - (ordinaryTax + capGainsTax + penaltyTax),
```

Replace with:
```js
        rmdRequired,  // IRS-mandated minimum (0 if age < 73)
        rmdActual,    // extra forced withdrawal on top of planned withdrawals
        extraIncome: yearExtraIncome,
        totalTax: ordinaryTax + capGainsTax + penaltyTax,
        netSpendable: yearWithdrawn + yearExtraIncome - (ordinaryTax + capGainsTax + penaltyTax),
```

- [ ] **Step 6: Reset `yearExtraIncome` at year boundary**

Find:
```js
      yearPenaltyBase = 0;
      yearTradWithdrawn = 0;
      // Update tradBalStartOfYear AFTER the top-up so next year uses the correct Dec 31 balance
```

Replace with:
```js
      yearPenaltyBase = 0;
      yearTradWithdrawn = 0;
      yearExtraIncome = 0;
      // Update tradBalStartOfYear AFTER the top-up so next year uses the correct Dec 31 balance
```

- [ ] **Step 7: Verify with Node.js**

```bash
node -e "
// Simulate income offset logic
const monthlySpend = 10000;
const monthlyIncome = 2400; // e.g. SS
const remaining = Math.max(0, monthlySpend - monthlyIncome);
console.log('remaining after income offset:', remaining); // Expected: 7600

// If income exceeds spend — no negative withdrawals
const highIncome = 15000;
const remainingHigh = Math.max(0, monthlySpend - highIncome);
console.log('remaining when income > spend:', remainingHigh); // Expected: 0

// yearExtraIncome accumulates monthly
let yearExtraIncome = 0;
for (let i = 0; i < 12; i++) yearExtraIncome += 2400;
console.log('yearExtraIncome for year:', yearExtraIncome); // Expected: 28800

// netSpendable includes extra income
const yearWithdrawn = 84000; // 7600 * 12
const totalTax = 10000;
const netSpendable = yearWithdrawn + yearExtraIncome - totalTax;
console.log('netSpendable:', netSpendable); // Expected: 102800
"
```

Expected:
```
remaining after income offset: 7600
remaining when income > spend: 0
yearExtraIncome for year: 28800
netSpendable: 102800
```

Also verify JS syntax:
```bash
node -e "
const fs = require('fs');
const js = fs.readFileSync('app.js', 'utf8');
try { new Function(js); console.log('JS syntax OK'); } catch(e) { console.log('ERROR:', e.message); }
"
```

- [ ] **Step 8: Commit**

```bash
git add app.js
git commit -m "feat: income stream engine — offset withdrawals, add extraIncome to year result"
```

---

### Task 3: UI — Income Streams card + table column

**Files:**
- Modify: `app.js` — RENDER UI section and `renderTable()`
- Modify: `app.css` — one new CSS class
- Modify: `index.html` — new card div

- [ ] **Step 1: Add `ctrl-income` card to `index.html`**

Find:
```html
  <!-- Controls row 3: Contribution Intervals | Spend Intervals -->
  <div class="grid-2">
    <div class="card" id="ctrl-contributions"></div>
    <div class="card" id="ctrl-spend"></div>
  </div>

  <!-- Summary strip -->
  <div class="summary-grid" id="summary-grid" style="margin-bottom:14px"></div>
```

Replace with:
```html
  <!-- Controls row 3: Contribution Intervals | Spend Intervals -->
  <div class="grid-2">
    <div class="card" id="ctrl-contributions"></div>
    <div class="card" id="ctrl-spend"></div>
  </div>

  <!-- Controls row 4: Income Streams (full width) -->
  <div class="card" id="ctrl-income"></div>

  <!-- Summary strip -->
  <div class="summary-grid" id="summary-grid" style="margin-bottom:14px"></div>
```

- [ ] **Step 2: Add `.income-val` CSS class to `app.css`**

Find:
```css
td.rmd-val     { color: #8b5cf6; }
```

Add immediately after:
```css
td.income-val  { color: #0d9488; }
```

- [ ] **Step 3: Add `renderIncomeStreams()` and mutators to `app.js`**

Find the `applyPasted` function (last function in the RENDER UI section):
```js
function applyPasted() {
  const text = document.getElementById('paste-area').value.trim();
  if (!text) return;
  if (loadConfigFromText(text)) onConfigChange();
}
```

Add the following immediately after it (before `// === RENDER OUTPUTS ===`):
```js
function renderIncomeStreams() {
  const el = document.getElementById('ctrl-income');
  const rows = (config.incomeStreams || []).map((s, i) => `
    <div class="interval-row">
      <div class="interval-row-header">
        <input type="text" value="${s.label}" placeholder="Label (e.g. Social Security)"
          style="flex:1;min-width:120px;font-weight:600;font-size:12px;background:transparent;border:none;outline:none;color:#0f172a"
          oninput="updateIS(${i},'label',this.value)"
          onblur="onConfigChange()">
        <button class="danger" onclick="removeIS(${i})">×</button>
      </div>
      <div class="interval-fields" style="grid-template-columns:1fr 1fr 1fr">
        <div class="interval-field"><label>From Age</label>${ageAnchorSelect(s.startAge, `updateIS(${i},'startAge',__v)`)}</div>
        <div class="interval-field"><label>To Age</label>${ageAnchorSelect(s.endAge, `updateIS(${i},'endAge',__v)`)}</div>
        <div class="interval-field"><label>$/Month</label><input type="number" value="${s.monthly}" min="0" oninput="updateIS(${i},'monthly',+this.value)"></div>
      </div>
    </div>`).join('');
  el.innerHTML = `<div style="display:flex;align-items:center;margin-bottom:14px">
      <span class="section-label" style="margin-bottom:0">Income Streams</span>
      <span class="phase-badge" style="background:#ccfbf1;color:#0f766e;margin-left:6px;font-size:10px;font-weight:600;padding:2px 9px;border-radius:20px">Retirement</span>
    </div>
    <div id="is-list">${rows}</div>
    <button class="add-interval" style="color:#0d9488;border-color:#99f6e4" onclick="addIS()">+ Add Income Stream</button>`;
}

function updateIS(i, field, val) {
  config.incomeStreams[i][field] = val;
  runSim();
}
function addIS() {
  config.incomeStreams.push({ label: '', startAge: 'retirementAge', endAge: 'endAge', monthly: 0 });
  onConfigChange();
}
function removeIS(i) {
  config.incomeStreams.splice(i, 1);
  onConfigChange();
}
```

- [ ] **Step 4: Wire `renderIncomeStreams()` into `onConfigChange()`**

Find:
```js
function onConfigChange() {
  renderGlobal();
  renderBuckets();
  renderOrder();
  renderContributions();
  renderSpend();
  renderSaveLoad();
  runSim();
}
```

Replace with:
```js
function onConfigChange() {
  renderGlobal();
  renderBuckets();
  renderOrder();
  renderContributions();
  renderSpend();
  renderIncomeStreams();
  renderSaveLoad();
  runSim();
}
```

- [ ] **Step 5: Add "Extra Income" column to `renderTable()`**

Find the table header:
```js
      <th>Withdrawn</th><th>RMD Req.</th><th>RMD Forced</th><th>Ord. Tax</th>
```

Replace with:
```js
      <th>Extra Income</th><th>Withdrawn</th><th>RMD Req.</th><th>RMD Forced</th><th>Ord. Tax</th>
```

Find these table row cells:
```js
      <td>${isSpend(y) ? fmt(y.withdrawn) : '<span class="dash">—</span>'}</td>
      <td class="${y.rmdRequired > 0 ? 'rmd-val' : 'dash'}">${y.rmdRequired > 0 ? fmt(y.rmdRequired) : '—'}</td>
```

Replace with:
```js
      <td class="${isSpend(y) && y.extraIncome > 0 ? 'income-val' : 'dash'}">${isSpend(y) && y.extraIncome > 0 ? fmt(y.extraIncome) : '—'}</td>
      <td>${isSpend(y) ? fmt(y.withdrawn) : '<span class="dash">—</span>'}</td>
      <td class="${y.rmdRequired > 0 ? 'rmd-val' : 'dash'}">${y.rmdRequired > 0 ? fmt(y.rmdRequired) : '—'}</td>
```

- [ ] **Step 6: Verify syntax and check in browser**

```bash
node -e "
const fs = require('fs');
const js = fs.readFileSync('app.js', 'utf8');
try { new Function(js); console.log('JS syntax OK'); } catch(e) { console.log('ERROR:', e.message); }
"
open index.html
```

Expected: `JS syntax OK`

Browser checks:
- "Income Streams" card appears between Spend Intervals and the Summary strip
- Card shows a teal "+ Add Income Stream" button
- Adding a stream shows label input, From Age (anchor select), To Age (anchor select), Monthly $ input
- Table now has 14 columns; "Extra Income" column is first after Total, shows `—` for all rows with default config (no income streams defined)
- Add a stream (e.g. label "SS", From Age: Retirement Age, To Age: End Age, Monthly: 2400) → Extra Income column shows teal $28,800 values in retirement rows, Ord. Tax rises, Net Spendable rises

- [ ] **Step 7: Commit and push**

```bash
git add app.js app.css index.html
git commit -m "feat: income streams — UI card, Extra Income table column, teal styling"
git push origin main
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| `incomeStreams: []` in DEFAULT_CONFIG | Task 1 |
| `migrateConfig` adds `incomeStreams: []` to old configs | Task 1 |
| `resolvedIncomeStreams` with age anchor resolution | Task 2 |
| `getActiveIncome(ageFloat)` sums active streams each month | Task 2 |
| `yearOrdinaryIncome += monthlyIncome` (100% taxable) | Task 2 |
| `yearExtraIncome += monthlyIncome` (for display) | Task 2 |
| `remaining = Math.max(0, monthlySpend - monthlyIncome)` | Task 2 |
| `extraIncome` in year result object | Task 2 |
| `netSpendable = withdrawn + extraIncome - totalTax` | Task 2 |
| `yearExtraIncome` reset at year boundary | Task 2 |
| `ctrl-income` card in `index.html` between spend and summary | Task 3 |
| `td.income-val { color: #0d9488 }` CSS | Task 3 |
| `renderIncomeStreams()` with label/from/to/monthly fields | Task 3 |
| `updateIS`, `addIS`, `removeIS` mutators | Task 3 |
| `renderIncomeStreams()` called in `onConfigChange()` | Task 3 |
| "Extra Income" table column between Total and Withdrawn | Task 3 |
| Column teal when > 0, `—` when zero | Task 3 |
| No balance chart changes | By omission (correct) |
| No tax chart changes | By omission (correct) |
| No overlap validation (streams can overlap — they sum) | By omission (correct) |

All requirements covered.

### Placeholder scan
No TBD/TODO/vague steps. All code blocks complete.

### Type consistency
- `config.incomeStreams[i]` fields: `label` (string), `startAge` (number|string), `endAge` (number|string), `monthly` (number). Consistent across Task 1 (DEFAULT_CONFIG), Task 2 (resolvedIncomeStreams), Task 3 (renderIncomeStreams/updateIS/addIS).
- `y.extraIncome` — number, always present (initialized to 0 each year). Task 2 sets it, Task 3 reads it. Consistent.
- `getActiveIncome(ageFloat)` — returns number, used in Task 2 spend phase. Consistent.
- `resolvedIncomeStreams` — used only in `getActiveIncome`. Consistent.
