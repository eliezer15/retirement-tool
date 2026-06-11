# UI Restyling — Clean & Light (Option B)

**Date:** 2026-06-11  
**Status:** Approved  
**Scope:** CSS and HTML structure only. No JS logic changes.

---

## Summary

Replace the current utilitarian styling with a modern "Clean & Light" design system. All existing functionality (charts, tooltips, table, save/load, intervals, validation banner) is preserved exactly. Only the visual presentation changes.

---

## Design System

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| Page background | `#f1f5f9` (slate-100) | Body background |
| Card background | `#ffffff` | All card surfaces |
| Card border | `#f1f5f9` | 1px border on cards |
| Card shadow | `0 1px 3px rgba(0,0,0,.06)` | Subtle elevation |
| Primary accent | `#6366f1` (indigo-500) | Primary button, active inputs, highlight values |
| Primary light | `#eef2ff` / `#c7d2fe` | Active input bg / border |
| Text primary | `#0f172a` (slate-900) | Main text, numbers |
| Text secondary | `#475569` (slate-600) | Body text, table cells |
| Text muted | `#94a3b8` (slate-400) | Labels, placeholders, axis text |
| Success green | `#10b981` | "Never runs out", net spendable |
| Danger red | `#f43f5e` | Tax amounts, error banner |
| Amber | `#f59e0b` | Cap gains tax, Taxable bucket dot |
| Section label | `#64748b` (slate-500) | Uppercase section headers |

### Bucket accent colors (dots + chart)
- Traditional: `#6366f1` (indigo)
- Roth: `#10b981` (emerald)
- Taxable: `#f59e0b` (amber)

### Typography
- Font: `'Inter', system-ui, sans-serif` — load Inter from Google Fonts CDN
- Page title: 15px, weight 700, slate-900
- Section headers: 11px, weight 600, slate-500, uppercase, letter-spacing .07em
- Card h2: 14px, weight 600, slate-900 (chart/table titles)
- Input values: 13px, weight 600
- Table body: 12px

### Shape
- Card border-radius: `12px`
- Input border-radius: `8px`
- Button border-radius: `8px`
- Interval row border-radius: `8px`
- Badge/pill border-radius: `20px`

---

## Layout (top to bottom, full width)

1. **App header bar** — logo icon (gradient pill) + app name + subtitle + Save/Load buttons (right-aligned)
2. **Global Settings card** — single row, 3 inputs (Start Age, Retirement Age, End Age). Retirement Age input gets indigo highlight (bg + border) to stand out.
3. **3-column row**: Starting Balances card | Withdrawal Order card | Save/Load card
4. **2-column row**: Contribution Intervals card | Spend Intervals card
5. **Summary strip** — 4 stat cards full width (Peak Net Worth, Runs Out, Lifetime Tax, Ending Balance)
6. **Portfolio Balance chart** — full width, tall (320px), with title + legend header, age axis labels below
7. **Annual Tax Breakdown chart** — full width (220px), with title + legend header, age axis labels below
8. **Year-by-Year Detail table** — full width, with title

All validation banner styling updated (same error/warn logic, new colors).

---

## Component Details

### App Header
```
[gradient icon] Retirement Visualizer        [Save ↓] [Load ↑]
                2026 MFJ Tax Model
```
Icon: 32px rounded square, `linear-gradient(135deg, #6366f1, #8b5cf6)`, 💰 emoji.  
Save button: white bg, slate border — secondary style.  
Load button: indigo bg, white text — primary style.

### Inputs
- Default state: bg `#f8fafc`, border `1px solid #e2e8f0`
- Focus state: bg `#eef2ff`, border `1.5px solid #c7d2fe` (indigo tint)
- All `number` inputs select-all on focus (already implemented)

### Bucket color dots
Each bucket row in the Balances card and Withdrawal Order card shows a colored dot (8px circle) using the bucket's accent color.

### Withdrawal Order rows
Each row: numbered badge (gray) + color dot + bucket name + ▲▼ buttons. Row bg `#f8fafc`, border-radius `8px`.

### Interval rows
Interval rows use `#f8fafc` background + `1px solid #e2e8f0` border, `8px` radius. Bucket name shown with color dot. Fields in a 4-column grid (contribution) or labeled grid (spend). Remove button is a plain `×` in red.

"Add Interval" buttons use a dashed border in the bucket's accent color (indigo for contributions, pink for spend).

### Section badges
- Accumulation: `#dbeafe` bg, `#1d4ed8` text
- Retirement: `#fce7f3` bg, `#9d174d` text

### Summary stat cards
Large number (26px, weight 700) in accent color, small uppercase label above, small muted subtitle below.
- Peak Net Worth: indigo `#6366f1`
- Runs Out: green `#10b981`
- Lifetime Tax: red `#f43f5e`
- Ending Balance: slate `#0f172a`

### Charts
Chart title (14px, weight 600) + legend (11px, muted) in a flex row above each chart. Chart background `linear-gradient(to bottom, #f8fafc, #f1f5f9)` inside the canvas wrapper. Age axis labels below chart as a flex row of small muted text.

Chart.js dataset colors:
- Traditional: bg `rgba(99,102,241,0.5)`, border `#6366f1`
- Roth: bg `rgba(16,185,129,0.5)`, border `#10b981`
- Taxable: bg `rgba(245,158,11,0.5)`, border `#f59e0b`
- Total line: `#374151`, dashed
- Ordinary tax bars: `rgba(244,63,94,0.75)`
- Cap gains bars: `rgba(245,158,11,0.75)`

### Table
Uppercase column headers (10px, slate-500, letter-spacing .05em). Alternating row bg (`#fafafa` on even). Retirement year row gets indigo age cell. Tax columns red, net spendable green. `—` for zero/accumulation years.

### Validation banner
- Error: `#fee2e2` bg, `#991b1b` text (unchanged)
- Warning: `#fef9c3` bg, `#854d0e` text (unchanged)
- Both get `border-radius: 8px`

---

## What Does NOT Change

- All JS logic (simulation engine, tax math, save/load, validation, localStorage)
- Chart.js hover tooltips (already show all bucket values)
- All HTML element IDs and data attributes
- The `runSim()` / `onConfigChange()` split
- Select-all-on-focus behavior
