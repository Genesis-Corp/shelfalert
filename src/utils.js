// ============================================================================
// Ledgerline — utility functions: formatting, dates, AU tax, accounting, PDF
// ============================================================================

// ---- Number / currency formatting ----------------------------------------
const CURRENCY_SYMBOLS = {
  AUD: '$', USD: 'US$', EUR: '€', GBP: '£', NZD: 'NZ$', JPY: '¥',
  CAD: 'C$', SGD: 'S$', HKD: 'HK$', CNY: '¥', INR: '₹', CHF: 'CHF ',
};

// Display rates relative to AUD (1 AUD = X foreign). For demo only.
export const FX_RATES_TO_AUD = {
  AUD: 1,
  USD: 1.52,    // 1 USD = 1.52 AUD
  EUR: 1.65,
  GBP: 1.92,
  NZD: 0.91,
  JPY: 0.0102,
  CAD: 1.10,
  SGD: 1.13,
  HKD: 0.196,
  CNY: 0.213,
  INR: 0.0181,
  CHF: 1.71,
};

export function toAUD(amount, currency = 'AUD') {
  const rate = FX_RATES_TO_AUD[currency] ?? 1;
  return Number(amount) * rate;
}

export function fmtCurrency(amount, currency = 'AUD', opts = {}) {
  const n = Number(amount || 0);
  const symbol = CURRENCY_SYMBOLS[currency] ?? '';
  const minDp = opts.dp != null ? opts.dp : 2;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-AU', {
    minimumFractionDigits: minDp,
    maximumFractionDigits: minDp,
  });
  return `${sign}${symbol}${formatted}`;
}

export function fmtNumber(n, dp = 0) {
  return Number(n || 0).toLocaleString('en-AU', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function fmtPct(n, dp = 1) {
  return `${Number(n || 0).toFixed(dp)}%`;
}

export function fmtSigned(n, currency = 'AUD') {
  const sign = n > 0 ? '+' : '';
  return sign + fmtCurrency(n, currency);
}

// ---- Date helpers --------------------------------------------------------
export function todayISO() { return new Date().toISOString().slice(0, 10); }
export function nowISO()   { return new Date().toISOString(); }

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function daysBetween(a, b) {
  const ms = (new Date(b)) - (new Date(a));
  return Math.round(ms / 86400000);
}

export function addDays(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function startOfMonth(iso) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function endOfMonth(iso) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export function monthKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
}

// AU financial year: 1 July → 30 June. Returns the FY in which a date falls (e.g. 2025 = FY24/25)
export function fyOf(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 7 ? y + 1 : y;
}

export function fyLabel(fy) { return `FY${String(fy - 1).slice(2)}/${String(fy).slice(2)}`; }

export function fyStart(fy) { return `${fy - 1}-07-01`; }
export function fyEnd(fy)   { return `${fy}-06-30`; }

// ---- IDs ----------------------------------------------------------------
export function uid(prefix = '') {
  const r = Math.random().toString(36).slice(2, 9);
  const t = Date.now().toString(36).slice(-4);
  return `${prefix}${prefix ? '_' : ''}${t}${r}`;
}

// ---- AU tax calculations -------------------------------------------------
// Resident individual rates 2024–25 (does not include Medicare levy)
export const AU_TAX_BRACKETS_2024_25 = [
  { from: 0,      to: 18200,  rate: 0.00,  base: 0 },
  { from: 18200,  to: 45000,  rate: 0.16,  base: 0 },
  { from: 45000,  to: 135000, rate: 0.30,  base: 4288 },
  { from: 135000, to: 190000, rate: 0.37,  base: 31288 },
  { from: 190000, to: Infinity, rate: 0.45, base: 51638 },
];

export const MEDICARE_LEVY = 0.02;
export const COMPANY_TAX_SMALL = 0.25;   // base rate entity
export const COMPANY_TAX_FULL = 0.30;
export const SUPER_RATE = 0.115;         // 11.5% for 2024–25
export const GST_RATE = 0.10;
export const CONCESSIONAL_CAP = 30000;   // 2024–25
export const NON_CONCESSIONAL_CAP = 120000;
export const FBT_RATE = 0.47;
export const FBT_GROSS_UP_TYPE1 = 2.0802;
export const FBT_GROSS_UP_TYPE2 = 1.8868;

export function calcResidentTax(taxable) {
  let amount = Number(taxable || 0);
  if (amount <= 0) return 0;
  for (const b of AU_TAX_BRACKETS_2024_25) {
    if (amount <= b.to) return b.base + (amount - b.from) * b.rate;
  }
  const last = AU_TAX_BRACKETS_2024_25[AU_TAX_BRACKETS_2024_25.length - 1];
  return last.base + (amount - last.from) * last.rate;
}

export function calcMedicareLevy(taxable) {
  const amt = Number(taxable || 0);
  if (amt <= 24276) return 0;          // 2024–25 single threshold
  if (amt <= 30345) {
    return (amt - 24276) * 0.10;       // shade-in
  }
  return amt * MEDICARE_LEVY;
}

export function calcCompanyTax(taxable, smallBusiness = true) {
  const amt = Math.max(0, Number(taxable || 0));
  return amt * (smallBusiness ? COMPANY_TAX_SMALL : COMPANY_TAX_FULL);
}

export function calcMarginalRate(taxable) {
  const amt = Number(taxable || 0);
  for (const b of AU_TAX_BRACKETS_2024_25) {
    if (amt <= b.to) return b.rate;
  }
  return AU_TAX_BRACKETS_2024_25[AU_TAX_BRACKETS_2024_25.length - 1].rate;
}

// PAYG Withholding (simplified: weekly tax-free + brackets, no claim of free threshold = false case)
export function calcPAYG(grossWeekly, claimsTaxFree = true) {
  const annual = grossWeekly * 52;
  const annualTax = calcResidentTax(claimsTaxFree ? annual : annual + 18200);
  const weekly = annualTax / 52;
  return Math.max(0, Math.round(weekly * 100) / 100);
}

// Capital gains
export function calcCGT(proceeds, costBase, acquired, sold, isCompany = false) {
  const gain = Number(proceeds) - Number(costBase);
  if (gain <= 0) return { rawGain: gain, discount: 0, taxableGain: gain };
  const days = daysBetween(acquired, sold);
  const eligibleDiscount = days >= 365 && !isCompany;
  const discount = eligibleDiscount ? gain * 0.5 : 0;
  return { rawGain: gain, discount, taxableGain: gain - discount, eligibleDiscount };
}

// Depreciation
export function depreciatePrimeCost(cost, residual, lifeYears, monthsHeld = 12) {
  const annual = (cost - residual) / Math.max(0.0001, lifeYears);
  return annual * (monthsHeld / 12);
}
export function depreciateDiminishing(openingValue, lifeYears, monthsHeld = 12) {
  const rate = 2 / Math.max(0.0001, lifeYears); // 200% method
  return openingValue * rate * (monthsHeld / 12);
}

// FBT
export function calcFBT(grossUpValue, type1 = true) {
  const grossedUp = grossUpValue * (type1 ? FBT_GROSS_UP_TYPE1 : FBT_GROSS_UP_TYPE2);
  return { grossedUp, fbt: grossedUp * FBT_RATE };
}

// ---- Accounting --------------------------------------------------------
export const NORMAL_BALANCE = {
  asset: 'debit', expense: 'debit',
  liability: 'credit', equity: 'credit', revenue: 'credit',
};

export function isJournalBalanced(lines) {
  const dr = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const cr = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  return Math.abs(dr - cr) < 0.005;
}

export function sumDebit(lines) { return lines.reduce((s, l) => s + Number(l.debit || 0), 0); }
export function sumCredit(lines) { return lines.reduce((s, l) => s + Number(l.credit || 0), 0); }

// Compute account balance from journal entries (only posted)
export function accountBalance(accountId, type, journalEntries) {
  let dr = 0, cr = 0;
  for (const j of journalEntries) {
    if (j.status !== 'posted') continue;
    for (const l of j.lines) {
      if (l.accountId !== accountId) continue;
      dr += Number(l.debit || 0);
      cr += Number(l.credit || 0);
    }
  }
  const normal = NORMAL_BALANCE[type];
  return normal === 'debit' ? dr - cr : cr - dr;
}

// Trial balance from journal entries
export function trialBalance(accounts, journalEntries) {
  const map = {};
  for (const a of accounts) map[a.id] = { account: a, debit: 0, credit: 0 };
  for (const j of journalEntries) {
    if (j.status !== 'posted') continue;
    for (const l of j.lines) {
      if (!map[l.accountId]) continue;
      map[l.accountId].debit  += Number(l.debit  || 0);
      map[l.accountId].credit += Number(l.credit || 0);
    }
  }
  return Object.values(map);
}

// ---- Loan amortisation / debt payoff ----------------------------------
// Compute payoff timeline given list of debts and monthly extra budget,
// using avalanche (highest APR first) or snowball (smallest balance first).
export function payoffPlan(debts, extra = 0, strategy = 'avalanche') {
  const work = debts.map(d => ({ ...d, balance: Number(d.balance), apr: Number(d.apr), min: Number(d.min) }));
  const timeline = [];
  let month = 0;
  let totalInterest = 0;

  while (work.some(d => d.balance > 0.01) && month < 600) {
    month++;
    let snapshot = { month };
    let extraLeft = extra;

    // Sort active debts by strategy (avalanche: highest APR; snowball: smallest balance)
    const order = work
      .map((d, i) => ({ d, i }))
      .filter(x => x.d.balance > 0.01)
      .sort((a, b) => strategy === 'avalanche'
        ? b.d.apr - a.d.apr
        : a.d.balance - b.d.balance);

    // Apply min payments first (interest then principal)
    for (const { d } of order) {
      const interest = d.balance * (d.apr / 12);
      totalInterest += interest;
      const minPay = Math.min(d.min, d.balance + interest);
      const principal = Math.max(0, minPay - interest);
      d.balance = Math.max(0, d.balance + interest - minPay);
      snapshot[d.id] = d.balance;
    }

    // Apply extra to top priority debt
    for (const { d } of order) {
      if (extraLeft <= 0) break;
      const pay = Math.min(extraLeft, d.balance);
      d.balance -= pay;
      extraLeft -= pay;
      snapshot[d.id] = d.balance;
    }

    timeline.push(snapshot);
  }
  return { months: month, totalInterest, timeline };
}

// ---- CSV import --------------------------------------------------------
export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length === 0) return [];
  const head = lines[0].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const cells = parseCSVLine(line);
    const row = {};
    head.forEach((h, i) => row[h] = (cells[i] ?? '').trim());
    return row;
  });
}

function parseCSVLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// ---- Print to PDF -----------------------------------------------------
// Show a printable-only view, trigger native print dialogue (user can save as PDF)
export function printPDF(title) {
  const oldTitle = document.title;
  if (title) document.title = title;
  window.print();
  setTimeout(() => { document.title = oldTitle; }, 1000);
}

// ---- Misc helpers -----------------------------------------------------
export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export function groupBy(arr, fn) {
  return arr.reduce((acc, item) => {
    const k = fn(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

export function sumBy(arr, fn) { return arr.reduce((s, x) => s + Number(fn(x) || 0), 0); }

// Compute aging buckets for AP/AR
export function agingBuckets(items, asOf = todayISO()) {
  const buckets = { current: 0, '30': 0, '60': 0, '90+': 0 };
  for (const it of items) {
    if (it.status === 'paid') continue;
    const owed = Number(it.amount) - Number(it.paid || 0);
    if (owed <= 0) continue;
    const days = daysBetween(it.dueDate, asOf);
    if (days <= 0) buckets.current += owed;
    else if (days <= 30) buckets['30'] += owed;
    else if (days <= 60) buckets['60'] += owed;
    else buckets['90+'] += owed;
  }
  return buckets;
}

// Score band for credit
export function creditBand(score) {
  if (score >= 833) return { label: 'Excellent', color: 'green' };
  if (score >= 726) return { label: 'Very good', color: 'green' };
  if (score >= 622) return { label: 'Good', color: 'blue' };
  if (score >= 510) return { label: 'Average', color: 'amber' };
  return { label: 'Below average', color: 'red' };
}
