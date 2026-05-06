// ============================================================================
// Ledgerline — Bookkeeper module (double-entry, BAS, AP/AR, reconciliation)
// ============================================================================
import React, { useMemo, useState } from 'react';
import { useStore, useCanWrite } from '../store';
import {
  fmtCurrency, fmtDate, fmtSigned, todayISO, sumDebit, sumCredit, isJournalBalanced,
  trialBalance, accountBalance, agingBuckets, printPDF, daysBetween, fyOf, monthKey, addDays, sumBy,
} from '../utils';
import { Modal, Kpi, BarChart, toast } from '../components';

const TABS = [
  { id: 'coa',    label: 'Chart of Accounts' },
  { id: 'jrnl',   label: 'Journal Entries' },
  { id: 'tb',     label: 'Trial Balance' },
  { id: 'recon',  label: 'Bank Reconciliation' },
  { id: 'bas',    label: 'BAS / GST' },
  { id: 'apar',   label: 'AP / AR' },
];

export default function BookkeeperModule() {
  const [tab, setTab] = useState('coa');
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Bookkeeper</h1>
          <div className="page-sub">Double-entry general ledger · {fyLabel()}</div>
        </div>
      </div>
      <div className="tabs">{TABS.map(t => <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
      {tab === 'coa'   && <COA />}
      {tab === 'jrnl'  && <Journal />}
      {tab === 'tb'    && <TrialBalance />}
      {tab === 'recon' && <Reconciliation />}
      {tab === 'bas'   && <BAS />}
      {tab === 'apar'  && <APAR />}
    </div>
  );
}

function fyLabel() {
  const fy = fyOf(todayISO());
  return `FY${String(fy - 1).slice(2)}/${String(fy).slice(2)}`;
}

// ---------------- Chart of accounts ----------------
function COA() {
  const { state, add, update, remove, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState(null);
  const [filter, setFilter] = useState('');

  const filtered = state.chartOfAccounts.filter(a =>
    !filter ||
    a.code.includes(filter) ||
    a.name.toLowerCase().includes(filter.toLowerCase()) ||
    a.type.toLowerCase().includes(filter.toLowerCase())
  ).sort((a, b) => a.code.localeCompare(b.code));

  const groups = ['asset', 'liability', 'equity', 'revenue', 'expense'];

  const startNew = () => { setEdit(null); setDraft({ code: '', name: '', type: 'asset', subType: '', gst: 'GST 10%', active: true }); setOpen(true); };
  const startEdit = (a) => { setEdit(a); setDraft({ ...a }); setOpen(true); };
  const save = () => {
    if (!draft.code || !draft.name) return toast('Code and name required', 'error');
    if (edit) { update('chartOfAccounts', edit.id, draft); audit('updated', 'COA', `Updated ${draft.code}`); toast('Account updated', 'success'); }
    else { add('chartOfAccounts', { ...draft, id: 'coa_' + draft.code }); audit('created', 'COA', `Added ${draft.code}`); toast('Account added', 'success'); }
    setOpen(false);
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div className="row" style={{ flex: 1 }}>
            <h3 className="card-title">Chart of Accounts ({state.chartOfAccounts.length})</h3>
            <input className="input" placeholder="Filter…" style={{ maxWidth: 260, marginLeft: 16 }} value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ Add account</button>}
        </div>
        <div className="card-body tight">
          {groups.map(g => {
            const items = filtered.filter(a => a.type === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <div style={{ background: 'var(--panel-2)', padding: '7px 14px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{g}s</div>
                <table className="table">
                  <thead><tr><th>Code</th><th>Name</th><th>Sub-type</th><th>GST</th><th className="right">Balance</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {items.map(a => {
                      const bal = accountBalance(a.id, a.type, state.journalEntries);
                      return (
                        <tr key={a.id}>
                          <td className="mono">{a.code}</td>
                          <td>{a.name}</td>
                          <td className="muted">{a.subType || '—'}</td>
                          <td>{a.gst}</td>
                          <td className="num">{fmtCurrency(bal, 'AUD')}</td>
                          <td>{a.active ? <span className="pill green">Active</span> : <span className="pill">Inactive</span>}</td>
                          <td className="right">
                            {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => startEdit(a)}>Edit</button>}
                            {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => update('chartOfAccounts', a.id, { active: !a.active })}>{a.active ? 'Deactivate' : 'Activate'}</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Edit account' : 'New account'} footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field-row">
              <div className="field"><label className="field-label">Code</label><input className="input mono" value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} placeholder="4030" /></div>
              <div className="field"><label className="field-label">Type</label>
                <select className="input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                  <option value="asset">Asset</option><option value="liability">Liability</option>
                  <option value="equity">Equity</option><option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
            </div>
            <div className="field"><label className="field-label">Name</label><input className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="field-row">
              <div className="field"><label className="field-label">Sub-type</label><input className="input" value={draft.subType} onChange={e => setDraft({ ...draft, subType: e.target.value })} placeholder="current / fixed / opex / sales / cogs" /></div>
              <div className="field"><label className="field-label">GST treatment</label>
                <select className="input" value={draft.gst} onChange={e => setDraft({ ...draft, gst: e.target.value })}>
                  <option>GST 10%</option><option>GST Free</option><option>Input Taxed</option><option>BAS Excluded</option>
                </select>
              </div>
            </div>
            <label className="row"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Active</label>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------- Journal Entries ----------------
function Journal() {
  const { state, add, update, remove, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState(null);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const startNew = () => {
    setEdit(null);
    setDraft({
      date: todayISO(), ref: '', memo: '', status: 'draft',
      lines: [{ accountId: '', debit: 0, credit: 0, description: '' }, { accountId: '', debit: 0, credit: 0, description: '' }],
    });
    setOpen(true);
  };
  const startEdit = (j) => {
    setEdit(j);
    setDraft({ ...j, lines: j.lines.map(l => ({ ...l })) });
    setOpen(true);
  };

  const save = (postNow) => {
    const dr = sumDebit(draft.lines), cr = sumCredit(draft.lines);
    if (Math.abs(dr - cr) >= 0.005) return toast('Debits and credits must balance', 'error');
    if (dr === 0) return toast('Entry has zero amount', 'error');
    if (draft.lines.some(l => !l.accountId)) return toast('All lines need an account', 'error');
    const next = { ...draft, status: postNow ? 'posted' : draft.status };
    if (edit) {
      update('journalEntries', edit.id, next);
      audit(postNow ? 'posted' : 'updated', 'JournalEntry', `${next.ref || '(no ref)'} — ${next.memo}`);
    } else {
      const it = add('journalEntries', { ...next, createdAt: todayISO(), createdBy: state.currentUserId });
      audit(postNow ? 'posted' : 'created', 'JournalEntry', `${next.ref || '(no ref)'} — ${next.memo}`, it.id);
    }
    toast(postNow ? 'Posted' : 'Saved', 'success');
    setOpen(false);
  };

  const post = (j) => {
    if (!isJournalBalanced(j.lines)) return toast('Cannot post — unbalanced', 'error');
    update('journalEntries', j.id, { status: 'posted' });
    audit('posted', 'JournalEntry', j.ref || j.memo, j.id);
    toast('Posted', 'success');
  };
  const voidJE = (j) => {
    if (!window.confirm('Void this entry?')) return;
    update('journalEntries', j.id, { status: 'voided' });
    audit('voided', 'JournalEntry', j.ref || j.memo, j.id);
    toast('Voided', 'success');
  };
  const reverseJE = (j) => {
    const reversal = {
      date: todayISO(), ref: `REV-${j.ref || j.id.slice(-4)}`, memo: `Reversal of ${j.ref || j.id}`,
      status: 'posted', createdAt: todayISO(), createdBy: state.currentUserId,
      lines: j.lines.map(l => ({ ...l, debit: l.credit, credit: l.debit })),
    };
    add('journalEntries', reversal);
    audit('reversed', 'JournalEntry', reversal.memo);
    toast('Reversal posted', 'success');
  };

  const filtered = state.journalEntries.filter(j => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return j.ref?.toLowerCase().includes(q) || j.memo?.toLowerCase().includes(q);
  }).sort((a, b) => b.date.localeCompare(a.date));

  const updateLine = (i, patch) => {
    const lines = draft.lines.map((l, j) => j === i ? { ...l, ...patch } : l);
    setDraft({ ...draft, lines });
  };
  const addLine = () => setDraft({ ...draft, lines: [...draft.lines, { accountId: '', debit: 0, credit: 0, description: '' }] });
  const rmLine = (i) => setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) });

  const dr = draft ? sumDebit(draft.lines) : 0;
  const cr = draft ? sumCredit(draft.lines) : 0;
  const balanced = Math.abs(dr - cr) < 0.005;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div className="row">
            <h3 className="card-title">Journal Entries</h3>
            <input className="input" placeholder="Filter ref or memo…" style={{ maxWidth: 250, marginLeft: 12 }} value={filter} onChange={e => setFilter(e.target.value)} />
            <select className="input" style={{ width: 120 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All</option><option value="draft">Draft</option><option value="posted">Posted</option><option value="voided">Voided</option>
            </select>
          </div>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ New entry</button>}
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Date</th><th>Ref</th><th>Memo</th><th className="right">Debit</th><th className="right">Credit</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(j => (
                <tr key={j.id}>
                  <td>{fmtDate(j.date)}</td>
                  <td className="mono">{j.ref || '—'}</td>
                  <td>{j.memo}</td>
                  <td className="num">{fmtCurrency(sumDebit(j.lines), 'AUD')}</td>
                  <td className="num">{fmtCurrency(sumCredit(j.lines), 'AUD')}</td>
                  <td><span className={`pill ${j.status === 'posted' ? 'green' : j.status === 'voided' ? 'red' : 'amber'}`}>{j.status}</span></td>
                  <td className="right">
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(j)}>{j.status === 'posted' ? 'View' : 'Edit'}</button>
                    {canWrite && j.status === 'draft'  && <button className="btn btn-ghost btn-sm" onClick={() => post(j)}>Post</button>}
                    {canWrite && j.status === 'posted' && <button className="btn btn-ghost btn-sm" onClick={() => reverseJE(j)}>Reverse</button>}
                    {canWrite && j.status !== 'voided' && <button className="btn btn-ghost btn-sm" onClick={() => voidJE(j)}>Void</button>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="empty">No entries</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? `Journal entry ${edit.ref || ''}` : 'New journal entry'} size="lg" footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          {(!edit || edit.status === 'draft') && <button className="btn" onClick={() => save(false)}>Save draft</button>}
          {(!edit || edit.status === 'draft') && <button className="btn btn-primary" disabled={!balanced} onClick={() => save(true)}>Post entry</button>}
        </>
      }>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field-row-3">
              <div className="field"><label className="field-label">Date</label><input className="input" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></div>
              <div className="field"><label className="field-label">Reference</label><input className="input" value={draft.ref} onChange={e => setDraft({ ...draft, ref: e.target.value })} placeholder="INV-1042" /></div>
              <div className="field"><label className="field-label">Memo</label><input className="input" value={draft.memo} onChange={e => setDraft({ ...draft, memo: e.target.value })} /></div>
            </div>

            <table className="table">
              <thead><tr><th>Account</th><th>Description</th><th className="right">Debit</th><th className="right">Credit</th><th></th></tr></thead>
              <tbody>
                {draft.lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select className="input" value={l.accountId} onChange={e => updateLine(i, { accountId: e.target.value })}>
                        <option value="">—</option>
                        {state.chartOfAccounts.filter(a => a.active).sort((a, b) => a.code.localeCompare(b.code)).map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td><input className="input" value={l.description || ''} onChange={e => updateLine(i, { description: e.target.value })} /></td>
                    <td><input className="input num" type="number" step="0.01" value={l.debit || ''} onChange={e => updateLine(i, { debit: Number(e.target.value), credit: 0 })} /></td>
                    <td><input className="input num" type="number" step="0.01" value={l.credit || ''} onChange={e => updateLine(i, { credit: Number(e.target.value), debit: 0 })} /></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => rmLine(i)}>×</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><button className="btn btn-sm" onClick={addLine}>+ Add line</button></td>
                  <td className="num">{fmtCurrency(dr, 'AUD')}</td>
                  <td className="num">{fmtCurrency(cr, 'AUD')}</td>
                  <td>{balanced ? <span className="pill green">Balanced</span> : <span className="pill red">Off by {fmtCurrency(Math.abs(dr - cr), 'AUD')}</span>}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------- Trial balance ----------------
function TrialBalance() {
  const { state } = useStore();
  const tb = trialBalance(state.chartOfAccounts, state.journalEntries);
  const totalDr = tb.reduce((s, x) => s + x.debit, 0);
  const totalCr = tb.reduce((s, x) => s + x.credit, 0);

  return (
    <div>
      <div className="grid grid-3 mb-4">
        <Kpi label="Total debits" value={fmtCurrency(totalDr, 'AUD')} />
        <Kpi label="Total credits" value={fmtCurrency(totalCr, 'AUD')} />
        <Kpi label="Difference" value={fmtCurrency(totalDr - totalCr, 'AUD')} sub={Math.abs(totalDr - totalCr) < 0.005 ? 'Balanced ✓' : 'Investigate'} trend={Math.abs(totalDr - totalCr) < 0.005 ? 'up' : 'down'} />
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Trial Balance — {fyLabel()}</h3>
          <button className="btn btn-sm" onClick={() => printPDF('Trial Balance — Ledgerline')}>Export PDF</button>
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Code</th><th>Account</th><th>Type</th><th className="right">Debit</th><th className="right">Credit</th></tr></thead>
            <tbody>
              {tb.filter(r => r.debit > 0 || r.credit > 0).sort((a, b) => a.account.code.localeCompare(b.account.code)).map(r => (
                <tr key={r.account.id}>
                  <td className="mono">{r.account.code}</td>
                  <td>{r.account.name}</td>
                  <td><span className="pill">{r.account.type}</span></td>
                  <td className="num">{r.debit ? fmtCurrency(r.debit, 'AUD') : '—'}</td>
                  <td className="num">{r.credit ? fmtCurrency(r.credit, 'AUD') : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Totals</td>
                <td className="num">{fmtCurrency(totalDr, 'AUD')}</td>
                <td className="num">{fmtCurrency(totalCr, 'AUD')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------- Bank reconciliation ----------------
function Reconciliation() {
  const { state, update, audit } = useStore();
  const [accountId, setAccountId] = useState(state.accounts[0]?.id);
  const account = state.accounts.find(a => a.id === accountId);
  const txns = state.transactions.filter(t => t.accountId === accountId).sort((a, b) => b.date.localeCompare(a.date));

  const unrec = txns.filter(t => !t.reconciled);
  const rec = txns.filter(t => t.reconciled);

  const toggle = (t) => {
    update('transactions', t.id, { reconciled: !t.reconciled });
  };

  const matchBank = () => {
    let n = 0;
    for (const t of unrec) {
      // Naive: mark all dated >= 14 days ago reconciled as a "match"
      if (daysBetween(t.date, todayISO()) >= 14) {
        update('transactions', t.id, { reconciled: true });
        n++;
      }
    }
    audit('reconciled', 'Transaction', `Auto-reconciled ${n} items on ${account.name}`);
    toast(`Auto-reconciled ${n} items`, 'success');
  };

  const balRec = sumBy(rec, t => t.amount);
  const balUnrec = sumBy(unrec, t => t.amount);

  return (
    <div>
      <div className="row mb-4 wrap">
        <div className="field" style={{ minWidth: 280 }}>
          <label className="field-label">Account</label>
          <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
            {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={matchBank}>Auto-match older items</button>
      </div>

      <div className="grid grid-3 mb-4">
        <Kpi label="Reconciled balance"   value={fmtCurrency(balRec, account?.currency || 'AUD')} sub={`${rec.length} items`} />
        <Kpi label="Unreconciled balance" value={fmtCurrency(balUnrec, account?.currency || 'AUD')} sub={`${unrec.length} items`} />
        <Kpi label="Account balance"      value={fmtCurrency(account?.balance, account?.currency || 'AUD')} />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Unreconciled ({unrec.length})</h3></div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Date</th><th>Payee</th><th className="right">Amount</th><th></th></tr></thead>
              <tbody>
                {unrec.slice(0, 30).map(t => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.date)}</td>
                    <td>{t.payee}</td>
                    <td className={`num ${t.amount >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(t.amount, account?.currency)}</td>
                    <td className="right"><button className="btn btn-ghost btn-sm" onClick={() => toggle(t)}>Mark reconciled</button></td>
                  </tr>
                ))}
                {unrec.length === 0 && <tr><td colSpan={4} className="empty">All reconciled ✓</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Reconciled ({rec.length})</h3></div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Date</th><th>Payee</th><th className="right">Amount</th><th></th></tr></thead>
              <tbody>
                {rec.slice(0, 30).map(t => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.date)}</td>
                    <td>{t.payee}</td>
                    <td className={`num ${t.amount >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(t.amount, account?.currency)}</td>
                    <td className="right"><button className="btn btn-ghost btn-sm" onClick={() => toggle(t)}>Unmark</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- BAS ----------------
function BAS() {
  const { state, add, audit } = useStore();
  const today = todayISO();

  // Quarter boundaries (most recent finished quarter)
  const quarters = computeQuarters();
  const [qIdx, setQIdx] = useState(0);
  const q = quarters[qIdx];

  const lines = state.journalEntries.flatMap(j => j.status === 'posted' && j.date >= q.start && j.date <= q.end ? j.lines.map(l => ({ ...l, je: j })) : []);
  const accs = state.chartOfAccounts;
  const findAcc = (id) => accs.find(a => a.id === id);

  // G1 = total sales (incl GST)
  const g1 = lines.reduce((s, l) => {
    const a = findAcc(l.accountId);
    if (a && a.type === 'revenue' && a.gst === 'GST 10%') return s + (l.credit - l.debit) * 1.1; // gross-up exclusive amount
    return s;
  }, 0);

  // 1A — GST collected
  const oneA = lines.reduce((s, l) => l.accountId === 'coa_2200' ? s + (l.credit - l.debit) : s, 0);
  // 1B — GST paid
  const oneB = lines.reduce((s, l) => l.accountId === 'coa_2210' ? s + (l.debit - l.credit) : s, 0);

  // G3 — exports / GST-free supplies
  const g3 = lines.reduce((s, l) => {
    const a = findAcc(l.accountId);
    if (a && a.type === 'revenue' && a.gst === 'GST Free') return s + (l.credit - l.debit);
    return s;
  }, 0);

  // G10 — capital purchases (incl GST), G11 — non-capital purchases
  const g11 = lines.reduce((s, l) => {
    const a = findAcc(l.accountId);
    if (a && a.type === 'expense' && a.gst === 'GST 10%') return s + (l.debit - l.credit) * 1.1;
    return s;
  }, 0);

  // PAYG W1 (gross wages) and W2 (PAYG withheld)
  const w1 = lines.reduce((s, l) => l.accountId === 'coa_6000' ? s + (l.debit - l.credit) : s, 0);
  const w2 = lines.reduce((s, l) => l.accountId === 'coa_2300' ? s + (l.credit - l.debit) : s, 0);

  const fields = {
    G1: g1,            G2: 0,
    G3: g3,            G7: 0,
    G10: 0,            G11: g11,
    G20: 0,
    W1: w1,            W2: w2,
    '1A': oneA,        '1B': oneB,
    '7A': oneA,        '8A': oneA,
    '8B': oneB,        '9': oneA - oneB + w2,
  };

  const lodge = () => {
    add('bas', { period: q.label, status: 'lodged', lodgedDate: today, fields });
    audit('lodged', 'BAS', `${q.label}: net ${fmtCurrency(fields['9'], 'AUD')}`);
    toast('BAS marked lodged', 'success');
  };

  return (
    <div>
      <div className="row wrap mb-4">
        <div className="field" style={{ minWidth: 260 }}>
          <label className="field-label">Quarter</label>
          <select className="input" value={qIdx} onChange={e => setQIdx(Number(e.target.value))}>
            {quarters.map((q, i) => <option key={i} value={i}>{q.label}</option>)}
          </select>
        </div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => printPDF('BAS — ' + q.label)}>Export PDF</button>
        <button className="btn btn-primary btn-sm" onClick={lodge}>Mark lodged</button>
      </div>

      <div className="grid grid-3 mb-4">
        <Kpi label="GST collected (1A)" value={fmtCurrency(oneA, 'AUD')} />
        <Kpi label="GST paid (1B)" value={fmtCurrency(oneB, 'AUD')} />
        <Kpi label="Net GST + PAYG (9)" value={fmtCurrency(fields['9'], 'AUD')} sub={fields['9'] >= 0 ? 'Payable to ATO' : 'Refundable from ATO'} />
      </div>

      <div className="card mb-4">
        <div className="card-header"><h3 className="card-title">BAS form — {q.label}</h3></div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Field</th><th>Description</th><th className="right">Amount</th></tr></thead>
            <tbody>
              {[
                ['G1','Total sales (incl. GST)'],
                ['G2','Export sales'],
                ['G3','Other GST-free sales'],
                ['G7','Adjustments'],
                ['G10','Capital purchases (incl. GST)'],
                ['G11','Non-capital purchases (incl. GST)'],
                ['G20','Adjustments'],
                ['W1','Gross wages'],
                ['W2','PAYG withholding'],
                ['1A','GST collected on sales'],
                ['1B','GST credits on purchases'],
                ['7A','Total amounts at 1A & 5A'],
                ['8A','Total amounts at 1A,2A,3,4'],
                ['8B','Total amounts at 1B,5B,6,7'],
                ['9','Payment / refund (1A−1B+W2 etc.)'],
              ].map(([k, label]) => (
                <tr key={k}>
                  <td className="mono"><b>{k}</b></td>
                  <td>{label}</td>
                  <td className="num">{fmtCurrency(fields[k] || 0, 'AUD')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">BAS history</h3></div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Period</th><th>Lodged</th><th className="right">G1</th><th className="right">1A</th><th className="right">1B</th><th className="right">Net (9)</th><th>Status</th></tr></thead>
            <tbody>
              {state.bas.map(b => (
                <tr key={b.id}>
                  <td>{b.period}</td>
                  <td>{b.lodgedDate ? fmtDate(b.lodgedDate) : '—'}</td>
                  <td className="num">{fmtCurrency(b.fields.G1 || 0, 'AUD')}</td>
                  <td className="num">{fmtCurrency(b.fields['1A'] || 0, 'AUD')}</td>
                  <td className="num">{fmtCurrency(b.fields['1B'] || 0, 'AUD')}</td>
                  <td className="num">{fmtCurrency(b.fields['9'] || 0, 'AUD')}</td>
                  <td><span className={`pill ${b.status === 'lodged' ? 'green' : 'amber'}`}>{b.status}</span></td>
                </tr>
              ))}
              {state.bas.length === 0 && <tr><td colSpan={7} className="empty">No history</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function computeQuarters() {
  const today = new Date();
  const list = [];
  // current and previous 3 quarters in AU FY (Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun)
  const startMonths = [6, 9, 0, 3]; // 0-indexed (Jul, Oct, Jan, Apr) — Jul=6
  for (let i = 0; i < 4; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    d.setMonth(d.getMonth() - i * 3);
    const m = d.getMonth();
    let qStart = m;
    while (![6, 9, 0, 3].includes(qStart)) qStart -= 1;
    const startD = new Date(d.getFullYear(), qStart, 1);
    const endD = new Date(startD.getFullYear(), qStart + 3, 0);
    const q = qStart === 6 ? 'Q1' : qStart === 9 ? 'Q2' : qStart === 0 ? 'Q3' : 'Q4';
    const fyEnd = qStart >= 6 ? startD.getFullYear() + 1 : startD.getFullYear();
    const fyLab = `FY${String(fyEnd - 1).slice(2)}/${String(fyEnd).slice(2)}`;
    const monthsLabel = `${startD.toLocaleString('en-AU', { month: 'short' })}–${endD.toLocaleString('en-AU', { month: 'short' })}`;
    list.push({ label: `${q} ${fyLab} (${monthsLabel})`, start: startD.toISOString().slice(0, 10), end: endD.toISOString().slice(0, 10) });
  }
  // De-dupe and order most-recent first
  const seen = new Set();
  return list.filter(x => { if (seen.has(x.label)) return false; seen.add(x.label); return true; });
}

// ---------------- AP/AR ----------------
function APAR() {
  const { state, add, update, audit } = useStore();
  const canWrite = useCanWrite();
  const [tab, setTab] = useState('ar');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const list = tab === 'ap' ? state.ap : state.ar;
  const aging = agingBuckets(list);

  const startNew = () => {
    setDraft({
      [tab === 'ap' ? 'supplier' : 'customer']: '',
      invoiceNo: '', date: todayISO(), dueDate: addDays(todayISO(), 30),
      amount: 0, paid: 0, status: 'current',
    });
    setOpen(true);
  };
  const save = () => {
    if (!draft.amount) return toast('Amount required', 'error');
    add(tab, draft);
    audit('created', tab.toUpperCase(), `${tab === 'ap' ? draft.supplier : draft.customer} — ${draft.invoiceNo}`);
    toast('Added', 'success'); setOpen(false);
  };

  const markPaid = (it) => {
    update(tab, it.id, { paid: it.amount, status: 'paid' });
    audit('paid', tab.toUpperCase(), `${it.invoiceNo} marked paid`);
    toast('Marked paid', 'success');
  };
  const markPartial = (it) => {
    const amt = Number(prompt(`Partial payment amount (outstanding ${fmtCurrency(it.amount - (it.paid || 0), 'AUD')}):`, ''));
    if (!amt || amt <= 0) return;
    const newPaid = Math.min(it.amount, (it.paid || 0) + amt);
    update(tab, it.id, { paid: newPaid, status: newPaid >= it.amount ? 'paid' : 'partial' });
    toast('Recorded', 'success');
  };

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={`tab ${tab === 'ar' ? 'active' : ''}`} onClick={() => setTab('ar')}>Accounts Receivable</button>
        <button className={`tab ${tab === 'ap' ? 'active' : ''}`} onClick={() => setTab('ap')}>Accounts Payable</button>
      </div>

      <div className="grid grid-4 mb-4">
        <Kpi label="Current"  value={fmtCurrency(aging.current, 'AUD')} />
        <Kpi label="1–30 days" value={fmtCurrency(aging['30'],   'AUD')} />
        <Kpi label="31–60 days" value={fmtCurrency(aging['60'],  'AUD')} />
        <Kpi label="61+ days"  value={fmtCurrency(aging['90+'],  'AUD')} trend={aging['90+'] > 0 ? 'down' : ''} />
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{tab === 'ar' ? 'Receivables' : 'Payables'}</h3>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ New {tab === 'ar' ? 'invoice' : 'bill'}</button>}
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr>
              <th>{tab === 'ap' ? 'Supplier' : 'Customer'}</th>
              <th>Invoice #</th><th>Issued</th><th>Due</th>
              <th className="right">Amount</th><th className="right">Paid</th><th className="right">Outstanding</th>
              <th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {list.map(it => {
                const out = it.amount - (it.paid || 0);
                const overdue = out > 0 && new Date(it.dueDate) < new Date();
                return (
                  <tr key={it.id}>
                    <td><b>{tab === 'ap' ? it.supplier : it.customer}</b></td>
                    <td className="mono">{it.invoiceNo}</td>
                    <td>{fmtDate(it.date)}</td>
                    <td>{fmtDate(it.dueDate)}</td>
                    <td className="num">{fmtCurrency(it.amount, 'AUD')}</td>
                    <td className="num">{fmtCurrency(it.paid || 0, 'AUD')}</td>
                    <td className="num">{fmtCurrency(out, 'AUD')}</td>
                    <td><span className={`pill ${out === 0 ? 'green' : overdue ? 'red' : 'amber'}`}>
                      {out === 0 ? 'Paid' : overdue ? 'Overdue' : 'Open'}
                    </span></td>
                    <td className="right">
                      {canWrite && out > 0 && <>
                        <button className="btn btn-ghost btn-sm" onClick={() => markPartial(it)}>Partial</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => markPaid(it)}>Mark paid</button>
                      </>}
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={9} className="empty">Nothing here</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`New ${tab === 'ar' ? 'invoice' : 'bill'}`} footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field"><label className="field-label">{tab === 'ap' ? 'Supplier' : 'Customer'}</label>
              <input className="input" value={tab === 'ap' ? draft.supplier : draft.customer}
                onChange={e => setDraft({ ...draft, [tab === 'ap' ? 'supplier' : 'customer']: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field"><label className="field-label">Invoice #</label><input className="input" value={draft.invoiceNo} onChange={e => setDraft({ ...draft, invoiceNo: e.target.value })} /></div>
              <div className="field"><label className="field-label">Amount</label><input className="input" type="number" step="0.01" value={draft.amount} onChange={e => setDraft({ ...draft, amount: Number(e.target.value) })} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label className="field-label">Issued</label><input className="input" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></div>
              <div className="field"><label className="field-label">Due</label><input className="input" type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} /></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
