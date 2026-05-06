// ============================================================================
// Ledgerline — Market Terminal (Portfolio · Watchlist · Charts · News · Options)
// ============================================================================
import React, { useMemo, useState } from 'react';
import { useStore, useCanWrite } from '../store';
import { fmtCurrency, fmtDate, fmtDateTime, fmtPct, fmtSigned, sumBy, todayISO } from '../utils';
import { Kpi, CandlestickChart, LineChart, Sparkline, Modal, toast } from '../components';

const TABS = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'charts',    label: 'Charts' },
  { id: 'news',      label: 'News' },
  { id: 'options',   label: 'Options' },
];

export default function MarketModule() {
  const [tab, setTab] = useState('portfolio');
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Market Terminal</h1>
          <div className="page-sub">Live portfolio, watchlist, charts and news · prices update every 8 seconds</div>
        </div>
      </div>
      <div className="tabs">{TABS.map(t => <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
      {tab === 'portfolio' && <Portfolio />}
      {tab === 'watchlist' && <Watchlist />}
      {tab === 'charts'    && <Charts />}
      {tab === 'news'      && <News />}
      {tab === 'options'   && <Options />}
    </div>
  );
}

// ----------- Portfolio -----------
function Portfolio() {
  const { state, add, remove, audit } = useStore();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const enriched = state.portfolio.map(p => {
    const m = state.marketPrices[p.ticker] || { price: p.avgCost, change: 0, openPrice: p.avgCost };
    const value = m.price * p.qty;
    const cost = p.avgCost * p.qty;
    const ulPL = value - cost;
    const ulPct = cost ? (ulPL / cost) * 100 : 0;
    const dayPL = m.change * p.qty;
    const dayPct = m.openPrice ? (m.change / m.openPrice) * 100 : 0;
    return { ...p, price: m.price, value, cost, ulPL, ulPct, dayPL, dayPct, history: m.history };
  });

  const totalValue = sumBy(enriched, p => p.value);
  const totalCost = sumBy(enriched, p => p.cost);
  const totalUL = totalValue - totalCost;
  const totalDay = sumBy(enriched, p => p.dayPL);

  const startNew = () => { setDraft({ ticker: '', name: '', qty: 0, avgCost: 0, currency: 'AUD', type: 'stock' }); setOpen(true); };
  const save = () => {
    if (!draft.ticker || !draft.qty) return toast('Ticker and quantity required', 'error');
    add('portfolio', { ...draft, qty: Number(draft.qty), avgCost: Number(draft.avgCost) });
    audit('created', 'PortfolioHolding', `${draft.ticker} × ${draft.qty}`);
    toast('Holding added', 'success');
    setOpen(false);
  };

  return (
    <div>
      <div className="grid grid-4 mb-4">
        <Kpi label="Portfolio value" value={fmtCurrency(totalValue, 'AUD')} sub={`${enriched.length} holdings`} />
        <Kpi label="Total cost" value={fmtCurrency(totalCost, 'AUD')} />
        <Kpi label="Unrealised P/L" value={fmtSigned(totalUL, 'AUD')} sub={fmtPct(totalCost ? (totalUL / totalCost) * 100 : 0, 1)} trend={totalUL >= 0 ? 'up' : 'down'} />
        <Kpi label="Today" value={fmtSigned(totalDay, 'AUD')} sub={fmtPct(totalValue ? (totalDay / totalValue) * 100 : 0, 2)} trend={totalDay >= 0 ? 'up' : 'down'} />
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Holdings</h3>
          {canWrite && <button className="btn btn-primary btn-sm" onClick={startNew}>+ Add holding</button>}
        </div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr>
              <th>Ticker</th><th>Name</th><th>Type</th>
              <th className="right">Qty</th><th className="right">Avg cost</th><th className="right">Price</th>
              <th className="right">Value</th><th className="right">Day</th><th className="right">Total P/L</th>
              <th>30d</th><th></th>
            </tr></thead>
            <tbody>
              {[...enriched].sort((a, b) => b.value - a.value).map(p => (
                <tr key={p.id}>
                  <td className="mono"><b>{p.ticker}</b></td>
                  <td>{p.name}</td>
                  <td><span className="pill">{p.type}</span></td>
                  <td className="num">{p.qty}</td>
                  <td className="num">{fmtCurrency(p.avgCost, p.currency)}</td>
                  <td className="num">{fmtCurrency(p.price, p.currency)}</td>
                  <td className="num">{fmtCurrency(p.value, p.currency)}</td>
                  <td className={`num ${p.dayPct >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(p.dayPL, p.currency)} <span style={{ opacity: .6 }}>({p.dayPct >= 0 ? '+' : ''}{p.dayPct.toFixed(2)}%)</span></td>
                  <td className={`num ${p.ulPct >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(p.ulPL, p.currency)} <span style={{ opacity: .6 }}>({p.ulPct >= 0 ? '+' : ''}{p.ulPct.toFixed(1)}%)</span></td>
                  <td><Sparkline values={(p.history || []).slice(-30)} color={p.ulPct >= 0 ? '#0c8a5b' : '#b3261e'} /></td>
                  <td>{canWrite && <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Remove ${p.ticker}?`)) { remove('portfolio', p.id); toast('Removed'); } }}>×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add holding" footer={
        <>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </>
      }>
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field-row">
              <div className="field"><label className="field-label">Ticker</label><input className="input mono" value={draft.ticker} onChange={e => setDraft({ ...draft, ticker: e.target.value.toUpperCase() })} placeholder="ABC.AX" /></div>
              <div className="field"><label className="field-label">Type</label>
                <select className="input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                  <option value="stock">Stock</option><option value="etf">ETF</option><option value="crypto">Crypto</option>
                </select>
              </div>
            </div>
            <div className="field"><label className="field-label">Name</label><input className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="field-row-3">
              <div className="field"><label className="field-label">Quantity</label><input className="input num" type="number" step="0.0001" value={draft.qty} onChange={e => setDraft({ ...draft, qty: e.target.value })} /></div>
              <div className="field"><label className="field-label">Avg cost</label><input className="input num" type="number" step="0.01" value={draft.avgCost} onChange={e => setDraft({ ...draft, avgCost: e.target.value })} /></div>
              <div className="field"><label className="field-label">Currency</label>
                <select className="input" value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value })}>
                  {['AUD','USD','EUR','GBP'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ----------- Watchlist -----------
function Watchlist() {
  const { state, add, remove, audit } = useStore();
  const canWrite = useCanWrite();
  const [draft, setDraft] = useState({ ticker: '', name: '' });

  const universe = [...state.watchlist, ...state.portfolio.map(p => ({ id: p.id, ticker: p.ticker, name: p.name, fromPortfolio: true }))];
  const seen = new Set();
  const items = universe.filter(it => { if (seen.has(it.ticker)) return false; seen.add(it.ticker); return true; });

  return (
    <div>
      {canWrite && (
        <div className="card mb-4">
          <div className="card-header"><h3 className="card-title">Add to watchlist</h3></div>
          <div className="card-body">
            <div className="row wrap">
              <input className="input mono" placeholder="Ticker (e.g. WBC.AX)" style={{ width: 180 }} value={draft.ticker} onChange={e => setDraft({ ...draft, ticker: e.target.value.toUpperCase() })} />
              <input className="input" placeholder="Name (optional)" style={{ width: 260 }} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
              <button className="btn btn-primary" onClick={() => {
                if (!draft.ticker) return toast('Ticker required', 'error');
                add('watchlist', { ticker: draft.ticker, name: draft.name || draft.ticker });
                audit('created', 'Watchlist', draft.ticker);
                toast('Added', 'success');
                setDraft({ ticker: '', name: '' });
              }}>Add</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3 className="card-title">Watchlist & holdings ({items.length})</h3></div>
        <div className="card-body tight">
          <table className="table">
            <thead><tr><th>Ticker</th><th>Name</th><th className="right">Price</th><th className="right">Day change</th><th className="right">Day %</th><th className="right">90d range</th><th>30d</th><th></th></tr></thead>
            <tbody>
              {items.map(it => {
                const m = state.marketPrices[it.ticker];
                if (!m) return null;
                const pct = m.openPrice ? (m.change / m.openPrice) * 100 : 0;
                const lo = Math.min(...(m.history || [m.price]));
                const hi = Math.max(...(m.history || [m.price]));
                return (
                  <tr key={it.id || it.ticker}>
                    <td className="mono"><b>{it.ticker}</b></td>
                    <td>{it.name}</td>
                    <td className="num">{fmtCurrency(m.price, it.ticker.startsWith('BTC') || it.ticker.startsWith('ETH') ? 'AUD' : 'AUD')}</td>
                    <td className={`num ${m.change >= 0 ? 'pos' : 'neg'}`}>{(m.change >= 0 ? '+' : '') + m.change.toFixed(2)}</td>
                    <td className={`num ${pct >= 0 ? 'pos' : 'neg'}`}>{(pct >= 0 ? '+' : '') + pct.toFixed(2)}%</td>
                    <td className="num">{lo.toFixed(2)} – {hi.toFixed(2)}</td>
                    <td><Sparkline values={(m.history || []).slice(-30)} color={pct >= 0 ? '#0c8a5b' : '#b3261e'} /></td>
                    <td>
                      {it.fromPortfolio
                        ? <span className="pill blue">held</span>
                        : (canWrite && <button className="btn btn-ghost btn-sm" onClick={() => { remove('watchlist', it.id); toast('Removed'); }}>×</button>)
                      }
                    </td>
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

// ----------- Charts -----------
function Charts() {
  const { state } = useStore();
  const universe = Object.keys(state.marketPrices);
  const [ticker, setTicker] = useState(universe[0]);
  const [range, setRange] = useState(60);
  const [type, setType] = useState('candle');

  const m = state.marketPrices[ticker];
  if (!m) return <div className="empty">No data</div>;

  const slice = (m.history || []).slice(-range);

  // Build OHLC by grouping every 1 day = 1 candle (we have 1 point per day)
  const ohlc = [];
  for (let i = 0; i < slice.length; i++) {
    const v = slice[i];
    const prev = i > 0 ? slice[i - 1] : v;
    const o = prev;
    const c = v;
    const h = Math.max(o, c) * (1 + Math.random() * 0.01);
    const l = Math.min(o, c) * (1 - Math.random() * 0.01);
    ohlc.push({ o, h, l, c });
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="card-body">
          <div className="row wrap">
            <div className="field"><label className="field-label">Ticker</label>
              <select className="input mono" style={{ width: 180 }} value={ticker} onChange={e => setTicker(e.target.value)}>
                {universe.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field"><label className="field-label">Range</label>
              <div className="row">
                {[14, 30, 60, 90].map(r => (
                  <button key={r} className={`btn btn-sm ${range === r ? 'btn-primary' : ''}`} onClick={() => setRange(r)}>{r}d</button>
                ))}
              </div>
            </div>
            <div className="field"><label className="field-label">Style</label>
              <div className="row">
                <button className={`btn btn-sm ${type === 'candle' ? 'btn-primary' : ''}`} onClick={() => setType('candle')}>Candle</button>
                <button className={`btn btn-sm ${type === 'line' ? 'btn-primary' : ''}`} onClick={() => setType('line')}>Line</button>
              </div>
            </div>
            <div className="spacer" />
            <div className="row" style={{ gap: 18 }}>
              <div><div className="muted" style={{ fontSize: '0.78em' }}>Last</div><div style={{ fontWeight: 700, fontSize: '1.1em' }}>{m.price.toFixed(2)}</div></div>
              <div><div className="muted" style={{ fontSize: '0.78em' }}>Day</div><div className={m.change >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700, fontSize: '1.1em' }}>{(m.change >= 0 ? '+' : '') + m.change.toFixed(2)}</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">{ticker} — {range} day chart</h3></div>
        <div className="card-body">
          {type === 'candle'
            ? <CandlestickChart data={ohlc} />
            : <LineChart series={[{ name: ticker, values: slice }]} fill format={v => v.toFixed(2)} />
          }
        </div>
      </div>
    </div>
  );
}

// ----------- News -----------
function News() {
  const { state } = useStore();
  const [filter, setFilter] = useState('');
  const tickers = [...new Set(state.newsFeed.map(n => n.ticker).filter(Boolean))];
  const items = state.newsFeed.filter(n => !filter || n.ticker === filter);

  return (
    <div>
      <div className="row mb-4">
        <span className="muted">Filter:</span>
        <button className={`btn btn-sm ${!filter ? 'btn-primary' : ''}`} onClick={() => setFilter('')}>All</button>
        {tickers.map(t => (
          <button key={t} className={`btn btn-sm ${filter === t ? 'btn-primary' : ''}`} onClick={() => setFilter(t)}>{t}</button>
        ))}
      </div>

      <div className="card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {items.map(n => (
            <div key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="row between">
                <div style={{ fontWeight: 600 }}>{n.title}</div>
                {n.ticker && <span className="pill blue">{n.ticker}</span>}
              </div>
              <div className="muted" style={{ fontSize: '0.85em', marginTop: 3 }}>{n.source} · {fmtDateTime(n.ts)}</div>
            </div>
          ))}
          {items.length === 0 && <div className="empty">No articles</div>}
        </div>
      </div>
    </div>
  );
}

// ----------- Options -----------
function Options() {
  const { state } = useStore();
  const tickers = [...new Set(state.options.map(o => o.ticker))];
  const [ticker, setTicker] = useState(tickers[0]);
  const chain = state.options.filter(o => o.ticker === ticker);
  const calls = chain.filter(o => o.type === 'call').sort((a, b) => a.strike - b.strike);
  const puts  = chain.filter(o => o.type === 'put').sort((a, b)  => a.strike - b.strike);
  const m = state.marketPrices[ticker];

  return (
    <div>
      <div className="row mb-4">
        <div className="field" style={{ minWidth: 200 }}>
          <label className="field-label">Underlying</label>
          <select className="input mono" value={ticker} onChange={e => setTicker(e.target.value)}>
            {tickers.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        {m && <Kpi label="Spot" value={fmtCurrency(m.price, 'AUD')} sub={`Δ ${m.change >= 0 ? '+' : ''}${m.change.toFixed(2)}`} trend={m.change >= 0 ? 'up' : 'down'} />}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Calls</h3></div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Strike</th><th>Expiry</th><th className="right">Bid</th><th className="right">Ask</th><th className="right">Mid</th><th className="right">ITM/OTM</th></tr></thead>
              <tbody>
                {calls.map((o, i) => {
                  const itm = m && m.price > o.strike;
                  return (
                    <tr key={i}>
                      <td className="num">{o.strike}</td>
                      <td>{fmtDate(o.expiry)}</td>
                      <td className="num">{o.bid.toFixed(2)}</td>
                      <td className="num">{o.ask.toFixed(2)}</td>
                      <td className="num">{((o.bid + o.ask) / 2).toFixed(2)}</td>
                      <td className="right"><span className={`pill ${itm ? 'green' : ''}`}>{itm ? 'ITM' : 'OTM'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Puts</h3></div>
          <div className="card-body tight">
            <table className="table">
              <thead><tr><th>Strike</th><th>Expiry</th><th className="right">Bid</th><th className="right">Ask</th><th className="right">Mid</th><th className="right">ITM/OTM</th></tr></thead>
              <tbody>
                {puts.map((o, i) => {
                  const itm = m && m.price < o.strike;
                  return (
                    <tr key={i}>
                      <td className="num">{o.strike}</td>
                      <td>{fmtDate(o.expiry)}</td>
                      <td className="num">{o.bid.toFixed(2)}</td>
                      <td className="num">{o.ask.toFixed(2)}</td>
                      <td className="num">{((o.bid + o.ask) / 2).toFixed(2)}</td>
                      <td className="right"><span className={`pill ${itm ? 'red' : ''}`}>{itm ? 'ITM' : 'OTM'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
