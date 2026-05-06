// ============================================================================
// Ledgerline — shared UI components
// ============================================================================
import React, { useEffect, useState } from 'react';
import { fmtCurrency, fmtNumber } from './utils';

// ---- Modal ----------------------------------------------------------------
export function Modal({ open, title, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Toasts ---------------------------------------------------------------
let _toastId = 0;
let _toastSetter = null;
export function ToastHost() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => { _toastSetter = setToasts; return () => { _toastSetter = null; }; }, []);
  return (
    <div className="toasts">
      {toasts.map(t => <div key={t.id} className={`toast ${t.kind || ''}`}>{t.msg}</div>)}
    </div>
  );
}
export function toast(msg, kind = '') {
  if (!_toastSetter) return;
  const id = ++_toastId;
  _toastSetter(t => [...t, { id, msg, kind }]);
  setTimeout(() => _toastSetter && _toastSetter(t => t.filter(x => x.id !== id)), 3500);
}

// ---- Confirm wrapper -----------------------------------------------------
export function confirmDialog(question) {
  return window.confirm(question);
}

// ---- Bar chart -----------------------------------------------------------
// data: [{label, value, value2?}]; colors: [c1, c2]
export function BarChart({ data, height = 220, colors = ['#1463a3', '#0c8a5b'], format = (v) => fmtCurrency(v, 'AUD', { dp: 0 }), legend = [], stacked = false }) {
  if (!data || !data.length) return <div className="empty">No data</div>;
  const W = 600, H = height, padL = 50, padR = 12, padT = 14, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const series = data.map(d => stacked ? (Number(d.value || 0) + Number(d.value2 || 0)) : Math.max(Number(d.value || 0), Number(d.value2 || 0)));
  const max = Math.max(1, ...series);
  const niceMax = niceCeil(max);

  const bw = innerW / data.length;
  const bGap = bw * 0.18;
  const bWidth = (bw - bGap * 2) / (data[0].value2 != null && !stacked ? 2 : 1);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => t * niceMax);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
        {/* gridlines */}
        {yTicks.map((t, i) => {
          const y = padT + innerH - (t / niceMax) * innerH;
          return <g key={i}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e3e7ee" strokeWidth="1" />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#5f6a7d">{abbrev(t)}</text>
          </g>;
        })}
        {/* bars */}
        {data.map((d, i) => {
          const x0 = padL + i * bw + bGap;
          if (stacked) {
            const v1 = Number(d.value || 0);
            const v2 = Number(d.value2 || 0);
            const h1 = (v1 / niceMax) * innerH;
            const h2 = (v2 / niceMax) * innerH;
            return <g key={i}>
              <rect x={x0} y={padT + innerH - h1} width={bw - bGap * 2} height={h1} fill={colors[0]} />
              <rect x={x0} y={padT + innerH - h1 - h2} width={bw - bGap * 2} height={h2} fill={colors[1] || '#0c8a5b'} />
              <text x={x0 + (bw - bGap * 2) / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#5f6a7d">{d.label}</text>
            </g>;
          }
          const v1 = Number(d.value || 0);
          const v2 = Number(d.value2 || 0);
          const h1 = (v1 / niceMax) * innerH;
          const h2 = (v2 / niceMax) * innerH;
          return <g key={i}>
            <rect x={x0} y={padT + innerH - h1} width={bWidth} height={h1} fill={colors[0]}>
              <title>{`${d.label}: ${format(v1)}`}</title>
            </rect>
            {d.value2 != null && (
              <rect x={x0 + bWidth} y={padT + innerH - h2} width={bWidth} height={h2} fill={colors[1] || '#0c8a5b'}>
                <title>{`${d.label}: ${format(v2)}`}</title>
              </rect>
            )}
            <text x={x0 + (bw - bGap * 2) / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#5f6a7d">{d.label}</text>
          </g>;
        })}
      </svg>
      {legend.length > 0 && (
        <div className="legend">
          {legend.map((l, i) => <span key={i}><span className="legend-swatch" style={{ background: colors[i] }} />{l}</span>)}
        </div>
      )}
    </div>
  );
}

// ---- Line chart ----------------------------------------------------------
export function LineChart({ series, height = 220, format = (v) => fmtCurrency(v, 'AUD', { dp: 0 }), labels, colors = ['#1463a3', '#0c8a5b', '#b86a00', '#b3261e'], showDots = false, fill = false }) {
  if (!series || !series.length) return <div className="empty">No data</div>;
  const all = series.flatMap(s => s.values || []);
  if (!all.length) return <div className="empty">No data</div>;
  const W = 600, H = height, padL = 50, padR = 12, padT = 14, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const lo = min < 0 ? min : 0;
  const hi = niceCeil(Math.max(max, 1));
  const range = hi - lo || 1;

  const n = series[0].values.length;
  const xAt = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v) => padT + innerH - ((v - lo) / range) * innerH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => lo + t * range);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
        {yTicks.map((t, i) => {
          const y = yAt(t);
          return <g key={i}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e3e7ee" strokeWidth="1" />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#5f6a7d">{abbrev(t)}</text>
          </g>;
        })}
        {series.map((s, si) => {
          const path = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
          const fillPath = `${path} L ${xAt(s.values.length - 1)} ${yAt(lo)} L ${xAt(0)} ${yAt(lo)} Z`;
          const c = colors[si % colors.length];
          return <g key={si}>
            {fill && (
              <path d={fillPath} fill={c} opacity="0.10" />
            )}
            <path d={path} stroke={c} strokeWidth="2" fill="none" />
            {showDots && s.values.map((v, i) => (
              <circle key={i} cx={xAt(i)} cy={yAt(v)} r="2.5" fill={c} />
            ))}
          </g>;
        })}
        {labels && labels.map((l, i) => {
          if (n > 14 && i % Math.ceil(n / 8) !== 0 && i !== n - 1) return null;
          return <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#5f6a7d">{l}</text>;
        })}
      </svg>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s, i) => <span key={i}><span className="legend-swatch" style={{ background: colors[i % colors.length] }} />{s.name}</span>)}
        </div>
      )}
    </div>
  );
}

// ---- Donut chart ---------------------------------------------------------
export function DonutChart({ slices, size = 180, format = (v) => fmtCurrency(v, 'AUD', { dp: 0 }) }) {
  if (!slices || !slices.length) return <div className="empty">No data</div>;
  const total = slices.reduce((s, x) => s + Math.abs(Number(x.value || 0)), 0);
  if (total <= 0) return <div className="empty">No data</div>;
  const colors = ['#1463a3', '#0c8a5b', '#b86a00', '#b3261e', '#7e51c8', '#1f8a99', '#b07e1c', '#5e7689', '#cc4f6f'];
  const cx = size / 2, cy = size / 2, r = size / 2 - 4, rInner = r * 0.62;
  let start = -Math.PI / 2;

  return (
    <div className="chart-wrap" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {slices.map((s, i) => {
          const v = Math.abs(Number(s.value || 0));
          const ang = (v / total) * Math.PI * 2;
          const end = start + ang;
          const large = ang > Math.PI ? 1 : 0;
          const x0 = cx + r * Math.cos(start), y0 = cy + r * Math.sin(start);
          const x1 = cx + r * Math.cos(end),   y1 = cy + r * Math.sin(end);
          const xi0 = cx + rInner * Math.cos(end),   yi0 = cy + rInner * Math.sin(end);
          const xi1 = cx + rInner * Math.cos(start), yi1 = cy + rInner * Math.sin(start);
          const path = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi0} ${yi0} A ${rInner} ${rInner} 0 ${large} 0 ${xi1} ${yi1} Z`;
          start = end;
          const c = s.color || colors[i % colors.length];
          return <path key={i} d={path} fill={c}><title>{`${s.label}: ${format(v)}`}</title></path>;
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="#5f6a7d">Total</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1a2233">{abbrev(total)}</text>
      </svg>
      <div style={{ flex: 1, fontSize: '0.85em' }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dashed #eef' }}>
            <span><span className="legend-swatch" style={{ background: s.color || colors[i % colors.length] }} />{s.label}</span>
            <span className="num">{format(Math.abs(Number(s.value || 0)))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Waterfall -----------------------------------------------------------
export function WaterfallChart({ data, height = 240, format = (v) => fmtCurrency(v, 'AUD', { dp: 0 }) }) {
  if (!data || !data.length) return <div className="empty">No data</div>;
  const W = 640, H = height, padL = 60, padR = 12, padT = 14, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  let running = 0;
  const bars = data.map(d => {
    if (d.kind === 'total') return { ...d, start: 0, end: d.value, running: d.value };
    const start = running;
    running += d.value;
    return { ...d, start, end: running, running };
  });
  const all = bars.flatMap(b => [b.start, b.end]);
  const lo = Math.min(0, ...all);
  const hi = niceCeil(Math.max(1, ...all));
  const range = hi - lo || 1;
  const bw = innerW / data.length;
  const yAt = v => padT + innerH - ((v - lo) / range) * innerH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => lo + t * range);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
        {yTicks.map((t, i) => {
          const y = yAt(t);
          return <g key={i}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e3e7ee" strokeWidth="1" />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#5f6a7d">{abbrev(t)}</text>
          </g>;
        })}
        {bars.map((b, i) => {
          const x = padL + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const top = yAt(Math.max(b.start, b.end));
          const bot = yAt(Math.min(b.start, b.end));
          const h = Math.max(2, bot - top);
          const color = b.kind === 'total' ? '#1463a3' : (b.value >= 0 ? '#0c8a5b' : '#b3261e');
          return <g key={i}>
            <rect x={x} y={top} width={w} height={h} fill={color}>
              <title>{`${b.label}: ${format(b.value)}`}</title>
            </rect>
            <text x={x + w / 2} y={H - 22} textAnchor="middle" fontSize="9" fill="#1a2233">{b.label}</text>
            <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#5f6a7d">{abbrev(b.value)}</text>
          </g>;
        })}
      </svg>
    </div>
  );
}

// ---- Sparkline ----------------------------------------------------------
export function Sparkline({ values, height = 28, width = 90, color = '#1463a3' }) {
  if (!values || !values.length) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || 1;
  const path = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2) + 1;
    const y = (height - 2) - ((v - lo) / range) * (height - 4) + 1;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// ---- Candlestick ---------------------------------------------------------
// data: [{date, o, h, l, c}]
export function CandlestickChart({ data, height = 280 }) {
  if (!data || !data.length) return <div className="empty">No data</div>;
  const W = 700, H = height, padL = 50, padR = 12, padT = 12, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const all = data.flatMap(d => [d.h, d.l]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const range = hi - lo || 1;
  const bw = innerW / data.length;
  const yAt = v => padT + innerH - ((v - lo) / range) * innerH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => lo + t * range);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="none">
        {yTicks.map((t, i) => {
          const y = yAt(t);
          return <g key={i}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e3e7ee" strokeWidth="1" />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#5f6a7d">{abbrev(t)}</text>
          </g>;
        })}
        {data.map((d, i) => {
          const x = padL + i * bw + bw * 0.5;
          const wickT = yAt(d.h);
          const wickB = yAt(d.l);
          const oY = yAt(d.o);
          const cY = yAt(d.c);
          const up = d.c >= d.o;
          const color = up ? '#0c8a5b' : '#b3261e';
          const top = Math.min(oY, cY);
          const h = Math.max(1, Math.abs(cY - oY));
          const bw2 = Math.max(2, bw * 0.5);
          return <g key={i}>
            <line x1={x} x2={x} y1={wickT} y2={wickB} stroke={color} strokeWidth="1" />
            <rect x={x - bw2 / 2} y={top} width={bw2} height={h} fill={color} />
          </g>;
        })}
      </svg>
    </div>
  );
}

// ---- Helpers -------------------------------------------------------------
function niceCeil(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  if (n <= 1) return 1 * p;
  if (n <= 2) return 2 * p;
  if (n <= 5) return 5 * p;
  return 10 * p;
}

function abbrev(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'k';
  return sign + abs.toFixed(0);
}

// ---- Empty state -------------------------------------------------------
export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

// ---- Stat tile --------------------------------------------------------
export function Kpi({ label, value, sub, trend, currency }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{currency ? fmtCurrency(value, currency) : value}</div>
      {sub && <div className={`kpi-sub ${trend === 'up' ? 'kpi-up' : trend === 'down' ? 'kpi-down' : ''}`}>{sub}</div>}
    </div>
  );
}
