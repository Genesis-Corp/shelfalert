// ============================================================================
// Ledgerline — Home Dashboard
// ============================================================================
import React, { useMemo } from 'react';
import { useStore, useCurrentUser } from '../store';
import {
  fmtCurrency, fmtDate, fmtSigned, fmtPct, toAUD, monthKey, daysBetween, todayISO, sumBy,
} from '../utils';
import { Kpi, Sparkline } from '../components';

export default function HomeModule({ onNavigate }) {
  const { state } = useStore();
  const user = useCurrentUser();
  const cur = state.profile.currency || 'AUD';
  const today = todayISO();
  const cm = today.slice(0, 7);

  // Net worth (AUD)
  const netWorth = useMemo(() => {
    return state.accounts.reduce((s, a) => s + toAUD(a.balance, a.currency), 0)
      - state.debts.filter(d => d.type !== 'credit').reduce((s, d) => s + d.balance, 0);
  }, [state.accounts, state.debts]);

  // Month income/expense from transactions (personal accounts)
  const monthIncome = useMemo(() => sumBy(
    state.transactions.filter(t => t.date.startsWith(cm) && t.amount > 0),
    t => t.amount
  ), [state.transactions, cm]);
  const monthExpense = useMemo(() => sumBy(
    state.transactions.filter(t => t.date.startsWith(cm) && t.amount < 0),
    t => -t.amount
  ), [state.transactions, cm]);

  const cashOnHand = useMemo(() => state.accounts
    .filter(a => ['bank', 'savings'].includes(a.type))
    .reduce((s, a) => s + toAUD(a.balance, a.currency), 0), [state.accounts]);

  // Portfolio top holdings
  const holdings = useMemo(() => state.portfolio.map(p => {
    const m = state.marketPrices[p.ticker] || { price: p.avgCost, change: 0 };
    const value = m.price * p.qty;
    const dailyPct = m.openPrice ? (m.change / m.openPrice) * 100 : 0;
    const totalPct = ((m.price - p.avgCost) / p.avgCost) * 100;
    return { ...p, price: m.price, value, dailyPct, totalPct, history: m.history };
  }).sort((a, b) => b.value - a.value), [state.portfolio, state.marketPrices]);

  // Upcoming deadlines (next 60 days, not lodged)
  const upcomingDeadlines = useMemo(() => state.taxDeadlines
    .filter(d => !d.lodged && daysBetween(today, d.dueDate) >= 0 && daysBetween(today, d.dueDate) <= 60)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5), [state.taxDeadlines, today]);

  // Upcoming bills (recurring with negative amount)
  const upcomingBills = useMemo(() => state.recurring
    .filter(r => r.amount < 0 && daysBetween(today, r.nextDate) >= 0 && daysBetween(today, r.nextDate) <= 30)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 5), [state.recurring, today]);

  // Recent transactions
  const recent = useMemo(() => [...state.transactions].slice(0, 7), [state.transactions]);

  // Active alerts
  const activeAlerts = state.alertEvents.filter(e => !e.dismissed);

  // AI summary
  const aiSummary = useMemo(() => generateAISummary({ state, netWorth, monthIncome, monthExpense, holdings, activeAlerts }), [state, netWorth, monthIncome, monthExpense, holdings, activeAlerts]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome back, {user?.name?.split(' ')[0]}</h1>
          <div className="page-sub">{state.profile.businessName} · {fmtDate(today)}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => onNavigate('book')}>Add transaction</button>
          <button className="btn" onClick={() => onNavigate('tax')}>Tax centre</button>
          <button className="btn btn-primary" onClick={() => onNavigate('ai')}>Ask AI</button>
        </div>
      </div>

      {/* Top KPI strip */}
      <div className="grid grid-4 mb-4">
        <Kpi label="Net worth" value={fmtCurrency(netWorth, 'AUD')} sub="across all accounts" />
        <Kpi label="Cash on hand" value={fmtCurrency(cashOnHand, 'AUD')} sub="bank + savings" />
        <Kpi
          label="Income (MTD)"
          value={fmtCurrency(monthIncome, cur)}
          sub={`vs Expenses ${fmtCurrency(monthExpense, cur)}`}
          trend={monthIncome > monthExpense ? 'up' : 'down'}
        />
        <Kpi
          label="Active alerts"
          value={String(activeAlerts.length)}
          sub={activeAlerts.length ? 'requires attention' : 'all clear'}
          trend={activeAlerts.some(a => a.severity === 'critical') ? 'down' : ''}
        />
      </div>

      {/* AI summary card */}
      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title">◇ Financial health summary</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('ai')}>Open assistant →</button>
        </div>
        <div className="card-body">
          <p style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{aiSummary}</p>
        </div>
      </div>

      <div className="grid grid-2 mb-4">
        {/* Top holdings */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Top holdings</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('market')}>Market terminal →</button>
          </div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Ticker</th><th>Qty</th><th>Value</th><th>Day</th><th>Total</th><th>30-day</th></tr></thead>
              <tbody>
                {holdings.slice(0, 6).map(h => (
                  <tr key={h.id}>
                    <td><b>{h.ticker}</b><div className="muted" style={{ fontSize: '0.82em' }}>{h.name}</div></td>
                    <td className="num">{h.qty}</td>
                    <td className="num">{fmtCurrency(h.value, 'AUD')}</td>
                    <td className={`num ${h.dailyPct >= 0 ? 'pos' : 'neg'}`}>{h.dailyPct >= 0 ? '+' : ''}{h.dailyPct.toFixed(2)}%</td>
                    <td className={`num ${h.totalPct >= 0 ? 'pos' : 'neg'}`}>{h.totalPct >= 0 ? '+' : ''}{h.totalPct.toFixed(1)}%</td>
                    <td><Sparkline values={(h.history || []).slice(-30)} color={h.totalPct >= 0 ? '#0c8a5b' : '#b3261e'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upcoming */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Upcoming</h3>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: '0.82em', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Tax deadlines</div>
              {upcomingDeadlines.length === 0 ? (
                <div className="muted" style={{ fontSize: '0.9em' }}>No deadlines in next 60 days</div>
              ) : upcomingDeadlines.map(d => {
                const days = daysBetween(today, d.dueDate);
                return (
                  <div key={d.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                    <span><b>{d.label}</b> <span className="muted" style={{ fontSize: '0.85em' }}>· {d.kind}</span></span>
                    <span className={`pill ${days <= 7 ? 'red' : days <= 21 ? 'amber' : 'blue'}`}>
                      {fmtDate(d.dueDate)} · {days}d
                    </span>
                  </div>
                );
              })}
            </div>
            <div>
              <div style={{ fontSize: '0.82em', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Bills due</div>
              {upcomingBills.length === 0 ? (
                <div className="muted" style={{ fontSize: '0.9em' }}>No bills in next 30 days</div>
              ) : upcomingBills.map(b => (
                <div key={b.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                  <span><b>{b.payee}</b></span>
                  <span className="num">{fmtCurrency(b.amount, cur)} · {fmtDate(b.nextDate)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent transactions</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('personal')}>All transactions →</button>
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Date</th><th>Payee</th><th>Account</th><th>Category</th><th className="right">Amount</th></tr></thead>
            <tbody>
              {recent.map(t => {
                const acc = state.accounts.find(a => a.id === t.accountId);
                const cat = state.categories.find(c => c.id === t.category)?.name || '—';
                return (
                  <tr key={t.id}>
                    <td>{fmtDate(t.date)}</td>
                    <td>{t.payee}</td>
                    <td>{acc?.name}</td>
                    <td>{cat}</td>
                    <td className={`num ${t.amount >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(t.amount, acc?.currency)}</td>
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

function generateAISummary({ state, netWorth, monthIncome, monthExpense, holdings, activeAlerts }) {
  const cur = state.profile.currency || 'AUD';
  const surplus = monthIncome - monthExpense;
  const savingsRate = monthIncome > 0 ? (surplus / monthIncome) * 100 : 0;
  const portfolioValue = holdings.reduce((s, h) => s + h.value, 0);
  const portfolioDay = holdings.reduce((s, h) => s + (h.dailyPct * h.value / 100), 0);
  const dayPct = portfolioValue ? (portfolioDay / portfolioValue) * 100 : 0;
  const overdueAR = state.ar.filter(a => a.status !== 'paid' && new Date(a.dueDate) < new Date()).length;

  const lines = [];
  lines.push(`Your net worth is ${fmtCurrency(netWorth, 'AUD')} across ${state.accounts.length} accounts. Month-to-date you've earned ${fmtCurrency(monthIncome, cur)} and spent ${fmtCurrency(monthExpense, cur)} — a savings rate of ${savingsRate.toFixed(1)}%.`);
  lines.push(`Your portfolio is worth ${fmtCurrency(portfolioValue, 'AUD')} (${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}% today).`);
  if (overdueAR > 0) lines.push(`There are ${overdueAR} overdue customer invoices — consider chasing payment.`);
  if (activeAlerts.length > 0) {
    const crit = activeAlerts.filter(a => a.severity === 'critical').length;
    lines.push(crit > 0 ? `${crit} critical alert${crit === 1 ? '' : 's'} need immediate review.` : `${activeAlerts.length} alerts are active.`);
  }
  if (savingsRate < 15 && monthIncome > 0) lines.push(`Tip: a savings rate of 15–25% gives most households a comfortable cushion.`);
  return lines.join(' ');
}
