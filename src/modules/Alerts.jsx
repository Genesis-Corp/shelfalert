// ============================================================================
// Ledgerline — Smart Alerts (rule-based monitoring + email digest)
// ============================================================================
import React, { useMemo, useState } from 'react';
import { useStore, useCanWrite } from '../store';
import { fmtCurrency, fmtDate, fmtDateTime, todayISO, daysBetween, toAUD } from '../utils';
import { Modal, Kpi, toast } from '../components';

const KIND_LABELS = {
  balance_below: 'Balance below threshold',
  tx_above:      'Transaction over amount',
  cc_balance:    'Credit card balance over',
  ar_overdue:    'Receivable overdue',
  bas_due_soon:  'BAS deadline approaching',
  budget_over:   'Budget exceeded',
};

export default function AlertsModule() {
  const { state, add, update, remove, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [digestOpen, setDigestOpen] = useState(false);
  const [digestEmail, setDigestEmail] = useState(state.profile.contact || '');
  const [digestFreq, setDigestFreq] = useState('weekly');

  const evaluated = useMemo(() => evaluateRules(state), [state]);
  const triggered = evaluated.filter(t => t.triggered);
  const active = state.alertEvents.filter(e => !e.dismissed);

  const startNew = () => { setDraft({ name: '', kind: 'balance_below', enabled: true, severity: 'warning', params: {} }); setOpen(true); };
  const startEdit = (r) => { setDraft({ ...r, params: { ...r.params } }); setOpen(true); };
  const save = () => {
    if (!draft.name) return toast('Name required', 'error');
    if (draft.id) update('alertRules', draft.id, draft);
    else add('alertRules', draft);
    audit('saved', 'AlertRule', draft.name);
    toast('Saved', 'success');
    setOpen(false);
  };

  const runNow = () => {
    let added = 0;
    for (const t of triggered) {
      add('alertEvents', { ruleId: t.rule.id, message: t.message, severity: t.rule.severity, createdAt: todayISO(), dismissed: false });
      added++;
    }
    audit('ran', 'AlertEngine', `Generated ${added} new alerts`);
    toast(`${added} new alerts generated`, 'success');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Smart Alerts</h1>
          <div className="page-sub">Rule-based monitoring across your finances</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setDigestOpen(true)}>Email digest…</button>
          <button className="btn btn-primary" onClick={runNow}>Run rules now</button>
        </div>
      </div>

      <div className="grid grid-4 mb-4">
        <Kpi label="Active alerts" value={String(active.length)} />
        <Kpi label="Critical"      value={String(active.filter(a => a.severity === 'critical').length)} trend={active.some(a => a.severity === 'critical') ? 'down' : ''} />
        <Kpi label="Warnings"      value={String(active.filter(a => a.severity === 'warning').length)} />
        <Kpi label="Rules"         value={`${state.alertRules.filter(r => r.enabled).length} / ${state.alertRules.length}`} sub="enabled / total" />
      </div>

      <div className="grid grid-2 mb-4">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Active alerts</h3></div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Severity</th><th>Message</th><th>When</th><th></th></tr></thead>
              <tbody>
                {active.map(a => (
                  <tr key={a.id}>
                    <td><span className={`pill ${a.severity === 'critical' ? 'red' : a.severity === 'warning' ? 'amber' : 'blue'}`}>{a.severity}</span></td>
                    <td>{a.message}</td>
                    <td>{fmtDate(a.createdAt)}</td>
                    <td className="right">{canWrite && <button className="btn btn-ghost btn-sm" onClick={() => { update('alertEvents', a.id, { dismissed: true }); toast('Dismissed'); }}>Dismiss</button>}</td>
                  </tr>
                ))}
                {active.length === 0 && <tr><td colSpan={4} className="empty">All clear ✓</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Triggered (preview)</h3></div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Rule</th><th>Status</th><th>Message</th></tr></thead>
              <tbody>
                {evaluated.map(t => (
                  <tr key={t.rule.id}>
                    <td><b>{t.rule.name}</b><div className="muted" style={{ fontSize: '0.82em' }}>{KIND_LABELS[t.rule.kind]}</div></td>
                    <td>{t.triggered ? <span className={`pill ${t.rule.severity === 'critical' ? 'red' : t.rule.severity === 'warning' ? 'amber' : 'blue'}`}>{t.rule.severity}</span> : <span className="pill green">OK</span>}</td>
                    <td className="muted" style={{ fontSize: '0.9em' }}>{t.message || 'No issues detected'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Rules</h3>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ New rule</button>}
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Name</th><th>Kind</th><th>Severity</th><th>Parameters</th><th>Enabled</th><th></th></tr></thead>
            <tbody>
              {state.alertRules.map(r => (
                <tr key={r.id}>
                  <td><b>{r.name}</b></td>
                  <td>{KIND_LABELS[r.kind]}</td>
                  <td><span className={`pill ${r.severity === 'critical' ? 'red' : r.severity === 'warning' ? 'amber' : 'blue'}`}>{r.severity}</span></td>
                  <td className="muted">{describeParams(state, r)}</td>
                  <td><label className="row"><input type="checkbox" checked={r.enabled} onChange={() => canWrite && update('alertRules', r.id, { enabled: !r.enabled })} /> {r.enabled ? 'On' : 'Off'}</label></td>
                  <td className="right">
                    {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => startEdit(r)}>Edit</button>}
                    {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm('Delete this rule?')) { remove('alertRules', r.id); toast('Deleted'); } }}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / new rule */}
      <Modal open={open} onClose={() => setOpen(false)} title={draft?.id ? 'Edit rule' : 'New alert rule'} footer={
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
                <select className="input" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value, params: {} })}>
                  {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field"><label className="field-label">Severity</label>
                <select className="input" value={draft.severity} onChange={e => setDraft({ ...draft, severity: e.target.value })}>
                  <option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option>
                </select>
              </div>
            </div>

            {draft.kind === 'balance_below' && (
              <div className="field-row">
                <div className="field"><label className="field-label">Account</label>
                  <select className="input" value={draft.params.accountId || ''} onChange={e => setDraft({ ...draft, params: { ...draft.params, accountId: e.target.value } })}>
                    <option value="">—</option>
                    {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="field"><label className="field-label">Threshold (AUD)</label>
                  <input className="input num" type="number" value={draft.params.threshold || ''} onChange={e => setDraft({ ...draft, params: { ...draft.params, threshold: Number(e.target.value) } })} />
                </div>
              </div>
            )}
            {draft.kind === 'cc_balance' && (
              <div className="field-row">
                <div className="field"><label className="field-label">Credit card account</label>
                  <select className="input" value={draft.params.accountId || ''} onChange={e => setDraft({ ...draft, params: { ...draft.params, accountId: e.target.value } })}>
                    <option value="">—</option>
                    {state.accounts.filter(a => a.type === 'credit').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="field"><label className="field-label">Threshold (absolute, AUD)</label>
                  <input className="input num" type="number" value={draft.params.threshold || ''} onChange={e => setDraft({ ...draft, params: { ...draft.params, threshold: Number(e.target.value) } })} />
                </div>
              </div>
            )}
            {draft.kind === 'tx_above' && (
              <div className="field"><label className="field-label">Threshold (absolute, AUD)</label>
                <input className="input num" type="number" value={draft.params.threshold || ''} onChange={e => setDraft({ ...draft, params: { ...draft.params, threshold: Number(e.target.value) } })} />
              </div>
            )}
            {(draft.kind === 'ar_overdue' || draft.kind === 'bas_due_soon') && (
              <div className="field"><label className="field-label">Days threshold</label>
                <input className="input num" type="number" value={draft.params.days || ''} onChange={e => setDraft({ ...draft, params: { ...draft.params, days: Number(e.target.value) } })} />
              </div>
            )}
            {draft.kind === 'budget_over' && (
              <div className="field"><label className="field-label">Trigger when % of budget reaches</label>
                <input className="input num" type="number" value={draft.params.pct || ''} onChange={e => setDraft({ ...draft, params: { ...draft.params, pct: Number(e.target.value) } })} />
              </div>
            )}

            <label className="row"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /> Rule enabled</label>
          </div>
        )}
      </Modal>

      <Modal open={digestOpen} onClose={() => setDigestOpen(false)} title="Schedule email digest" footer={
        <>
          <button className="btn" onClick={() => setDigestOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { audit('scheduled', 'EmailDigest', `${digestFreq} → ${digestEmail}`); toast('Digest scheduled', 'success'); setDigestOpen(false); }}>Schedule</button>
        </>
      }>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.92em' }}>Send a summary of all triggered alerts on a schedule.</p>
        <div className="field-row">
          <div className="field"><label className="field-label">Frequency</label>
            <select className="input" value={digestFreq} onChange={e => setDigestFreq(e.target.value)}>
              <option value="daily">Daily (8am)</option>
              <option value="weekly">Weekly (Mondays)</option>
              <option value="monthly">Monthly (1st)</option>
            </select>
          </div>
          <div className="field"><label className="field-label">Email</label><input className="input" type="email" value={digestEmail} onChange={e => setDigestEmail(e.target.value)} /></div>
        </div>
      </Modal>
    </div>
  );
}

function describeParams(state, rule) {
  const p = rule.params || {};
  switch (rule.kind) {
    case 'balance_below': {
      const a = state.accounts.find(x => x.id === p.accountId);
      return `${a?.name || '—'} ≤ ${fmtCurrency(p.threshold || 0, 'AUD')}`;
    }
    case 'cc_balance': {
      const a = state.accounts.find(x => x.id === p.accountId);
      return `${a?.name || '—'} ≥ ${fmtCurrency(p.threshold || 0, 'AUD')}`;
    }
    case 'tx_above': return `|amount| ≥ ${fmtCurrency(p.threshold || 0, 'AUD')}`;
    case 'ar_overdue': return `Overdue by ${p.days || 0} days`;
    case 'bas_due_soon': return `Within ${p.days || 0} days`;
    case 'budget_over': return `≥ ${p.pct || 100}% of budget`;
    default: return '';
  }
}

function evaluateRules(state) {
  const out = [];
  for (const rule of state.alertRules) {
    if (!rule.enabled) { out.push({ rule, triggered: false, message: '(disabled)' }); continue; }
    const r = evaluateOne(state, rule);
    out.push({ rule, ...r });
  }
  return out;
}

function evaluateOne(state, rule) {
  const p = rule.params || {};
  switch (rule.kind) {
    case 'balance_below': {
      const a = state.accounts.find(x => x.id === p.accountId);
      if (!a) return { triggered: false, message: 'No account selected' };
      const aud = toAUD(a.balance, a.currency);
      if (aud < (p.threshold || 0)) return { triggered: true, message: `${a.name} balance ${fmtCurrency(aud, 'AUD')} below threshold ${fmtCurrency(p.threshold, 'AUD')}` };
      return { triggered: false, message: `${a.name} balance ${fmtCurrency(aud, 'AUD')} OK` };
    }
    case 'cc_balance': {
      const a = state.accounts.find(x => x.id === p.accountId);
      if (!a) return { triggered: false, message: 'No account selected' };
      if (Math.abs(a.balance) >= (p.threshold || 0)) return { triggered: true, message: `${a.name} balance ${fmtCurrency(a.balance, 'AUD')} exceeds ${fmtCurrency(p.threshold, 'AUD')}` };
      return { triggered: false, message: '' };
    }
    case 'tx_above': {
      const last30 = state.transactions.filter(t => daysBetween(t.date, todayISO()) <= 30);
      const big = last30.filter(t => Math.abs(t.amount) >= (p.threshold || 0));
      if (big.length) {
        const t = big[0];
        return { triggered: true, message: `Large transaction: ${t.payee} ${fmtCurrency(t.amount, 'AUD')} on ${fmtDate(t.date)} (+${big.length - 1} more)` };
      }
      return { triggered: false, message: '' };
    }
    case 'ar_overdue': {
      const overdue = state.ar.filter(a => a.status !== 'paid' && daysBetween(a.dueDate, todayISO()) >= (p.days || 0));
      if (overdue.length) {
        const x = overdue[0];
        return { triggered: true, message: `${overdue.length} invoice${overdue.length === 1 ? '' : 's'} overdue (oldest: ${x.invoiceNo} ${fmtCurrency(x.amount, 'AUD')})` };
      }
      return { triggered: false, message: '' };
    }
    case 'bas_due_soon': {
      const soon = state.taxDeadlines.filter(d => d.kind === 'BAS' && !d.lodged && daysBetween(todayISO(), d.dueDate) >= 0 && daysBetween(todayISO(), d.dueDate) <= (p.days || 0));
      if (soon.length) return { triggered: true, message: `BAS due in ${daysBetween(todayISO(), soon[0].dueDate)} days: ${soon[0].label}` };
      return { triggered: false, message: '' };
    }
    case 'budget_over': {
      const cm = todayISO().slice(0, 7);
      const budget = state.budgets[cm] || {};
      const overs = [];
      for (const c of state.categories.filter(x => x.kind === 'expense')) {
        const spent = state.transactions
          .filter(t => t.date.startsWith(cm) && t.category === c.id && t.amount < 0)
          .reduce((s, t) => s + (-t.amount), 0);
        const b = Number(budget[c.id] || 0);
        if (b > 0 && spent / b * 100 >= (p.pct || 100)) overs.push({ name: c.name, pct: spent / b * 100 });
      }
      if (overs.length) return { triggered: true, message: `${overs.length} categories over budget — ${overs.map(o => `${o.name} (${o.pct.toFixed(0)}%)`).join(', ')}` };
      return { triggered: false, message: '' };
    }
    default: return { triggered: false, message: '' };
  }
}
