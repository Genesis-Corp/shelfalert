// ============================================================================
// Ledgerline — Tax module
//   Sub-tabs: Income Tax · Payroll · Super · PAYG · CGT · FBT · Depreciation · Calendar
// ============================================================================
import React, { useMemo, useState } from 'react';
import { useStore, useCanWrite } from '../store';
import {
  fmtCurrency, fmtDate, fmtSigned, fmtPct, todayISO, addDays, fyOf, fyStart, fyEnd, fyLabel,
  calcResidentTax, calcMedicareLevy, calcCompanyTax, calcMarginalRate, calcCGT, calcFBT,
  depreciatePrimeCost, depreciateDiminishing, printPDF, sumBy, daysBetween,
  CONCESSIONAL_CAP, NON_CONCESSIONAL_CAP, SUPER_RATE, AU_TAX_BRACKETS_2024_25, FBT_RATE,
} from '../utils';
import { Modal, Kpi, BarChart, LineChart, DonutChart, toast } from '../components';

const TABS = [
  { id: 'income',     label: 'Income Tax' },
  { id: 'payroll',    label: 'Payroll' },
  { id: 'super',      label: 'Superannuation' },
  { id: 'payg',       label: 'PAYG Withholding' },
  { id: 'cgt',        label: 'Capital Gains' },
  { id: 'fbt',        label: 'FBT' },
  { id: 'depr',       label: 'Depreciation' },
  { id: 'calendar',   label: 'Deadlines' },
];

export default function TaxModule() {
  const [tab, setTab] = useState('income');
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tax</h1>
          <div className="page-sub">Australian tax management — {fyLabel(fyOf(todayISO()))}</div>
        </div>
      </div>
      <div className="tabs">{TABS.map(t => <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
      {tab === 'income'   && <IncomeTax />}
      {tab === 'payroll'  && <Payroll />}
      {tab === 'super'    && <Super />}
      {tab === 'payg'     && <PAYG />}
      {tab === 'cgt'      && <CGT />}
      {tab === 'fbt'      && <FBT />}
      {tab === 'depr'     && <Depreciation />}
      {tab === 'calendar' && <Calendar />}
    </div>
  );
}

// ---------- Income tax estimate ----------------
function IncomeTax() {
  const { state } = useStore();
  const fy = fyOf(todayISO());
  const fStart = fyStart(fy);
  const fEnd = fyEnd(fy);

  const [entity, setEntity] = useState(state.profile.smallBusiness ? 'individual' : 'company');

  // YTD income from transactions
  const ytdSalary = sumBy(state.transactions.filter(t => t.date >= fStart && t.date <= fEnd && t.category === 'cat_salary'), t => t.amount);
  const ytdDividends = sumBy(state.transactions.filter(t => t.date >= fStart && t.date <= fEnd && t.category === 'cat_dividend'), t => t.amount);
  const ytdInterest = sumBy(state.transactions.filter(t => t.date >= fStart && t.date <= fEnd && t.category === 'cat_interest'), t => t.amount);
  const ytdOther = sumBy(state.transactions.filter(t => t.date >= fStart && t.date <= fEnd && t.category === 'cat_other_inc'), t => t.amount);

  // YTD tax withheld
  const ytdWithheld = state.payRuns.flatMap(r => r.payslips).reduce((s, p) => s + p.paygWithheld, 0);

  const [draft, setDraft] = useState({
    grossIncome: Math.round(ytdSalary + ytdDividends + ytdInterest + ytdOther) || 95000,
    deductions: 4200,
    offsets: 0,
    withheld: Math.round(ytdWithheld) || 18500,
    cgtTaxableGain: 0,
    superDeducted: 0,
  });

  const taxable = Math.max(0, draft.grossIncome - draft.deductions - draft.superDeducted + draft.cgtTaxableGain);
  const tax = entity === 'individual' ? calcResidentTax(taxable) : calcCompanyTax(taxable, state.profile.smallBusiness);
  const medicare = entity === 'individual' ? calcMedicareLevy(taxable) : 0;
  const totalLiability = Math.max(0, tax + medicare - draft.offsets);
  const balance = totalLiability - draft.withheld;
  const marginal = entity === 'individual' ? calcMarginalRate(taxable) : (state.profile.smallBusiness ? 0.25 : 0.30);
  const effective = taxable > 0 ? totalLiability / taxable : 0;

  // Bracket bar visualisation
  const brackets = AU_TAX_BRACKETS_2024_25.map(b => ({
    label: b.from === 0 ? '$0–18.2k' : b.to === Infinity ? '$190k+' : `$${(b.from / 1000).toFixed(0)}k–${(b.to / 1000).toFixed(0)}k`,
    value: Math.max(0, Math.min(taxable, b.to) - b.from) * b.rate,
  }));

  return (
    <div>
      <div className="grid grid-4 mb-4">
        <Kpi label="Estimated taxable income" value={fmtCurrency(taxable, 'AUD')} sub={fmtPct(effective * 100, 1) + ' effective rate'} />
        <Kpi label="Estimated tax + Medicare" value={fmtCurrency(totalLiability, 'AUD')} />
        <Kpi label="Tax withheld YTD" value={fmtCurrency(draft.withheld, 'AUD')} />
        <Kpi
          label={balance >= 0 ? 'Estimated balance owing' : 'Estimated refund'}
          value={fmtCurrency(Math.abs(balance), 'AUD')}
          sub={balance >= 0 ? 'pay to ATO' : 'from ATO'}
          trend={balance < 0 ? 'up' : 'down'}
        />
      </div>

      <div className="grid grid-2 mb-4">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Inputs</h3>
            <div className="row">
              <button className={`btn btn-sm ${entity === 'individual' ? 'btn-primary' : ''}`} onClick={() => setEntity('individual')}>Individual</button>
              <button className={`btn btn-sm ${entity === 'company' ? 'btn-primary' : ''}`} onClick={() => setEntity('company')}>Company</button>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <NumField label="Gross income (YTD + projected)" value={draft.grossIncome} onChange={v => setDraft({ ...draft, grossIncome: v })} />
              <NumField label="Total deductions" value={draft.deductions} onChange={v => setDraft({ ...draft, deductions: v })} />
              <NumField label="Personal super contributions (deductible)" value={draft.superDeducted} onChange={v => setDraft({ ...draft, superDeducted: v })} />
              <NumField label="Net capital gain (already discounted)" value={draft.cgtTaxableGain} onChange={v => setDraft({ ...draft, cgtTaxableGain: v })} />
              <NumField label="Tax offsets / rebates" value={draft.offsets} onChange={v => setDraft({ ...draft, offsets: v })} />
              <NumField label="PAYG withheld" value={draft.withheld} onChange={v => setDraft({ ...draft, withheld: v })} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Calculation breakdown</h3>
            <button className="btn btn-sm" onClick={() => printPDF('Income Tax Estimate — Ledgerline')}>Export PDF</button>
          </div>
          <div className="card-body tight">
            <table className="table">
              <tbody>
                <Row label="Gross income"        v={draft.grossIncome} />
                <Row label="Less: deductions"    v={-draft.deductions} />
                <Row label="Less: deductible super" v={-draft.superDeducted} />
                <Row label="Plus: net capital gain" v={draft.cgtTaxableGain} />
                <Row label="= Taxable income"    v={taxable} bold />
                <Row label="Tax on income"       v={tax} />
                {entity === 'individual' && <Row label="Medicare levy (2%)" v={medicare} />}
                <Row label="Less: offsets"       v={-draft.offsets} />
                <Row label="= Total tax payable" v={totalLiability} bold />
                <Row label="Less: PAYG withheld" v={-draft.withheld} />
                <Row label={balance >= 0 ? 'Balance owing' : 'Refund'} v={balance} bold />
                <tr><td>Marginal rate</td><td className="num">{fmtPct(marginal * 100, 0)}</td></tr>
                <tr><td>Effective rate</td><td className="num">{fmtPct(effective * 100, 1)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {entity === 'individual' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">Tax across brackets</h3></div>
          <div className="card-body">
            <BarChart data={brackets} />
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input className="input num" type="number" step="100" value={value || ''} onChange={e => onChange(Number(e.target.value || 0))} />
    </div>
  );
}
function Row({ label, v, bold }) {
  return <tr style={{ fontWeight: bold ? 700 : 400 }}><td>{label}</td><td className="num">{fmtCurrency(v, 'AUD')}</td></tr>;
}

// ---------- Payroll ----------------
function Payroll() {
  const { state, add, update, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [empOpen, setEmpOpen] = useState(false);
  const [empDraft, setEmpDraft] = useState(null);

  // Latest pay run
  const lastRun = state.payRuns[state.payRuns.length - 1];

  const ytd = state.employees.map(e => {
    const slips = state.payRuns.flatMap(r => r.payslips).filter(s => s.employeeId === e.id);
    return {
      ...e,
      ytdGross: sumBy(slips, s => s.gross),
      ytdTax:   sumBy(slips, s => s.paygWithheld),
      ytdSuper: sumBy(slips, s => s.super),
      ytdNet:   sumBy(slips, s => s.net),
    };
  });

  const startNewRun = () => {
    setDraft({
      periodEnd: todayISO(),
      payslips: state.employees.map(e => {
        const hours = e.type === 'casual' ? 32 : (e.type === 'part-time' ? 60 : 76);
        return { employeeId: e.id, hours, baseRate: e.baseRate };
      }),
    });
    setOpen(true);
  };

  const computed = draft ? draft.payslips.map(p => {
    const e = state.employees.find(x => x.id === p.employeeId);
    const gross = p.hours * p.baseRate;
    const annual = gross * 26;
    let fortnightlyTax = 0;
    if (annual > 18200) {
      let tx = 0;
      for (const b of AU_TAX_BRACKETS_2024_25) {
        const taxableInBracket = Math.max(0, Math.min(annual, b.to) - b.from);
        tx += taxableInBracket * b.rate;
      }
      fortnightlyTax = tx / 26;
    }
    const sup = gross * (e?.super || SUPER_RATE);
    const net = gross - fortnightlyTax;
    return {
      employeeId: p.employeeId, hours: p.hours,
      gross: r2(gross), paygWithheld: r2(fortnightlyTax), super: r2(sup), net: r2(net),
    };
  }) : [];

  const totals = computed.reduce((acc, p) => ({
    gross: acc.gross + p.gross,
    tax: acc.tax + p.paygWithheld,
    sup: acc.sup + p.super,
    net: acc.net + p.net,
  }), { gross: 0, tax: 0, sup: 0, net: 0 });

  const processRun = () => {
    add('payRuns', {
      period: `Fortnight ending ${draft.periodEnd}`,
      periodEnd: draft.periodEnd,
      payslips: computed,
    });
    audit('processed', 'PayRun', `Pay run for ${draft.periodEnd}: gross ${fmtCurrency(totals.gross, 'AUD')}`);
    toast('Pay run processed', 'success');
    setOpen(false);
  };

  const startEmp = (e = null) => {
    setEmpDraft(e || { name: '', email: '', role: '', type: 'full-time', startDate: todayISO(), baseRate: 32, super: 0.115 });
    setEmpOpen(true);
  };
  const saveEmp = () => {
    if (!empDraft.name) return toast('Name required', 'error');
    if (empDraft.id) update('employees', empDraft.id, empDraft);
    else add('employees', { ...empDraft, baseRate: Number(empDraft.baseRate), super: Number(empDraft.super) });
    audit('updated', 'Employee', empDraft.name);
    toast('Saved', 'success');
    setEmpOpen(false);
  };

  return (
    <div>
      <div className="grid grid-4 mb-4">
        <Kpi label="Employees" value={String(state.employees.length)} />
        <Kpi label="Last pay run gross" value={fmtCurrency(lastRun ? sumBy(lastRun.payslips, p => p.gross) : 0, 'AUD')} sub={lastRun ? fmtDate(lastRun.periodEnd) : '—'} />
        <Kpi label="Last pay run net"   value={fmtCurrency(lastRun ? sumBy(lastRun.payslips, p => p.net)   : 0, 'AUD')} />
        <Kpi label="Last pay run super" value={fmtCurrency(lastRun ? sumBy(lastRun.payslips, p => p.super) : 0, 'AUD')} />
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title">Employees & YTD totals</h3>
          {canWrite && <div className="row"><button className="btn btn-sm" onClick={() => startEmp()}>+ Employee</button><button className="btn btn-primary btn-sm" onClick={startNewRun}>+ New pay run</button></div>}
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Name</th><th>Type</th><th>Role</th><th className="right">Rate</th><th className="right">YTD gross</th><th className="right">YTD tax</th><th className="right">YTD super</th><th className="right">YTD net</th><th></th></tr></thead>
            <tbody>
              {ytd.map(e => (
                <tr key={e.id}>
                  <td><b>{e.name}</b></td>
                  <td><span className="pill">{e.type}</span></td>
                  <td>{e.role}</td>
                  <td className="num">{fmtCurrency(e.baseRate, 'AUD')}/hr</td>
                  <td className="num">{fmtCurrency(e.ytdGross, 'AUD')}</td>
                  <td className="num">{fmtCurrency(e.ytdTax, 'AUD')}</td>
                  <td className="num">{fmtCurrency(e.ytdSuper, 'AUD')}</td>
                  <td className="num">{fmtCurrency(e.ytdNet, 'AUD')}</td>
                  <td className="right">{canWrite && <button className="btn btn-ghost btn-sm" onClick={() => startEmp(e)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {lastRun && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Latest payslips — {fmtDate(lastRun.periodEnd)}</h3>
            <button className="btn btn-sm" onClick={() => printPDF('Payslips — ' + lastRun.periodEnd)}>Export PDF</button>
          </div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Employee</th><th className="right">Hours</th><th className="right">Gross</th><th className="right">PAYG</th><th className="right">Super</th><th className="right">Net</th></tr></thead>
              <tbody>
                {lastRun.payslips.map(p => {
                  const e = state.employees.find(x => x.id === p.employeeId);
                  return (
                    <tr key={p.employeeId}>
                      <td><b>{e?.name}</b><div className="muted" style={{ fontSize: '0.82em' }}>{e?.role}</div></td>
                      <td className="num">{p.hours}</td>
                      <td className="num">{fmtCurrency(p.gross, 'AUD')}</td>
                      <td className="num">{fmtCurrency(p.paygWithheld, 'AUD')}</td>
                      <td className="num">{fmtCurrency(p.super, 'AUD')}</td>
                      <td className="num">{fmtCurrency(p.net, 'AUD')}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Totals</td>
                  <td className="num">{fmtCurrency(sumBy(lastRun.payslips, p => p.gross), 'AUD')}</td>
                  <td className="num">{fmtCurrency(sumBy(lastRun.payslips, p => p.paygWithheld), 'AUD')}</td>
                  <td className="num">{fmtCurrency(sumBy(lastRun.payslips, p => p.super), 'AUD')}</td>
                  <td className="num">{fmtCurrency(sumBy(lastRun.payslips, p => p.net), 'AUD')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Process new pay run" size="lg" footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={processRun}>Process run</button>
        </>
      }>
        {draft && (
          <>
            <div className="field mb-3">
              <label className="field-label">Period end</label>
              <input className="input" type="date" value={draft.periodEnd} onChange={e => setDraft({ ...draft, periodEnd: e.target.value })} />
            </div>
            <table className="table">
              <thead><tr><th>Employee</th><th>Hours</th><th>Rate</th><th className="right">Gross</th><th className="right">PAYG</th><th className="right">Super</th><th className="right">Net</th></tr></thead>
              <tbody>
                {draft.payslips.map((p, i) => {
                  const e = state.employees.find(x => x.id === p.employeeId);
                  const c = computed[i];
                  return (
                    <tr key={p.employeeId}>
                      <td>{e.name}</td>
                      <td><input className="input num" style={{ width: 70 }} type="number" step="0.5" value={p.hours} onChange={ev => {
                        const ps = draft.payslips.map((x, j) => j === i ? { ...x, hours: Number(ev.target.value) } : x);
                        setDraft({ ...draft, payslips: ps });
                      }} /></td>
                      <td><input className="input num" style={{ width: 80 }} type="number" step="0.5" value={p.baseRate} onChange={ev => {
                        const ps = draft.payslips.map((x, j) => j === i ? { ...x, baseRate: Number(ev.target.value) } : x);
                        setDraft({ ...draft, payslips: ps });
                      }} /></td>
                      <td className="num">{fmtCurrency(c.gross, 'AUD')}</td>
                      <td className="num">{fmtCurrency(c.paygWithheld, 'AUD')}</td>
                      <td className="num">{fmtCurrency(c.super, 'AUD')}</td>
                      <td className="num">{fmtCurrency(c.net, 'AUD')}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={3}>Totals</td>
                  <td className="num">{fmtCurrency(totals.gross, 'AUD')}</td>
                  <td className="num">{fmtCurrency(totals.tax, 'AUD')}</td>
                  <td className="num">{fmtCurrency(totals.sup, 'AUD')}</td>
                  <td className="num">{fmtCurrency(totals.net, 'AUD')}</td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </Modal>

      <Modal open={empOpen} onClose={() => setEmpOpen(false)} title={empDraft?.id ? 'Edit employee' : 'Add employee'} footer={
        <>
          <button className="btn" onClick={() => setEmpOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveEmp}>Save</button>
        </>
      }>
        {empDraft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field-row">
              <div className="field"><label className="field-label">Name</label><input className="input" value={empDraft.name} onChange={e => setEmpDraft({ ...empDraft, name: e.target.value })} /></div>
              <div className="field"><label className="field-label">Email</label><input className="input" value={empDraft.email} onChange={e => setEmpDraft({ ...empDraft, email: e.target.value })} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label className="field-label">Role</label><input className="input" value={empDraft.role} onChange={e => setEmpDraft({ ...empDraft, role: e.target.value })} /></div>
              <div className="field"><label className="field-label">Type</label>
                <select className="input" value={empDraft.type} onChange={e => setEmpDraft({ ...empDraft, type: e.target.value })}>
                  <option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="casual">Casual</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field"><label className="field-label">Start date</label><input className="input" type="date" value={empDraft.startDate} onChange={e => setEmpDraft({ ...empDraft, startDate: e.target.value })} /></div>
              <div className="field"><label className="field-label">Base rate ($/hr)</label><input className="input" type="number" step="0.5" value={empDraft.baseRate} onChange={e => setEmpDraft({ ...empDraft, baseRate: e.target.value })} /></div>
            </div>
            <div className="field"><label className="field-label">Super rate</label><input className="input" type="number" step="0.005" value={empDraft.super} onChange={e => setEmpDraft({ ...empDraft, super: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const r2 = (n) => Math.round(n * 100) / 100;

// ---------- Super ----------------
function Super() {
  const { state, add, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const fy = fyOf(todayISO());
  const fStart = fyStart(fy);
  const fEnd = fyEnd(fy);

  const ownerContribs = state.superContribs.filter(c => c.employeeId === 'u_owner' && c.date >= fStart && c.date <= fEnd);
  const ownerConcessional = sumBy(ownerContribs.filter(c => c.type === 'concessional'), c => c.amount);
  const ownerNonConcessional = sumBy(ownerContribs.filter(c => c.type === 'non-concessional'), c => c.amount);
  const ownerFhss = sumBy(ownerContribs.filter(c => c.type === 'fhss'), c => c.amount);

  // Employee balance history (mock from contribs)
  const monthly = {};
  for (const c of state.superContribs) {
    const k = c.date.slice(0, 7);
    monthly[k] = (monthly[k] || 0) + c.amount;
  }
  const months = Object.keys(monthly).sort();
  const series = [];
  let running = 165000;
  for (const m of months) {
    running = running + monthly[m] + (running * 0.005);
    series.push(running);
  }

  const startContrib = () => {
    setDraft({ employeeId: 'u_owner', type: 'concessional', amount: 0, date: todayISO() });
    setOpen(true);
  };
  const save = () => {
    if (!Number(draft.amount)) return toast('Amount required', 'error');
    add('superContribs', { ...draft, amount: Number(draft.amount) });
    audit('created', 'SuperContrib', `${draft.type} ${fmtCurrency(draft.amount, 'AUD')}`);
    toast('Recorded', 'success');
    setOpen(false);
  };

  return (
    <div>
      <div className="grid grid-4 mb-4">
        <Kpi label="Super balance"           value={fmtCurrency(state.accounts.find(a => a.type === 'super')?.balance || 0, 'AUD')} sub="AustralianSuper" />
        <Kpi label="Concessional (FY)"       value={fmtCurrency(ownerConcessional, 'AUD')} sub={`${((ownerConcessional / CONCESSIONAL_CAP) * 100).toFixed(0)}% of $${CONCESSIONAL_CAP.toLocaleString()} cap`} trend={ownerConcessional <= CONCESSIONAL_CAP ? '' : 'down'} />
        <Kpi label="Non-concessional (FY)"   value={fmtCurrency(ownerNonConcessional, 'AUD')} sub={`${((ownerNonConcessional / NON_CONCESSIONAL_CAP) * 100).toFixed(0)}% of $${NON_CONCESSIONAL_CAP.toLocaleString()} cap`} />
        <Kpi label="FHSS contributions"      value={fmtCurrency(ownerFhss, 'AUD')} sub="First Home Super Saver" />
      </div>

      <div className="grid grid-2 mb-4">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Caps utilisation</h3>
          </div>
          <div className="card-body">
            <div className="field mb-3">
              <div className="row between"><span>Concessional ($30k cap)</span><span className="num">{fmtCurrency(ownerConcessional, 'AUD')}</span></div>
              <div className={`progress ${ownerConcessional > CONCESSIONAL_CAP ? 'over' : ''}`}><div style={{ width: `${Math.min(100, (ownerConcessional / CONCESSIONAL_CAP) * 100)}%` }} /></div>
            </div>
            <div className="field mb-3">
              <div className="row between"><span>Non-concessional ($120k cap)</span><span className="num">{fmtCurrency(ownerNonConcessional, 'AUD')}</span></div>
              <div className={`progress ${ownerNonConcessional > NON_CONCESSIONAL_CAP ? 'over' : ''}`}><div style={{ width: `${Math.min(100, (ownerNonConcessional / NON_CONCESSIONAL_CAP) * 100)}%` }} /></div>
            </div>
            <div className="muted" style={{ fontSize: '0.85em' }}>Caps shown are 2024–25 standard limits — bring-forward and carry-forward provisions may extend these.</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Balance history (modelled)</h3>
            {canWrite && <button className="btn btn-primary btn-sm" onClick={startContrib}>+ Contribution</button>}
          </div>
          <div className="card-body">
            <LineChart series={[{ name: 'Balance', values: series }]} labels={months.map(m => m.slice(2))} fill />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">Recent contributions</h3></div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Date</th><th>Person</th><th>Type</th><th className="right">Amount</th></tr></thead>
            <tbody>
              {[...state.superContribs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).map(c => {
                const person = state.users.find(u => u.id === c.employeeId)?.name
                  || state.employees.find(e => e.id === c.employeeId)?.name || c.employeeId;
                return (
                  <tr key={c.id}>
                    <td>{fmtDate(c.date)}</td>
                    <td>{person}</td>
                    <td><span className="pill">{c.type}</span></td>
                    <td className="num">{fmtCurrency(c.amount, 'AUD')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Record super contribution" footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field"><label className="field-label">Person</label>
              <select className="input" value={draft.employeeId} onChange={e => setDraft({ ...draft, employeeId: e.target.value })}>
                {state.users.map(u => <option key={u.id} value={u.id}>{u.name} (user)</option>)}
                {state.employees.map(e => <option key={e.id} value={e.id}>{e.name} (employee)</option>)}
              </select>
            </div>
            <div className="field-row">
              <div className="field"><label className="field-label">Type</label>
                <select className="input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                  <option value="concessional">Concessional</option>
                  <option value="non-concessional">Non-concessional</option>
                  <option value="fhss">FHSS</option>
                </select>
              </div>
              <div className="field"><label className="field-label">Amount</label><input className="input num" type="number" step="100" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} /></div>
            </div>
            <div className="field"><label className="field-label">Date</label><input className="input" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- PAYG ----------------
function PAYG() {
  const { state } = useStore();
  const fy = fyOf(todayISO());
  const fStart = fyStart(fy);

  // Group by quarter
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const qBounds = [
    { q: 'Q1', start: `${fy - 1}-07-01`, end: `${fy - 1}-09-30` },
    { q: 'Q2', start: `${fy - 1}-10-01`, end: `${fy - 1}-12-31` },
    { q: 'Q3', start: `${fy}-01-01`,     end: `${fy}-03-31` },
    { q: 'Q4', start: `${fy}-04-01`,     end: `${fy}-06-30` },
  ];

  const byQuarter = qBounds.map(q => {
    const slips = state.payRuns.filter(r => r.periodEnd >= q.start && r.periodEnd <= q.end).flatMap(r => r.payslips);
    return {
      ...q,
      gross: sumBy(slips, p => p.gross),
      payg: sumBy(slips, p => p.paygWithheld),
      super: sumBy(slips, p => p.super),
      runs: state.payRuns.filter(r => r.periodEnd >= q.start && r.periodEnd <= q.end).length,
    };
  });

  const totalPAYG = sumBy(byQuarter, q => q.payg);
  const totalGross = sumBy(byQuarter, q => q.gross);

  return (
    <div>
      <div className="grid grid-3 mb-4">
        <Kpi label={`PAYG withheld ${fyLabel(fy)}`} value={fmtCurrency(totalPAYG, 'AUD')} />
        <Kpi label="Gross wages YTD" value={fmtCurrency(totalGross, 'AUD')} />
        <Kpi label="Effective withholding" value={fmtPct(totalGross ? (totalPAYG / totalGross) * 100 : 0, 1)} />
      </div>

      <div className="card mb-4">
        <div className="card-header"><h3 className="card-title">PAYG by quarter</h3></div>
        <div className="card-body">
          <BarChart data={byQuarter.map(q => ({ label: q.q, value: q.gross, value2: q.payg }))} colors={['#1463a3', '#b86a00']} legend={['Gross wages', 'PAYG withheld']} />
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">Quarterly summary</h3></div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Quarter</th><th>Period</th><th className="right">Pay runs</th><th className="right">Gross wages</th><th className="right">PAYG withheld</th><th className="right">Super</th></tr></thead>
            <tbody>
              {byQuarter.map(q => (
                <tr key={q.q}>
                  <td><b>{q.q} {fyLabel(fy)}</b></td>
                  <td>{fmtDate(q.start)} – {fmtDate(q.end)}</td>
                  <td className="num">{q.runs}</td>
                  <td className="num">{fmtCurrency(q.gross, 'AUD')}</td>
                  <td className="num">{fmtCurrency(q.payg, 'AUD')}</td>
                  <td className="num">{fmtCurrency(q.super, 'AUD')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={3}>YTD totals</td>
                <td className="num">{fmtCurrency(totalGross, 'AUD')}</td>
                <td className="num">{fmtCurrency(totalPAYG, 'AUD')}</td>
                <td className="num">{fmtCurrency(sumBy(byQuarter, q => q.super), 'AUD')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------- CGT ----------------
function CGT() {
  const { state, add, update, remove, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const fy = fyOf(todayISO());
  const fStart = fyStart(fy);
  const fEnd = fyEnd(fy);

  const computed = state.cgtAssets.map(a => {
    if (!a.sold || !a.proceeds) return { ...a, status: 'held', rawGain: 0, taxableGain: 0, discount: 0 };
    const c = calcCGT(a.proceeds, a.costBase, a.acquired, a.sold);
    const inFY = a.sold >= fStart && a.sold <= fEnd;
    return { ...a, status: 'sold', ...c, inFY };
  });

  const fyEvents = computed.filter(a => a.status === 'sold' && a.inFY);
  const totalGain  = sumBy(fyEvents.filter(a => a.rawGain >= 0), a => a.taxableGain);
  const totalLoss  = sumBy(fyEvents.filter(a => a.rawGain <  0), a => a.rawGain);
  const netGain    = totalGain + totalLoss;

  const startNew = () => {
    setDraft({ name: '', kind: 'shares', qty: 0, costBase: 0, acquired: todayISO(), sold: '', proceeds: 0 });
    setOpen(true);
  };
  const startEdit = (a) => { setDraft({ ...a }); setOpen(true); };
  const save = () => {
    if (!draft.name) return toast('Name required', 'error');
    if (draft.id) update('cgtAssets', draft.id, { ...draft, qty: Number(draft.qty), costBase: Number(draft.costBase), proceeds: Number(draft.proceeds) });
    else add('cgtAssets', { ...draft, qty: Number(draft.qty), costBase: Number(draft.costBase), proceeds: Number(draft.proceeds) });
    audit('updated', 'CGTAsset', draft.name);
    toast('Saved', 'success');
    setOpen(false);
  };

  return (
    <div>
      <div className="grid grid-4 mb-4">
        <Kpi label="Total gains (FY)" value={fmtCurrency(totalGain, 'AUD')} sub={`${fyEvents.filter(a => a.rawGain >= 0).length} disposals`} trend="up" />
        <Kpi label="Total losses (FY)" value={fmtCurrency(totalLoss, 'AUD')} sub={`${fyEvents.filter(a => a.rawGain < 0).length} disposals`} trend="down" />
        <Kpi label="Net capital gain (FY)" value={fmtCurrency(Math.max(0, netGain), 'AUD')} sub="after 50% discount" />
        <Kpi label="Held assets" value={String(computed.filter(a => a.status === 'held').length)} />
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Capital assets</h3>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ Add asset</button>}
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr>
              <th>Asset</th><th>Kind</th><th>Acquired</th><th>Sold</th>
              <th className="right">Cost base</th><th className="right">Proceeds</th>
              <th className="right">Raw gain</th><th className="right">Discount</th><th className="right">Taxable</th><th></th>
            </tr></thead>
            <tbody>
              {computed.map(a => (
                <tr key={a.id}>
                  <td><b>{a.name}</b></td>
                  <td><span className="pill">{a.kind}</span></td>
                  <td>{fmtDate(a.acquired)}</td>
                  <td>{a.sold ? fmtDate(a.sold) : <span className="pill blue">held</span>}</td>
                  <td className="num">{fmtCurrency(a.costBase, 'AUD')}</td>
                  <td className="num">{a.sold ? fmtCurrency(a.proceeds, 'AUD') : '—'}</td>
                  <td className={`num ${a.rawGain >= 0 ? 'pos' : 'neg'}`}>{a.sold ? fmtCurrency(a.rawGain, 'AUD') : '—'}</td>
                  <td className="num">{a.sold && a.discount ? fmtCurrency(a.discount, 'AUD') : '—'}</td>
                  <td className="num">{a.sold ? fmtCurrency(a.taxableGain, 'AUD') : '—'}</td>
                  <td className="right">{canWrite && <button className="btn btn-ghost btn-sm" onClick={() => startEdit(a)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={6}>FY totals</td>
                <td className={`num ${totalGain + totalLoss >= 0 ? 'pos' : 'neg'}`}>{fmtCurrency(totalGain + totalLoss, 'AUD')}</td>
                <td className="num">{fmtCurrency(sumBy(fyEvents, a => a.discount), 'AUD')}</td>
                <td className="num">{fmtCurrency(Math.max(0, netGain), 'AUD')}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={draft?.id ? 'Edit asset' : 'New CGT asset'} footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field"><label className="field-label">Name</label><input className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="field-row">
              <div className="field"><label className="field-label">Kind</label>
                <select className="input" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}>
                  <option value="shares">Shares</option><option value="property">Property</option><option value="crypto">Crypto</option>
                </select>
              </div>
              <div className="field"><label className="field-label">Quantity</label><input className="input num" type="number" step="0.0001" value={draft.qty} onChange={e => setDraft({ ...draft, qty: e.target.value })} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label className="field-label">Acquired</label><input className="input" type="date" value={draft.acquired} onChange={e => setDraft({ ...draft, acquired: e.target.value })} /></div>
              <div className="field"><label className="field-label">Cost base</label><input className="input num" type="number" step="0.01" value={draft.costBase} onChange={e => setDraft({ ...draft, costBase: e.target.value })} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label className="field-label">Sold (blank if held)</label><input className="input" type="date" value={draft.sold || ''} onChange={e => setDraft({ ...draft, sold: e.target.value })} /></div>
              <div className="field"><label className="field-label">Proceeds</label><input className="input num" type="number" step="0.01" value={draft.proceeds} onChange={e => setDraft({ ...draft, proceeds: e.target.value })} /></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- FBT ----------------
function FBT() {
  const { state, add, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const fy = fyOf(todayISO());

  const fyItems = state.fbtItems.filter(i => i.fbtYear === fy);
  const computed = fyItems.map(i => {
    const r = calcFBT(i.taxableValue, i.type1);
    return { ...i, ...r };
  });
  const totalGrossedUp = sumBy(computed, i => i.grossedUp);
  const totalFBT = sumBy(computed, i => i.fbt);

  const startNew = () => {
    setDraft({ employeeId: state.employees[0]?.id, type: 'Car (Statutory)', description: '', taxableValue: 0, type1: true, fbtYear: fy });
    setOpen(true);
  };
  const save = () => {
    if (!Number(draft.taxableValue)) return toast('Taxable value required', 'error');
    add('fbtItems', { ...draft, taxableValue: Number(draft.taxableValue) });
    audit('created', 'FBTItem', draft.description);
    toast('Saved', 'success');
    setOpen(false);
  };

  return (
    <div>
      <div className="grid grid-3 mb-4">
        <Kpi label="Taxable value (FBT yr)" value={fmtCurrency(sumBy(fyItems, i => i.taxableValue), 'AUD')} />
        <Kpi label="Grossed-up value" value={fmtCurrency(totalGrossedUp, 'AUD')} />
        <Kpi label="FBT payable @ 47%" value={fmtCurrency(totalFBT, 'AUD')} />
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">FBT items — {fy} year</h3>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ Add benefit</button>}
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Employee</th><th>Type</th><th>Description</th><th>GST</th><th className="right">Taxable</th><th className="right">Gross-up</th><th className="right">FBT</th></tr></thead>
            <tbody>
              {computed.map(i => {
                const e = state.employees.find(x => x.id === i.employeeId);
                return (
                  <tr key={i.id}>
                    <td><b>{e?.name || i.employeeId}</b></td>
                    <td>{i.type}</td>
                    <td>{i.description}</td>
                    <td><span className="pill">{i.type1 ? 'Type 1 (GST)' : 'Type 2 (no GST)'}</span></td>
                    <td className="num">{fmtCurrency(i.taxableValue, 'AUD')}</td>
                    <td className="num">{fmtCurrency(i.grossedUp, 'AUD')}</td>
                    <td className="num">{fmtCurrency(i.fbt, 'AUD')}</td>
                  </tr>
                );
              })}
              {computed.length === 0 && <tr><td colSpan={7} className="empty">No FBT items</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Totals</td>
                <td className="num">{fmtCurrency(sumBy(fyItems, i => i.taxableValue), 'AUD')}</td>
                <td className="num">{fmtCurrency(totalGrossedUp, 'AUD')}</td>
                <td className="num">{fmtCurrency(totalFBT, 'AUD')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add fringe benefit" footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field"><label className="field-label">Employee</label>
              <select className="input" value={draft.employeeId} onChange={e => setDraft({ ...draft, employeeId: e.target.value })}>
                {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="field-row">
              <div className="field"><label className="field-label">Benefit type</label>
                <select className="input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                  <option>Car (Statutory)</option><option>Car (Operating cost)</option>
                  <option>Entertainment</option><option>Loan</option>
                  <option>Housing</option><option>Property</option><option>Other</option>
                </select>
              </div>
              <div className="field"><label className="field-label">GST treatment</label>
                <select className="input" value={draft.type1 ? '1' : '2'} onChange={e => setDraft({ ...draft, type1: e.target.value === '1' })}>
                  <option value="1">Type 1 (GST credits claimable)</option>
                  <option value="2">Type 2 (no GST credits)</option>
                </select>
              </div>
            </div>
            <div className="field"><label className="field-label">Description</label><input className="input" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></div>
            <div className="field"><label className="field-label">Taxable value</label><input className="input num" type="number" step="0.01" value={draft.taxableValue} onChange={e => setDraft({ ...draft, taxableValue: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- Depreciation ----------------
function Depreciation() {
  const { state, add, update, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const computed = state.depAssets.map(a => {
    const annual = a.method === 'prime'
      ? depreciatePrimeCost(a.cost, a.residual, a.lifeYears, 12)
      : depreciateDiminishing(a.bookValue, a.lifeYears, 12);
    return { ...a, annualDep: annual };
  });
  const totalCost = sumBy(state.depAssets, a => a.cost);
  const totalBV = sumBy(state.depAssets, a => a.bookValue);
  const totalDep = sumBy(computed, a => a.annualDep);

  const startNew = () => {
    setDraft({ name: '', cost: 0, residual: 0, lifeYears: 5, method: 'prime', acquired: todayISO(), bookValue: 0 });
    setOpen(true);
  };
  const save = () => {
    if (!draft.name) return toast('Name required', 'error');
    const a = { ...draft, cost: Number(draft.cost), residual: Number(draft.residual), lifeYears: Number(draft.lifeYears), bookValue: Number(draft.bookValue || draft.cost) };
    add('depAssets', a);
    audit('created', 'DepAsset', draft.name);
    toast('Saved', 'success');
    setOpen(false);
  };

  const runYear = () => {
    for (const a of state.depAssets) {
      const annual = a.method === 'prime'
        ? depreciatePrimeCost(a.cost, a.residual, a.lifeYears, 12)
        : depreciateDiminishing(a.bookValue, a.lifeYears, 12);
      const newBV = Math.max(a.residual, a.bookValue - annual);
      update('depAssets', a.id, { bookValue: r2(newBV) });
    }
    audit('processed', 'Depreciation', 'End-of-year depreciation run');
    toast('Annual depreciation applied', 'success');
  };

  return (
    <div>
      <div className="grid grid-4 mb-4">
        <Kpi label="Asset count" value={String(state.depAssets.length)} />
        <Kpi label="Total cost" value={fmtCurrency(totalCost, 'AUD')} />
        <Kpi label="Book value" value={fmtCurrency(totalBV, 'AUD')} />
        <Kpi label="This year's depreciation" value={fmtCurrency(totalDep, 'AUD')} />
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Asset register</h3>
          <div className="row">
            {canWrite && <button className="btn btn-sm" onClick={runYear}>Apply annual depreciation</button>}
            {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ Add asset</button>}
          </div>
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Asset</th><th>Acquired</th><th className="right">Cost</th><th className="right">Residual</th><th className="right">Life (yrs)</th><th>Method</th><th className="right">Annual dep.</th><th className="right">Book value</th></tr></thead>
            <tbody>
              {computed.map(a => (
                <tr key={a.id}>
                  <td><b>{a.name}</b></td>
                  <td>{fmtDate(a.acquired)}</td>
                  <td className="num">{fmtCurrency(a.cost, 'AUD')}</td>
                  <td className="num">{fmtCurrency(a.residual, 'AUD')}</td>
                  <td className="num">{a.lifeYears}</td>
                  <td><span className="pill">{a.method === 'prime' ? 'Prime cost' : 'Diminishing'}</span></td>
                  <td className="num">{fmtCurrency(a.annualDep, 'AUD')}</td>
                  <td className="num">{fmtCurrency(a.bookValue, 'AUD')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={2}>Totals</td>
                <td className="num">{fmtCurrency(totalCost, 'AUD')}</td>
                <td className="num">{fmtCurrency(sumBy(state.depAssets, a => a.residual), 'AUD')}</td>
                <td colSpan={2}></td>
                <td className="num">{fmtCurrency(totalDep, 'AUD')}</td>
                <td className="num">{fmtCurrency(totalBV, 'AUD')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add depreciable asset" footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field"><label className="field-label">Name</label><input className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="field-row">
              <div className="field"><label className="field-label">Acquired</label><input className="input" type="date" value={draft.acquired} onChange={e => setDraft({ ...draft, acquired: e.target.value })} /></div>
              <div className="field"><label className="field-label">Method</label>
                <select className="input" value={draft.method} onChange={e => setDraft({ ...draft, method: e.target.value })}>
                  <option value="prime">Prime cost</option><option value="dimin">Diminishing value</option>
                </select>
              </div>
            </div>
            <div className="field-row-3">
              <div className="field"><label className="field-label">Cost</label><input className="input num" type="number" step="0.01" value={draft.cost} onChange={e => setDraft({ ...draft, cost: e.target.value, bookValue: e.target.value })} /></div>
              <div className="field"><label className="field-label">Residual</label><input className="input num" type="number" step="0.01" value={draft.residual} onChange={e => setDraft({ ...draft, residual: e.target.value })} /></div>
              <div className="field"><label className="field-label">Life (years)</label><input className="input num" type="number" step="1" value={draft.lifeYears} onChange={e => setDraft({ ...draft, lifeYears: e.target.value })} /></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- Calendar ----------------
function Calendar() {
  const { state, update, add, audit } = useStore();
  const canWrite = useCanWrite();
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const first = new Date(view.y, view.m, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const dayDeadlines = (d) => {
    if (!d) return [];
    const iso = d.toISOString().slice(0, 10);
    return state.taxDeadlines.filter(x => x.dueDate === iso);
  };

  const goPrev = () => setView(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 });
  const goNext = () => setView(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 });

  const startNew = () => { setDraft({ label: '', kind: 'BAS', dueDate: todayISO(), lodged: false }); setOpen(true); };
  const save = () => {
    if (!draft.label) return toast('Label required', 'error');
    add('taxDeadlines', draft);
    audit('created', 'TaxDeadline', `${draft.label} due ${draft.dueDate}`);
    toast('Added', 'success');
    setOpen(false);
  };

  return (
    <div>
      <div className="row mb-4">
        <button className="btn" onClick={goPrev}>‹</button>
        <h2 style={{ margin: 0 }}>{first.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</h2>
        <button className="btn" onClick={goNext}>›</button>
        <div className="spacer" />
        {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ Add deadline</button>}
      </div>

      <div className="cal">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="cal-head">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-day other" />;
          const isToday = d.toDateString() === today.toDateString();
          const events = dayDeadlines(d);
          return (
            <div key={i} className={`cal-day ${isToday ? 'today' : ''}`}>
              <div className="num">{d.getDate()}</div>
              {events.map(ev => {
                const days = daysBetween(todayISO(), ev.dueDate);
                const cls = ev.lodged ? 'done' : (days < 0 ? 'danger' : days <= 14 ? 'warn' : '');
                return (
                  <span key={ev.id} className={`cal-event ${cls}`} title={ev.label}
                    onClick={() => canWrite && update('taxDeadlines', ev.id, { lodged: !ev.lodged })}>
                    {ev.lodged ? '✓ ' : ''}{ev.kind}: {ev.label}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="card mt-4">
        <div className="card-header"><h3 className="card-title">All deadlines</h3></div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Label</th><th>Kind</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {[...state.taxDeadlines].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(d => (
                <tr key={d.id}>
                  <td><b>{d.label}</b></td>
                  <td><span className="pill">{d.kind}</span></td>
                  <td>{fmtDate(d.dueDate)}</td>
                  <td>{d.lodged ? <span className="pill green">Lodged</span> : <span className="pill amber">Open</span>}</td>
                  <td className="right">{canWrite && <button className="btn btn-ghost btn-sm" onClick={() => update('taxDeadlines', d.id, { lodged: !d.lodged })}>{d.lodged ? 'Reopen' : 'Mark lodged'}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add deadline" footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field"><label className="field-label">Label</label><input className="input" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} /></div>
            <div className="field-row">
              <div className="field"><label className="field-label">Kind</label>
                <select className="input" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}>
                  <option>BAS</option><option>Tax</option><option>PAYG</option><option>Super</option><option>FBT</option><option>Payroll</option><option>Other</option>
                </select>
              </div>
              <div className="field"><label className="field-label">Due date</label><input className="input" type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} /></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
