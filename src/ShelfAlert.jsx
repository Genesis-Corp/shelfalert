import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { getWeeklyData, getMonthlyWeeklyTotals, getMonthlyDayBreakdown, generateTheftCSV } from "./theftUtils";

// ─── SUPABASE CLIENT (official library — handles auth/refresh automatically) ──
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, storageKey: "shelfalert_auth" } }
);

// ─── SESSION HELPERS ──────────────────────────────────────────────────────────
const saveSession  = (s) => { try { localStorage.setItem("shelfalert_session", JSON.stringify(s)); } catch {} };
const loadSession  = ()  => { try { const s = localStorage.getItem("shelfalert_session"); return s ? JSON.parse(s) : null; } catch { return null; } };
const clearSession = ()  => { try { localStorage.removeItem("shelfalert_session"); } catch {} };

// ─── WRAPPER (keeps same API as before so rest of app unchanged) ──────────────
const sb = {
  async signIn(email, pass) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return { error };
    return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  },
  async signUp(email, pass) {
    const { error } = await supabase.auth.signUp({ email, password: pass });
    if (error) return { error };
    return { user: true };
  },
  async signOut() { await supabase.auth.signOut(); },
  async select(table, _t, qs = "") {
    const params = {};
    qs.split("&").forEach(p => {
      const [k, v] = p.split("=");
      if (k === "order") { const [col, dir] = v.split("."); params._order = { col, asc: dir !== "desc" }; }
      if (k === "limit") params._limit = parseInt(v);
      if (k === "select") params._select = v;
    });
    let q = supabase.from(table).select(params._select || "*");
    if (params._order) q = q.order(params._order.col, { ascending: params._order.asc });
    if (params._limit) q = q.limit(params._limit);
    // Handle filter conditions like read=eq.false
    qs.split("&").forEach(p => {
      const eqMatch = p.match(/^([^=]+)=eq\.(.+)$/);
      if (eqMatch && eqMatch[1] !== "select" && eqMatch[1] !== "order" && eqMatch[1] !== "limit") {
        const val = eqMatch[2] === "false" ? false : eqMatch[2] === "true" ? true : eqMatch[2];
        q = q.eq(eqMatch[1], val);
      }
    });
    const { data, error } = await q;
    if (error) { console.error(`SELECT ${table} failed:`, error); return []; }
    return data || [];
  },
  async insert(table, _t, body) {
    const { data, error } = await supabase.from(table).insert(body).select();
    if (error) { console.error(`INSERT ${table} failed:`, error); return null; }
    return data;
  },
  async update(table, _t, match, body) {
    let q = supabase.from(table).update(body).select();
    Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
    const { data, error } = await q;
    if (error) { console.error(`UPDATE ${table} failed:`, error); return null; }
    return data;
  },
  async remove(table, _t, match) {
    let q = supabase.from(table).delete();
    Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
    const { error } = await q;
    return !error;
  },
  async uploadImage(_t, file) {
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `gaps/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("gap-images").upload(path, file, { contentType: file.type });
      if (error) { console.error("Image upload:", error); return null; }
      const { data } = supabase.storage.from("gap-images").getPublicUrl(path);
      return data.publicUrl;
    } catch(e) { console.error("Image upload error:", e); return null; }
  },
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DAYS  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const FREQS = ["weekly","fortnightly","monthly"];
const TIMEZONES = ["Australia/Perth","Australia/Sydney","Australia/Melbourne","Australia/Brisbane","Australia/Adelaide","Australia/Darwin","Pacific/Auckland","Asia/Singapore","Europe/London","America/New_York","America/Los_Angeles"];

// Department codes (letter-based aisles)
const DEPT_CODES = [
  { code: "MT", label: "MT — Meat" },
  { code: "SF", label: "SF — Seafood" },
  { code: "DL", label: "DL — Deli" },
  { code: "DY", label: "DY — Dairy" },
  { code: "FZ", label: "FZ — Freezer" },
  { code: "DF", label: "DF — Drinks Fridge" },
  { code: "FV", label: "FV — Fruit & Veg" },
];

// Build aisle options: numbered aisles + department codes
const buildAisleOptions = (numAisles, depts = []) => {
  const numbered = Array.from({ length: numAisles }, (_, i) => ({ value: String(i + 1), label: `Aisle ${i + 1}` }));
  const deptOpts = depts.map(d => ({ value: d.code, label: `${d.code} — ${d.label}` }));
  return [...numbered, ...deptOpts];
};

const buildBayOptions = (numBays) =>
  Array.from({ length: numBays }, (_, i) => ({ value: String(i + 1), label: `Bay ${i + 1}` }));

const fmtLocation = (aisle, bay, depts = []) => {
  if (!aisle) return "";
  const dept = depts.find(d => d.code === aisle);
  const aisleLabel = dept ? dept.label : `Aisle ${aisle}`;
  return bay ? `${aisleLabel} · Bay ${bay}` : aisleLabel;
};

const CREDIT_TYPES = ["damaged", "out_of_code", "non_scan"];
const CREDIT_TYPE_META = {
  damaged:     { label: "Damaged",     color: "#f87171", bg: "#3d1a1a", border: "#7a2a2a", icon: "💥" },
  out_of_code: { label: "Out of Code", color: "#fbbf24", bg: "#1e1a00", border: "#5a4a00", icon: "📅" },
  non_scan:    { label: "Non-Scan",    color: "#a78bfa", bg: "#1a1535", border: "#4a3a8a", icon: "🔍" },
};
const CREDIT_STATUS_META = {
  pending:   { label: "Pending",   bg: "#0f1e35", text: "#60a5fa", border: "#1a3a6a" },
  confirmed: { label: "Confirmed", bg: "#1e1a00", text: "#fbbf24", border: "#5a4a00" },
  received:  { label: "Received",  bg: "#0f2e1a", text: "#4ade80", border: "#1a5c30" },
  disputed:  { label: "Disputed",  bg: "#3d1a1a", text: "#ff7070", border: "#7a2a2a" },
  resolved:  { label: "Resolved",  bg: "#1a1a1a", text: "#5a6478", border: "#2a2a2a" },
};
const STATUS_META = {
  missed:      { label: "Missed",      bg: "#3d1a1a", text: "#ff7070", border: "#7a2a2a" },
  ordered:     { label: "Ordered",     bg: "#0f2e1a", text: "#4ade80", border: "#1a5c30" },
  unavailable: { label: "Unavailable", bg: "#1e1a00", text: "#fbbf24", border: "#5a4a00" },
  open:        { label: "Open",        bg: "#0f1e35", text: "#60a5fa", border: "#1a3a6a" },
};
const CODE_STATUS_META = {
  active:      { label: "Active",      bg: "#0f1e35", text: "#60a5fa", border: "#1a3a6a" },
  marked_down: { label: "Marked Down", bg: "#1e1a00", text: "#fbbf24", border: "#5a4a00" },
  returned:    { label: "Returned",    bg: "#0f2e1a", text: "#4ade80", border: "#1a5c30" },
  removed:     { label: "Removed",     bg: "#1a1a1a", text: "#5a6478", border: "#2a2a2a" },
};

const getCodeAlert = (useByDate) => {
  if (!useByDate) return null;
  const days = Math.ceil((new Date(useByDate) - new Date()) / 86400000);
  if (days < 0)    return { label: "EXPIRED — Remove now",       color: "#ff3030", bg: "#3d0000", border: "#7a0000" };
  if (days === 0)  return { label: "Remove from shelf TODAY",     color: "#ff3030", bg: "#3d0000", border: "#7a0000" };
  if (days <= 2)   return { label: "Clearance — 2 days left",    color: "#ff7070", bg: "#3d1a1a", border: "#7a2a2a" };
  if (days <= 7)   return { label: "Urgent action — 1 week left",color: "#f97316", bg: "#2a1500", border: "#7a3500" };
  if (days <= 14)  return { label: "Action required — 2 weeks",  color: "#fbbf24", bg: "#1e1a00", border: "#5a4a00" };
  return null;
};
const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;
const fmt$ = (v) => v ? `$${parseFloat(v).toFixed(2)}` : "—";
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";

// ─── MAPPERS ──────────────────────────────────────────────────────────────────
const mapGap = (g) => ({
  id: g.id, supplierId: g.supplier_id, description: g.description,
  aisle: g.aisle, bay: g.bay, priority: g.priority, status: g.status,
  notes: g.notes, imageUrl: g.image_url, unavailableUntil: g.unavailable_until,
  loggedBy: g.logged_by, loggedAt: g.logged_at,
});
const mapSupplier = (s) => ({
  id: s.id, name: s.name, contact: s.contact || "", phone: s.phone || "",
  visitDay: s.visit_day || "Monday", frequency: s.frequency || "weekly",
});
const mapCode = (c) => ({
  id: c.id, description: c.description, useByDate: c.use_by_date,
  quantity: c.quantity, aisle: c.aisle, bay: c.bay,
  supplierId: c.supplier_id, notes: c.notes, status: c.status,
  loggedBy: c.logged_by, loggedAt: c.logged_at,
});
const mapCredit = (c) => ({
  id: c.id, supplierId: c.supplier_id, type: c.type, description: c.description,
  quantity: c.quantity, value: c.value, dateRaised: c.date_raised,
  refNumber: c.ref_number, status: c.status, notes: c.notes,
  resolvedAt: c.resolved_at, loggedBy: c.logged_by,
});
const mapSettings = (s) => ({
  id: s.id, storeName: s.store_name || "", storeEmail: s.store_email || "",
  timezone: s.timezone || "Australia/Perth", notifTime: s.notif_time || "06:00",
  numAisles: s.num_aisles || 12, numBays: s.num_bays || 20,
});
const mapDept = (d) => ({ id: d.id, code: d.code, label: d.label });
const mapTheftItem = (t) => ({ id: t.id, name: t.name, resolved: t.resolved, resolvedAt: t.resolved_at, createdAt: t.created_at });
const mapTheftIncident = (i) => ({ id: i.id, itemId: i.item_id, quantity: i.quantity, shelfAisle: i.shelf_aisle, shelfBay: i.shelf_bay, foundAtId: i.found_at_id, incidentDate: i.incident_date, notes: i.notes, loggedBy: i.logged_by, loggedAt: i.logged_at });
const mapTheftLocation = (l) => ({ id: l.id, name: l.name });
const downloadTheftCSV = (content, filename) => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ─── AI DESCRIPTION ───────────────────────────────────────────────────────────
async function aiDescribe(base64) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 200,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: "Describe the missing supermarket shelf product concisely: name, size/weight, brand if visible. Under 15 words. Only the description." }
        ]}]
      }),
    });
    const d = await r.json(); return d.content?.[0]?.text || "";
  } catch { return ""; }
}

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 18, color = "currentColor", sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const IC = {
  home:   "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  gap:    ["M3 3h18v4H3z","M3 10h18v4H3z","M3 17h18v4H3z"],
  sup:    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  bell:   "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
  cam:    ["M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z","M12 17a4 4 0 100-8 4 4 0 000 8"],
  plus:   "M12 5v14M5 12h14",
  edit:   ["M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7","M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"],
  trash:  ["M3 6h18","M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"],
  x:      "M18 6L6 18M6 6l12 12",
  report: ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z","M14 2v6h6","M16 13H8M16 17H8M10 9H8"],
  cog:    ["M12 15a3 3 0 100-6 3 3 0 000 6z","M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"],
  dl:     "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  out:    ["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4","M16 17l5-5-5-5","M21 12H9"],
  ref:    "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
  eye:    ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z","M12 12m-3 0a3 3 0 106 0 3 3 0 00-6 0"],
  eyeOff: ["M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94","M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19","M1 1l22 22"],
  code:   ["M12 2a10 10 0 100 20A10 10 0 0012 2z","M12 6v6l4 2"],
  chev:   "M6 9l6 6 6-6",
  dollar: ["M12 1v22","M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"],
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
};

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const IS = { width: "100%", background: "var(--ib)", border: "1px solid var(--b)", borderRadius: 8, padding: "10px 12px", color: "var(--t1)", fontSize: 14, fontFamily: "var(--fb)", outline: "none", boxSizing: "border-box" };
const BP = { background: "var(--a)", color: "#000", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "var(--fb)" };
const BS = { background: "transparent", color: "var(--t2)", border: "1px solid var(--b)", borderRadius: 8, padding: "10px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "var(--fb)" };
const BD = { background: "#3d1a1a", color: "#ff7070", border: "1px solid #7a2a2a", borderRadius: 8, padding: "10px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "var(--fb)" };

function Badge({ status, meta = STATUS_META }) {
  const m = meta[status] || STATUS_META.open;
  return <span style={{ background: m.bg, color: m.text, border: `1px solid ${m.border}`, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", fontFamily: "var(--fm)", whiteSpace: "nowrap" }}>{m.label}</span>;
}
function Dot({ priority }) {
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: priority === "high" ? "#ef4444" : "#4b5563", marginRight: 6, flexShrink: 0, boxShadow: priority === "high" ? "0 0 6px #ef4444" : "none" }} />;
}
function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{ background: "var(--c)", border: "1px solid var(--b)", borderRadius: 12, padding: "18px 20px", cursor: onClick ? "pointer" : "default", transition: "border-color .2s, transform .15s", ...style }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = "var(--a)"; e.currentTarget.style.transform = "translateY(-1px)"; }}}
      onMouseLeave={e => { if (onClick) { e.currentTarget.style.borderColor = "var(--b)"; e.currentTarget.style.transform = ""; }}}>
      {children}
    </div>
  );
}
function Modal({ title, onClose, children, width = 540 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--s)", border: "1px solid var(--b)", borderRadius: 16, width: "100%", maxWidth: width, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,.6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--b)" }}>
          <span style={{ fontFamily: "var(--fd)", fontSize: 18, color: "var(--t1)", fontWeight: 600 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tm)", padding: 4 }}><Icon d={IC.x} /></button>
        </div>
        <div style={{ padding: "24px" }}>{children}</div>
      </div>
    </div>
  );
}
function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--tm)", marginBottom: 6, fontFamily: "var(--fm)" }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11, color: "var(--tm)", marginTop: 4, display: "block" }}>{hint}</span>}
    </div>
  );
}
function Spin() { return <div style={{ width: 18, height: 18, border: "2px solid var(--b)", borderTopColor: "var(--a)", borderRadius: "50%", animation: "spin .7s linear infinite" }} />; }
function Toast({ msg, type = "success", onDone }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, []);
  const c = { success: "var(--a)", error: "#ff7070", info: "#60a5fa" }[type] || "var(--a)";
  return <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: `1px solid ${c}`, borderRadius: 10, padding: "12px 20px", color: c, fontSize: 13, fontWeight: 600, zIndex: 2000, boxShadow: "0 8px 32px rgba(0,0,0,.6)", whiteSpace: "nowrap" }}>{msg}</div>;
}

// ─── LOCATION PICKER ──────────────────────────────────────────────────────────
function LocationPicker({ aisle, bay, onAisleChange, onBayChange, numAisles, numBays, depts = [] }) {
  const aisleOpts = buildAisleOptions(numAisles, depts);
  const bayOpts   = buildBayOptions(numBays);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Field label="Aisle">
        <select style={IS} value={aisle} onChange={e => onAisleChange(e.target.value)}>
          <option value="">— Select —</option>
          <optgroup label="Numbered Aisles">
            {aisleOpts.filter(o => !isNaN(o.value)).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
          <optgroup label="Departments">
            {aisleOpts.filter(o => isNaN(o.value)).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        </select>
      </Field>
      <Field label="Bay">
        <select style={IS} value={bay} onChange={e => onBayChange(e.target.value)}>
          <option value="">— Select —</option>
          {bayOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState(""); const [pass, setPass] = useState(""); const [name, setName] = useState("");
  const [showPass, setShowPass] = useState(false); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");

  const submit = async () => {
    if (!email || !pass) { setErr("Please enter email and password."); return; }
    setLoading(true); setErr("");
    try {
      if (mode === "signup") {
        const res = await sb.signUp(email, pass);
        if (res.error) setErr(res.error.message); else { setMode("signin"); setErr("Account created — please sign in."); }
      } else {
        const res = await sb.signIn(email, pass);
        if (res.error) setErr(res.error.message);
        else { const s = { token: res.access_token, refreshToken: res.refresh_token, email, displayName: name || email.split("@")[0] }; saveSession(s); onLogin(s); }
      }
    } catch (e) { setErr("Connection error — check your internet connection."); console.error(e); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🛒</div>
          <div style={{ fontFamily: "var(--fd)", fontSize: 34, fontWeight: 900, color: "var(--a)", letterSpacing: -1 }}>ShelfAlert</div>
          <div style={{ color: "var(--tm)", fontSize: 14, marginTop: 4 }}>Supermarket gap management</div>
        </div>
        <Card>
          {mode === "signup" && <Field label="Your Name"><input style={IS} placeholder="Sarah K." value={name} onChange={e => setName(e.target.value)} /></Field>}
          <Field label="Email"><input style={IS} type="email" placeholder="you@store.com.au" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} /></Field>
          <Field label="Password">
            <div style={{ position: "relative" }}>
              <input style={{ ...IS, paddingRight: 40 }} type={showPass ? "text" : "password"} placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
              <button onClick={() => setShowPass(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--tm)", padding: 0 }}><Icon d={showPass ? IC.eyeOff : IC.eye} size={15} /></button>
            </div>
          </Field>
          {err && <div style={{ fontSize: 12, color: err.includes("created") ? "#4ade80" : "#ff7070", marginBottom: 12, padding: "8px 12px", background: err.includes("created") ? "#0f2e1a" : "#3d1a1a", borderRadius: 6 }}>{err}</div>}
          <button onClick={submit} disabled={loading} style={{ ...BP, width: "100%", padding: 14, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading ? <Spin /> : (mode === "signup" ? "Create Account" : "Sign In")}
          </button>
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "var(--tm)" }}>
            {mode === "signin" ? <>No account? <button onClick={() => setMode("signup")} style={{ background: "none", border: "none", color: "var(--a)", cursor: "pointer", fontSize: 13 }}>Sign up</button></> : <>Have an account? <button onClick={() => setMode("signin")} style={{ background: "none", border: "none", color: "var(--a)", cursor: "pointer", fontSize: 13 }}>Sign in</button></>}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ gaps, suppliers, codeItems, credits, notifs, onResolve, onDismissNotif }) {
  const today = new Intl.DateTimeFormat("en-AU", { weekday: "long" }).format(new Date());
  const tmrw  = new Intl.DateTimeFormat("en-AU", { weekday: "long" }).format(new Date(Date.now() + 86400000));
  const open = gaps.filter(g => g.status !== "ordered");
  const urgentCode = codeItems.filter(c => c.status === "active" && getCodeAlert(c.useByDate));
  const pendingCredits = credits.filter(c => ["pending","confirmed"].includes(c.status));
  const pendingTotal = pendingCredits.reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0);
  const repSchedule = [...suppliers.filter(s => s.visitDay === today).map(s => ({ ...s, when: "TODAY" })), ...suppliers.filter(s => s.visitDay === tmrw).map(s => ({ ...s, when: "TOMORROW" }))];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 24 }}>
        {[["Open Gaps", open.length, "#60a5fa", false], ["Near Code", urgentCode.length, "#f97316", false], ["Credits", fmt$(pendingTotal), "#4ade80", true], ["Suppliers", suppliers.length, "#a78bfa", false]].map(([l,v,c,small]) => (
          <Card key={l}><div style={{ fontSize: small ? 20 : 32, fontWeight: 800, color: c, fontFamily: "var(--fd)", lineHeight: 1 }}>{v}</div><div style={{ fontSize: 11, color: "var(--tm)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--fm)" }}>{l}</div></Card>
        ))}
      </div>

      {urgentCode.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontFamily: "var(--fd)", fontSize: 13, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Close to Code Alerts</h3>
          {urgentCode.map(c => { const alert = getCodeAlert(c.useByDate); return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, background: alert.bg, border: `1px solid ${alert.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
              <Icon d={IC.code} size={16} color={alert.color} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: "var(--t1)", fontWeight: 600 }}>{c.description}</div><div style={{ fontSize: 11, color: alert.color, marginTop: 2 }}>{alert.label} · Use by {fmtDate(c.useByDate)}</div></div>
              <div style={{ fontSize: 11, color: "var(--tm)", fontFamily: "var(--fm)", whiteSpace: "nowrap" }}>{fmtLocation(c.aisle, c.bay)}</div>
            </div>
          ); })}
        </div>
      )}

      {notifs.filter(n => !n.read).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontFamily: "var(--fd)", fontSize: 13, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Alerts</h3>
          {notifs.filter(n => !n.read).map(n => (
            <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 12, background: n.type === "urgent" ? "#2a1500" : n.type === "warning" ? "#1e1a00" : "#1a1a2e", border: `1px solid ${n.type === "urgent" ? "#7a3500" : n.type === "warning" ? "#5a4a00" : "#1a3a6a"}`, borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
              <Icon d={IC.bell} size={16} color={n.type === "urgent" ? "#f97316" : n.type === "warning" ? "#fbbf24" : "#60a5fa"} />
              <span style={{ flex: 1, fontSize: 13, color: "var(--t2)" }}>{n.text}</span>
              <button onClick={() => onDismissNotif(n.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tm)", padding: 2 }}><Icon d={IC.x} size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ fontFamily: "var(--fd)", fontSize: 13, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Recent Gaps</h3>
      {gaps.length === 0 && <div style={{ textAlign: "center", color: "var(--tm)", padding: 32, fontSize: 14 }}>No gaps logged yet 🎉</div>}
      {gaps.slice(0, 5).map(g => {
        const sup = suppliers.find(s => s.id === g.supplierId);
        return (
          <Card key={g.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}><Dot priority={g.priority} /><span style={{ fontWeight: 600, fontSize: 14, color: "var(--t1)" }}>{g.description}</span></div>
                <div style={{ fontSize: 12, color: "var(--tm)" }}>{sup?.name} · {fmtLocation(g.aisle, g.bay)} · {g.loggedBy}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                <Badge status={g.status} />
                {g.status !== "ordered" && <div style={{ display: "flex", gap: 6 }}><button onClick={() => onResolve(g.id, "ordered")} style={{ ...BP, padding: "4px 10px", fontSize: 11 }}>Ordered</button><button onClick={() => onResolve(g.id, "unavailable")} style={{ ...BS, padding: "4px 10px", fontSize: 11 }}>Unavail.</button></div>}
              </div>
            </div>
          </Card>
        );
      })}

      {repSchedule.length > 0 && (
        <div style={{ marginTop: 24, marginBottom: 24 }}>
          <h3 style={{ fontFamily: "var(--fd)", fontSize: 13, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Rep Schedule</h3>
          {repSchedule.map(s => {
            const rg = gaps.filter(g => g.supplierId === s.id && g.status !== "ordered").length;
            const repCreditTotal = credits.filter(c => c.supplierId === s.id && ["pending","confirmed"].includes(c.status)).reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0);
            return (
              <Card key={s.id + s.when} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: s.when === "TODAY" ? "#f97316" : "#fbbf24", fontFamily: "var(--fm)", letterSpacing: 1, background: s.when === "TODAY" ? "#2a1500" : "#1e1a00", padding: "2px 8px", borderRadius: 10 }}>{s.when}</span>
                      <span style={{ fontWeight: 700, color: "var(--t1)", fontSize: 15 }}>{s.name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--tm)" }}>{s.contact} · {s.phone}</div>
                    {repCreditTotal > 0 && <div style={{ fontSize: 12, color: "#4ade80", marginTop: 4 }}>💰 {fmt$(repCreditTotal)} outstanding credits to claim</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: rg > 0 ? "#ff7070" : "#4ade80", fontFamily: "var(--fd)" }}>{rg}</div>
                    <div style={{ fontSize: 10, color: "var(--tm)", fontFamily: "var(--fm)" }}>OPEN GAPS</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── GAPS VIEW ────────────────────────────────────────────────────────────────
function GapsView({ gaps, suppliers, onAdd, onResolve, onDelete }) {
  const [filter, setFilter] = useState("all");
  const [supFilter, setSupFilter] = useState("all");
  const filtered = gaps.filter(g => (filter === "all" || g.status === filter) && (supFilter === "all" || g.supplierId === supFilter));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["all","open","missed","ordered","unavailable"].map(f => <button key={f} onClick={() => setFilter(f)} style={{ ...BS, padding: "6px 14px", fontSize: 12, borderColor: filter === f ? "var(--a)" : "var(--b)", color: filter === f ? "var(--a)" : "var(--tm)" }}>{f === "all" ? "All" : STATUS_META[f]?.label || f}</button>)}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={supFilter} onChange={e => setSupFilter(e.target.value)} style={{ ...IS, width: "auto", fontSize: 12, padding: "6px 12px" }}><option value="all">All Suppliers</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <button onClick={onAdd} style={{ ...BP, display: "flex", alignItems: "center", gap: 6 }}><Icon d={IC.plus} size={15} /> Log Gap</button>
        </div>
      </div>
      {filtered.length === 0 && <div style={{ textAlign: "center", color: "var(--tm)", padding: 40, fontSize: 14 }}>No gaps match this filter.</div>}
      {filtered.map(g => {
        const sup = suppliers.find(s => s.id === g.supplierId);
        return (
          <Card key={g.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              {g.imageUrl && <img src={g.imageUrl} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}><Dot priority={g.priority} /><span style={{ fontWeight: 700, fontSize: 15, color: "var(--t1)" }}>{g.description}</span><Badge status={g.status} />{g.priority === "high" && <span style={{ fontSize: 10, color: "#ef4444", fontFamily: "var(--fm)", letterSpacing: 1 }}>HIGH PRIORITY</span>}</div>
                <div style={{ fontSize: 12, color: "var(--tm)", marginBottom: 6, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}><span>🏢 {sup?.name||"—"}</span><span>📍 {fmtLocation(g.aisle, g.bay)}</span><span>👤 {g.loggedBy}</span><span>🕐 {fmtDate(g.loggedAt)}</span></div>
                {g.notes && <div style={{ fontSize: 12, color: "var(--t2)", background: "var(--ib)", borderRadius: 6, padding: "6px 10px" }}>"{g.notes}"</div>}
                {g.unavailableUntil && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 4 }}>📅 Expected back: {fmtDate(g.unavailableUntil)}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                {g.status !== "ordered" && <><button onClick={() => onResolve(g.id, "ordered")} style={{ ...BP, padding: "5px 12px", fontSize: 12 }}>Ordered</button><button onClick={() => onResolve(g.id, "unavailable")} style={{ ...BS, padding: "5px 12px", fontSize: 12 }}>Unavailable</button></>}
                <button onClick={() => onDelete(g.id)} style={{ ...BD, padding: "5px 12px", fontSize: 12 }}>Delete</button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── CLOSE TO CODE VIEW ───────────────────────────────────────────────────────
function CloseToCodeView({ items, suppliers, onAdd, onUpdateStatus, onDelete }) {
  const [filter, setFilter] = useState("active");
  const sorted = [...items.filter(i => filter === "all" || i.status === filter)].sort((a, b) => new Date(a.useByDate) - new Date(b.useByDate));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["active","all","marked_down","returned","removed"].map(f => <button key={f} onClick={() => setFilter(f)} style={{ ...BS, padding: "6px 14px", fontSize: 12, borderColor: filter === f ? "var(--a)" : "var(--b)", color: filter === f ? "var(--a)" : "var(--tm)" }}>{f === "all" ? "All" : CODE_STATUS_META[f]?.label || f}</button>)}
        </div>
        <button onClick={onAdd} style={{ ...BP, display: "flex", alignItems: "center", gap: 6 }}><Icon d={IC.plus} size={15} /> Add Item</button>
      </div>
      {sorted.length === 0 && <div style={{ textAlign: "center", color: "var(--tm)", padding: 40, fontSize: 14 }}>No items in this category.</div>}
      {sorted.map(item => {
        const alert = getCodeAlert(item.useByDate); const days = daysUntil(item.useByDate); const sup = suppliers.find(s => s.id === item.supplierId);
        return (
          <Card key={item.id} style={{ marginBottom: 10, borderColor: alert ? alert.border : "var(--b)" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {alert && item.status === "active" && <div style={{ background: alert.bg, border: `1px solid ${alert.border}`, borderRadius: 8, padding: "6px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}><Icon d={IC.bell} size={14} color={alert.color} /><span style={{ fontSize: 12, color: alert.color, fontWeight: 700 }}>{alert.label}</span></div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}><span style={{ fontWeight: 700, fontSize: 15, color: "var(--t1)" }}>{item.description}</span><Badge status={item.status} meta={CODE_STATUS_META} /></div>
                <div style={{ fontSize: 12, color: "var(--tm)", marginBottom: 6, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                  <span>📅 Use by: <strong style={{ color: days !== null && days <= 7 ? "#ff7070" : days !== null && days <= 14 ? "#fbbf24" : "var(--t2)" }}>{fmtDate(item.useByDate)}</strong></span>
                  {days !== null && <span style={{ color: days <= 0 ? "#ff3030" : days <= 2 ? "#ff7070" : days <= 7 ? "#f97316" : "var(--tm)" }}>{days <= 0 ? "EXPIRED" : `${days} day${days === 1 ? "" : "s"} left`}</span>}
                  {item.quantity && <span>📦 {item.quantity}</span>}
                  <span>📍 {fmtLocation(item.aisle, item.bay)}</span>
                  {sup && <span>🏢 {sup.name}</span>}
                </div>
                {item.notes && <div style={{ fontSize: 12, color: "var(--t2)", background: "var(--ib)", borderRadius: 6, padding: "6px 10px" }}>"{item.notes}"</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                {item.status === "active" && <><button onClick={() => onUpdateStatus(item.id, "marked_down")} style={{ ...BS, padding: "5px 12px", fontSize: 11, whiteSpace: "nowrap" }}>Mark Down</button><button onClick={() => onUpdateStatus(item.id, "returned")} style={{ ...BS, padding: "5px 12px", fontSize: 11 }}>Returned</button><button onClick={() => onUpdateStatus(item.id, "removed")} style={{ background: "#2a1500", color: "#f97316", border: "1px solid #7a3500", borderRadius: 8, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "var(--fb)" }}>Remove</button></>}
                <button onClick={() => onDelete(item.id)} style={{ ...BD, padding: "5px 12px", fontSize: 11 }}>Delete</button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── CREDIT SECTION ───────────────────────────────────────────────────────────
function CreditSection({ type, credits, supplierId, onAdd, onUpdateStatus, onDelete }) {
  const meta = CREDIT_TYPE_META[type];
  const items = credits.filter(c => c.supplierId === supplierId && c.type === type);
  const active = items.filter(c => c.status !== "resolved");
  const resolved = items.filter(c => c.status === "resolved");
  const [showResolved, setShowResolved] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const pendingTotal = active.filter(c => ["pending","confirmed"].includes(c.status)).reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0);

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{meta.icon}</span>
          <span style={{ fontWeight: 700, color: meta.color, fontSize: 14, fontFamily: "var(--fd)" }}>{meta.label}</span>
          {pendingTotal > 0 && <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, borderRadius: 20, fontSize: 11, fontWeight: 700, padding: "2px 10px", fontFamily: "var(--fm)" }}>{fmt$(pendingTotal)} pending</span>}
        </div>
        <button onClick={() => setShowForm(true)} style={{ ...BP, padding: "5px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><Icon d={IC.plus} size={13} /> Add</button>
      </div>
      {active.length === 0 && <div style={{ fontSize: 13, color: "var(--tm)", padding: "8px 0" }}>No active {meta.label.toLowerCase()} credits.</div>}
      {active.map(c => (
        <div key={c.id} style={{ background: "var(--ib)", border: "1px solid var(--b)", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: "var(--t1)", fontSize: 14, marginBottom: 4 }}>{c.description}</div>
              <div style={{ fontSize: 12, color: "var(--tm)", display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                {c.quantity && <span>📦 {c.quantity}</span>}
                {c.value && <span style={{ color: "#4ade80", fontWeight: 700 }}>💰 {fmt$(c.value)}</span>}
                <span>📅 {fmtDate(c.dateRaised)}</span>
                {c.refNumber && <span>🔖 Ref: {c.refNumber}</span>}
              </div>
              {c.notes && <div style={{ fontSize: 12, color: "var(--t2)", marginTop: 6, background: "var(--c)", borderRadius: 6, padding: "4px 8px" }}>"{c.notes}"</div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0, alignItems: "flex-end" }}>
              <Badge status={c.status} meta={CREDIT_STATUS_META} />
              <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {c.status === "pending" && <button onClick={() => onUpdateStatus(c.id, "confirmed")} style={{ ...BS, padding: "3px 8px", fontSize: 11 }}>Confirmed</button>}
                {["pending","confirmed"].includes(c.status) && <button onClick={() => onUpdateStatus(c.id, "received")} style={{ ...BP, padding: "3px 8px", fontSize: 11 }}>Received</button>}
                {["pending","confirmed"].includes(c.status) && <button onClick={() => onUpdateStatus(c.id, "disputed")} style={{ ...BD, padding: "3px 8px", fontSize: 11 }}>Disputed</button>}
                {["received","disputed"].includes(c.status) && <button onClick={() => onUpdateStatus(c.id, "resolved")} style={{ ...BS, padding: "3px 8px", fontSize: 11 }}>Archive</button>}
                <button onClick={() => onDelete(c.id)} style={{ ...BD, padding: "3px 8px", fontSize: 11 }}>✕</button>
              </div>
            </div>
          </div>
        </div>
      ))}
      {resolved.length > 0 && (
        <button onClick={() => setShowResolved(v => !v)} style={{ ...BS, padding: "5px 14px", fontSize: 12, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon d={IC.chev} size={13} /> {showResolved ? "Hide" : "Show"} archive ({resolved.length})
        </button>
      )}
      {showResolved && resolved.map(c => (
        <div key={c.id} style={{ background: "var(--ib)", border: "1px solid var(--b)", borderRadius: 10, padding: "10px 14px", marginTop: 6, opacity: 0.5 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div><div style={{ fontSize: 13, color: "var(--t2)" }}>{c.description}</div><div style={{ fontSize: 11, color: "var(--tm)" }}>{fmtDate(c.dateRaised)} {c.value && `· ${fmt$(c.value)}`}</div></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Badge status="resolved" meta={CREDIT_STATUS_META} /><button onClick={() => onDelete(c.id)} style={{ ...BD, padding: "3px 8px", fontSize: 11 }}>✕</button></div>
          </div>
        </div>
      ))}
      {showForm && <CreditForm type={type} onSave={async (data) => { await onAdd(data); setShowForm(false); }} onClose={() => setShowForm(false)} />}
    </div>
  );
}

// ─── SUPPLIERS VIEW ───────────────────────────────────────────────────────────
function SuppliersView({ suppliers, gaps, credits, onAdd, onEdit, onDelete, onAddCredit, onUpdateCreditStatus, onDeleteCredit }) {
  const [expanded, setExpanded] = useState(null);
  const [activeTab, setActiveTab] = useState({});
  const toggle = (id) => setExpanded(e => e === id ? null : id);
  const getTab = (id) => activeTab[id] || "details";
  const setTab = (id, tab) => setActiveTab(t => ({ ...t, [id]: tab }));
  const today = new Intl.DateTimeFormat("en-AU", { weekday: "long" }).format(new Date());
  const tmrw  = new Intl.DateTimeFormat("en-AU", { weekday: "long" }).format(new Date(Date.now() + 86400000));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <button onClick={onAdd} style={{ ...BP, display: "flex", alignItems: "center", gap: 6 }}><Icon d={IC.plus} size={15} /> Add Supplier</button>
      </div>
      {suppliers.length === 0 && <div style={{ color: "var(--tm)", fontSize: 14, padding: 20 }}>No suppliers yet. Add your first rep above.</div>}
      {suppliers.map(s => {
        const isOpen = expanded === s.id;
        const tab = getTab(s.id);
        const og = gaps.filter(g => g.supplierId === s.id && g.status !== "ordered").length;
        const supCredits = credits.filter(c => c.supplierId === s.id);
        const pendingTotal = supCredits.filter(c => ["pending","confirmed"].includes(c.status)).reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0);
        const repWhen = s.visitDay === today ? "TODAY" : s.visitDay === tmrw ? "TOMORROW" : null;

        return (
          <div key={s.id} style={{ marginBottom: 10 }}>
            <div onClick={() => toggle(s.id)} style={{ background: "var(--c)", border: `1px solid ${isOpen ? "var(--a)" : "var(--b)"}`, borderRadius: isOpen ? "12px 12px 0 0" : 12, padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "border-color .2s" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 16, color: "var(--t1)" }}>{s.name}</span>
                  {repWhen && <span style={{ fontSize: 10, fontWeight: 800, color: repWhen === "TODAY" ? "#f97316" : "#fbbf24", fontFamily: "var(--fm)", letterSpacing: 1, background: repWhen === "TODAY" ? "#2a1500" : "#1e1a00", padding: "2px 8px", borderRadius: 10 }}>REP {repWhen}</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--tm)", marginTop: 2 }}>{s.visitDay} · <span style={{ textTransform: "capitalize" }}>{s.frequency}</span></div>
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
                {pendingTotal > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 800, color: "#4ade80", fontFamily: "var(--fd)" }}>{fmt$(pendingTotal)}</div><div style={{ fontSize: 10, color: "var(--tm)", fontFamily: "var(--fm)" }}>CREDITS</div></div>}
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 800, color: og > 0 ? "#ff7070" : "#4ade80", fontFamily: "var(--fd)" }}>{og}</div><div style={{ fontSize: 10, color: "var(--tm)", fontFamily: "var(--fm)" }}>GAPS</div></div>
                <Icon d={IC.chev} size={16} color="var(--tm)" />
              </div>
            </div>

            {isOpen && (
              <div style={{ background: "var(--s)", border: "1px solid var(--a)", borderTop: "none", borderRadius: "0 0 12px 12px" }}>
                <div style={{ display: "flex", borderBottom: "1px solid var(--b)", padding: "0 20px" }}>
                  {[["details","Rep Details"],["credits","Credits & Returns"]].map(([id, label]) => (
                    <button key={id} onClick={() => setTab(s.id, id)} style={{ background: "none", border: "none", borderBottom: `2px solid ${tab === id ? "var(--a)" : "transparent"}`, color: tab === id ? "var(--a)" : "var(--tm)", cursor: "pointer", padding: "12px 16px", fontSize: 13, fontWeight: tab === id ? 700 : 400, fontFamily: "var(--fb)", transition: "color .15s", marginBottom: -1 }}>
                      {label}
                      {id === "credits" && pendingTotal > 0 && <span style={{ marginLeft: 6, background: "#0f2e1a", color: "#4ade80", border: "1px solid #1a5c30", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>{fmt$(pendingTotal)}</span>}
                    </button>
                  ))}
                  <div style={{ flex: 1 }} />
                  <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 0" }}>
                    <button onClick={(e) => { e.stopPropagation(); onEdit(s); }} style={{ ...BS, padding: "4px 10px" }}><Icon d={IC.edit} size={13} /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }} style={{ ...BD, padding: "4px 10px" }}><Icon d={IC.trash} size={13} /></button>
                  </div>
                </div>

                {tab === "details" && (
                  <div style={{ padding: "20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
                      {[["Rep Name", s.contact], ["Phone", s.phone], ["Visit Day", s.visitDay], ["Frequency", s.frequency]].map(([l, v]) => v ? (
                        <div key={l}><div style={{ fontSize: 11, color: "var(--tm)", fontFamily: "var(--fm)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{l}</div><div style={{ fontSize: 14, color: "var(--t1)", fontWeight: 600 }}>{v}</div></div>
                      ) : null)}
                    </div>
                    {og > 0 && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--b)" }}>
                        <div style={{ fontSize: 12, color: "var(--tm)", marginBottom: 8 }}>Open gaps for this supplier:</div>
                        {gaps.filter(g => g.supplierId === s.id && g.status !== "ordered").map(g => (
                          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><Dot priority={g.priority} /><span style={{ fontSize: 13, color: "var(--t2)", flex: 1 }}>{g.description}</span><span style={{ fontSize: 11, color: "var(--tm)" }}>{fmtLocation(g.aisle, g.bay)}</span><Badge status={g.status} /></div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === "credits" && (
                  <div style={{ padding: "20px" }}>
                    {pendingTotal > 0 && (
                      <div style={{ background: "#0f2e1a", border: "1px solid #1a5c30", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: "#4ade80" }}>💰 Total outstanding credits</span>
                        <span style={{ fontSize: 20, fontWeight: 800, color: "#4ade80", fontFamily: "var(--fd)" }}>{fmt$(pendingTotal)}</span>
                      </div>
                    )}
                    {CREDIT_TYPES.map(type => (
                      <CreditSection key={type} type={type} credits={credits} supplierId={s.id}
                        onAdd={(data) => onAddCredit({ ...data, supplierId: s.id, type })}
                        onUpdateStatus={onUpdateCreditStatus}
                        onDelete={onDeleteCredit}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── REPORTS VIEW ─────────────────────────────────────────────────────────────
function ReportsView({ gaps, suppliers, credits }) {
  const rows = suppliers.map(s => ({
    ...s,
    total: gaps.filter(g => g.supplierId === s.id).length,
    ordered: gaps.filter(g => g.supplierId === s.id && g.status === "ordered").length,
    missed: gaps.filter(g => g.supplierId === s.id && g.status === "missed").length,
    creditTotal: credits.filter(c => c.supplierId === s.id && ["pending","confirmed"].includes(c.status)).reduce((sum, c) => sum + (parseFloat(c.value)||0), 0),
  }));
  const exportCSV = () => {
    const lines = [["Description","Supplier","Location","Priority","Status","Logged By","Date"].join(",")];
    gaps.forEach(g => { const sup = suppliers.find(s => s.id === g.supplierId); lines.push([g.description, sup?.name||"", fmtLocation(g.aisle, g.bay), g.priority, g.status, g.loggedBy, fmtDate(g.loggedAt)].map(v => `"${v}"`).join(",")); });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "shelfalert.csv"; a.click();
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <button onClick={exportCSV} style={{ ...BS, display: "flex", alignItems: "center", gap: 6 }}><Icon d={IC.dl} size={14} /> Export CSV</button>
      </div>
      {rows.map(s => (
        <Card key={s.id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontWeight: 700, color: "var(--t1)", fontSize: 15 }}>{s.name}</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[["Total",s.total,"#a78bfa"],["Ordered",s.ordered,"#4ade80"],["Missed",s.missed,"#ff7070"],["Credits",fmt$(s.creditTotal),"#4ade80"]].map(([l,v,c]) => (
                <div key={l} style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "var(--fd)" }}>{v}</div><div style={{ fontSize: 10, color: "var(--tm)", fontFamily: "var(--fm)", letterSpacing: 1 }}>{l}</div></div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 10, height: 5, background: "var(--ib)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${s.total ? (s.ordered/s.total)*100 : 0}%`, background: "#4ade80", borderRadius: 3 }} />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── SETTINGS VIEW ────────────────────────────────────────────────────────────
function SettingsView({ settings, depts, onSave, saving, onAddDept, onUpdateDept, onDeleteDept }) {
  const [f, setF] = useState(settings);
  const [editDept, setEditDept] = useState(null); // null | { id, code, label } | "new"
  const [deptForm, setDeptForm] = useState({ code: "", label: "" });
  useEffect(() => setF(settings), [settings]);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const openNewDept = () => { setDeptForm({ code: "", label: "" }); setEditDept("new"); };
  const openEditDept = (d) => { setDeptForm({ code: d.code, label: d.label }); setEditDept(d); };
  const saveDept = async () => {
    if (!deptForm.code || !deptForm.label) return;
    if (editDept === "new") { await onAddDept(deptForm); }
    else { await onUpdateDept(editDept.id, deptForm); }
    setEditDept(null);
  };

  return (
    <div style={{ maxWidth: 580 }}>
      <h3 style={{ fontFamily: "var(--fd)", fontSize: 13, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>Store Details</h3>
      <Field label="Store Name"><input style={IS} value={f.storeName||""} onChange={e => s("storeName", e.target.value)} /></Field>
      <Field label="Store Email"><input style={IS} type="email" value={f.storeEmail||""} onChange={e => s("storeEmail", e.target.value)} /></Field>
      <Field label="Timezone"><select style={IS} value={f.timezone||"Australia/Perth"} onChange={e => s("timezone", e.target.value)}>{TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}</select></Field>
      <Field label="Notification Time" hint="Email sent at this time on rep visit days and the day before"><input style={IS} type="time" value={f.notifTime||"06:00"} onChange={e => s("notifTime", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Number of Aisles" hint="Numbered aisles in store"><input style={IS} type="number" min="1" max="50" value={f.numAisles||12} onChange={e => s("numAisles", parseInt(e.target.value)||12)} /></Field>
        <Field label="Number of Bays" hint="Max bays per aisle / department"><input style={IS} type="number" min="1" max="100" value={f.numBays||20} onChange={e => s("numBays", parseInt(e.target.value)||20)} /></Field>
      </div>
      <button onClick={() => onSave(f)} disabled={saving} style={{ ...BP, display: "flex", alignItems: "center", gap: 8, marginBottom: 32 }}>{saving ? <Spin /> : "Save Settings"}</button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ fontFamily: "var(--fd)", fontSize: 13, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 2 }}>Department Codes</h3>
        <button onClick={openNewDept} style={{ ...BP, padding: "5px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}><Icon d={IC.plus} size={13} /> Add</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--tm)", marginBottom: 12 }}>These appear alongside numbered aisles in the location picker.</div>

      {depts.length === 0 && <div style={{ color: "var(--tm)", fontSize: 13, padding: "12px 0" }}>No departments yet — add your first one above.</div>}
      {depts.map(d => (
        <div key={d.id} style={{ background: "var(--ib)", border: "1px solid var(--b)", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          {editDept?.id === d.id ? (
            <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
              <input style={{ ...IS, width: 70 }} placeholder="Code" value={deptForm.code} onChange={e => setDeptForm(p => ({ ...p, code: e.target.value.toUpperCase().slice(0,3) }))} maxLength={3} />
              <input style={{ ...IS, flex: 1, minWidth: 120 }} placeholder="Label e.g. Meat" value={deptForm.label} onChange={e => setDeptForm(p => ({ ...p, label: e.target.value }))} />
              <button onClick={saveDept} style={{ ...BP, padding: "5px 12px", fontSize: 12 }}>Save</button>
              <button onClick={() => setEditDept(null)} style={{ ...BS, padding: "5px 10px", fontSize: 12 }}>✕</button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: "var(--fm)", fontWeight: 700, color: "var(--a)", fontSize: 14, minWidth: 36 }}>{d.code}</span>
                <span style={{ color: "var(--t2)", fontSize: 14 }}>{d.label}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => openEditDept(d)} style={{ ...BS, padding: "3px 10px", fontSize: 12 }}><Icon d={IC.edit} size={13} /></button>
                <button onClick={() => onDeleteDept(d.id)} style={{ ...BD, padding: "3px 10px", fontSize: 12 }}><Icon d={IC.trash} size={13} /></button>
              </div>
            </>
          )}
        </div>
      ))}

      {editDept === "new" && (
        <div style={{ background: "var(--ib)", border: "1px solid var(--a)", borderRadius: 10, padding: "12px 14px", marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--tm)", fontFamily: "var(--fm)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>New Department</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input style={{ ...IS, width: 80 }} placeholder="Code e.g. MT" value={deptForm.code} onChange={e => setDeptForm(p => ({ ...p, code: e.target.value.toUpperCase().slice(0,3) }))} maxLength={3} />
            <input style={{ ...IS, flex: 1, minWidth: 150 }} placeholder="Label e.g. Meat" value={deptForm.label} onChange={e => setDeptForm(p => ({ ...p, label: e.target.value }))} />
            <button onClick={saveDept} disabled={!deptForm.code || !deptForm.label} style={{ ...BP, padding: "5px 14px", fontSize: 12 }}>Add</button>
            <button onClick={() => setEditDept(null)} style={{ ...BS, padding: "5px 10px", fontSize: 12 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FORMS ────────────────────────────────────────────────────────────────────
function GapForm({ suppliers, token, numAisles, numBays, depts, onSave, onClose }) {
  const [f, setF] = useState({ description: "", supplierId: suppliers[0]?.id || "", aisle: "", bay: "", priority: "normal", notes: "", imageFile: null, imagePreview: null });
  const [aiLoading, setAiLoading] = useState(false); const [aiDone, setAiDone] = useState(false); const [saving, setSaving] = useState(false);
  const ref = useRef(); const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]; if (!file) return; s("imageFile", file);
    const reader = new FileReader();
    reader.onload = async ev => { s("imagePreview", ev.target.result); setAiLoading(true); const desc = await aiDescribe(ev.target.result.split(",")[1]); if (desc) { s("description", desc); setAiDone(true); } setAiLoading(false); };
    reader.readAsDataURL(file);
  };
  const save = async () => {
    if (!f.description || !f.supplierId) return; setSaving(true);
    let imageUrl = null; if (f.imageFile) imageUrl = await sb.uploadImage(token, f.imageFile);
    await onSave({ ...f, imageUrl }); setSaving(false);
  };
  const canSave = f.description.trim().length > 0 && f.supplierId;
  return (
    <Modal title="Log New Gap" onClose={onClose} width={560}>
      <Field label="Photo — AI will describe the product">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => ref.current.click()} style={{ ...BS, display: "flex", alignItems: "center", gap: 6 }}><Icon d={IC.cam} size={14} /> {aiLoading ? "Analysing…" : "Take / Upload Photo"}</button>
          {aiDone && <span style={{ fontSize: 12, color: "#4ade80" }}>✓ AI generated</span>}
          <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhoto} />
        </div>
        {f.imagePreview && <img src={f.imagePreview} alt="" style={{ marginTop: 10, width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8 }} />}
      </Field>
      <Field label="Product Description"><input style={IS} placeholder="e.g. Birds Eye Chicken Nuggets 400g" value={f.description} onChange={e => s("description", e.target.value)} /></Field>
      <Field label="Supplier">
        <select style={IS} value={f.supplierId} onChange={e => s("supplierId", e.target.value)}>
          <option value="">— Select supplier —</option>
          {suppliers.map(sup => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
        </select>
      </Field>
      <LocationPicker aisle={f.aisle} bay={f.bay} onAisleChange={v => s("aisle", v)} onBayChange={v => s("bay", v)} numAisles={numAisles} numBays={numBays} depts={depts} />
      <Field label="Priority"><select style={IS} value={f.priority} onChange={e => s("priority", e.target.value)}><option value="normal">Normal</option><option value="high">High Priority</option></select></Field>
      <Field label="Notes (optional)"><textarea style={{ ...IS, resize: "vertical", minHeight: 60 }} value={f.notes} onChange={e => s("notes", e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={BS}>Cancel</button>
        <button onClick={save} disabled={!canSave || saving} style={{ ...BP, display: "flex", alignItems: "center", gap: 8, opacity: canSave ? 1 : 0.5 }}>{saving ? <Spin /> : "Save Gap"}</button>
      </div>
    </Modal>
  );
}

function CodeForm({ suppliers, numAisles, numBays, depts, onSave, onClose }) {
  const [f, setF] = useState({ description: "", useByDate: "", quantity: "", aisle: "", bay: "", supplierId: "", notes: "" });
  const [saving, setSaving] = useState(false); const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const canSave = f.description.trim().length > 0 && f.useByDate;
  return (
    <Modal title="Add Close to Code Item" onClose={onClose} width={520}>
      <Field label="Product Description"><input style={IS} placeholder="e.g. Pauls Full Cream Milk 2L" value={f.description} onChange={e => s("description", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Use-By Date" hint="Alerts at 2wk, 1wk, 2 days, day of"><input style={IS} type="date" value={f.useByDate} onChange={e => s("useByDate", e.target.value)} /></Field>
        <Field label="Quantity (optional)"><input style={IS} placeholder="e.g. 12 units" value={f.quantity} onChange={e => s("quantity", e.target.value)} /></Field>
      </div>
      <LocationPicker aisle={f.aisle} bay={f.bay} onAisleChange={v => s("aisle", v)} onBayChange={v => s("bay", v)} numAisles={numAisles} numBays={numBays} depts={depts} />
      <Field label="Supplier (optional)"><select style={IS} value={f.supplierId} onChange={e => s("supplierId", e.target.value)}><option value="">— None —</option>{suppliers.map(sup => <option key={sup.id} value={sup.id}>{sup.name}</option>)}</select></Field>
      <Field label="Notes (optional)"><textarea style={{ ...IS, resize: "vertical", minHeight: 60 }} value={f.notes} onChange={e => s("notes", e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={BS}>Cancel</button>
        <button onClick={async () => { if (!canSave) return; setSaving(true); await onSave(f); setSaving(false); }} disabled={!canSave || saving} style={{ ...BP, display: "flex", alignItems: "center", gap: 8, opacity: canSave ? 1 : 0.5 }}>{saving ? <Spin /> : "Add Item"}</button>
      </div>
    </Modal>
  );
}

function CreditForm({ type, onSave, onClose }) {
  const meta = CREDIT_TYPE_META[type];
  const [f, setF] = useState({ description: "", quantity: "", value: "", dateRaised: new Date().toISOString().split("T")[0], refNumber: "", notes: "" });
  const [saving, setSaving] = useState(false); const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal title={`Add ${meta.label} Credit`} onClose={onClose} width={480}>
      <Field label="Product Description"><input style={IS} placeholder="e.g. Pauls Milk 2L x6" value={f.description} onChange={e => s("description", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Quantity"><input style={IS} placeholder="e.g. 4 units" value={f.quantity} onChange={e => s("quantity", e.target.value)} /></Field>
        <Field label="Dollar Value ($)"><input style={IS} type="number" step="0.01" placeholder="0.00" value={f.value} onChange={e => s("value", e.target.value)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Date Raised"><input style={IS} type="date" value={f.dateRaised} onChange={e => s("dateRaised", e.target.value)} /></Field>
        <Field label="Ref / Claim Number (optional)"><input style={IS} placeholder="e.g. CR-1234" value={f.refNumber} onChange={e => s("refNumber", e.target.value)} /></Field>
      </div>
      <Field label="Notes (optional)"><textarea style={{ ...IS, resize: "vertical", minHeight: 60 }} value={f.notes} onChange={e => s("notes", e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={BS}>Cancel</button>
        <button onClick={async () => { if (!f.description) return; setSaving(true); await onSave(f); setSaving(false); }} disabled={!f.description || saving} style={{ ...BP, display: "flex", alignItems: "center", gap: 8 }}>{saving ? <Spin /> : `Add ${meta.label} Credit`}</button>
      </div>
    </Modal>
  );
}

function SupplierForm({ supplier, onSave, onClose }) {
  const [f, setF] = useState(supplier || { name: "", contact: "", phone: "", visitDay: "Monday", frequency: "weekly" });
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const canSave = f.name.trim().length > 0;
  const hasContacts = "contacts" in navigator && "ContactsManager" in window;

  const importContact = async () => {
    try {
      const results = await navigator.contacts.select(["name", "tel"], { multiple: false });
      if (!results.length) return;
      const c = results[0];
      if (c.name?.[0])  s("contact", c.name[0]);
      if (c.tel?.[0])   s("phone",   c.tel[0].replace(/\s+/g, " ").trim());
    } catch {}
  };

  return (
    <Modal title={supplier ? "Edit Supplier" : "Add Supplier"} onClose={onClose}>
      {hasContacts && !supplier && (
        <button onClick={importContact} style={{ ...BS, width: "100%", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 11l-4-4m0 4 4-4" size={15} />
          Import from Contacts
        </button>
      )}
      <Field label="Company / Supplier Name"><input style={IS} placeholder="e.g. Patties Foods" value={f.name} onChange={e => s("name", e.target.value)} /></Field>
      <Field label="Rep Name (optional)"><input style={IS} placeholder="e.g. Mark Reynolds" value={f.contact} onChange={e => s("contact", e.target.value)} /></Field>
      <Field label="Phone (optional)"><input style={IS} placeholder="e.g. 0412 000 111" value={f.phone} onChange={e => s("phone", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Visit Day"><select style={IS} value={f.visitDay} onChange={e => s("visitDay", e.target.value)}>{DAYS.map(d => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Frequency"><select style={IS} value={f.frequency} onChange={e => s("frequency", e.target.value)}>{FREQS.map(fr => <option key={fr} value={fr}>{fr.charAt(0).toUpperCase()+fr.slice(1)}</option>)}</select></Field>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={BS}>Cancel</button>
        <button onClick={async () => { if (!canSave) return; setSaving(true); await onSave(f); setSaving(false); }} disabled={!canSave || saving} style={{ ...BP, display: "flex", alignItems: "center", gap: 8, opacity: canSave ? 1 : 0.5 }}>{saving ? <Spin /> : "Save Supplier"}</button>
      </div>
    </Modal>
  );
}

function ResolveModal({ gapId, status, onConfirm, onClose }) {
  const [date, setDate] = useState("");
  if (status !== "unavailable") { onConfirm(gapId, status, null); return null; }
  return (
    <Modal title="Mark as Unavailable" onClose={onClose} width={400}>
      <p style={{ color: "var(--t2)", fontSize: 14, marginBottom: 20 }}>When does the rep expect this back in stock? (optional)</p>
      <Field label="Expected Back-In-Stock Date"><input style={IS} type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 10 }}><button onClick={onClose} style={BS}>Cancel</button><button onClick={() => onConfirm(gapId, "unavailable", date||null)} style={BP}>Confirm</button></div>
    </Modal>
  );
}

// ─── THEFT CHARTS ─────────────────────────────────────────────────────────────
function WeeklyBarChart({ data }) {
  const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const maxVal = Math.max(...data, 1);
  const maxIdx = data.indexOf(Math.max(...data));
  const todayDow = new Date().getDay();
  const W = 420, H = 110, padL = 26, padB = 20, padT = 10;
  const chartH = H - padB - padT;
  const slotW = (W - padL - 8) / 7;
  const bw = slotW * 0.65;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {[0.5, 1].map((f, i) => (
        <line key={i} x1={padL} y1={padT + chartH * (1 - f)} x2={W - 4} y2={padT + chartH * (1 - f)} stroke="var(--b)" strokeWidth="0.5" />
      ))}
      {data.map((v, i) => {
        const cx = padL + i * slotW + slotW / 2;
        const bh = v === 0 ? 0 : Math.max(3, (v / maxVal) * chartH);
        const y = padT + chartH - bh;
        const isMax = i === maxIdx && v > 0;
        const isToday = i === todayDow;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={y} width={bw} height={bh} rx="3" fill={isMax ? "#f97316" : "var(--a)"} opacity={isToday ? 1 : 0.7} />
            {v > 0 && <text x={cx} y={y - 3} fill={isMax ? "#f97316" : "var(--tm)"} fontSize="7" textAnchor="middle">{v}</text>}
            <text x={cx} y={H - 3} fill={isToday ? "var(--t2)" : "var(--tm)"} fontSize="8" textAnchor="middle" fontWeight={isToday ? "700" : "400"}>{DAY_LABELS[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function MonthlyTotalsChart({ weeks }) {
  const maxVal = Math.max(...weeks.map(w => w.total), 1);
  const W = 400, H = 110, padL = 26, padB = 20, padT = 10;
  const chartH = H - padB - padT;
  const slotW = (W - padL - 8) / Math.max(weeks.length, 1);
  const bw = slotW * 0.55;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {[0.5, 1].map((f, i) => (
        <line key={i} x1={padL} y1={padT + chartH * (1 - f)} x2={W - 4} y2={padT + chartH * (1 - f)} stroke="var(--b)" strokeWidth="0.5" />
      ))}
      {weeks.map(({ total, isPartial }, i) => {
        const cx = padL + i * slotW + slotW / 2;
        const bh = total === 0 ? 0 : Math.max(3, (total / maxVal) * chartH);
        const y = padT + chartH - bh;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={y} width={bw} height={bh} rx="4" fill="var(--a)" opacity={isPartial ? 0.4 : 0.75} />
            {total > 0 && <text x={cx} y={y - 3} fill="var(--tm)" fontSize="7" textAnchor="middle">{total}</text>}
            <text x={cx} y={H - 3} fill="var(--tm)" fontSize="8" textAnchor="middle">Wk {i + 1}{isPartial ? " ▸" : ""}</text>
          </g>
        );
      })}
    </svg>
  );
}

function MonthlyBreakdownChart({ data }) {
  const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const OPACITIES = [0.4, 0.55, 0.7, 0.85, 1.0];
  const activeWeeks = data.filter(wk => wk.some(v => v > 0)).length;
  const maxVal = Math.max(...data.flat(), 1);
  const W = 420, H = 110, padL = 26, padB = 20, padT = 10;
  const chartH = H - padB - padT;
  const daySlotW = (W - padL - 8) / 7;
  const barW = Math.max(4, (daySlotW * 0.75) / Math.max(activeWeeks, 1));
  const barGap = 1.5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {[0.5, 1].map((f, i) => (
        <line key={i} x1={padL} y1={padT + chartH * (1 - f)} x2={W - 4} y2={padT + chartH * (1 - f)} stroke="var(--b)" strokeWidth="0.5" />
      ))}
      {DAY_LABELS.map((day, dow) => {
        const dayStart = padL + dow * daySlotW + daySlotW * 0.1;
        return (
          <g key={dow}>
            {data.map((wkData, wkIdx) => {
              const v = wkData[dow];
              if (v === 0) return null;
              const bh = Math.max(3, (v / maxVal) * chartH);
              const y = padT + chartH - bh;
              const x = dayStart + wkIdx * (barW + barGap);
              return <rect key={wkIdx} x={x} y={y} width={barW} height={bh} rx="2" fill="var(--a)" opacity={OPACITIES[wkIdx] ?? 1} />;
            })}
            <text x={padL + dow * daySlotW + daySlotW / 2} y={H - 3} fill="var(--tm)" fontSize="8" textAnchor="middle">{day}</text>
          </g>
        );
      })}
    </svg>
  );
}

function TheftPrintReport({ incidents, items, locations }) {
  const itemMap = Object.fromEntries(items.map(i => [i.id, i.name]));
  const locMap  = Object.fromEntries(locations.map(l => [l.id, l.name]));
  const totalQty = incidents.reduce((s, i) => s + (i.quantity || 0), 0);
  const itemCounts = {};
  incidents.forEach(inc => { itemCounts[inc.itemId] = (itemCounts[inc.itemId] || 0) + 1; });
  const topItemId  = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const locCounts  = {};
  incidents.forEach(inc => { if (inc.foundAtId) locCounts[inc.foundAtId] = (locCounts[inc.foundAtId] || 0) + 1; });
  const topLocId   = Object.entries(locCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const itemStats = items.map(item => {
    const incs = incidents.filter(i => i.itemId === item.id);
    return { ...item, count: incs.length, lastDate: incs[0]?.incidentDate };
  }).filter(i => i.count > 0).sort((a, b) => b.count - a.count);

  return (
    <div id="theft-print-report" style={{ display: "none", padding: 20, color: "#000", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>ShelfAlert — Theft Report</h1>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>Generated {new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</div>

      <div style={{ marginBottom: 20 }}>
        <span className="print-stat"><strong>{incidents.length}</strong><br /><small>Total Incidents</small></span>
        <span className="print-stat"><strong>{totalQty}</strong><br /><small>Total Quantity</small></span>
        {topItemId && <span className="print-stat"><strong>{itemMap[topItemId]}</strong><br /><small>Top Item ({itemCounts[topItemId]} incidents)</small></span>}
        {topLocId  && <span className="print-stat"><strong>{locMap[topLocId]}</strong><br /><small>Top Location ({locCounts[topLocId]} reports)</small></span>}
      </div>

      {itemStats.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, marginBottom: 8, borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Items Summary</h2>
          <table style={{ marginBottom: 20 }}>
            <thead><tr><th>Item</th><th>Incidents</th><th>Last Seen</th><th>Status</th></tr></thead>
            <tbody>
              {itemStats.map(i => (
                <tr key={i.id}><td>{i.name}</td><td>{i.count}</td><td>{i.lastDate ? fmtDate(i.lastDate) : "—"}</td><td>{i.resolved ? "Resolved" : "Active"}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {incidents.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, marginBottom: 8, borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Incident Log</h2>
          <table>
            <thead><tr><th>Date</th><th>Item</th><th>Qty</th><th>Shelf</th><th>Found At</th><th>Notes</th><th>Logged By</th></tr></thead>
            <tbody>
              {incidents.map(inc => (
                <tr key={inc.id}>
                  <td>{inc.incidentDate}</td>
                  <td>{itemMap[inc.itemId] ?? ""}</td>
                  <td>{inc.quantity}</td>
                  <td>{inc.shelfAisle ? (inc.shelfBay ? `${inc.shelfAisle}·${inc.shelfBay}` : inc.shelfAisle) : ""}</td>
                  <td>{inc.foundAtId ? (locMap[inc.foundAtId] ?? "") : ""}</td>
                  <td>{inc.notes ?? ""}</td>
                  <td>{inc.loggedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function TheftItemsTab({ itemStats, locations, locReportCounts, onToggleResolved, onAddItem, onAddLocation, onDeleteLocation }) {
  const [newItemName, setNewItemName] = useState("");
  const [addingItem, setAddingItem]   = useState(false);
  const [newLocName, setNewLocName]   = useState("");
  const [addingLoc, setAddingLoc]     = useState(false);

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    await onAddItem(newItemName.trim());
    setNewItemName(""); setAddingItem(false);
  };

  const handleAddLoc = async () => {
    if (!newLocName.trim()) return;
    await onAddLocation(newLocName.trim());
    setNewLocName(""); setAddingLoc(false);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontFamily: "var(--fd)", fontSize: 13, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 2 }}>Tracked Items</h3>
        <button onClick={() => setAddingItem(true)} style={{ ...BP, padding: "5px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}><Icon d={IC.plus} size={13} /> Add Item</button>
      </div>

      {addingItem && (
        <div style={{ background: "var(--ib)", border: "1px solid var(--a)", borderRadius: 10, padding: "12px 14px", marginBottom: 10, display: "flex", gap: 8 }}>
          <input style={{ ...IS, flex: 1 }} placeholder="Item name e.g. Gillette Fusion Blades" autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddItem()} />
          <button onClick={handleAddItem} disabled={!newItemName.trim()} style={{ ...BP, padding: "5px 14px", fontSize: 12 }}>Add</button>
          <button onClick={() => { setAddingItem(false); setNewItemName(""); }} style={{ ...BS, padding: "5px 10px", fontSize: 12 }}>✕</button>
        </div>
      )}

      {itemStats.length === 0 && !addingItem && (
        <div style={{ color: "var(--tm)", fontSize: 13, padding: "16px 0" }}>No items tracked yet — add your first one above.</div>
      )}

      {itemStats.map(item => (
        <div key={item.id} style={{ background: "var(--c)", border: `1px solid ${item.resolved ? "#1a5c30" : "var(--b)"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: item.resolved ? 0.8 : 1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: item.resolved ? "#4ade80" : "var(--t1)", marginBottom: 2 }}>{item.name}{item.resolved ? " ✓" : ""}</div>
            <div style={{ fontSize: 11, color: "var(--tm)" }}>
              {item.count} incident{item.count !== 1 ? "s" : ""} total
              {item.lastDate && ` · Last: ${fmtDate(item.lastDate)}`}
              {item.topAisle && ` · Aisle ${item.topAisle}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <span style={{ background: item.resolved ? "#0f2e1a" : "#0f1e35", color: item.resolved ? "#4ade80" : "#60a5fa", border: `1px solid ${item.resolved ? "#1a5c30" : "#1a3a6a"}`, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: "uppercase", fontFamily: "var(--fm)", whiteSpace: "nowrap" }}>
              {item.resolved ? "Resolved" : "Active"}
            </span>
            <button onClick={() => onToggleResolved(item.id, !item.resolved)} style={{ ...BS, padding: "4px 10px", fontSize: 11 }}>
              {item.resolved ? "Reopen" : "Mark Resolved"}
            </button>
          </div>
        </div>
      ))}

      <div style={{ borderTop: "1px solid var(--b)", margin: "24px 0 18px" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontFamily: "var(--fd)", fontSize: 13, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 2 }}>Found At Locations</h3>
        <button onClick={() => setAddingLoc(true)} style={{ ...BP, padding: "5px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}><Icon d={IC.plus} size={13} /> Add Location</button>
      </div>

      {addingLoc && (
        <div style={{ background: "var(--ib)", border: "1px solid var(--a)", borderRadius: 10, padding: "12px 14px", marginBottom: 12, display: "flex", gap: 8 }}>
          <input style={{ ...IS, flex: 1 }} placeholder="Location name e.g. Near Register" autoFocus value={newLocName} onChange={e => setNewLocName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddLoc()} />
          <button onClick={handleAddLoc} disabled={!newLocName.trim()} style={{ ...BP, padding: "5px 14px", fontSize: 12 }}>Add</button>
          <button onClick={() => { setAddingLoc(false); setNewLocName(""); }} style={{ ...BS, padding: "5px 10px", fontSize: 12 }}>✕</button>
        </div>
      )}

      {locations.length === 0 && !addingLoc && (
        <div style={{ color: "var(--tm)", fontSize: 13, padding: "8px 0" }}>No locations yet — add your first one above.</div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {locations.map(loc => (
          <div key={loc.id} style={{ background: "var(--c)", border: "1px solid var(--b)", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--t2)" }}>
            {loc.name}
            <span style={{ fontSize: 10, color: "var(--tm)" }}>{locReportCounts[loc.id] || 0} reports</span>
            <button onClick={() => {
              if (locReportCounts[loc.id]) { alert(`Cannot delete "${loc.name}" — it has ${locReportCounts[loc.id]} report(s) linked to it.`); return; }
              onDeleteLocation(loc.id);
            }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tm)", padding: "0 2px", fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TheftChartsTab({ incidents, metric, setMetric, monthTab, setMonthTab }) {
  const weeklyData    = getWeeklyData(incidents, metric);
  const monthlyTotals = getMonthlyWeeklyTotals(incidents, metric);
  const monthlyBreakdown = getMonthlyDayBreakdown(incidents, metric);

  const now = new Date();
  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const weekStart = (() => { const d = new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay()); return d; })();
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
  const fmtShort  = d => d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });

  const todayTotal = weeklyData[now.getDay()];
  const maxDay     = weeklyData.indexOf(Math.max(...weeklyData));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 16, gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 1 }}>Show:</span>
        <div style={{ display: "flex", border: "1px solid var(--b)", borderRadius: 7, overflow: "hidden", fontSize: 12, fontWeight: 700 }}>
          {[["incidents","Incidents"],["quantity","Quantity"]].map(([val, label]) => (
            <button key={val} onClick={() => setMetric(val)} style={{ padding: "5px 14px", background: metric === val ? "var(--a)" : "transparent", color: metric === val ? "#000" : "var(--tm)", border: "none", cursor: "pointer", fontFamily: "var(--fb)", fontWeight: 700, fontSize: 12, transition: "background .15s" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, color: "var(--t1)" }}>This Week</div>
          <div style={{ fontSize: 11, color: "var(--tm)" }}>{fmtShort(weekStart)} – {fmtShort(weekEnd)}</div>
        </div>
        <WeeklyBarChart data={weeklyData} />
        {todayTotal > 0 && (
          <div style={{ fontSize: 11, color: "var(--tm)", marginTop: 6, textAlign: "center" }}>
            Today is {DAY_NAMES[now.getDay()]} — {todayTotal} {metric === "quantity" ? "units" : "incident"}{todayTotal !== 1 ? "s" : ""} so far
            {weeklyData[maxDay] === todayTotal && todayTotal > 0 ? " — highest day this week" : ""}
          </div>
        )}
        {weeklyData.every(v => v === 0) && <div style={{ fontSize: 12, color: "var(--tm)", textAlign: "center", marginTop: 6 }}>No incidents this week yet.</div>}
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, color: "var(--t1)" }}>{now.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["totals","Weekly Totals"],["breakdown","Day Breakdown"]].map(([val, label]) => (
              <button key={val} onClick={() => setMonthTab(val)} style={{ padding: "4px 10px", background: monthTab === val ? "var(--a)" : "transparent", color: monthTab === val ? "#000" : "var(--tm)", border: `1px solid ${monthTab === val ? "var(--a)" : "var(--b)"}`, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--fb)" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {monthTab === "totals" && <MonthlyTotalsChart weeks={monthlyTotals} />}
        {monthTab === "breakdown" && <MonthlyBreakdownChart data={monthlyBreakdown} />}
        {monthlyTotals.every(w => w.total === 0) && <div style={{ fontSize: 12, color: "var(--tm)", textAlign: "center", marginTop: 6 }}>No incidents this month yet.</div>}
        {monthTab === "breakdown" && (
          <div style={{ fontSize: 10, color: "var(--tm)", marginTop: 8 }}>Each bar cluster is a day of the week — bars represent Week 1 (lightest) through Week {monthlyTotals.length} (darkest).</div>
        )}
      </Card>
    </div>
  );
}

function TheftIncidentForm({ items, locations, numAisles, numBays, depts, session, onSave, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [search, setSearch]         = useState("");
  const [selectedItem, setSelected] = useState(null);
  const [showDrop, setShowDrop]     = useState(false);
  const [qty, setQty]               = useState("1");
  const [date, setDate]             = useState(today);
  const [aisle, setAisle]           = useState("");
  const [bay, setBay]               = useState("");
  const [foundAtId, setFoundAtId]   = useState("");
  const [notes, setNotes]           = useState("");
  const [saving, setSaving]         = useState(false);
  const inputRef = useRef();

  const aisleOpts = buildAisleOptions(numAisles, depts);
  const bayOpts   = buildBayOptions(numBays);

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const showAddNew    = search.trim() && !items.find(i => i.name.toLowerCase() === search.trim().toLowerCase());

  const selectItem = (item) => { setSelected(item); setSearch(item.name); setShowDrop(false); };

  const handleSave = async () => {
    if (!selectedItem || !qty) return;
    setSaving(true);
    await onSave({
      selectedItem, qty: parseInt(qty) || 1, date, aisle, bay, foundAtId: foundAtId || null, notes, loggedBy: session.displayName,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Modal title="Log Theft Incident" onClose={onClose}>
      <Field label="Item">
        <div style={{ position: "relative" }}>
          <input ref={inputRef} style={IS} placeholder="Search or add item..." value={search}
            onChange={e => { setSearch(e.target.value); setSelected(null); setShowDrop(true); }}
            onFocus={() => setShowDrop(true)} />
          {showDrop && (search || filteredItems.length > 0) && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--s)", border: "1px solid var(--b)", borderTop: "none", borderRadius: "0 0 8px 8px", zIndex: 10, maxHeight: 200, overflowY: "auto" }}>
              {filteredItems.map(i => (
                <div key={i.id} onClick={() => selectItem(i)} style={{ padding: "8px 12px", cursor: "pointer", color: "var(--t2)", fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--c)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {i.name}
                </div>
              ))}
              {showAddNew && (
                <div onClick={() => selectItem({ id: "new", name: search.trim() })} style={{ padding: "8px 12px", cursor: "pointer", color: "var(--a)", fontSize: 13, borderTop: filteredItems.length ? "1px solid var(--b)" : "none" }}>
                  + Add "{search.trim()}" as new item
                </div>
              )}
              {!filteredItems.length && !showAddNew && (
                <div style={{ padding: "8px 12px", color: "var(--tm)", fontSize: 12 }}>No items found</div>
              )}
            </div>
          )}
        </div>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Quantity"><input style={IS} type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} /></Field>
        <Field label="Date Found"><input style={IS} type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      </div>

      <Field label="Shelf Location (where item came from)" hint="Optional">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <select style={IS} value={aisle} onChange={e => { setAisle(e.target.value); setBay(""); }}>
            <option value="">Aisle / Dept</option>
            {aisleOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select style={IS} value={bay} onChange={e => setBay(e.target.value)} disabled={!aisle}>
            <option value="">Bay</option>
            {bayOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </Field>

      <Field label="Found At" hint="Optional — where theft was detected">
        <select style={IS} value={foundAtId} onChange={e => setFoundAtId(e.target.value)}>
          <option value="">Select location...</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>

      <Field label="Notes"><textarea style={{ ...IS, height: 72, resize: "vertical" }} placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} /></Field>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={handleSave} disabled={!selectedItem || saving} style={{ ...BP, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saving ? <Spin /> : "Log Incident"}
        </button>
        <button onClick={onClose} style={BS}>Cancel</button>
      </div>
    </Modal>
  );
}

function TheftIncidentsList({ incidents, itemMap, locMap, itemResolvedMap, items, locations,
  statusFilter, setStatusFilter, itemFilter, setItemFilter,
  locationFilter, setLocationFilter, onDelete }) {
  const fmtShelf = (aisle, bay) => aisle ? (bay ? `${aisle} · Bay ${bay}` : aisle) : "";
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        {["all","active","resolved"].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)} style={{ ...BS, padding: "5px 14px", fontSize: 12, borderColor: statusFilter === f ? "var(--a)" : "var(--b)", color: statusFilter === f ? "var(--a)" : "var(--tm)" }}>
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <select value={itemFilter} onChange={e => setItemFilter(e.target.value)} style={{ ...IS, width: "auto", padding: "5px 10px", fontSize: 12, marginLeft: 8 }}>
          <option value="">All items</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={{ ...IS, width: "auto", padding: "5px 10px", fontSize: 12 }}>
          <option value="">All locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10, gap: 8 }}>
        <button onClick={() => {
          const itemMap2 = Object.fromEntries(items.map(i => [i.id, i.name]));
          const locMap2  = Object.fromEntries(locations.map(l => [l.id, l.name]));
          const csv = generateTheftCSV(incidents, itemMap2, locMap2);
          downloadTheftCSV(csv, `shelfalert-theft-${new Date().toISOString().slice(0, 10)}.csv`);
        }} style={{ ...BS, padding: "5px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon d={IC.dl} size={13} /> Export CSV
        </button>
        <button onClick={() => {
          const prev = document.title;
          document.title = `ShelfAlert Theft Report — ${new Date().toLocaleDateString("en-AU")}`;
          window.print();
          document.title = prev;
        }} style={{ ...BS, padding: "5px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon d={IC.report} size={13} /> Export PDF
        </button>
      </div>

      {incidents.length === 0 && (
        <div style={{ color: "var(--tm)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>No incidents match the current filters.</div>
      )}

      {incidents.map(inc => {
        const resolved = itemResolvedMap[inc.itemId];
        return (
          <Card key={inc.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--t1)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {itemMap[inc.itemId] || "Unknown item"}
                </div>
                <div style={{ fontSize: 12, color: "var(--tm)" }}>
                  Qty: {inc.quantity}
                  {fmtShelf(inc.shelfAisle, inc.shelfBay) && ` · ${fmtShelf(inc.shelfAisle, inc.shelfBay)}`}
                  {inc.foundAtId && locMap[inc.foundAtId] && ` → ${locMap[inc.foundAtId]}`}
                  {inc.incidentDate && ` · ${fmtDate(inc.incidentDate)}`}
                </div>
                {inc.notes && <div style={{ fontSize: 11, color: "var(--t2)", background: "var(--ib)", borderRadius: 6, padding: "4px 8px", marginTop: 4 }}>"{inc.notes}"</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ background: resolved ? "#0f2e1a" : "#0f1e35", color: resolved ? "#4ade80" : "#60a5fa", border: `1px solid ${resolved ? "#1a5c30" : "#1a3a6a"}`, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", fontFamily: "var(--fm)", whiteSpace: "nowrap" }}>
                  {resolved ? "Resolved ✓" : "Active"}
                </span>
                <button onClick={() => onDelete(inc.id)} style={{ ...BD, padding: "4px 10px", fontSize: 11 }}>
                  <Icon d={IC.trash} size={13} />
                </button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function HighTheftView({ incidents, items, locations, numAisles, numBays, depts, session,
  onShowForm, onAddIncident, onAddItem, onToggleResolved, onDeleteIncident, onAddLocation, onDeleteLocation }) {
  const [tab, setTab] = useState("incidents");
  const [metric, setMetric] = useState("incidents");
  const [monthTab, setMonthTab] = useState("totals");
  const [statusFilter, setStatusFilter] = useState("all");
  const [itemFilter, setItemFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const now = new Date();
  const weekStart = (() => { const d = new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay()); return d; })();
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
  const thisWeekCount = incidents.filter(inc => { const d = new Date(inc.incidentDate); return d >= weekStart && d < weekEnd; }).length;

  const activeItemIds = new Set(items.filter(i => !i.resolved).map(i => i.id));
  const itemCounts = {};
  incidents.forEach(inc => { if (activeItemIds.has(inc.itemId)) itemCounts[inc.itemId] = (itemCounts[inc.itemId] || 0) + 1; });
  const topItemId = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topItem = items.find(i => i.id === topItemId);
  const resolvedCount = items.filter(i => i.resolved).length;

  const itemMap = Object.fromEntries(items.map(i => [i.id, i.name]));
  const locMap  = Object.fromEntries(locations.map(l => [l.id, l.name]));
  const itemResolvedMap = Object.fromEntries(items.map(i => [i.id, i.resolved]));
  const locReportCounts = {};
  incidents.forEach(inc => { if (inc.foundAtId) locReportCounts[inc.foundAtId] = (locReportCounts[inc.foundAtId] || 0) + 1; });

  const filtered = incidents.filter(inc => {
    if (statusFilter === "active"   && itemResolvedMap[inc.itemId])  return false;
    if (statusFilter === "resolved" && !itemResolvedMap[inc.itemId]) return false;
    if (itemFilter     && inc.itemId    !== itemFilter)     return false;
    if (locationFilter && inc.foundAtId !== locationFilter) return false;
    return true;
  });

  const itemStats = items.map(item => {
    const incs = incidents.filter(inc => inc.itemId === item.id);
    const aisles = {};
    incs.forEach(inc => { if (inc.shelfAisle) aisles[inc.shelfAisle] = (aisles[inc.shelfAisle] || 0) + 1; });
    const topAisle = Object.entries(aisles).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { ...item, count: incs.length, lastDate: incs[0]?.incidentDate, topAisle };
  }).sort((a, b) => b.count - a.count);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "var(--tm)" }}>Track, analyse, and resolve theft patterns</div>
        <button onClick={onShowForm} style={{ ...BP, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon d={IC.plus} size={14} /> Log Incident
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        <Card><div style={{ fontSize: 10, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>This Week</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--t1)", lineHeight: 1 }}>{thisWeekCount}</div><div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>incidents</div></Card>
        <Card><div style={{ fontSize: 10, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Top Item</div><div style={{ fontSize: 14, fontWeight: 700, color: "#f97316", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topItem?.name || "—"}</div><div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>{topItemId ? `${itemCounts[topItemId]} incidents` : "no data"}</div></Card>
        <Card><div style={{ fontSize: 10, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Resolved</div><div style={{ fontSize: 28, fontWeight: 700, color: "#4ade80", lineHeight: 1 }}>{resolvedCount}</div><div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>items solved</div></Card>
      </div>

      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid var(--b)" }}>
        {[["incidents","Incidents"],["charts","Charts"],["items","Items & Locations"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ background: "none", border: "none", borderBottom: tab === id ? "2px solid var(--a)" : "2px solid transparent", color: tab === id ? "var(--a)" : "var(--tm)", padding: "8px 16px", cursor: "pointer", fontSize: 13, fontFamily: "var(--fb)", fontWeight: tab === id ? 700 : 400, marginBottom: -1, transition: "color .15s" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "incidents" && <TheftIncidentsList incidents={filtered} itemMap={itemMap} locMap={locMap} itemResolvedMap={itemResolvedMap} items={items} locations={locations} statusFilter={statusFilter} setStatusFilter={setStatusFilter} itemFilter={itemFilter} setItemFilter={setItemFilter} locationFilter={locationFilter} setLocationFilter={setLocationFilter} onDelete={onDeleteIncident} />}
      {tab === "charts"    && <TheftChartsTab incidents={incidents} metric={metric} setMetric={setMetric} monthTab={monthTab} setMonthTab={setMonthTab} />}
      {tab === "items"     && <TheftItemsTab itemStats={itemStats} locations={locations} locReportCounts={locReportCounts} onToggleResolved={onToggleResolved} onAddItem={onAddItem} onAddLocation={onAddLocation} onDeleteLocation={onDeleteLocation} />}
      <TheftPrintReport incidents={filtered} items={items} locations={locations} />
    </div>
  );
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: IC.home },
  { id: "gaps",      label: "Gaps",      icon: IC.gap },
  { id: "code",      label: "Near Code", icon: IC.code },
  { id: "suppliers", label: "Suppliers", icon: IC.sup },
  { id: "reports",   label: "Reports",   icon: IC.report },
  { id: "theft",     label: "High Theft Items", icon: IC.shield },
  { id: "settings",  label: "Settings",  icon: IC.cog },
];

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function ShelfAlert() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState("dashboard");
  const [suppliers, setSuppliers] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [codeItems, setCodeItems] = useState([]);
  const [credits, setCredits] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [settings, setSettings] = useState({ id: null, storeName: "", storeEmail: "", timezone: "Australia/Perth", notifTime: "06:00", numAisles: 12, numBays: 20 });
  const [depts, setDepts] = useState([]);
  const [theftItems, setTheftItems] = useState([]);
  const [theftIncidents, setTheftIncidents] = useState([]);
  const [theftLocations, setTheftLocations] = useState([]);
  const [showTheftForm, setShowTheftForm] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGapForm, setShowGapForm] = useState(false);
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [showSupForm, setShowSupForm] = useState(false);
  const [editSup, setEditSup] = useState(null);
  const [resolveTarget, setResolveTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const toast$ = (msg, type = "success") => setToast({ msg, type });

  const loadAll = useCallback(async () => {
    setDataLoading(true);
    const q = async (table, builder) => {
      try {
        const { data, error } = await builder;
        if (error) { console.error(`${table}:`, error); return []; }
        return data || [];
      } catch (e) { console.error(`${table} fetch error:`, e); return []; }
    };
    try {
      const [rawGaps, rawSups, rawNotifs, rawSettings, rawCode, rawCredits, rawDepts, rawTheftItems, rawTheftIncidents, rawTheftLocations] = await Promise.all([
        q("gaps",             supabase.from("gaps").select("*").order("logged_at", { ascending: false })),
        q("suppliers",        supabase.from("suppliers").select("*").order("name")),
        q("notifications",    supabase.from("notifications").select("*").eq("read", false).order("created_at", { ascending: false }).limit(15)),
        q("store_settings",   supabase.from("store_settings").select("*").limit(1)),
        q("close_to_code",    supabase.from("close_to_code").select("*").order("use_by_date")),
        q("supplier_credits", supabase.from("supplier_credits").select("*").order("date_raised", { ascending: false })),
        q("departments",      supabase.from("departments").select("*").order("code")),
        q("theft_items",      supabase.from("theft_items").select("*").order("created_at")),
        q("theft_incidents",  supabase.from("theft_incidents").select("*").order("incident_date", { ascending: false })),
        q("theft_locations",  supabase.from("theft_locations").select("*").order("created_at")),
      ]);
      setGaps(rawGaps.map(mapGap));
      setSuppliers(rawSups.map(mapSupplier));
      setNotifs(rawNotifs);
      setCodeItems(rawCode.map(mapCode));
      setCredits(rawCredits.map(mapCredit));
      setDepts(rawDepts.map(mapDept));
      setTheftItems(rawTheftItems.map(mapTheftItem));
      setTheftIncidents(rawTheftIncidents.map(mapTheftIncident));
      setTheftLocations(rawTheftLocations.map(mapTheftLocation));
      const rs = rawSettings[0];
      if (rs && !rs.error) setSettings(mapSettings(rs));
    } catch (e) { console.error("loadAll error:", e); toast$("Failed to load data", "error"); }
    setDataLoading(false);
  }, []);

  // Official Supabase auth listener — handles token refresh automatically
  useEffect(() => {
    // Get current session on mount and auto-load data
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) {
        const saved = loadSession();
        const sess = { token: s.access_token, email: s.user.email, displayName: saved?.displayName || s.user.email.split("@")[0] };
        setSession(sess);
        loadAll(); // Auto-load on open
      }
      setAuthReady(true);
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) {
        const saved = loadSession();
        setSession(prev => ({ token: s.access_token, email: s.user.email, displayName: prev?.displayName || saved?.displayName || s.user.email.split("@")[0] }));
      } else {
        setSession(null);
        clearSession();
      }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh when app comes back into focus or tab becomes visible
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) loadAll(); };
    const onFocus = () => loadAll();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (s) => { saveSession(s); };  // auth listener sets session automatically
  const handleSignOut = async () => { await sb.signOut(); clearSession(); };

  const handleAddGap = async (form) => {
    const body = { supplier_id: form.supplierId, description: form.description.trim(), aisle: form.aisle || null, bay: form.bay || null, priority: form.priority, status: "open", notes: form.notes || "", image_url: form.imageUrl || null, logged_by: session.displayName, logged_at: new Date().toISOString() };
    const res = await sb.insert("gaps", session.token, body);
    if (res && Array.isArray(res) && res[0]) { setGaps(g => [mapGap(res[0]), ...g]); toast$("✓ Gap logged"); }
    else if (res && res.id) { setGaps(g => [mapGap(res), ...g]); toast$("✓ Gap logged"); }
    else { toast$("Failed to save gap — check console", "error"); }
    setShowGapForm(false);
  };

  const handleResolve = (gapId, status) => { if (status === "unavailable") { setResolveTarget({ gapId, status }); return; } handleResolveConfirm(gapId, status, null); };
  const handleResolveConfirm = async (gapId, status, date) => {
    const res = await sb.update("gaps", session.token, { id: gapId }, { status, resolved_at: status === "ordered" ? new Date().toISOString() : null, unavailable_until: date || null });
    const row = Array.isArray(res) ? res[0] : res;
    if (row?.id) { setGaps(g => g.map(gap => gap.id === gapId ? mapGap(row) : gap)); toast$(`✓ ${STATUS_META[status].label}`); }
    setResolveTarget(null);
  };
  const handleDeleteGap = async (id) => { await supabase.from("gaps").delete().eq("id", id); setGaps(g => g.filter(gap => gap.id !== id)); toast$("Gap removed"); };

  const handleAddCode = async (form) => {
    const body = { description: form.description.trim(), use_by_date: form.useByDate, quantity: form.quantity || null, aisle: form.aisle || null, bay: form.bay || null, supplier_id: form.supplierId || null, notes: form.notes || "", status: "active", logged_by: session.displayName, logged_at: new Date().toISOString() };
    const res = await sb.insert("close_to_code", session.token, body);
    const row = Array.isArray(res) ? res[0] : res;
    if (row?.id) { setCodeItems(c => [...c, mapCode(row)].sort((a,b) => new Date(a.useByDate) - new Date(b.useByDate))); toast$("✓ Item added"); }
    else toast$("Failed to save", "error");
    setShowCodeForm(false);
  };
  const handleUpdateCodeStatus = async (id, status) => {
    const res = await sb.update("close_to_code", session.token, { id }, { status });
    const row = Array.isArray(res) ? res[0] : res;
    if (row?.id) { setCodeItems(c => c.map(i => i.id === id ? mapCode(row) : i)); toast$(`✓ ${CODE_STATUS_META[status].label}`); }
  };
  const handleDeleteCode = async (id) => { await sb.remove("close_to_code", session.token, { id }); setCodeItems(c => c.filter(i => i.id !== id)); toast$("Item removed"); };

  const handleAddCredit = async (form) => {
    const body = { supplier_id: form.supplierId, type: form.type, description: form.description.trim(), quantity: form.quantity || null, value: form.value ? parseFloat(form.value) : null, date_raised: form.dateRaised, ref_number: form.refNumber || null, notes: form.notes || "", status: "pending", logged_by: session.displayName };
    const res = await sb.insert("supplier_credits", session.token, body);
    const row = Array.isArray(res) ? res[0] : res;
    if (row?.id) { setCredits(c => [mapCredit(row), ...c]); toast$("✓ Credit logged"); }
    else toast$("Failed to save", "error");
  };
  const handleUpdateCreditStatus = async (id, status) => {
    const res = await sb.update("supplier_credits", session.token, { id }, { status, resolved_at: status === "resolved" ? new Date().toISOString() : null });
    const row = Array.isArray(res) ? res[0] : res;
    if (row?.id) { setCredits(c => c.map(cr => cr.id === id ? mapCredit(row) : cr)); toast$(`✓ ${CREDIT_STATUS_META[status].label}`); }
  };
  const handleDeleteCredit = async (id) => { await supabase.from("supplier_credits").delete().eq("id", id); setCredits(c => c.filter(cr => cr.id !== id)); toast$("Credit removed"); };

  const handleSaveSup = async (form) => {
    const body = { name: form.name.trim(), contact: form.contact || "", phone: form.phone || "", visit_day: form.visitDay, frequency: form.frequency };
    if (editSup) {
      const res = await sb.update("suppliers", session.token, { id: editSup.id }, body);
      const row = Array.isArray(res) ? res[0] : res;
      if (row?.id) { setSuppliers(s => s.map(sup => sup.id === editSup.id ? mapSupplier(row) : sup)); toast$("✓ Supplier updated"); }
      else toast$("Failed to update", "error");
    } else {
      const res = await sb.insert("suppliers", session.token, body);
      const row = Array.isArray(res) ? res[0] : res;
      if (row?.id) { setSuppliers(s => [...s, mapSupplier(row)].sort((a,b) => a.name.localeCompare(b.name))); toast$("✓ Supplier added"); }
      else toast$("Failed to save — check Supabase connection", "error");
    }
    setEditSup(null); setShowSupForm(false);
  };
  const handleDeleteSup = async (id) => { await supabase.from("suppliers").delete().eq("id", id); setSuppliers(s => s.filter(sup => sup.id !== id)); toast$("Supplier removed"); };

  const handleSaveSettings = async (form) => {
    setSaving(true);
    const body = { store_name: form.storeName, store_email: form.storeEmail, timezone: form.timezone, notif_time: form.notifTime, num_aisles: form.numAisles, num_bays: form.numBays };
    if (form.id) {
      await supabase.from("store_settings").update(body).eq("id", form.id);
    } else {
      const { data } = await supabase.from("store_settings").insert(body).select().single();
      if (data?.id) form = { ...form, id: data.id };
    }
    setSettings(form); toast$("✓ Settings saved"); setSaving(false);
  };

  const handleAddDept = async (dept) => {
    const { data, error } = await supabase.from("departments")
      .insert({ code: dept.code.toUpperCase().trim(), label: dept.label.trim() })
      .select().single();
    if (error) { console.error("Dept insert error:", error); toast$("Failed to add department", "error"); return; }
    if (data) { setDepts(d => [...d, mapDept(data)].sort((a,b) => a.code.localeCompare(b.code))); toast$("✓ Department added"); }
  };
  const handleUpdateDept = async (id, dept) => {
    const { data, error } = await supabase.from("departments")
      .update({ code: dept.code.toUpperCase().trim(), label: dept.label.trim() })
      .eq("id", id).select().single();
    if (error) { console.error("Dept update error:", error); toast$("Failed to update", "error"); return; }
    if (data) { setDepts(d => d.map(dp => dp.id === id ? mapDept(data) : dp)); toast$("✓ Department updated"); }
  };
  const handleDeleteDept = async (id) => {
    await supabase.from("departments").delete().eq("id", id);
    setDepts(d => d.filter(dp => dp.id !== id));
    toast$("Department removed");
  };

  const handleAddTheftIncident = async ({ selectedItem, qty, date, aisle, bay, foundAtId, notes, loggedBy }) => {
    let itemId = selectedItem.id;
    if (itemId === "new") {
      const res = await supabase.from("theft_items").insert({ name: selectedItem.name }).select().single();
      if (res.error || !res.data) { toast$("Failed to create item", "error"); return; }
      setTheftItems(prev => [...prev, mapTheftItem(res.data)]);
      itemId = res.data.id;
    }
    const body = { item_id: itemId, quantity: qty, shelf_aisle: aisle || null, shelf_bay: bay || null, found_at_id: foundAtId || null, incident_date: date, notes: notes || null, logged_by: loggedBy };
    const res = await supabase.from("theft_incidents").insert(body).select().single();
    if (res.error || !res.data) { toast$("Failed to log incident", "error"); return; }
    setTheftIncidents(prev => [mapTheftIncident(res.data), ...prev]);
    toast$("✓ Incident logged");
  };

  const handleToggleTheftItemResolved = async (id, resolved) => {
    const body = { resolved, resolved_at: resolved ? new Date().toISOString() : null };
    const res = await supabase.from("theft_items").update(body).eq("id", id).select().single();
    if (res.error || !res.data) { toast$("Failed to update", "error"); return; }
    setTheftItems(prev => prev.map(i => i.id === id ? mapTheftItem(res.data) : i));
    toast$(resolved ? "✓ Marked resolved" : "✓ Reopened");
  };

  const handleAddTheftItem = async (name) => {
    const res = await supabase.from("theft_items").insert({ name }).select().single();
    if (res.error || !res.data) { toast$("Failed to add item", "error"); return; }
    setTheftItems(prev => [...prev, mapTheftItem(res.data)]);
    toast$("✓ Item added");
  };

  const handleDeleteTheftIncident = async (id) => {
    const { error } = await supabase.from("theft_incidents").delete().eq("id", id);
    if (error) { toast$("Failed to delete", "error"); return; }
    setTheftIncidents(prev => prev.filter(i => i.id !== id));
    toast$("Incident removed");
  };

  const handleAddTheftLocation = async (name) => {
    const res = await supabase.from("theft_locations").insert({ name }).select().single();
    if (res.error || !res.data) { toast$("Failed to add location", "error"); return; }
    setTheftLocations(prev => [...prev, mapTheftLocation(res.data)]);
    toast$("✓ Location added");
  };

  const handleDeleteTheftLocation = async (id) => {
    const { error } = await supabase.from("theft_locations").delete().eq("id", id);
    if (error) { toast$("Failed to delete", "error"); return; }
    setTheftLocations(prev => prev.filter(l => l.id !== id));
    toast$("Location removed");
  };

  const handleDismissNotif = async (id) => {
    await sb.update("notifications", session.token, { id }, { read: true });
    setNotifs(n => n.filter(notif => notif.id !== id));
  };

  if (!authReady) return (<><style>{CSS}</style><div style={{ minHeight: "100vh", background: "#0a0c0f", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 24, height: 24, border: "2px solid #1e2430", borderTopColor: "#00e5b0", borderRadius: "50%", animation: "spin .7s linear infinite" }} /></div></>);
  if (!session) return (<><style>{CSS}</style><LoginScreen onLogin={handleLogin} /></>);

  const urgentCodeCount = codeItems.filter(c => c.status === "active" && getCodeAlert(c.useByDate)).length;
  const openGapCount = gaps.filter(g => g.status !== "ordered").length;
  const unread = notifs.filter(n => !n.read).length;
  const totalAlerts = unread + urgentCodeCount;

  return (
    <>
      <style>{CSS}</style>
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", fontFamily: "var(--fb)" }}>
        <aside style={{ width: 220, background: "var(--s)", borderRight: "1px solid var(--b)", display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 100, overflowY: "auto" }}>
          <div style={{ padding: "24px 20px 16px" }}>
            <div style={{ fontFamily: "var(--fd)", fontSize: 22, fontWeight: 900, color: "var(--a)", letterSpacing: -0.5, marginBottom: 2 }}>ShelfAlert</div>
            <div style={{ fontSize: 11, color: "var(--tm)", letterSpacing: 1, fontFamily: "var(--fm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(settings.storeName || "YOUR STORE").toUpperCase()}</div>
          </div>
          <nav style={{ flex: 1, padding: "8px 12px" }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setView(n.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", background: view === n.id ? "var(--ad)" : "transparent", color: view === n.id ? "var(--a)" : "var(--tm)", cursor: "pointer", fontSize: 14, fontFamily: "var(--fb)", fontWeight: view === n.id ? 700 : 400, marginBottom: 2, transition: "background .15s, color .15s", textAlign: "left" }}>
                <Icon d={n.icon} size={16} color={view === n.id ? "var(--a)" : "var(--tm)"} />
                {n.label}
                {n.id === "dashboard" && totalAlerts > 0 && <span style={{ marginLeft: "auto", background: "#ef4444", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>{totalAlerts}</span>}
                {n.id === "gaps" && openGapCount > 0 && <span style={{ marginLeft: "auto", background: "#3b82f6", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>{openGapCount}</span>}
                {n.id === "code" && urgentCodeCount > 0 && <span style={{ marginLeft: "auto", background: "#f97316", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>{urgentCodeCount}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--b)" }}>
            <div style={{ fontSize: 11, color: "var(--tm)", marginBottom: 2 }}>Signed in as</div>
            <div style={{ fontSize: 13, color: "var(--t2)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.displayName}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button onClick={() => loadAll()} style={{ ...BS, padding: "5px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }} title="Refresh"><Icon d={IC.ref} size={12} /></button>
              <button onClick={handleSignOut} style={{ ...BS, padding: "5px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}><Icon d={IC.out} size={12} /> Sign out</button>
            </div>
          </div>
        </aside>

        <main style={{ marginLeft: 220, flex: 1, padding: "28px 28px 80px", maxWidth: "calc(100vw - 220px)" }}>
          <div style={{ maxWidth: 920, margin: "0 auto" }}>
            <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h1 style={{ fontFamily: "var(--fd)", fontSize: 26, fontWeight: 900, color: "var(--t1)", letterSpacing: -0.5, margin: 0 }}>{NAV.find(n => n.id === view)?.label}</h1>
                <div style={{ fontSize: 12, color: "var(--tm)", marginTop: 3, fontFamily: "var(--fm)" }}>{new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {settings.timezone}</div>
              </div>
              {dataLoading && <Spin />}
            </div>
            {view === "dashboard" && <Dashboard gaps={gaps} suppliers={suppliers} codeItems={codeItems} credits={credits} notifs={notifs} onResolve={handleResolve} onDismissNotif={handleDismissNotif} />}
            {view === "gaps"      && <GapsView gaps={gaps} suppliers={suppliers} onAdd={() => setShowGapForm(true)} onResolve={handleResolve} onDelete={handleDeleteGap} />}
            {view === "code"      && <CloseToCodeView items={codeItems} suppliers={suppliers} onAdd={() => setShowCodeForm(true)} onUpdateStatus={handleUpdateCodeStatus} onDelete={handleDeleteCode} />}
            {view === "suppliers" && <SuppliersView suppliers={suppliers} gaps={gaps} credits={credits} onAdd={() => { setEditSup(null); setShowSupForm(true); }} onEdit={s => { setEditSup(s); setShowSupForm(true); }} onDelete={handleDeleteSup} onAddCredit={handleAddCredit} onUpdateCreditStatus={handleUpdateCreditStatus} onDeleteCredit={handleDeleteCredit} />}
            {view === "reports"   && <ReportsView gaps={gaps} suppliers={suppliers} credits={credits} />}
            {view === "settings"  && <SettingsView settings={settings} depts={depts} onSave={handleSaveSettings} saving={saving} onAddDept={handleAddDept} onUpdateDept={handleUpdateDept} onDeleteDept={handleDeleteDept} />}
            {view === "theft"     && <HighTheftView incidents={theftIncidents} items={theftItems} locations={theftLocations} numAisles={settings.numAisles} numBays={settings.numBays} depts={depts} session={session} onShowForm={() => setShowTheftForm(true)} onAddIncident={handleAddTheftIncident} onAddItem={handleAddTheftItem} onToggleResolved={handleToggleTheftItemResolved} onDeleteIncident={handleDeleteTheftIncident} onAddLocation={handleAddTheftLocation} onDeleteLocation={handleDeleteTheftLocation} />}
          </div>
        </main>
      </div>

      <div className="mobile-header">
        <div style={{ fontFamily: "var(--fd)", fontSize: 18, fontWeight: 900, color: "var(--a)" }}>ShelfAlert</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {dataLoading && <Spin />}
          <button onClick={() => loadAll()} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tm)", padding: 4 }}><Icon d={IC.ref} size={18} /></button>
          <button onClick={handleSignOut} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tm)", padding: 4 }}><Icon d={IC.out} size={18} /></button>
        </div>
      </div>

      <nav className="mobile-nav">
        {NAV.map(n => (
          <button key={n.id} onClick={() => setView(n.id)} className={`mobile-nav-btn${view === n.id ? " active" : ""}`}>
            <Icon d={n.icon} size={20} color={view === n.id ? "var(--a)" : "var(--tm)"} />
            <span style={{ fontSize: 9, marginTop: 2, fontFamily: "var(--fm)" }}>{n.label}</span>
            {n.id === "dashboard" && totalAlerts > 0 && <span style={{ position: "absolute", top: 4, right: "50%", transform: "translateX(10px)", background: "#ef4444", color: "#fff", borderRadius: 10, fontSize: 9, fontWeight: 800, padding: "1px 5px", lineHeight: 1.4 }}>{totalAlerts}</span>}
            {n.id === "gaps" && openGapCount > 0 && <span style={{ position: "absolute", top: 4, right: "50%", transform: "translateX(10px)", background: "#3b82f6", color: "#fff", borderRadius: 10, fontSize: 9, fontWeight: 800, padding: "1px 5px", lineHeight: 1.4 }}>{openGapCount}</span>}
            {n.id === "code" && urgentCodeCount > 0 && <span style={{ position: "absolute", top: 4, right: "50%", transform: "translateX(10px)", background: "#f97316", color: "#fff", borderRadius: 10, fontSize: 9, fontWeight: 800, padding: "1px 5px", lineHeight: 1.4 }}>{urgentCodeCount}</span>}
          </button>
        ))}
      </nav>

      {showGapForm  && <GapForm suppliers={suppliers} token={session.token} numAisles={settings.numAisles} numBays={settings.numBays} depts={depts} onSave={handleAddGap} onClose={() => setShowGapForm(false)} />}
      {showCodeForm && <CodeForm suppliers={suppliers} numAisles={settings.numAisles} numBays={settings.numBays} depts={depts} onSave={handleAddCode} onClose={() => setShowCodeForm(false)} />}
      {showSupForm  && <SupplierForm supplier={editSup} onSave={handleSaveSup} onClose={() => { setShowSupForm(false); setEditSup(null); }} />}
      {resolveTarget && <ResolveModal gapId={resolveTarget.gapId} status={resolveTarget.status} onConfirm={handleResolveConfirm} onClose={() => setResolveTarget(null)} />}
      {showTheftForm && <TheftIncidentForm items={theftItems} locations={theftLocations} numAisles={settings.numAisles} numBays={settings.numBays} depts={depts} session={session} onSave={handleAddTheftIncident} onClose={() => setShowTheftForm(false)} />}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </>
  );
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800;900&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300&family=DM+Mono:wght@400;500&display=swap');
  :root{--bg:#0a0c0f;--s:#0f1217;--c:#131720;--b:#1e2430;--ib:#0d1018;--a:#00e5b0;--ad:rgba(0,229,176,0.08);--t1:#e8edf5;--t2:#9ba8bb;--tm:#5a6478;--fd:'Syne',sans-serif;--fb:'DM Sans',sans-serif;--fm:'DM Mono',monospace;}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--bg);color:var(--t1);}
  input,select,textarea{color-scheme:dark;transition:border-color .2s;}
  input:focus,select:focus,textarea:focus{border-color:var(--a)!important;outline:none;}
  ::-webkit-scrollbar{width:6px;height:6px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:var(--b);border-radius:3px;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .mobile-header{display:none;}.mobile-nav{display:none;}
  @media print{
    body > div > aside,
    body > div > main > div > div:first-child,
    .mobile-header,.mobile-nav,
    button,select,input { display: none !important; }
    body > div > main { margin-left: 0 !important; max-width: 100% !important; padding: 0 !important; }
    #theft-print-report { display: block !important; }
    #theft-print-report table { width: 100%; border-collapse: collapse; font-size: 11px; }
    #theft-print-report th { background: #f0f0f0; text-align: left; padding: 6px 8px; border-bottom: 2px solid #ccc; }
    #theft-print-report td { padding: 5px 8px; border-bottom: 1px solid #eee; }
    #theft-print-report .print-stat { display: inline-block; border: 1px solid #ccc; border-radius: 6px; padding: 8px 16px; margin-right: 12px; margin-bottom: 12px; }
  }
  @media(max-width:680px){
    aside{display:none!important;}
    main{margin-left:0!important;max-width:100vw!important;padding:70px 14px 90px!important;}
    .mobile-header{display:flex!important;position:fixed;top:0;left:0;right:0;height:56px;background:var(--s);border-bottom:1px solid var(--b);padding:0 16px;align-items:center;justify-content:space-between;z-index:200;}
    .mobile-nav{display:flex!important;position:fixed;bottom:0;left:0;right:0;background:var(--s);border-top:1px solid var(--b);z-index:200;padding-bottom:env(safe-area-inset-bottom);}
    .mobile-nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;color:var(--tm);font-family:var(--fb);position:relative;padding:8px 0;transition:color .15s;}
    .mobile-nav-btn.active{color:var(--a);}
    .mobile-nav-btn.active::before{content:'';position:absolute;top:0;left:20%;right:20%;height:2px;background:var(--a);border-radius:0 0 2px 2px;}
  }
`;
