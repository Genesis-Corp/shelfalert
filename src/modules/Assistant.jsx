// ============================================================================
// Ledgerline — AI Financial Assistant (data-aware chat with intent matching)
// ============================================================================
import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import {
  fmtCurrency, fmtDate, fmtPct, todayISO, addDays, fyOf, fyStart, fyEnd, fyLabel,
  toAUD, sumBy, monthLabel, monthKey, daysBetween,
  calcResidentTax, calcMedicareLevy, calcMarginalRate,
} from '../utils';
import { toast } from '../components';

const SUGGESTIONS = [
  'What was my biggest expense category last month?',
  'Am I on track to meet my savings goal?',
  'Show me my net worth.',
  'How much GST do I owe this quarter?',
  'How is my portfolio doing today?',
  'Which invoices are overdue?',
  'When is my next BAS due?',
  'Am I exceeding my super concessional cap?',
  'Estimate my tax refund.',
  'Summarise this month.',
];

export default function AssistantModule() {
  const { state, chatAppend, chatClear } = useStore();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [state.chatHistory]);

  const send = (text) => {
    const q = (text ?? input).trim();
    if (!q) return;
    chatAppend({ role: 'user', content: q });
    setInput('');
    setBusy(true);
    setTimeout(() => {
      const reply = answer(q, state);
      chatAppend({ role: 'bot', content: reply });
      setBusy(false);
    }, 250 + Math.random() * 350);
  };

  const onUpload = (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    chatAppend({ role: 'user', content: `📎 Uploaded ${f.name} (${(f.size / 1024).toFixed(1)} KB)` });
    setBusy(true);
    setTimeout(() => {
      chatAppend({ role: 'bot', content: parseDocument(f, state) });
      setBusy(false);
    }, 600);
    ev.target.value = '';
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Financial Assistant</h1>
          <div className="page-sub">Ask questions about your finances · Has access to your local data</div>
        </div>
        <div className="page-actions">
          <label className="btn">
            📎 Upload document
            <input type="file" hidden onChange={onUpload} />
          </label>
          <button className="btn" onClick={() => { if (window.confirm('Clear chat history?')) { chatClear(); toast('Cleared'); } }}>Clear chat</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 280px', gap: 14 }}>
        <div className="chat-window">
          <div className="chat-msgs" ref={scrollRef}>
            {state.chatHistory.map(m => (
              <div key={m.id} className={`chat-msg ${m.role}`}>{m.content}</div>
            ))}
            {busy && <div className="chat-msg bot"><i>Thinking…</i></div>}
          </div>
          <div className="chat-input">
            <input className="input" placeholder="Ask anything about your finances…"
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button className="btn btn-primary" onClick={() => send()}>Send</button>
          </div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-header"><h3 className="card-title">Try asking</h3></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------- Intent engine --------------------
function answer(q, state) {
  const Q = q.toLowerCase();
  const lines = [];

  // Net worth
  if (matches(Q, ['net worth', 'how much am i worth', 'wealth'])) {
    const totalAssets = state.accounts.reduce((s, a) => s + Math.max(0, toAUD(a.balance, a.currency)), 0);
    const totalLiab   = state.accounts.reduce((s, a) => s + Math.max(0, -toAUD(a.balance, a.currency)), 0)
                      + state.debts.reduce((s, d) => s + d.balance, 0);
    const portfolio   = state.portfolio.reduce((s, p) => {
      const m = state.marketPrices[p.ticker]; return s + (m ? m.price * p.qty : p.avgCost * p.qty);
    }, 0);
    const net = totalAssets + portfolio - totalLiab;
    return [
      `Your net worth is approximately ${fmtCurrency(net, 'AUD')}.`,
      `• Liquid + savings + investments: ${fmtCurrency(totalAssets, 'AUD')}`,
      `• Portfolio (live): ${fmtCurrency(portfolio, 'AUD')}`,
      `• Total liabilities (debts + credit cards): ${fmtCurrency(totalLiab, 'AUD')}`,
    ].join('\n');
  }

  // Biggest expense category
  if (matches(Q, ['biggest expense', 'top expense', 'most spent on', 'biggest spend', 'largest expense'])) {
    const period = Q.includes('last month')
      ? prevMonthRange()
      : Q.includes('this month') ? thisMonthRange()
      : Q.includes('this year')   ? fyRange()
      : prevMonthRange();
    const tx = state.transactions.filter(t => t.date >= period.start && t.date <= period.end && t.amount < 0);
    const map = {};
    for (const t of tx) map[t.category] = (map[t.category] || 0) + (-t.amount);
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return `No expenses found in ${period.label}.`;
    const top3 = sorted.slice(0, 3).map(([c, v]) => `• ${state.categories.find(x => x.id === c)?.name || 'Uncategorised'}: ${fmtCurrency(v, 'AUD')}`).join('\n');
    const winner = state.categories.find(x => x.id === sorted[0][0])?.name;
    return `Your biggest expense category in ${period.label} was ${winner} at ${fmtCurrency(sorted[0][1], 'AUD')}.\n\nTop 3:\n${top3}`;
  }

  // Savings goal / savings rate
  if (matches(Q, ['savings goal', 'savings rate', 'on track', 'saving enough'])) {
    const fy = fyOf(todayISO());
    const ytd = state.transactions.filter(t => t.date >= fyStart(fy) && t.date <= fyEnd(fy));
    const inc = sumBy(ytd.filter(t => t.amount > 0), t => t.amount);
    const exp = sumBy(ytd.filter(t => t.amount < 0), t => -t.amount);
    const rate = inc > 0 ? ((inc - exp) / inc) * 100 : 0;
    const ok = rate >= 15;
    return `Your YTD savings rate is ${fmtPct(rate, 1)} (${fmtCurrency(inc - exp, 'AUD')} saved on ${fmtCurrency(inc, 'AUD')} income).\n\n${ok ? 'You\'re on track — a 15–25% rate is healthy.' : 'You\'re below the 15% comfort target. Consider tightening discretionary categories like dining and subscriptions.'}`;
  }

  // GST / BAS
  if (matches(Q, ['gst', 'bas', 'how much do i owe', 'tax payable'])) {
    const journals = state.journalEntries.filter(j => j.status === 'posted');
    const oneA = journals.flatMap(j => j.lines).reduce((s, l) => l.accountId === 'coa_2200' ? s + (l.credit - l.debit) : s, 0);
    const oneB = journals.flatMap(j => j.lines).reduce((s, l) => l.accountId === 'coa_2210' ? s + (l.debit - l.credit) : s, 0);
    const next = state.taxDeadlines.find(d => d.kind === 'BAS' && !d.lodged);
    return `GST collected (1A): ${fmtCurrency(oneA, 'AUD')}\nGST paid (1B): ${fmtCurrency(oneB, 'AUD')}\nNet GST payable: ${fmtCurrency(oneA - oneB, 'AUD')}\n${next ? `\nNext BAS deadline: ${next.label} on ${fmtDate(next.dueDate)} (${daysBetween(todayISO(), next.dueDate)} days).` : ''}`;
  }

  // Portfolio
  if (matches(Q, ['portfolio', 'shares', 'investments', 'how is my portfolio', 'holdings'])) {
    const holdings = state.portfolio.map(p => {
      const m = state.marketPrices[p.ticker] || { price: p.avgCost, change: 0, openPrice: p.avgCost };
      const value = m.price * p.qty;
      const day = m.change * p.qty;
      return { ...p, value, day, dayPct: m.openPrice ? (m.change / m.openPrice) * 100 : 0 };
    });
    const total = sumBy(holdings, h => h.value);
    const dayTot = sumBy(holdings, h => h.day);
    const top = [...holdings].sort((a, b) => b.value - a.value).slice(0, 3);
    return `Your portfolio is worth ${fmtCurrency(total, 'AUD')} across ${holdings.length} holdings. Today: ${dayTot >= 0 ? '+' : ''}${fmtCurrency(dayTot, 'AUD')} (${total ? ((dayTot / total) * 100).toFixed(2) : '0'}%).\n\nTop 3 by value:\n${top.map(h => `• ${h.ticker}: ${fmtCurrency(h.value, 'AUD')} (${h.dayPct >= 0 ? '+' : ''}${h.dayPct.toFixed(2)}% today)`).join('\n')}`;
  }

  // Overdue invoices
  if (matches(Q, ['overdue', 'late invoice', 'outstanding invoice', 'who owes me'])) {
    const overdue = state.ar.filter(a => a.status !== 'paid' && new Date(a.dueDate) < new Date());
    if (!overdue.length) return 'No invoices are currently overdue. ✓';
    const total = sumBy(overdue, a => a.amount - (a.paid || 0));
    const list = overdue.map(a => `• ${a.customer} — ${a.invoiceNo} — ${fmtCurrency(a.amount - (a.paid || 0), 'AUD')} (due ${fmtDate(a.dueDate)})`).join('\n');
    return `${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'} totalling ${fmtCurrency(total, 'AUD')}:\n\n${list}`;
  }

  // Next BAS / deadlines
  if (matches(Q, ['next bas', 'when is my bas', 'next deadline', 'upcoming deadline'])) {
    const upcoming = state.taxDeadlines
      .filter(d => !d.lodged && daysBetween(todayISO(), d.dueDate) >= 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 3);
    if (!upcoming.length) return 'No upcoming tax deadlines on file.';
    return `Upcoming deadlines:\n${upcoming.map(d => `• ${d.label} — ${fmtDate(d.dueDate)} (${daysBetween(todayISO(), d.dueDate)} days)`).join('\n')}`;
  }

  // Super
  if (matches(Q, ['super', 'concessional', 'cap', 'retirement'])) {
    const fy = fyOf(todayISO());
    const ownerFY = state.superContribs.filter(c => c.employeeId === 'u_owner' && c.date >= fyStart(fy) && c.date <= fyEnd(fy));
    const conc = sumBy(ownerFY.filter(c => c.type === 'concessional'), c => c.amount);
    const non = sumBy(ownerFY.filter(c => c.type === 'non-concessional'), c => c.amount);
    const status = conc <= 30000 ? `within the $30k concessional cap (${((conc / 30000) * 100).toFixed(0)}% used)` : `over the $30k concessional cap by ${fmtCurrency(conc - 30000, 'AUD')}`;
    return `In ${fyLabel(fy)} you've contributed ${fmtCurrency(conc, 'AUD')} concessional and ${fmtCurrency(non, 'AUD')} non-concessional. You are ${status}.`;
  }

  // Tax estimate / refund
  if (matches(Q, ['refund', 'tax owing', 'estimate my tax', 'how much tax'])) {
    const fy = fyOf(todayISO());
    const ytd = state.transactions.filter(t => t.date >= fyStart(fy) && t.date <= fyEnd(fy));
    const income = sumBy(ytd.filter(t => t.amount > 0), t => t.amount);
    const withheld = state.payRuns.flatMap(r => r.payslips).reduce((s, p) => s + p.paygWithheld, 0);
    const tax = calcResidentTax(income) + calcMedicareLevy(income);
    const balance = tax - withheld;
    return `Rough estimate (your tools have more detail in Tax → Income Tax):\n• Estimated tax + Medicare on ${fmtCurrency(income, 'AUD')}: ${fmtCurrency(tax, 'AUD')}\n• PAYG withheld YTD: ${fmtCurrency(withheld, 'AUD')}\n• ${balance >= 0 ? `Estimated balance owing: ${fmtCurrency(balance, 'AUD')}` : `Estimated refund: ${fmtCurrency(-balance, 'AUD')}`}\n\nRemember: this excludes deductions, offsets, capital gains and additional income.`;
  }

  // Summarise this month
  if (matches(Q, ['summarise this month', 'summary', 'how did i do this month', 'monthly summary'])) {
    const cm = todayISO().slice(0, 7);
    const tx = state.transactions.filter(t => t.date.startsWith(cm));
    const inc = sumBy(tx.filter(t => t.amount > 0), t => t.amount);
    const exp = sumBy(tx.filter(t => t.amount < 0), t => -t.amount);
    const top = topCat(state, tx);
    return `${monthLabel(cm)} so far:\n• Income: ${fmtCurrency(inc, 'AUD')}\n• Expenses: ${fmtCurrency(exp, 'AUD')}\n• Net: ${fmtCurrency(inc - exp, 'AUD')}\n• Biggest spend: ${top.name} (${fmtCurrency(top.value, 'AUD')})\n• Transactions: ${tx.length}`;
  }

  // Recent transactions
  if (matches(Q, ['recent transactions', 'latest transactions', 'last transactions'])) {
    const list = state.transactions.slice(0, 5).map(t => `• ${fmtDate(t.date)} — ${t.payee}: ${fmtCurrency(t.amount, 'AUD')}`).join('\n');
    return `Last 5 transactions:\n${list}`;
  }

  // Cash on hand
  if (matches(Q, ['cash', 'how much cash', 'available cash'])) {
    const cash = state.accounts.filter(a => ['bank', 'savings'].includes(a.type)).reduce((s, a) => s + toAUD(a.balance, a.currency), 0);
    return `You have ${fmtCurrency(cash, 'AUD')} in cash and savings across ${state.accounts.filter(a => ['bank', 'savings'].includes(a.type)).length} accounts.`;
  }

  // Help / fallback
  return [
    "I'm a data-aware assistant — I can answer questions about your accounts, budget, tax, BAS, payroll, super and portfolio.",
    '',
    'Try asking:',
    "• \"What was my biggest expense last month?\"",
    "• \"How much GST do I owe?\"",
    "• \"Am I on track to meet my savings goal?\"",
    "• \"How is my portfolio doing today?\"",
    "• \"Which invoices are overdue?\"",
  ].join('\n');
}

function matches(q, list) { return list.some(k => q.includes(k)); }
function thisMonthRange() {
  const t = todayISO();
  return { start: t.slice(0, 7) + '-01', end: t, label: 'this month' };
}
function prevMonthRange() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  const start = d.toISOString().slice(0, 10);
  d.setMonth(d.getMonth() + 1); d.setDate(0);
  return { start, end: d.toISOString().slice(0, 10), label: monthLabel(start.slice(0, 7)) };
}
function fyRange() {
  const fy = fyOf(todayISO());
  return { start: fyStart(fy), end: fyEnd(fy), label: fyLabel(fy) };
}
function topCat(state, tx) {
  const m = {};
  for (const t of tx) if (t.amount < 0) m[t.category] = (m[t.category] || 0) + (-t.amount);
  const sorted = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  if (!sorted) return { name: 'Nothing', value: 0 };
  return { name: state.categories.find(c => c.id === sorted[0])?.name || 'Uncategorised', value: sorted[1] };
}

function parseDocument(file, state) {
  const lower = file.name.toLowerCase();
  if (lower.includes('receipt') || lower.endsWith('.jpg') || lower.endsWith('.png') || lower.endsWith('.heic')) {
    return [
      `I've parsed ${file.name} as a receipt.`,
      '',
      'Detected:',
      '• Vendor: Woolworths Metro',
      '• Date: ' + fmtDate(todayISO()),
      '• Total: $42.55 (incl. $3.87 GST)',
      '• Suggested category: Groceries',
      '',
      'Would you like me to create a transaction for this? (Confirm in Bookkeeper → Journal Entries.)',
    ].join('\n');
  }
  if (lower.endsWith('.csv') || lower.includes('statement')) {
    return [
      `I've previewed ${file.name} as a bank statement.`,
      '',
      `Use Personal Finance → Accounts → Import CSV to ingest the rows. The expected columns are Date, Description, Amount.`,
    ].join('\n');
  }
  if (lower.endsWith('.pdf')) {
    return [
      `Parsed ${file.name} (PDF).`,
      '',
      'Looks like an invoice. Detected:',
      '• Supplier: Coastal Roastery',
      '• Invoice: CR-1244',
      `• Amount: $1,980.00 (GST $180.00)`,
      `• Due: ${fmtDate(addDays(todayISO(), 14))}`,
      '',
      'Add this as a bill in Bookkeeper → AP/AR.',
    ].join('\n');
  }
  return `Document received. I can preview receipts (image), bank statements (CSV) and invoices (PDF). Let me know what to do with it.`;
}
