// ============================================================================
// Ledgerline — HR & Leave (Directory · Leave · Timesheets)
// ============================================================================
import React, { useState } from 'react';
import { useStore, useCanWrite } from '../store';
import { fmtDate, fmtNumber, todayISO, addDays, daysBetween, sumBy } from '../utils';
import { Modal, Kpi, toast } from '../components';

const TABS = [
  { id: 'directory',   label: 'Employee Directory' },
  { id: 'leave',       label: 'Leave Management' },
  { id: 'timesheets',  label: 'Timesheets' },
];

export default function HRModule() {
  const [tab, setTab] = useState('directory');
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">HR & Leave</h1>
          <div className="page-sub">People, leave balances and timesheets</div>
        </div>
      </div>
      <div className="tabs">{TABS.map(t => <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
      {tab === 'directory'  && <Directory />}
      {tab === 'leave'      && <Leave />}
      {tab === 'timesheets' && <Timesheets />}
    </div>
  );
}

// -------- Directory --------
function Directory() {
  const { state } = useStore();
  return (
    <div>
      <div className="grid grid-4 mb-4">
        <Kpi label="Employees" value={String(state.employees.length)} />
        <Kpi label="Full-time" value={String(state.employees.filter(e => e.type === 'full-time').length)} />
        <Kpi label="Part-time" value={String(state.employees.filter(e => e.type === 'part-time').length)} />
        <Kpi label="Casual"    value={String(state.employees.filter(e => e.type === 'casual').length)} />
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">All employees</h3></div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Type</th><th>Start date</th><th className="right">Tenure</th><th className="right">Base rate</th></tr></thead>
            <tbody>
              {state.employees.map(e => {
                const days = daysBetween(e.startDate, todayISO());
                const years = Math.floor(days / 365);
                const months = Math.floor((days % 365) / 30);
                return (
                  <tr key={e.id}>
                    <td><b>{e.name}</b></td>
                    <td className="muted">{e.email}</td>
                    <td>{e.role}</td>
                    <td><span className="pill">{e.type}</span></td>
                    <td>{fmtDate(e.startDate)}</td>
                    <td className="num">{years}y {months}m</td>
                    <td className="num">${e.baseRate}/hr</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// -------- Leave --------
function Leave() {
  const { state, add, update, replace, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const startNew = () => {
    setDraft({ employeeId: state.employees[0]?.id, type: 'annual', from: todayISO(), to: addDays(todayISO(), 4), days: 5, status: 'pending', reason: '' });
    setOpen(true);
  };
  const save = () => {
    if (!Number(draft.days)) return toast('Days required', 'error');
    add('leaveRequests', { ...draft, days: Number(draft.days) });
    audit('created', 'LeaveRequest', `${draft.type} request`);
    toast('Submitted', 'success');
    setOpen(false);
  };
  const decide = (req, status) => {
    update('leaveRequests', req.id, { status });
    audit(status, 'LeaveRequest', `${req.type} for ${state.employees.find(e => e.id === req.employeeId)?.name}`);
    if (status === 'approved') {
      const bal = state.leaveBalances[req.employeeId] || {};
      const updated = { ...bal, [req.type]: Math.max(0, (bal[req.type] || 0) - Number(req.days)) };
      const all = { ...state.leaveBalances, [req.employeeId]: updated };
      replace('leaveBalances', all);
    }
    toast(`Marked ${status}`, 'success');
  };

  // Calendar with leave events
  const first = new Date(view.y, view.m, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const goPrev = () => setView(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 });
  const goNext = () => setView(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 });

  const eventsForDay = (d) => {
    if (!d) return [];
    const iso = d.toISOString().slice(0, 10);
    return state.leaveRequests.filter(r => r.from <= iso && r.to >= iso);
  };

  return (
    <div>
      <div className="grid grid-4 mb-4">
        {state.employees.slice(0, 4).map(e => {
          const b = state.leaveBalances[e.id] || {};
          return (
            <div key={e.id} className="kpi">
              <div className="kpi-label">{e.name.split(' ')[0]}'s leave</div>
              <div className="kpi-value">{(b.annual || 0).toFixed(1)} d</div>
              <div className="kpi-sub">Annual · {(b.personal || 0).toFixed(1)}d personal · {(b.longService || 0).toFixed(1)}d LSL</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-2 mb-4">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Leave requests</h3>
            {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ New request</button>}
          </div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Employee</th><th>Type</th><th>From → To</th><th className="right">Days</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {state.leaveRequests.map(r => {
                  const e = state.employees.find(x => x.id === r.employeeId);
                  return (
                    <tr key={r.id}>
                      <td><b>{e?.name || '—'}</b><div className="muted" style={{ fontSize: '0.82em' }}>{r.reason}</div></td>
                      <td><span className="pill">{r.type}</span></td>
                      <td>{fmtDate(r.from)} → {fmtDate(r.to)}</td>
                      <td className="num">{r.days}</td>
                      <td><span className={`pill ${r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : 'amber'}`}>{r.status}</span></td>
                      <td className="right">
                        {canWrite && r.status === 'pending' && <>
                          <button className="btn btn-ghost btn-sm" onClick={() => decide(r, 'approved')}>Approve</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => decide(r, 'rejected')}>Reject</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="row">
              <button className="btn" onClick={goPrev}>‹</button>
              <h3 className="card-title">{first.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</h3>
              <button className="btn" onClick={goNext}>›</button>
            </div>
          </div>
          <div className="card-body">
            <div className="cal">
              {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="cal-head">{d}</div>)}
              {cells.map((d, i) => {
                const ev = eventsForDay(d);
                return (
                  <div key={i} className={`cal-day ${!d ? 'other' : ''} ${d && d.toDateString() === today.toDateString() ? 'today' : ''}`}>
                    {d && <div className="num">{d.getDate()}</div>}
                    {ev.map((r, j) => {
                      const e = state.employees.find(x => x.id === r.employeeId);
                      const cls = r.status === 'approved' ? 'done' : r.status === 'pending' ? 'warn' : 'danger';
                      return <span key={j} className={`cal-event ${cls}`}>{e?.name?.split(' ')[0]}</span>;
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New leave request" footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Submit</button>
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
              <div className="field"><label className="field-label">Type</label>
                <select className="input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                  <option value="annual">Annual</option>
                  <option value="personal">Personal</option>
                  <option value="longService">Long service</option>
                  <option value="compassionate">Compassionate</option>
                </select>
              </div>
              <div className="field"><label className="field-label">Days</label><input className="input num" type="number" step="0.5" value={draft.days} onChange={e => setDraft({ ...draft, days: e.target.value })} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label className="field-label">From</label><input className="input" type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></div>
              <div className="field"><label className="field-label">To</label><input className="input" type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></div>
            </div>
            <div className="field"><label className="field-label">Reason</label><textarea className="input" value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// -------- Timesheets --------
function Timesheets() {
  const { state, add, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [empFilter, setEmpFilter] = useState('all');

  const last14 = (() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10); })();
  const items = state.timesheets.filter(t => t.date >= last14 && (empFilter === 'all' || t.employeeId === empFilter)).sort((a, b) => b.date.localeCompare(a.date));

  const totals = state.employees.map(e => {
    const ts = state.timesheets.filter(t => t.employeeId === e.id && t.date >= last14);
    return { ...e, regular: sumBy(ts, t => t.regularHrs), ot: sumBy(ts, t => t.otHrs) };
  });

  const startNew = () => {
    setDraft({ employeeId: state.employees[0]?.id, date: todayISO(), regularHrs: 8, otHrs: 0, notes: '' });
    setOpen(true);
  };
  const save = () => {
    add('timesheets', { ...draft, regularHrs: Number(draft.regularHrs), otHrs: Number(draft.otHrs) });
    audit('created', 'Timesheet', `${state.employees.find(e => e.id === draft.employeeId)?.name} on ${draft.date}`);
    toast('Saved', 'success');
    setOpen(false);
  };

  return (
    <div>
      <div className="grid grid-4 mb-4">
        {totals.map(e => (
          <div key={e.id} className="kpi">
            <div className="kpi-label">{e.name.split(' ')[0]} (14d)</div>
            <div className="kpi-value">{fmtNumber(e.regular, 1)} h</div>
            <div className="kpi-sub">+ {fmtNumber(e.ot, 1)}h overtime</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="row">
            <h3 className="card-title">Timesheet entries (last 14 days)</h3>
            <select className="input" style={{ marginLeft: 12, width: 200 }} value={empFilter} onChange={e => setEmpFilter(e.target.value)}>
              <option value="all">All employees</option>
              {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ Log time</button>}
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Date</th><th>Employee</th><th className="right">Regular</th><th className="right">Overtime</th><th className="right">Total</th><th>Notes</th></tr></thead>
            <tbody>
              {items.map(t => {
                const e = state.employees.find(x => x.id === t.employeeId);
                return (
                  <tr key={t.id}>
                    <td>{fmtDate(t.date)}</td>
                    <td><b>{e?.name}</b></td>
                    <td className="num">{fmtNumber(t.regularHrs, 1)}</td>
                    <td className={`num ${t.otHrs ? 'pos' : ''}`}>{t.otHrs ? fmtNumber(t.otHrs, 1) : '—'}</td>
                    <td className="num">{fmtNumber(t.regularHrs + t.otHrs, 1)}</td>
                    <td className="muted">{t.notes || '—'}</td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={6} className="empty">No timesheets</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Log timesheet" footer={
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
              <div className="field"><label className="field-label">Date</label><input className="input" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></div>
              <div className="field"></div>
            </div>
            <div className="field-row">
              <div className="field"><label className="field-label">Regular hours</label><input className="input num" type="number" step="0.25" value={draft.regularHrs} onChange={e => setDraft({ ...draft, regularHrs: e.target.value })} /></div>
              <div className="field"><label className="field-label">Overtime hours</label><input className="input num" type="number" step="0.25" value={draft.otHrs} onChange={e => setDraft({ ...draft, otHrs: e.target.value })} /></div>
            </div>
            <div className="field"><label className="field-label">Notes</label><textarea className="input" value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
