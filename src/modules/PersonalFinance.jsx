// ============================================================================
// Ledgerline — Personal Finance module
// ============================================================================
import React, { useMemo, useState } from 'react';
import { useStore, useCanWrite } from '../store';
import {
  fmtCurrency, fmtDate, fmtSigned, fmtPct, toAUD, monthKey, monthLabel, fyOf, fyStart, fyEnd,
  todayISO, sumBy, payoffPlan, creditBand, parseCSV, addDays,
} from '../utils';
import { Kpi, BarChart, DonutChart, LineChart, WaterfallChart, Modal, toast, Sparkline } from '../components';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'accounts', label: 'Accounts & Cards' },
  { id: 'budget',   label: 'Budget' },
  { id: 'debt',     label: 'Debt Payoff' },
  { id: 'credit',   label: 'Credit Scores' },
];

export default function PersonalModule() {
  const [tab, setTab] = useState('overview');
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Personal Finance</h1>
          <div className="page-sub">Your day-to-day money: budgets, accounts, debt and credit health</div>
        </div>
      </div>
      <div className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'budget'   && <Budget />}
      {tab === 'debt'     && <Debt />}
      {tab === 'credit'   && <Credit />}
    </div>
  );
}

// ---------- Overview ------------
function Overview() {
  const { state } = useStore();
  const today = todayISO();
  const fy = fyOf(today);
  const fStart = fyStart(fy);
  const fEnd   = fyEnd(fy);

  const ytd = state.transactions.filter(t => t.date >= fStart && t.date <= fEnd);
  const ytdIncome  = sumBy(ytd.filter(t => t.amount > 0), t => t.amount);
  const ytdExpense = sumBy(ytd.filter(t => t.amount < 0), t => -t.amount);

  // Approx YTD tax withheld: sum of payRuns YTD
  const ytdTaxWithheld = state.payRuns.flatMap(r => r.payslips).reduce((s, p) => s + p.paygWithheld, 0);

  const netWorth = state.accounts.reduce((s, a) => s + toAUD(a.balance, a.currency), 0)
    - state.debts.filter(d => d.type !== 'credit').reduce((s, d) => s + d.balance, 0);

  const totalDebt = state.debts.reduce((s, d) => s + d.balance, 0);
  const dti = ytdIncome > 0 ? totalDebt / ytdIncome : 0;
  const savingsRate = ytdIncome > 0 ? ((ytdIncome - ytdExpense) / ytdIncome) * 100 : 0;

  // 12-month income vs expense bars
  const months = [];
  for (let m = 11; m >= 0; m--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - m);
    const mk = d.toISOString().slice(0, 7);
    const mTx = state.transactions.filter(t => t.date.startsWith(mk));
    months.push({
      label: monthLabel(mk),
      value: sumBy(mTx.filter(t => t.amount > 0), t => t.amount),
      value2: sumBy(mTx.filter(t => t.amount < 0), t => -t.amount),
    });
  }

  // 90-day cash flow forecast based on recurring rules + average daily net
  const recent60 = state.transactions.filter(t => t.date >= addDays(today, -60));
  const avgDailyNet = sumBy(recent60, t => t.amount) / 60;
  const startCash = state.accounts.filter(a => ['bank', 'savings'].includes(a.type)).reduce((s, a) => s + toAUD(a.balance, a.currency), 0);
  const forecastSeries = [];
  let cash = startCash;
  const labels = [];
  for (let d = 0; d <= 90; d++) {
    const dateISO = addDays(today, d);
    let extra = 0;
    for (const r of state.recurring) {
      const rd = new Date(r.nextDate);
      const fd = new Date(dateISO);
      const dayDiff = Math.round((fd - rd) / 86400000);
      if (r.freq === 'fortnightly' && dayDiff >= 0 && dayDiff % 14 === 0) extra += r.amount;
      else if (r.freq === 'monthly' && rd.getDate() === fd.getDate() && dateISO >= r.nextDate) extra += r.amount;
      else if (r.freq === 'weekly' && dayDiff >= 0 && dayDiff % 7 === 0) extra += r.amount;
    }
    cash += avgDailyNet + extra;
    forecastSeries.push(cash);
    if (d % 15 === 0) labels.push(`+${d}d`); else labels.push('');
  }

  // Cash flow waterfall (last 30 days)
  const last30 = state.transactions.filter(t => t.date >= addDays(today, -30));
  const opening = startCash - sumBy(last30, t => t.amount);
  const incomeWf = sumBy(last30.filter(t => t.amount > 0), t => t.amount);
  const expenseWf = sumBy(last30.filter(t => t.amount < 0), t => t.amount);
  const wfData = [
    { label: 'Opening', kind: 'total', value: opening },
    { label: 'Income',  value: incomeWf },
    { label: 'Expense', value: expenseWf },
    { label: 'Closing', kind: 'total', value: opening + incomeWf + expenseWf },
  ];

  return (
    <div>
      <div className="grid grid-4 mb-4">
        <Kpi label="YTD income"  value={fmtCurrency(ytdIncome, 'AUD')} sub={`from 1 Jul`} trend="up" />
        <Kpi label="YTD expenses" value={fmtCurrency(ytdExpense, 'AUD')} sub="all categories" />
        <Kpi label="YTD tax withheld" value={fmtCurrency(ytdTaxWithheld, 'AUD')} sub="from payslips" />
        <Kpi label="Savings rate"  value={fmtPct(savingsRate, 1)} sub={savingsRate >= 15 ? 'healthy' : 'below 15% target'} trend={savingsRate >= 15 ? 'up' : 'down'} />
      </div>

      <div className="grid grid-3 mb-4">
        <Kpi label="Net worth"    value={fmtCurrency(netWorth, 'AUD')} />
        <Kpi label="Total debt"   value={fmtCurrency(totalDebt, 'AUD')} sub={`across ${state.debts.length} debts`} />
        <Kpi label="Debt-to-income" value={(dti * 100).toFixed(0) + '%'} sub={dti < 0.4 ? 'below 40% threshold' : 'high — review debts'} trend={dti < 0.4 ? 'up' : 'down'} />
      </div>

      <div className="grid grid-2 mb-4">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Income vs expense — last 12 months</h3></div>
          <div className="card-body">
            <BarChart data={months} colors={['#0c8a5b', '#b3261e']} legend={['Income', 'Expense']} />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Cash flow waterfall — last 30 days</h3></div>
          <div className="card-body">
            <WaterfallChart data={wfData} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">90-day cash flow forecast</h3><span className="muted">based on recurring rules + 60-day average</span></div>
        <div className="card-body">
          <LineChart series={[{ name: 'Cash', values: forecastSeries }]} labels={labels} fill />
        </div>
      </div>
    </div>
  );
}

// ---------- Accounts & Cards ------------
function Accounts() {
  const { state, add, update, remove, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState({});
  const [csvOpen, setCsvOpen] = useState(false);

  const startNew = () => { setEdit(null); setDraft({ name: '', type: 'bank', currency: 'AUD', balance: 0, institution: '' }); setOpen(true); };
  const startEdit = (a) => { setEdit(a); setDraft(a); setOpen(true); };
  const save = () => {
    if (!draft.name) return toast('Name required', 'error');
    if (edit) { update('accounts', edit.id, draft); audit('updated', 'Account', `Updated ${draft.name}`, edit.id); toast('Account updated', 'success'); }
    else { const it = add('accounts', { ...draft, lastSynced: todayISO(), balance: Number(draft.balance) }); audit('created', 'Account', `Added ${draft.name}`, it.id); toast('Account added', 'success'); }
    setOpen(false);
  };

  // Net worth by type
  const byType = {};
  for (const a of state.accounts) {
    byType[a.type] = (byType[a.type] || 0) + toAUD(a.balance, a.currency);
  }
  const slices = Object.entries(byType).map(([k, v]) => ({ label: capitalise(k), value: v }));

  // Sync simulation
  const syncOne = (a) => { update('accounts', a.id, { lastSynced: todayISO() }); toast(`${a.name} synced`, 'success'); };

  return (
    <div>
      <div className="grid grid-3 mb-4">
        <Kpi label="Accounts" value={String(state.accounts.length)} sub={`${state.accounts.filter(a => a.balance >= 0).length} positive`} />
        <Kpi label="Cash + Savings" value={fmtCurrency(state.accounts.filter(a => ['bank','savings'].includes(a.type)).reduce((s,a) => s + toAUD(a.balance, a.currency), 0), 'AUD')} />
        <Kpi label="Investments" value={fmtCurrency(state.accounts.filter(a => ['investment','crypto','super'].includes(a.type)).reduce((s,a) => s + toAUD(a.balance, a.currency), 0), 'AUD')} />
      </div>

      <div className="grid grid-2 mb-4">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Net worth by account type</h3></div>
          <div className="card-body">
            <DonutChart slices={slices} />
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Imports & sync</h3>
          </div>
          <div className="card-body">
            <p className="muted" style={{ fontSize: '0.9em', marginTop: 0 }}>Connect via Open Banking (mocked) or import a CSV bank statement (Date, Description, Amount columns).</p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => { state.accounts.forEach(a => update('accounts', a.id, { lastSynced: todayISO() })); toast('All accounts synced', 'success'); }}>Sync all</button>
              <button className="btn btn-primary" onClick={() => setCsvOpen(true)}>Import CSV</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Accounts</h3>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ Add account</button>}
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Name</th><th>Type</th><th>Institution</th><th>Currency</th><th className="right">Balance</th><th className="right">Balance (AUD)</th><th>Last synced</th><th></th></tr></thead>
            <tbody>
              {state.accounts.map(a => (
                <tr key={a.id}>
                  <td><b>{a.name}</b></td>
                  <td><span className="pill">{capitalise(a.type)}</span></td>
                  <td>{a.institution}</td>
                  <td>{a.currency}</td>
                  <td className={`num ${a.balance >= 0 ? '' : 'neg'}`}>{fmtCurrency(a.balance, a.currency)}</td>
                  <td className="num">{fmtCurrency(toAUD(a.balance, a.currency), 'AUD')}</td>
                  <td>{fmtDate(a.lastSynced)}</td>
                  <td className="right">
                    <button className="btn btn-ghost btn-sm" onClick={() => syncOne(a)}>Sync</button>
                    {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => startEdit(a)}>Edit</button>}
                    {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Delete ${a.name}?`)) { remove('accounts', a.id); toast('Deleted'); } }}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Edit account' : 'Add account'} footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field"><label className="field-label">Name</label><input className="input" value={draft.name || ''} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label className="field-label">Type</label>
              <select className="input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                <option value="bank">Bank</option><option value="savings">Savings</option>
                <option value="credit">Credit Card</option><option value="investment">Investment</option>
                <option value="crypto">Crypto</option><option value="super">Superannuation</option>
              </select>
            </div>
            <div className="field"><label className="field-label">Currency</label>
              <select className="input" value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value })}>
                {['AUD','USD','NZD','GBP','EUR','JPY','CAD','SGD','HKD','CNY','INR','CHF'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label className="field-label">Institution</label><input className="input" value={draft.institution || ''} onChange={e => setDraft({ ...draft, institution: e.target.value })} /></div>
            <div className="field"><label className="field-label">Opening balance</label><input className="input" type="number" step="0.01" value={draft.balance ?? 0} onChange={e => setDraft({ ...draft, balance: e.target.value })} /></div>
          </div>
        </div>
      </Modal>

      <CsvImportModal open={csvOpen} onClose={() => setCsvOpen(false)} />
    </div>
  );
}

function CsvImportModal({ open, onClose }) {
  const { state, add, audit } = useStore();
  const [text, setText] = useState('');
  const [accountId, setAccountId] = useState(state.accounts[0]?.id);

  const importNow = () => {
    const rows = parseCSV(text);
    if (!rows.length) return toast('No rows parsed', 'error');
    let count = 0;
    for (const r of rows) {
      const dateRaw = r.Date || r.date || r.DATE || r['Posted Date'] || '';
      const desc = r.Description || r.description || r.Payee || r.Memo || '';
      const amt = Number(r.Amount || r.amount || r.AMOUNT || 0);
      if (!desc || !amt) continue;
      const dateISO = parseDate(dateRaw) || todayISO();
      add('transactions', {
        accountId, date: dateISO, payee: desc, amount: amt,
        category: amt > 0 ? 'cat_other_inc' : 'cat_other_exp',
        memo: 'CSV import', reconciled: false, gst: 0,
      });
      count++;
    }
    audit('imported', 'Transaction', `Imported ${count} CSV rows`);
    toast(`Imported ${count} transactions`, 'success');
    setText('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Import CSV" size="lg" footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={importNow}>Import</button>
      </>
    }>
      <div className="field">
        <label className="field-label">Target account</label>
        <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
          {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="field mt-3">
        <label className="field-label">CSV (header row required: Date, Description, Amount)</label>
        <textarea className="input" rows={12} placeholder="Date,Description,Amount&#10;2025-04-12,Coles Supermarkets,-65.40&#10;2025-04-13,Acme Corp Salary,3850.00" value={text} onChange={e => setText(e.target.value)} />
      </div>
    </Modal>
  );
}

function parseDate(s) {
  if (!s) return null;
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${yr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ---------- Budget ------------
function Budget() {
  const { state, setBudget } = useStore();
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const expCats = state.categories.filter(c => c.kind === 'expense');
  const budget = state.budgets[month] || {};

  const actuals = useMemo(() => {
    const map = {};
    for (const t of state.transactions) {
      if (!t.date.startsWith(month)) continue;
      if (t.amount >= 0) continue;
      map[t.category] = (map[t.category] || 0) + (-t.amount);
    }
    return map;
  }, [state.transactions, month]);

  const totalBudget = Object.values(budget).reduce((s, x) => s + Number(x || 0), 0);
  const totalActual = Object.values(actuals).reduce((s, x) => s + x, 0);

  const setCat = (catId, val) => {
    setBudget(month, { ...budget, [catId]: Number(val) });
  };

  // Donut
  const slices = expCats.map(c => ({ label: c.name, value: actuals[c.id] || 0 }))
    .filter(s => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const months = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(today + 'T00:00:00');
    d.setMonth(d.getMonth() + i);
    months.push(d.toISOString().slice(0, 7));
  }

  return (
    <div>
      <div className="grid grid-3 mb-4">
        <div className="kpi">
          <div className="kpi-label">Month</div>
          <select className="input" style={{ marginTop: 4 }} value={month} onChange={e => setMonth(e.target.value)}>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <Kpi label="Total budget" value={fmtCurrency(totalBudget, 'AUD')} sub={`${expCats.length} categories`} />
        <Kpi
          label="Total spent"
          value={fmtCurrency(totalActual, 'AUD')}
          sub={`${fmtPct(totalBudget ? (totalActual / totalBudget) * 100 : 0)} of budget`}
          trend={totalActual <= totalBudget ? 'up' : 'down'}
        />
      </div>

      <div className="grid grid-2 mb-4">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Categories</h3></div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Category</th><th className="right">Budget</th><th className="right">Actual</th><th className="right">Diff</th><th>Progress</th></tr></thead>
              <tbody>
                {expCats.map(c => {
                  const b = Number(budget[c.id] || 0);
                  const a = Number(actuals[c.id] || 0);
                  const diff = b - a;
                  const pct = b > 0 ? Math.min(150, (a / b) * 100) : 0;
                  const over = a > b && b > 0;
                  return (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="num">
                        <input className="input num" style={{ width: 90, padding: '3px 6px' }} type="number" step="10"
                          value={b || ''} placeholder="0"
                          onChange={e => setCat(c.id, e.target.value)} />
                      </td>
                      <td className="num">{fmtCurrency(a, 'AUD')}</td>
                      <td className={`num ${diff >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(diff, 'AUD')}</td>
                      <td>
                        <div className={`progress ${over ? 'over' : ''}`}>
                          <div style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <div className="muted" style={{ fontSize: '0.75em', textAlign: 'right' }}>{fmtPct(pct, 0)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td>Total</td>
                  <td className="num">{fmtCurrency(totalBudget, 'AUD')}</td>
                  <td className="num">{fmtCurrency(totalActual, 'AUD')}</td>
                  <td className={`num ${(totalBudget - totalActual) >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(totalBudget - totalActual, 'AUD')}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Spend mix</h3></div>
          <div className="card-body">
            {slices.length === 0 ? <div className="empty">No spending yet this month</div> : <DonutChart slices={slices} />}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">Rollover</h3></div>
        <div className="card-body">
          <p className="muted" style={{ marginTop: 0, fontSize: '0.92em' }}>Click below to roll unspent budget into next month — categories where you spent less will have the surplus added to the following month's budget.</p>
          <button className="btn btn-primary" onClick={() => {
            const nxt = (() => { const d = new Date(month + '-01'); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7); })();
            const cur = state.budgets[nxt] || {};
            const merged = { ...cur };
            for (const c of expCats) {
              const b = Number(budget[c.id] || 0);
              const a = Number(actuals[c.id] || 0);
              const surplus = Math.max(0, b - a);
              if (surplus > 0) merged[c.id] = (Number(cur[c.id] || b)) + surplus;
            }
            setBudget(nxt, merged);
            toast(`Rolled surplus into ${monthLabel(nxt)}`, 'success');
          }}>Roll over surplus to next month</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Debt Payoff ------------
function Debt() {
  const { state, add, update, remove, audit } = useStore();
  const canWrite = useCanWrite();
  const [strategy, setStrategy] = useState('avalanche');
  const [extra, setExtra] = useState(500);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', balance: 0, apr: 0, min: 0, type: 'credit' });

  const planA = useMemo(() => payoffPlan(state.debts, Number(extra), 'avalanche'), [state.debts, extra]);
  const planS = useMemo(() => payoffPlan(state.debts, Number(extra), 'snowball'),  [state.debts, extra]);
  const plan  = strategy === 'avalanche' ? planA : planS;

  const interestSaved = Math.max(0, planS.totalInterest - planA.totalInterest);

  const total = sumBy(state.debts, d => d.balance);
  const minSum = sumBy(state.debts, d => d.min);

  // Build month-by-month chart (per-debt stacks summed)
  const labels = [];
  const series = state.debts.map(d => ({ name: d.name, values: [] }));
  const maxMonths = Math.min(plan.timeline.length, 96);
  for (let i = 0; i < maxMonths; i++) {
    const snap = plan.timeline[i];
    labels.push(`m${i + 1}`);
    for (const s of series) {
      const d = state.debts.find(x => x.name === s.name);
      s.values.push(snap[d.id] ?? 0);
    }
  }
  const totalLine = [];
  for (let i = 0; i < maxMonths; i++) {
    let t = 0;
    for (const s of series) t += s.values[i];
    totalLine.push(t);
  }

  const save = () => {
    if (!draft.name) return toast('Name required', 'error');
    const d = { ...draft, balance: Number(draft.balance), apr: Number(draft.apr) / 100, min: Number(draft.min) };
    add('debts', d);
    audit('created', 'Debt', `Added ${draft.name}`);
    toast('Debt added', 'success');
    setOpen(false);
    setDraft({ name: '', balance: 0, apr: 0, min: 0, type: 'credit' });
  };

  return (
    <div>
      <div className="grid grid-4 mb-4">
        <Kpi label="Total debt" value={fmtCurrency(total, 'AUD')} sub={`${state.debts.length} debts`} />
        <Kpi label="Sum of minimums" value={fmtCurrency(minSum, 'AUD')} sub="per month" />
        <Kpi label="Avalanche payoff" value={`${planA.months} mo`} sub={`Interest ${fmtCurrency(planA.totalInterest, 'AUD')}`} />
        <Kpi label="Interest saved vs. snowball" value={fmtCurrency(interestSaved, 'AUD')} sub="picking avalanche" trend="up" />
      </div>

      <div className="card mb-4">
        <div className="card-header"><h3 className="card-title">Strategy</h3></div>
        <div className="card-body">
          <div className="row wrap">
            <label className="row" style={{ gap: 6 }}>
              <input type="radio" name="strat" checked={strategy === 'avalanche'} onChange={() => setStrategy('avalanche')} />
              Avalanche (highest APR first)
            </label>
            <label className="row" style={{ gap: 6 }}>
              <input type="radio" name="strat" checked={strategy === 'snowball'} onChange={() => setStrategy('snowball')} />
              Snowball (smallest balance first)
            </label>
            <div className="spacer" />
            <label className="row"><span style={{ fontSize: '0.9em' }}>Extra payment / month</span>
              <input className="input" style={{ width: 100 }} type="number" step="50" value={extra} onChange={e => setExtra(e.target.value)} />
            </label>
          </div>
          <div className="muted mt-2" style={{ fontSize: '0.9em' }}>
            With <b>{strategy}</b> @ {fmtCurrency(extra, 'AUD')}/mo extra: payoff in <b>{plan.months}</b> months,
            total interest <b>{fmtCurrency(plan.totalInterest, 'AUD')}</b>.
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><h3 className="card-title">Payoff timeline</h3></div>
        <div className="card-body">
          <LineChart series={[{ name: 'Total balance', values: totalLine }]} labels={labels} fill />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Debts</h3>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>+ Add debt</button>}
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Name</th><th>Type</th><th className="right">Balance</th><th className="right">APR</th><th className="right">Min payment</th><th></th></tr></thead>
            <tbody>
              {state.debts.map(d => (
                <tr key={d.id}>
                  <td><b>{d.name}</b></td>
                  <td><span className="pill">{d.type}</span></td>
                  <td className="num">{fmtCurrency(d.balance, 'AUD')}</td>
                  <td className="num">{(d.apr * 100).toFixed(2)}%</td>
                  <td className="num">{fmtCurrency(d.min, 'AUD')}</td>
                  <td className="right">
                    {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Delete ${d.name}?`)) { remove('debts', d.id); toast('Deleted'); } }}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add debt" footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field"><label className="field-label">Name</label><input className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label className="field-label">Type</label>
              <select className="input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                <option value="credit">Credit card</option><option value="mortgage">Mortgage</option>
                <option value="auto">Auto loan</option><option value="personal">Personal loan</option>
                <option value="student">Student / HECS</option>
              </select>
            </div>
            <div className="field"><label className="field-label">Balance</label><input className="input" type="number" step="0.01" value={draft.balance} onChange={e => setDraft({ ...draft, balance: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label className="field-label">APR (%)</label><input className="input" type="number" step="0.01" value={draft.apr} onChange={e => setDraft({ ...draft, apr: e.target.value })} /></div>
            <div className="field"><label className="field-label">Min payment</label><input className="input" type="number" step="0.01" value={draft.min} onChange={e => setDraft({ ...draft, min: e.target.value })} /></div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------- Credit Scores ------------
function Credit() {
  const { state, add, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ bureau: 'Equifax', score: 720, date: todayISO() });

  const bureaus = [...new Set(state.creditScores.map(s => s.bureau))];

  const seriesByBureau = bureaus.map(b => {
    const items = state.creditScores.filter(s => s.bureau === b).sort((a, b) => a.date.localeCompare(b.date));
    return { name: b, values: items.map(i => i.score), labels: items.map(i => i.date.slice(2, 7)) };
  });
  const labels = seriesByBureau[0]?.labels || [];

  const latestByBureau = bureaus.map(b => {
    const items = state.creditScores.filter(s => s.bureau === b).sort((a, b) => b.date.localeCompare(a.date));
    return { bureau: b, latest: items[0] };
  });

  const factors = [
    { label: 'Payment history',          weight: 35, status: 'On time, last 24 months', good: true },
    { label: 'Credit utilisation',       weight: 30, status: 'High on Amex (≈48%) — pay down', good: false },
    { label: 'Length of credit history', weight: 15, status: '7+ years average', good: true },
    { label: 'Credit mix',               weight: 10, status: '4 different types', good: true },
    { label: 'New credit / inquiries',   weight: 10, status: 'No hard inquiries in 12 mo', good: true },
  ];

  const save = () => {
    if (!Number(draft.score)) return toast('Score required', 'error');
    add('creditScores', { ...draft, score: Number(draft.score) });
    audit('created', 'CreditScore', `${draft.bureau}: ${draft.score} on ${draft.date}`);
    toast('Score added', 'success');
    setOpen(false);
  };

  return (
    <div>
      <div className="grid grid-3 mb-4">
        {latestByBureau.map(b => {
          const band = creditBand(b.latest.score);
          return (
            <div key={b.bureau} className="kpi">
              <div className="kpi-label">{b.bureau}</div>
              <div className="kpi-value">{b.latest.score}</div>
              <div className="kpi-sub"><span className={`pill ${band.color}`}>{band.label}</span> · {fmtDate(b.latest.date)}</div>
            </div>
          );
        })}
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title">Score history (12 months)</h3>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>+ Record score</button>}
        </div>
        <div className="card-body">
          <LineChart series={seriesByBureau} labels={labels} format={v => v} />
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">Factors affecting your score</h3></div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Factor</th><th className="right">Weight</th><th>Status</th></tr></thead>
            <tbody>
              {factors.map(f => (
                <tr key={f.label}>
                  <td><b>{f.label}</b></td>
                  <td className="num">{f.weight}%</td>
                  <td><span className={`pill ${f.good ? 'green' : 'amber'}`}>{f.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Record credit score" footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field-row">
            <div className="field"><label className="field-label">Bureau</label>
              <select className="input" value={draft.bureau} onChange={e => setDraft({ ...draft, bureau: e.target.value })}>
                <option>Equifax</option><option>Experian</option><option>illion</option>
              </select>
            </div>
            <div className="field"><label className="field-label">Score</label>
              <input className="input" type="number" min="0" max="1200" value={draft.score} onChange={e => setDraft({ ...draft, score: e.target.value })} />
            </div>
          </div>
          <div className="field"><label className="field-label">Date</label>
            <input className="input" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function capitalise(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
