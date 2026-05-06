// ============================================================================
// Ledgerline — Settings (Profile · Users/RBAC · Recurring · Audit · Data)
// ============================================================================
import React, { useState } from 'react';
import { useStore, useCurrentUser } from '../store';
import { fmtCurrency, fmtDate, fmtDateTime, todayISO, addDays } from '../utils';
import { Modal, Kpi, toast } from '../components';

const TABS = [
  { id: 'profile',   label: 'Business Profile' },
  { id: 'users',     label: 'Users & Roles' },
  { id: 'display',   label: 'Display' },
  { id: 'recurring', label: 'Recurring Transactions' },
  { id: 'audit',     label: 'Audit Log' },
  { id: 'data',      label: 'Data' },
];

export default function SettingsModule() {
  const [tab, setTab] = useState('profile');
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">Business profile, users, display, recurring rules and data management</div>
        </div>
      </div>
      <div className="tabs">{TABS.map(t => <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
      {tab === 'profile'   && <Profile />}
      {tab === 'users'     && <Users />}
      {tab === 'display'   && <Display />}
      {tab === 'recurring' && <Recurring />}
      {tab === 'audit'     && <AuditLog />}
      {tab === 'data'      && <DataMgmt />}
    </div>
  );
}

function Profile() {
  const { state, setProfile, audit } = useStore();
  const [draft, setDraft] = useState({ ...state.profile });
  const save = () => {
    setProfile(draft);
    audit('updated', 'BusinessProfile', `Profile updated`);
    toast('Profile saved', 'success');
  };
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Business profile</h3></div>
      <div className="card-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
          <div className="field-row">
            <div className="field"><label className="field-label">Business / entity name</label><input className="input" value={draft.businessName} onChange={e => setDraft({ ...draft, businessName: e.target.value })} /></div>
            <div className="field"><label className="field-label">Trading name</label><input className="input" value={draft.tradingName || ''} onChange={e => setDraft({ ...draft, tradingName: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label className="field-label">ABN</label><input className="input mono" value={draft.abn} onChange={e => setDraft({ ...draft, abn: e.target.value })} /></div>
            <div className="field"><label className="field-label">Currency</label>
              <select className="input" value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value })}>
                {['AUD','USD','NZD','GBP','EUR'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label className="field-label">Address</label><input className="input" value={draft.address || ''} onChange={e => setDraft({ ...draft, address: e.target.value })} /></div>
          <div className="field"><label className="field-label">Contact email</label><input className="input" value={draft.contact || ''} onChange={e => setDraft({ ...draft, contact: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label className="field-label">Financial year start</label>
              <select className="input" value={draft.fyStartMonth} onChange={e => setDraft({ ...draft, fyStartMonth: Number(e.target.value) })}>
                <option value={7}>July (Australian)</option><option value={1}>January</option><option value={4}>April</option><option value={10}>October</option>
              </select>
            </div>
            <div className="field"><label className="field-label">Tax entity</label>
              <select className="input" value={draft.smallBusiness ? 'small' : 'full'} onChange={e => setDraft({ ...draft, smallBusiness: e.target.value === 'small' })}>
                <option value="small">Small business / base rate (25%)</option>
                <option value="full">Standard company (30%)</option>
              </select>
            </div>
          </div>
          <div><button className="btn btn-primary" onClick={save}>Save profile</button></div>
        </div>
      </div>
    </div>
  );
}

function Users() {
  const { state, add, update, remove, setCurrentUser, audit } = useStore();
  const me = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const isAdmin = me?.role === 'admin';

  const startNew = () => { setDraft({ name: '', email: '', role: 'read-only' }); setOpen(true); };
  const startEdit = (u) => { setDraft({ ...u }); setOpen(true); };
  const save = () => {
    if (!draft.name || !draft.email) return toast('Name & email required', 'error');
    if (draft.id) update('users', draft.id, draft);
    else add('users', draft);
    audit('updated', 'User', draft.name);
    toast('Saved', 'success');
    setOpen(false);
  };

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header"><h3 className="card-title">Active session</h3></div>
        <div className="card-body">
          <div className="field" style={{ maxWidth: 360 }}>
            <label className="field-label">Switch user (demo)</label>
            <select className="input" value={state.currentUserId} onChange={e => setCurrentUser(e.target.value)}>
              {state.users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
            </select>
          </div>
          <div className="muted mt-2" style={{ fontSize: '0.85em' }}>Read-only users can browse but not modify data. Admins can manage users and reset data.</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Users</h3>
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={startNew}>+ Add user</button>}
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Capabilities</th><th></th></tr></thead>
            <tbody>
              {state.users.map(u => (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td>
                  <td className="muted">{u.email}</td>
                  <td><span className={`pill ${u.role === 'admin' ? 'red' : u.role === 'accountant' ? 'amber' : 'blue'}`}>{u.role}</span></td>
                  <td className="muted" style={{ fontSize: '0.88em' }}>
                    {u.role === 'admin' ? 'Full access · user management · reset data'
                     : u.role === 'accountant' ? 'Create/edit/post entries · run reports'
                     : 'View-only across all modules'}
                  </td>
                  <td className="right">
                    {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => startEdit(u)}>Edit</button>}
                    {isAdmin && u.id !== me.id && <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Delete ${u.name}?`)) { remove('users', u.id); toast('Deleted'); } }}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={draft?.id ? 'Edit user' : 'Add user'} footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field"><label className="field-label">Name</label><input className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="field"><label className="field-label">Email</label><input className="input" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></div>
            <div className="field"><label className="field-label">Role</label>
              <select className="input" value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="accountant">Accountant</option>
                <option value="read-only">Read-only</option>
              </select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Display() {
  const { state, setProfile } = useStore();
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="card-header"><h3 className="card-title">Display preferences</h3></div>
      <div className="card-body">
        <div className="field">
          <label className="field-label">Interface text size: {state.profile.fontSize || 14}px</label>
          <input type="range" min="11" max="20" step="1" value={state.profile.fontSize || 14} onChange={e => setProfile({ fontSize: Number(e.target.value) })} style={{ width: '100%' }} />
          <div className="row between" style={{ fontSize: '0.78em', color: 'var(--text-muted)' }}><span>Compact</span><span>Default</span><span>Large</span></div>
        </div>
        <div className="muted mt-3" style={{ fontSize: '0.88em' }}>Changes apply immediately and persist between sessions.</div>
      </div>
    </div>
  );
}

function Recurring() {
  const { state, add, update, remove, audit } = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const startNew = () => { setDraft({ accountId: state.accounts[0]?.id, payee: '', amount: 0, category: 'cat_other_exp', freq: 'monthly', nextDate: addDays(todayISO(), 7) }); setOpen(true); };
  const startEdit = (r) => { setDraft({ ...r }); setOpen(true); };
  const save = () => {
    if (!draft.payee) return toast('Payee required', 'error');
    if (draft.id) update('recurring', draft.id, draft);
    else add('recurring', { ...draft, amount: Number(draft.amount) });
    audit('updated', 'Recurring', draft.payee);
    toast('Saved', 'success');
    setOpen(false);
  };

  const postNow = (r) => {
    add('transactions', {
      accountId: r.accountId, date: r.nextDate, payee: r.payee, amount: r.amount,
      category: r.category, memo: 'Auto-posted from recurring rule', reconciled: false, gst: 0,
    });
    const next = nextDate(r.nextDate, r.freq);
    update('recurring', r.id, { nextDate: next });
    audit('posted', 'Recurring', `Posted ${r.payee} ${fmtCurrency(r.amount, 'AUD')}`);
    toast('Posted next instance', 'success');
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Recurring transactions</h3>
        <button className="btn btn-primary btn-sm" onClick={startNew}>+ New rule</button>
      </div>
      <div className="card-body tight">
        <table className="table">
          <thead><tr><th>Payee</th><th>Account</th><th>Category</th><th className="right">Amount</th><th>Frequency</th><th>Next date</th><th></th></tr></thead>
          <tbody>
            {state.recurring.map(r => {
              const a = state.accounts.find(x => x.id === r.accountId);
              const c = state.categories.find(x => x.id === r.category);
              return (
                <tr key={r.id}>
                  <td><b>{r.payee}</b></td>
                  <td>{a?.name || '—'}</td>
                  <td>{c?.name || '—'}</td>
                  <td className={`num ${r.amount >= 0 ? 'pos' : 'neg'}`}>{fmtCurrency(r.amount, 'AUD')}</td>
                  <td><span className="pill">{r.freq}</span></td>
                  <td>{fmtDate(r.nextDate)}</td>
                  <td className="right">
                    <button className="btn btn-ghost btn-sm" onClick={() => postNow(r)}>Post now</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(r)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm('Delete?')) { remove('recurring', r.id); toast('Deleted'); } }}>×</button>
                  </td>
                </tr>
              );
            })}
            {state.recurring.length === 0 && <tr><td colSpan={7} className="empty">No recurring rules</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={draft?.id ? 'Edit rule' : 'New rule'} footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field"><label className="field-label">Payee / description</label><input className="input" value={draft.payee} onChange={e => setDraft({ ...draft, payee: e.target.value })} /></div>
            <div className="field-row">
              <div className="field"><label className="field-label">Account</label>
                <select className="input" value={draft.accountId} onChange={e => setDraft({ ...draft, accountId: e.target.value })}>
                  {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="field"><label className="field-label">Category</label>
                <select className="input" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>
                  {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field"><label className="field-label">Amount (negative = expense)</label><input className="input num" type="number" step="0.01" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} /></div>
              <div className="field"><label className="field-label">Frequency</label>
                <select className="input" value={draft.freq} onChange={e => setDraft({ ...draft, freq: e.target.value })}>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            <div className="field"><label className="field-label">Next date</label><input className="input" type="date" value={draft.nextDate} onChange={e => setDraft({ ...draft, nextDate: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function nextDate(d, freq) {
  const days = { weekly: 7, fortnightly: 14, monthly: 30, quarterly: 91, yearly: 365 };
  return addDays(d, days[freq] || 30);
}

function AuditLog() {
  const { state } = useStore();
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Audit log ({state.audit.length} entries · last 500 retained)</h3></div>
      <div className="card-body tight">
        <table className="table">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Summary</th></tr></thead>
          <tbody>
            {state.audit.slice(0, 100).map(a => {
              const u = state.users.find(x => x.id === a.userId);
              return (
                <tr key={a.id}>
                  <td>{fmtDateTime(a.ts)}</td>
                  <td>{u?.name || a.userId || '—'}</td>
                  <td><span className="pill">{a.action}</span></td>
                  <td className="muted">{a.entity}</td>
                  <td>{a.summary}</td>
                </tr>
              );
            })}
            {state.audit.length === 0 && <tr><td colSpan={5} className="empty">No audit entries yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataMgmt() {
  const { state, resetAll, setOnboarded } = useStore();

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ledgerline-export-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Export downloaded', 'success');
  };

  return (
    <div className="grid grid-2">
      <div className="card">
        <div className="card-header"><h3 className="card-title">Export</h3></div>
        <div className="card-body">
          <p className="muted" style={{ marginTop: 0, fontSize: '0.92em' }}>Download a complete JSON snapshot of all your data.</p>
          <button className="btn btn-primary" onClick={exportData}>Download JSON snapshot</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">Reset / re-run onboarding</h3></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.92em' }}>Replace everything with fresh sample data, or just replay the first-run setup wizard.</p>
          <div className="row">
            <button className="btn" onClick={() => { setOnboarded(false); toast('Onboarding will appear on next view', 'success'); }}>Replay onboarding</button>
            <button className="btn btn-danger" onClick={() => {
              if (!window.confirm('Reset ALL data and replace with samples? This cannot be undone.')) return;
              resetAll();
              toast('Reset complete', 'success');
            }}>Reset to sample data</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-header"><h3 className="card-title">Storage summary</h3></div>
        <div className="card-body">
          <div className="grid grid-4">
            <Kpi label="Transactions"     value={String(state.transactions.length)} />
            <Kpi label="Journal entries"  value={String(state.journalEntries.length)} />
            <Kpi label="Accounts (CoA)"   value={String(state.chartOfAccounts.length)} />
            <Kpi label="Audit entries"    value={String(state.audit.length)} />
          </div>
        </div>
      </div>
    </div>
  );
}
