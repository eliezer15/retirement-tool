// === CONSTANTS ===
// Source: IRS Rev. Proc. 2025-32 (2026 tax year, Married Filing Jointly)

const STANDARD_DEDUCTION_MFJ = 32200;

// Ordinary income brackets [MFJ]. Each entry: [threshold_up_to, rate].
// Last entry threshold is Infinity.
const ORDINARY_BRACKETS_MFJ = [
  [24800,    0.10],
  [100800,   0.12],
  [211400,   0.22],
  [403550,   0.24],
  [512450,   0.32],
  [768700,   0.35],
  [Infinity, 0.37],
];

// Long-term capital gains brackets [MFJ].
// Applied to gains stacked ON TOP of ordinary taxable income.
const LTCG_BRACKETS_MFJ = [
  [98900,    0.00],
  [613700,   0.15],
  [Infinity, 0.20],
];

// === ENGINE ===
// All pure functions. No DOM access.
//
// Bracket table format: array of [upperBound, rate].
// Each entry covers income from the PREVIOUS upperBound (exclusive) up to this upperBound (inclusive).
// The last entry uses Infinity as the upperBound.
// Example: [24800, 0.10] means: income from $0 to $24,800 is taxed at 10%.

/** Apply a progressive bracket table to a taxable amount.
 * brackets: array of [upperBound, rate]. Last upperBound must be Infinity.
 * Returns total tax owed. */
function applyBrackets(amount, brackets) {
  if (amount <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const [upper, rate] of brackets) {
    if (amount <= prev) break;
    const chunk = Math.min(amount, upper) - prev;
    tax += chunk * rate;
    prev = upper;
  }
  return tax;
}

/** Compute annual federal tax for a single year of retirement withdrawals.
 * @param {number} ordinaryIncome - Total Traditional withdrawals for the year
 * @param {number} capGainsRealized - Taxable gains portion of Taxable withdrawals
 * @returns {{ ordinaryTax: number, capGainsTax: number }}
 */
function computeAnnualTax(ordinaryIncome, capGainsRealized) {
  // Step 1: ordinary income tax
  const taxableOrdinary = Math.max(0, ordinaryIncome - STANDARD_DEDUCTION_MFJ);
  const ordinaryTax = applyBrackets(taxableOrdinary, ORDINARY_BRACKETS_MFJ);

  // Step 2: LTCG stacked on top of ordinary taxable income
  // Figure out effective rate at the top of the ordinary stack, then apply
  // remaining LTCG bracket room to the gains.
  let capGainsTax = 0;
  if (capGainsRealized > 0) {
    const stackBase = taxableOrdinary; // gains sit on top of this
    let remaining = capGainsRealized;
    let prev = 0;
    for (const [upper, rate] of LTCG_BRACKETS_MFJ) {
      // How much room is left in this bracket above stackBase?
      const bracketFloor = Math.max(prev, stackBase);
      const bracketRoom = Math.max(0, upper - bracketFloor);
      const chunk = Math.min(remaining, bracketRoom);
      capGainsTax += chunk * rate;
      remaining -= chunk;
      if (remaining <= 0) break;
      prev = upper;
    }
  }

  return { ordinaryTax, capGainsTax };
}

/** Validate the config object. Returns { errors: string[], warnings: string[] }.
 * errors block simulation. warnings allow it. */
function validateConfig(cfg) {
  const errors = [];
  const warnings = [];
  const BUCKETS = ['traditional', 'roth', 'taxable'];

  if (cfg.startAge >= cfg.retirementAge) errors.push('Start age must be less than retirement age.');
  if (cfg.retirementAge >= cfg.endAge) errors.push('Retirement age must be less than end age.');

  // Check contribution interval overlaps per bucket
  for (const bucket of BUCKETS) {
    const intervals = (cfg.contributionIntervals || []).filter(i => i.bucket === bucket)
      .map(i => ({ ...i, startAge: resolveAge(i.startAge), endAge: resolveAge(i.endAge) }));
    for (let a = 0; a < intervals.length; a++) {
      for (let b = a + 1; b < intervals.length; b++) {
        const ia = intervals[a], ib = intervals[b];
        if (ia.startAge < ib.endAge && ib.startAge < ia.endAge) {
          errors.push(`Contribution intervals for "${bucket}" overlap (ages ${ia.startAge}-${ia.endAge} and ${ib.startAge}-${ib.endAge}).`);
        }
      }
    }
  }

  // Check spend interval overlaps
  const spends = (cfg.spendIntervals || [])
    .map(s => ({ ...s, startAge: resolveAge(s.startAge), endAge: resolveAge(s.endAge) }));
  for (let a = 0; a < spends.length; a++) {
    for (let b = a + 1; b < spends.length; b++) {
      const sa = spends[a], sb = spends[b];
      if (sa.startAge < sb.endAge && sb.startAge < sa.endAge) {
        errors.push(`Spend intervals overlap (ages ${sa.startAge}-${sa.endAge} and ${sb.startAge}-${sb.endAge}).`);
      }
    }
  }

  // Warn on uncovered accumulation buckets
  for (const bucket of BUCKETS) {
    const intervals = (cfg.contributionIntervals || []).filter(i => i.bucket === bucket)
      .map(i => ({ ...i, startAge: resolveAge(i.startAge), endAge: resolveAge(i.endAge) }));
    if (intervals.length === 0) {
      warnings.push(`No contribution intervals defined for "${bucket}" — it will grow at 0% with no contributions during accumulation.`);
    } else {
      const coversStart = intervals.some(i => i.startAge <= cfg.startAge && i.endAge > cfg.startAge);
      if (!coversStart) {
        warnings.push(`No contribution interval for "${bucket}" covers the simulation start age (${cfg.startAge}) — it will grow at 0% with no contributions until age ${Math.min(...intervals.map(i => i.startAge))}.`);
      }
    }
  }

  // Warn on spend interval gaps
  if (spends.length === 0 && cfg.endAge > cfg.retirementAge) {
    warnings.push(`No spend intervals defined — the entire retirement phase (ages ${cfg.retirementAge}–${cfg.endAge}) will use $0 spend and 0% growth.`);
  } else if (spends.length > 0) {
    const sorted = [...spends].sort((a, b) => a.startAge - b.startAge);
    if (sorted[0].startAge > cfg.retirementAge) {
      warnings.push(`Spend intervals start at age ${sorted[0].startAge} but retirement is age ${cfg.retirementAge}. Gap will use $0 spend and 0% growth.`);
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startAge > sorted[i - 1].endAge) {
        warnings.push(`Gap in spend intervals between ages ${sorted[i-1].endAge} and ${sorted[i].startAge}. Gap will use $0 spend and 0% growth.`);
      }
    }
    if (sorted[sorted.length - 1].endAge < cfg.endAge) {
      warnings.push(`Spend intervals end at age ${sorted[sorted.length-1].endAge} but simulation ends at age ${cfg.endAge}. Gap will use $0 spend and 0% growth.`);
    }
  }

  // Validate withdrawal order contains only valid bucket names
  // 'roth-basis' is a virtual bucket meaning "Roth contributions only (basis), penalty-free"
  const VALID_BUCKETS = new Set(['traditional', 'roth', 'taxable', 'roth-basis']);
  for (const b of (cfg.withdrawalOrder || [])) {
    if (!VALID_BUCKETS.has(b)) {
      errors.push(`withdrawalOrder contains invalid bucket name: "${b}".`);
    }
  }

  return { errors, warnings };
}

/** Main simulation. Returns { years: YearResult[], summary: Summary } or null if config has errors.
 * Steps monthly, tallies taxes annually.
 * @param {object} cfg - validated config object
 */
function simulate(cfg) {
  const { errors } = validateConfig(cfg);
  if (errors.length > 0) return null;

  // --- state ---
  const bal = {
    traditional: cfg.buckets.traditional.startBalance,
    roth: cfg.buckets.roth.startBalance,
    taxable: cfg.buckets.taxable.startBalance,
  };
  let taxableBasis = cfg.buckets.taxable.startBasis ?? cfg.buckets.taxable.startBalance;
  let rothBasis = cfg.buckets.roth.startBasis ?? cfg.buckets.roth.startBalance;

  const years = [];

  // Resolve symbolic age anchors ('startAge', 'retirementAge', 'endAge') to numbers.
  // Operates on copies so the config object is not mutated.
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

  // Helper: find active contribution interval for a bucket at a given age (fractional ok)
  function getContribInterval(bucket, age) {
    return resolvedContribIntervals.find(
      i => i.bucket === bucket && age >= i.startAge && age < i.endAge
    ) || null;
  }

  // Helper: find active spend interval at a given age
  function getSpendInterval(age) {
    return resolvedSpendIntervals.find(
      i => age >= i.startAge && age < i.endAge
    ) || null;
  }

  // Run month by month
  const totalMonths = (cfg.endAge - cfg.startAge) * 12;
  let yearOrdinaryIncome = 0;
  let yearCapGainsRealized = 0;
  let yearWithdrawn = 0;
  let yearPenaltyBase = 0; // sum of penalized withdrawal amounts for the year
  let currentYear = 0; // years elapsed since startAge

  for (let m = 0; m < totalMonths; m++) {
    const ageFloat = cfg.startAge + m / 12;
    const isSpendPhase = ageFloat >= cfg.retirementAge;

    if (isSpendPhase) {
      // --- SPEND PHASE ---
      const si = getSpendInterval(ageFloat);
      const rates = si ? si.rates : { traditional: 0, roth: 0, taxable: 0 };
      const monthlySpend = si ? si.monthlySpend : 0;

      // Apply monthly growth to each bucket
      for (const b of ['traditional', 'roth', 'taxable']) {
        const r = rates[b] || 0;
        bal[b] = bal[b] * (1 + r / 12);
      }

      // Growth applied before withdrawal; balanceBefore in basis calc includes this month's growth.
      // Pull withdrawals in order
      let remaining = monthlySpend;
      for (const b of cfg.withdrawalOrder) {
        if (remaining <= 0) break;

        // isPenalty: IRS 59½ rule — penalty applies before age 59.5.
        // Monthly sim can represent this precisely since ageFloat is fractional.
        const isPenalty = ageFloat < 59.5;

        if (b === 'roth-basis') {
          // Virtual bucket: pull only from Roth balance up to the available basis (always penalty-free).
          const available = Math.min(bal['roth'], rothBasis);
          if (available <= 0) continue;
          const withdrawal = Math.min(remaining, available);
          bal['roth'] -= withdrawal;
          rothBasis = Math.max(0, rothBasis - withdrawal);
          remaining -= withdrawal;
          yearWithdrawn += withdrawal;
          // Roth basis: no ordinary income, no cap gains, no penalty
        } else {
          const available = bal[b];
          if (available <= 0) continue;
          const withdrawal = Math.min(remaining, available);
          bal[b] -= withdrawal;
          remaining -= withdrawal;
          yearWithdrawn += withdrawal;

          if (b === 'traditional') {
            yearOrdinaryIncome += withdrawal;
            // All traditional withdrawals are penalized pre-59.5 (all pre-tax, no basis)
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
            // Roth gains: only gains are penalized pre-59.5.
            // rothBasis is a running cost-basis tracker (contributions only, no growth).
            // bal['roth'] compounds monthly, so rothGainsFrac increases within a year as the account grows.
            const rothBalBefore = bal[b] + withdrawal;
            const rothGainsFrac = rothBalBefore > 0
              ? Math.max(0, (rothBalBefore - rothBasis) / rothBalBefore)
              : 0;
            const rothBasisWithdrawn = withdrawal * (1 - rothGainsFrac);
            rothBasis = Math.max(0, rothBasis - rothBasisWithdrawn);
            if (isPenalty) yearPenaltyBase += withdrawal * rothGainsFrac;
            // Roth withdrawals are never ordinary income (no income tax, only possible penalty on gains)
          }
        }
      }

    } else {
      // --- ACCUMULATION PHASE ---
      for (const b of ['traditional', 'roth', 'taxable']) {
        const ci = getContribInterval(b, ageFloat);
        const r = ci ? ci.annualRate : 0;
        const contrib = ci ? ci.monthly : 0;
        bal[b] = bal[b] * (1 + r / 12) + contrib;
        if (b === 'taxable') taxableBasis += contrib;
        if (b === 'roth')    rothBasis    += contrib;
      }
    }

    // At each year boundary, record annual results
    const newYear = Math.floor((m + 1) / 12);
    if (newYear > currentYear) {
      // age = age at END of this year (after 12 months complete). Year 1 data = age startAge+1.
      const age = cfg.startAge + newYear;
      const { ordinaryTax, capGainsTax } = computeAnnualTax(yearOrdinaryIncome, yearCapGainsRealized);
      const penaltyTax = yearPenaltyBase * 0.10;
      const totalBalance = bal.traditional + bal.roth + bal.taxable;
      years.push({
        age,
        balances: { traditional: bal.traditional, roth: bal.roth, taxable: bal.taxable },
        rothBasis,   // current Roth basis at year-end (for chart stacking)
        totalBalance,
        withdrawn: yearWithdrawn,
        ordinaryIncome: yearOrdinaryIncome,
        capGainsRealized: yearCapGainsRealized,
        ordinaryTax,
        capGainsTax,
        penaltyBase: yearPenaltyBase,
        penaltyTax,
        totalTax: ordinaryTax + capGainsTax + penaltyTax,
        netSpendable: yearWithdrawn - (ordinaryTax + capGainsTax + penaltyTax),
      });
      yearOrdinaryIncome = 0;
      yearCapGainsRealized = 0;
      yearWithdrawn = 0;
      yearPenaltyBase = 0;
      currentYear = newYear;
    }
  }

  // Compute summary
  let peakNetWorth = 0, peakNetWorthAge = cfg.startAge;
  let totalLifetimeTax = 0;
  let ageMoneyRunsOut = null;
  for (const y of years) {
    if (y.totalBalance > peakNetWorth) {
      peakNetWorth = y.totalBalance;
      peakNetWorthAge = y.age;
    }
    totalLifetimeTax += y.totalTax;
    if (ageMoneyRunsOut === null && y.totalBalance < 1 && y.age >= cfg.retirementAge) {
      ageMoneyRunsOut = y.age;
    }
  }
  const endingBalance = years.length > 0 ? years[years.length - 1].totalBalance : 0;

  return {
    years,
    summary: { peakNetWorth, peakNetWorthAge, totalLifetimeTax, ageMoneyRunsOut, endingBalance }
  };
}

// === UI STATE ===

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
  contributionIntervals: [
    { bucket: 'traditional', startAge: 'startAge', endAge: 'retirementAge', monthly: 1500, annualRate: 0.07 },
    { bucket: 'roth',        startAge: 'startAge', endAge: 'retirementAge', monthly: 500,  annualRate: 0.07 },
    { bucket: 'taxable',     startAge: 'startAge', endAge: 'retirementAge', monthly: 1000, annualRate: 0.06 }
  ],
  spendIntervals: [
    { startAge: 'retirementAge', endAge: 'endAge', monthlySpend: 10000,
      rates: { traditional: 0.04, roth: 0.05, taxable: 0.03 } }
  ],
  withdrawalOrder: ['taxable', 'traditional', 'roth-basis', 'roth']
};

const STORAGE_KEY = 'retirement-visualizer-config';

function persistConfig() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* quota exceeded etc. */ }
}

function loadPersistedConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.buckets || !parsed.contributionIntervals || !parsed.spendIntervals || !parsed.withdrawalOrder) return null;
    return migrateConfig(parsed);
  } catch { return null; }
}

let config = loadPersistedConfig() ?? { ...DEFAULT_CONFIG };

// === SAVE / LOAD ===

function saveConfig() {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'retirement-config.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function migrateConfig(cfg) {
  // v1 configs didn't have roth-basis in withdrawalOrder — insert it before 'roth' if missing
  if (!cfg.withdrawalOrder.includes('roth-basis')) {
    const rothIdx = cfg.withdrawalOrder.indexOf('roth');
    if (rothIdx >= 0) {
      cfg.withdrawalOrder.splice(rothIdx, 0, 'roth-basis');
    } else {
      cfg.withdrawalOrder.push('roth-basis');
    }
  }
  // v1 configs may not have roth.startBasis
  if (cfg.buckets.roth && cfg.buckets.roth.startBasis == null) {
    cfg.buckets.roth.startBasis = cfg.buckets.roth.startBalance;
  }
  return cfg;
}

function loadConfigFromText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    showBanner('error', 'Invalid JSON — could not parse.');
    return false;
  }
  // Basic schema check
  if (!parsed.buckets || !parsed.contributionIntervals || !parsed.spendIntervals || !parsed.withdrawalOrder) {
    showBanner('error', 'JSON is missing required fields (buckets, contributionIntervals, spendIntervals, withdrawalOrder).');
    return false;
  }
  config = migrateConfig(parsed);
  persistConfig();
  return true;
}

// === AGE ANCHORS ===
// Age fields in intervals can be a number OR a symbolic string.
// Symbolic strings: 'startAge' | 'retirementAge' | 'endAge'

const AGE_ANCHOR_LABELS = {
  startAge:      'Start Age',
  retirementAge: 'Retirement Age',
  endAge:        'End Age',
};

/** Resolve an age value (number or symbolic string) to a concrete number using the current config. */
function resolveAge(val) {
  if (typeof val === 'string' && val in AGE_ANCHOR_LABELS) return config[val];
  return +val;
}

/** Render a From/To age field as a select + optional custom number input.
 *  val: current value (number or symbolic string)
 *  callbackExpr: inline JS that receives the new value as `__v`
 *  e.g. "updateCI(0,'startAge',__v)"
 */
function ageAnchorSelect(val, callbackExpr) {
  const isSymbolic = typeof val === 'string' && val in AGE_ANCHOR_LABELS;
  const isCustom = !isSymbolic;
  const customVal = isCustom ? val : resolveAge(val);
  const selectChange = `var __v=this.value==='__custom__'?+this.nextElementSibling.value:this.value;${callbackExpr};this.nextElementSibling.style.display=this.value==='__custom__'?'block':'none'`;
  const inputChange = `var __v=+this.value;${callbackExpr}`;
  return `<select oninput="${selectChange}">
      ${Object.entries(AGE_ANCHOR_LABELS).map(([k, label]) =>
        `<option value="${k}" ${val === k ? 'selected' : ''}>${label}</option>`
      ).join('')}
      <option value="__custom__" ${isCustom ? 'selected' : ''}>Custom</option>
    </select><input type="number" value="${customVal}" min="0" max="120" style="display:${isCustom ? 'block' : 'none'};margin-top:4px" oninput="${inputChange}">`;
}

// === RENDER UI ===

const BUCKET_LABELS = { traditional: 'Traditional', roth: 'Roth', 'roth-basis': 'Roth Basis', taxable: 'Taxable' };
const BUCKET_DOT_CLASS = { traditional: 'dot-traditional', roth: 'dot-roth', 'roth-basis': 'dot-roth-basis', taxable: 'dot-taxable' };

function showBanner(type, msg) {
  const el = document.getElementById('banner');
  if (!msg) { el.className = ''; el.textContent = ''; return; }
  el.className = type;
  el.textContent = msg;
}

function fmt(n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString(); }
function fmtPct(n) { return (n * 100).toFixed(2) + '%'; }

function renderGlobal() {
  document.getElementById('ctrl-global').innerHTML = `
    <div class="section-label">Global Settings</div>
    <div class="row">
      <div class="field"><label>Start Age</label>
        <input type="number" id="g-start" value="${config.startAge}" min="18" max="80"></div>
      <div class="field"><label>Retirement Age</label>
        <input type="number" id="g-retire" value="${config.retirementAge}" min="18" max="100"></div>
      <div class="field"><label>End Age</label>
        <input type="number" id="g-end" value="${config.endAge}" min="20" max="120"></div>
    </div>`;
  document.getElementById('g-start').addEventListener('input', e => { config.startAge = +e.target.value; runSim(); });
  document.getElementById('g-retire').addEventListener('input', e => { config.retirementAge = +e.target.value; runSim(); });
  document.getElementById('g-end').addEventListener('input', e => { config.endAge = +e.target.value; runSim(); });
}

function renderBuckets() {
  document.getElementById('ctrl-buckets').innerHTML = `
    <div class="section-label">Starting Balances</div>
    <div class="bucket-row">
      <span class="bucket-dot dot-traditional"></span>
      <span class="bucket-name">Traditional</span>
      <input type="number" id="b-trad" value="${config.buckets.traditional.startBalance}" min="0">
    </div>
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
      <span class="bucket-name">Taxable</span>
      <input type="number" id="b-tax-bal" value="${config.buckets.taxable.startBalance}" min="0">
    </div>
    <div class="bucket-row bucket-basis">
      <span class="bucket-name" style="color:#94a3b8;font-size:11px">└ Basis</span>
      <input type="number" id="b-tax-basis" value="${config.buckets.taxable.startBasis}" min="0">
    </div>`;
  document.getElementById('b-trad').addEventListener('input', e => { config.buckets.traditional.startBalance = +e.target.value; runSim(); });
  document.getElementById('b-roth').addEventListener('input', e => { config.buckets.roth.startBalance = +e.target.value; runSim(); });
  document.getElementById('b-roth-basis').addEventListener('input', e => { config.buckets.roth.startBasis = +e.target.value; runSim(); });
  document.getElementById('b-tax-bal').addEventListener('input', e => { config.buckets.taxable.startBalance = +e.target.value; runSim(); });
  document.getElementById('b-tax-basis').addEventListener('input', e => { config.buckets.taxable.startBasis = +e.target.value; runSim(); });
}

function renderOrder() {
  const el = document.getElementById('ctrl-order');
  el.innerHTML = `<div class="section-label">Withdrawal Order</div>
    <ul class="order-list" id="order-list">
      ${config.withdrawalOrder.map((b, i) => `
        <li data-bucket="${b}">
          <span class="order-num">${i + 1}</span>
          <span class="bucket-dot ${BUCKET_DOT_CLASS[b]}"></span>
          <span class="order-name">${BUCKET_LABELS[b]}</span>
          <div class="order-btns">
            <button onclick="moveOrder(${i}, -1)" ${i===0?'disabled':''}>▲</button>
            <button onclick="moveOrder(${i},  1)" ${i===config.withdrawalOrder.length-1?'disabled':''}>▼</button>
          </div>
        </li>`).join('')}
    </ul>`;
}

function moveOrder(idx, dir) {
  const arr = config.withdrawalOrder;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  onConfigChange();
}

function renderContributions() {
  const el = document.getElementById('ctrl-contributions');
  const rows = config.contributionIntervals.map((ci, i) => `
    <div class="interval-row">
      <div class="interval-row-header">
        <span class="bucket-dot ${BUCKET_DOT_CLASS[ci.bucket]}"></span>
        <select class="interval-title" style="background:transparent;border:none;padding:0;font-size:12px;font-weight:600;color:#0f172a;width:auto;cursor:pointer" oninput="updateCI(${i},'bucket',this.value)">
          ${['traditional','roth','taxable'].map(b =>
            `<option value="${b}" ${ci.bucket===b?'selected':''}>${BUCKET_LABELS[b]}</option>`).join('')}
        </select>
        <button class="danger" onclick="removeCI(${i})">×</button>
      </div>
      <div class="interval-fields cols-4">
        <div class="interval-field"><label>From Age</label>${ageAnchorSelect(ci.startAge, `updateCI(${i},'startAge',__v)`)}</div>
        <div class="interval-field"><label>To Age</label>${ageAnchorSelect(ci.endAge, `updateCI(${i},'endAge',__v)`)}</div>
        <div class="interval-field"><label>$/Month</label><input type="number" value="${ci.monthly}" min="0" oninput="updateCI(${i},'monthly',+this.value)"></div>
        <div class="interval-field"><label>Rate %</label><input type="number" value="${(ci.annualRate*100).toFixed(2)}" min="0" max="30" step="0.1" oninput="updateCI(${i},'annualRate',+this.value/100)"></div>
      </div>
    </div>`).join('');
  el.innerHTML = `<div style="display:flex;align-items:center;margin-bottom:14px">
      <span class="section-label" style="margin-bottom:0">Contribution Intervals</span>
      <span class="phase-badge badge-acc">Accumulation</span>
    </div>
    <div id="ci-list">${rows}</div>
    <button class="add-interval" onclick="addCI()">+ Add Interval</button>`;
}

function updateCI(i, field, val) {
  config.contributionIntervals[i][field] = val;
  runSim();
}
function addCI() {
  config.contributionIntervals.push({ bucket: 'traditional', startAge: 'startAge', endAge: 'retirementAge', monthly: 500, annualRate: 0.07 });
  onConfigChange();
}
function removeCI(i) {
  config.contributionIntervals.splice(i, 1);
  onConfigChange();
}

function renderSpend() {
  const el = document.getElementById('ctrl-spend');
  const rows = config.spendIntervals.map((si, i) => `
    <div class="interval-row">
      <div class="interval-row-header">
        <span class="interval-title">Ages ${resolveAge(si.startAge)}–${resolveAge(si.endAge)}</span>
        <button class="danger" onclick="removeSI(${i})">×</button>
      </div>
      <div class="interval-fields cols-6" style="grid-template-columns:1fr 1fr 1fr 1fr 1fr 1fr">
        <div class="interval-field"><label>From Age</label>${ageAnchorSelect(si.startAge, `updateSI(${i},'startAge',__v)`)}</div>
        <div class="interval-field"><label>To Age</label>${ageAnchorSelect(si.endAge, `updateSI(${i},'endAge',__v)`)}</div>
        <div class="interval-field"><label>$/Month</label><input type="number" value="${si.monthlySpend}" min="0" oninput="updateSI(${i},'monthlySpend',+this.value)"></div>
        <div class="interval-field"><label style="color:#6366f1">Trad %</label><input type="number" value="${(si.rates.traditional*100).toFixed(2)}" min="0" max="30" step="0.1" oninput="updateSIRate(${i},'traditional',+this.value/100)"></div>
        <div class="interval-field"><label style="color:#10b981">Roth %</label><input type="number" value="${(si.rates.roth*100).toFixed(2)}" min="0" max="30" step="0.1" oninput="updateSIRate(${i},'roth',+this.value/100)"></div>
        <div class="interval-field"><label style="color:#f59e0b">Taxable %</label><input type="number" value="${(si.rates.taxable*100).toFixed(2)}" min="0" max="30" step="0.1" oninput="updateSIRate(${i},'taxable',+this.value/100)"></div>
      </div>
    </div>`).join('');
  el.innerHTML = `<div style="display:flex;align-items:center;margin-bottom:14px">
      <span class="section-label" style="margin-bottom:0">Spend Intervals</span>
      <span class="phase-badge badge-spend">Retirement</span>
    </div>
    <div id="si-list">${rows}</div>
    <button class="add-interval spend-variant" onclick="addSI()">+ Add Interval</button>`;
}

function updateSI(i, field, val) {
  config.spendIntervals[i][field] = val;
  runSim();
}
function updateSIRate(i, bucket, val) {
  config.spendIntervals[i].rates[bucket] = val;
  runSim();
}
function addSI() {
  config.spendIntervals.push({ startAge: 'retirementAge', endAge: 'endAge', monthlySpend: 8000, rates: { traditional: 0.04, roth: 0.05, taxable: 0.03 } });
  onConfigChange();
}
function removeSI(i) {
  config.spendIntervals.splice(i, 1);
  onConfigChange();
}

function renderSaveLoad() {
  document.getElementById('ctrl-saveload').innerHTML = `
    <div class="section-label">Save / Load</div>
    <div class="saveload-stack">
      <button onclick="saveConfig()">⬇ Download JSON</button>
      <button class="secondary" onclick="document.getElementById('file-input').click()">⬆ Upload JSON</button>
      <input type="file" id="file-input" accept=".json" style="display:none">
      <textarea id="paste-area" placeholder="Or paste JSON here…"></textarea>
      <button class="secondary" onclick="applyPasted()">Apply Pasted JSON</button>
    </div>`;
  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (loadConfigFromText(ev.target.result)) onConfigChange();
    };
    reader.readAsText(file);
  });
}

function applyPasted() {
  const text = document.getElementById('paste-area').value.trim();
  if (!text) return;
  if (loadConfigFromText(text)) onConfigChange();
}

// === RENDER OUTPUTS ===

let balanceChart = null;
let taxChart = null;

const BUCKET_COLORS = {
  traditional:  { bg: 'rgba(99,102,241,0.5)',   border: '#6366f1' },
  roth:         { bg: 'rgba(16,185,129,0.5)',    border: '#10b981' },
  'roth-basis': { bg: 'rgba(52,211,153,0.35)',   border: '#34d399' }, // lighter emerald — Roth basis sits inside Roth
  taxable:      { bg: 'rgba(245,158,11,0.5)',    border: '#f59e0b' },
};

function renderCharts(result) {
  const years = result.years;
  const labels = years.map(y => y.age);

  // --- Balance chart (stacked area) ---
  const balCtx = document.getElementById('chart-balance').getContext('2d');
  const retirementIdx = years.findIndex(y => y.age >= config.retirementAge);

  // Stack order: Traditional | Roth Basis | Roth Gains | Taxable
  // Roth is split: roth-basis = rothBasis, roth = bal.roth - rothBasis (gains only)
  const balDatasets = [
    {
      label: BUCKET_LABELS['traditional'],
      data: years.map(y => Math.round(y.balances.traditional)),
      backgroundColor: BUCKET_COLORS['traditional'].bg,
      borderColor: BUCKET_COLORS['traditional'].border,
      borderWidth: 1.5, fill: true, tension: 0.3,
    },
    {
      label: BUCKET_LABELS['roth-basis'],
      data: years.map(y => Math.round(Math.min(y.rothBasis, y.balances.roth))),
      backgroundColor: BUCKET_COLORS['roth-basis'].bg,
      borderColor: BUCKET_COLORS['roth-basis'].border,
      borderWidth: 1, fill: true, tension: 0.3,
    },
    {
      label: BUCKET_LABELS['roth'],
      data: years.map(y => Math.round(Math.max(0, y.balances.roth - y.rothBasis))),
      backgroundColor: BUCKET_COLORS['roth'].bg,
      borderColor: BUCKET_COLORS['roth'].border,
      borderWidth: 1.5, fill: true, tension: 0.3,
    },
    {
      label: BUCKET_LABELS['taxable'],
      data: years.map(y => Math.round(y.balances.taxable)),
      backgroundColor: BUCKET_COLORS['taxable'].bg,
      borderColor: BUCKET_COLORS['taxable'].border,
      borderWidth: 1.5, fill: true, tension: 0.3,
    },
  ];
  // Total balance as dashed line on top
  balDatasets.push({
    label: 'Total',
    data: years.map(y => Math.round(y.totalBalance)),
    backgroundColor: 'transparent',
    borderColor: '#374151',
    borderWidth: 2,
    borderDash: [5, 3],
    fill: false,
    tension: 0.3,
    pointRadius: 0,
  });

  // Build HTML legend for balance chart
  document.getElementById('legend-balance').innerHTML =
    ['traditional', 'roth-basis', 'roth', 'taxable'].map(b =>
      `<span><span class="legend-swatch" style="background:${BUCKET_COLORS[b].border}"></span>${BUCKET_LABELS[b]}</span>`
    ).join('') +
    `<span><span class="legend-line"></span>Total</span>`;

  if (balanceChart) balanceChart.destroy();
  balanceChart = new Chart(balCtx, {
    type: 'line',
    data: { labels, datasets: balDatasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        tooltip: { mode: 'index', intersect: false,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
        legend: { display: false },
      },
      scales: {
        x: { grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
        y: { stacked: true, grid: { color: '#f1f5f9' },
          ticks: { color: '#94a3b8', font: { size: 11 },
            callback: v => '$' + (v >= 1e6 ? (v/1e6).toFixed(1)+'M' : (v/1e3).toFixed(0)+'K') } },
      },
    },
    plugins: [{
      id: 'retireLine',
      afterDraw(chart) {
        if (retirementIdx < 0) return;
        const ctx = chart.ctx;
        const x = chart.scales.x.getPixelForValue(retirementIdx);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, chart.chartArea.top);
        ctx.lineTo(x, chart.chartArea.bottom);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.font = '600 11px Inter,system-ui,sans-serif';
        ctx.fillText('Retirement', x + 5, chart.chartArea.top + 14);
        ctx.restore();
      }
    }],
  });

  // --- Tax chart (stacked bar, retirement years only) ---
  const taxCtx = document.getElementById('chart-tax').getContext('2d');
  const retYears = years.filter(y => y.age > config.retirementAge);

  document.getElementById('legend-tax').innerHTML =
    `<span><span class="legend-swatch" style="background:#f43f5e"></span>Ordinary Income Tax</span>` +
    `<span><span class="legend-swatch" style="background:#f59e0b"></span>Capital Gains Tax</span>` +
    `<span><span class="legend-swatch" style="background:#f97316"></span>Early Withdrawal Penalty</span>`;

  if (taxChart) taxChart.destroy();
  taxChart = new Chart(taxCtx, {
    type: 'bar',
    data: {
      labels: retYears.map(y => y.age),
      datasets: [
        { label: 'Ordinary Income Tax',     data: retYears.map(y => Math.round(y.ordinaryTax)),  backgroundColor: 'rgba(244,63,94,0.75)'  },
        { label: 'Capital Gains Tax',        data: retYears.map(y => Math.round(y.capGainsTax)), backgroundColor: 'rgba(245,158,11,0.75)' },
        { label: 'Early Withdrawal Penalty', data: retYears.map(y => Math.round(y.penaltyTax)),  backgroundColor: 'rgba(249,115,22,0.75)' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        tooltip: { mode: 'index', intersect: false,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
        legend: { display: false },
      },
      scales: {
        x: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
        y: { stacked: true, grid: { color: '#f1f5f9' },
          ticks: { color: '#94a3b8', font: { size: 11 },
            callback: v => '$' + (v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v) } },
      }
    }
  });
}

function renderSummary(result) {
  const s = result.summary;
  document.getElementById('summary-grid').innerHTML = `
    <div class="summary-card">
      <div class="s-label">Peak Net Worth</div>
      <div class="s-val indigo">${fmt(s.peakNetWorth)}</div>
      <div class="s-sub">at age ${s.peakNetWorthAge}</div>
    </div>
    <div class="summary-card">
      <div class="s-label">Runs Out</div>
      <div class="s-val green">${s.ageMoneyRunsOut ?? 'Never'}</div>
      <div class="s-sub">within simulation</div>
    </div>
    <div class="summary-card">
      <div class="s-label">Lifetime Tax</div>
      <div class="s-val red">${fmt(s.totalLifetimeTax)}</div>
      <div class="s-sub">total federal</div>
    </div>
    <div class="summary-card">
      <div class="s-label">Ending Balance</div>
      <div class="s-val slate">${fmt(s.endingBalance)}</div>
      <div class="s-sub">at age ${config.endAge}</div>
    </div>
  `;
}

function renderTable(result) {
  const isRetireYear = y => y.age === config.retirementAge + 1;
  const isSpend = y => y.age > config.retirementAge;
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
  document.getElementById('detail-table').innerHTML = `
    <thead><tr>
      <th>Age</th><th>Traditional</th><th>Roth</th><th>Taxable</th><th>Total</th>
      <th>Withdrawn</th><th>Ord. Tax</th><th>CG Tax</th><th>Penalty</th><th>Total Tax</th><th>Net Spendable</th>
    </tr></thead>
    <tbody>${rows}</tbody>`;
}

// Select-all on focus for all number inputs so typing replaces the value immediately.
document.addEventListener('focusin', e => {
  if (e.target.type === 'number') e.target.select();
});

// === MAIN LOOP ===

// Validate + simulate + render outputs only (no control DOM rebuild).
// Used by value-change handlers so they don't steal focus mid-keystroke.
function runSim() {
  persistConfig();
  const { errors, warnings } = validateConfig(config);
  if (errors.length > 0) {
    showBanner('error', errors.join(' | '));
    return;
  }
  if (warnings.length > 0) {
    showBanner('warn', warnings.join(' | '));
  } else {
    showBanner(null, null);
  }

  const result = simulate(config);
  if (!result) return;
  renderCharts(result);
  renderSummary(result);
  renderTable(result);
}

// Full re-render of all controls + sim. Used when structure changes
// (add/remove interval, reorder, load config) where index rebinding is needed.
function onConfigChange() {
  renderGlobal();
  renderBuckets();
  renderOrder();
  renderContributions();
  renderSpend();
  renderSaveLoad();
  runSim();
}

// Initialize on load
onConfigChange();

