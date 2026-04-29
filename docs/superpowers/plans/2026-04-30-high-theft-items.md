# High Theft Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "High Theft Items" section to ShelfAlert for logging theft incidents, tracking patterns via charts, and managing item resolution.

**Architecture:** All UI components are added inline to `src/ShelfAlert.jsx` following the existing monolith pattern. Pure utility functions (chart aggregation, CSV generation) live in `src/theftUtils.js` for testability. Three new Supabase tables store the data. No new npm packages.

**Tech Stack:** React 19, Supabase JS v2, custom SVG charts, `window.print()` for PDF, `Blob` + `URL.createObjectURL` for CSV.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/theftUtils.js` | Create | Pure utility functions: chart data aggregation, CSV generation |
| `src/theftUtils.test.js` | Create | Tests for all utility functions |
| `src/ShelfAlert.jsx` | Modify | Icon, nav, mappers, state, data loading, all UI components, handlers, print CSS |

---

## Task 1: Create Supabase Tables

**Files:**
- No code files — run SQL in the Supabase dashboard SQL editor

- [ ] **Step 1: Run the following SQL in the Supabase dashboard**

Open your Supabase project → SQL Editor → New query → paste and run:

```sql
-- Item catalog
create table theft_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table theft_items enable row level security;
create policy "auth_all" on theft_items for all to authenticated using (true) with check (true);

-- Found-at locations
create table theft_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table theft_locations enable row level security;
create policy "auth_all" on theft_locations for all to authenticated using (true) with check (true);

-- Incident log
create table theft_incidents (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references theft_items(id) on delete cascade,
  quantity integer not null default 1,
  shelf_aisle text,
  shelf_bay text,
  found_at_id uuid references theft_locations(id) on delete set null,
  incident_date date not null default current_date,
  notes text,
  logged_by text not null,
  logged_at timestamptz not null default now()
);
alter table theft_incidents enable row level security;
create policy "auth_all" on theft_incidents for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Verify tables exist**

In the Supabase dashboard Table Editor, confirm `theft_items`, `theft_locations`, and `theft_incidents` all appear.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "feat: create theft_items, theft_incidents, theft_locations tables in Supabase"
```

---

## Task 2: Create Utility Functions + Tests

**Files:**
- Create: `src/theftUtils.js`
- Create: `src/theftUtils.test.js`

- [ ] **Step 1: Create `src/theftUtils.js`**

```js
// Returns the Sunday of the week containing `date`
export const getWeekStart = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

// Returns array of 7 values [Sun..Sat] for the current week.
// metric: "incidents" (count) | "quantity" (sum of quantities)
export const getWeeklyData = (incidents, metric = "incidents") => {
  const weekStart = getWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const days = [0, 0, 0, 0, 0, 0, 0];
  incidents.forEach(inc => {
    const d = new Date(inc.incidentDate);
    if (d >= weekStart && d < weekEnd) {
      const dow = d.getDay();
      days[dow] += metric === "quantity" ? (inc.quantity || 1) : 1;
    }
  });
  return days;
};

// Returns array of { total, isPartial } for each week of the current month.
// isPartial is true for the current (in-progress) week.
export const getMonthlyWeeklyTotals = (incidents, metric = "incidents") => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const currentWeekIdx = Math.floor((now.getDate() - 1) / 7);
  const totals = [0, 0, 0, 0, 0];
  incidents.forEach(inc => {
    const d = new Date(inc.incidentDate);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const weekIdx = Math.floor((d.getDate() - 1) / 7);
      totals[weekIdx] += metric === "quantity" ? (inc.quantity || 1) : 1;
    }
  });
  // Return only weeks that have data or are the current week, up to week 4
  return totals.slice(0, currentWeekIdx + 1).map((total, i) => ({
    total,
    isPartial: i === currentWeekIdx,
  }));
};

// Returns 2D array: data[weekIdx][dow] for each week of the current month.
// weekIdx 0–4, dow 0=Sun..6=Sat
export const getMonthlyDayBreakdown = (incidents, metric = "incidents") => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const data = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0, 0, 0]);
  incidents.forEach(inc => {
    const d = new Date(inc.incidentDate);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const weekIdx = Math.floor((d.getDate() - 1) / 7);
      const dow = d.getDay();
      data[weekIdx][dow] += metric === "quantity" ? (inc.quantity || 1) : 1;
    }
  });
  return data;
};

// Generates a CSV string from incidents.
// itemMap: { [itemId]: itemName }, locMap: { [locId]: locName }
export const generateTheftCSV = (incidents, itemMap, locMap) => {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Date", "Item", "Quantity", "Shelf Aisle", "Shelf Bay", "Found At", "Notes", "Logged By"];
  const rows = incidents.map(inc => [
    inc.incidentDate,
    escape(itemMap[inc.itemId] ?? ""),
    inc.quantity,
    escape(inc.shelfAisle ?? ""),
    escape(inc.shelfBay ?? ""),
    escape(inc.foundAtId ? (locMap[inc.foundAtId] ?? "") : ""),
    escape(inc.notes ?? ""),
    escape(inc.loggedBy ?? ""),
  ]);
  return [header.join(","), ...rows.map(r => r.join(","))].join("\n");
};
```

- [ ] **Step 2: Write the failing tests in `src/theftUtils.test.js`**

```js
import { getWeeklyData, getMonthlyWeeklyTotals, getMonthlyDayBreakdown, generateTheftCSV, getWeekStart } from './theftUtils';

describe('getWeeklyData', () => {
  it('returns zeros when no incidents', () => {
    expect(getWeeklyData([])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('counts incident on correct day of week', () => {
    const weekStart = getWeekStart();
    // Wednesday = weekStart + 3 days
    const wednesday = new Date(weekStart);
    wednesday.setDate(wednesday.getDate() + 3);
    const inc = { incidentDate: wednesday.toISOString().slice(0, 10), quantity: 2 };
    const result = getWeeklyData([inc], 'incidents');
    expect(result[3]).toBe(1); // Wednesday = index 3
    expect(result[0]).toBe(0);
  });

  it('sums quantity when metric is quantity', () => {
    const weekStart = getWeekStart();
    const monday = new Date(weekStart);
    monday.setDate(monday.getDate() + 1);
    const dateStr = monday.toISOString().slice(0, 10);
    const incidents = [
      { incidentDate: dateStr, quantity: 3 },
      { incidentDate: dateStr, quantity: 5 },
    ];
    const result = getWeeklyData(incidents, 'quantity');
    expect(result[1]).toBe(8); // Monday = index 1
  });

  it('ignores incidents outside current week', () => {
    const pastDate = '2020-01-01';
    const inc = { incidentDate: pastDate, quantity: 1 };
    expect(getWeeklyData([inc])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('getMonthlyWeeklyTotals', () => {
  it('returns empty array when no incidents', () => {
    const result = getMonthlyWeeklyTotals([]);
    expect(result.length).toBeGreaterThanOrEqual(1); // at least current week
    expect(result.every(w => w.total === 0)).toBe(true);
  });

  it('marks the current (in-progress) week as partial', () => {
    const result = getMonthlyWeeklyTotals([]);
    const last = result[result.length - 1];
    expect(last.isPartial).toBe(true);
  });
});

describe('getMonthlyDayBreakdown', () => {
  it('returns 5x7 array of zeros when no incidents', () => {
    const result = getMonthlyDayBreakdown([]);
    expect(result).toHaveLength(5);
    expect(result[0]).toHaveLength(7);
    expect(result.flat().every(v => v === 0)).toBe(true);
  });
});

describe('generateTheftCSV', () => {
  it('includes header row', () => {
    const csv = generateTheftCSV([], {}, {});
    expect(csv).toMatch(/Date,Item,Quantity/);
  });

  it('generates correct row for an incident', () => {
    const incidents = [{
      incidentDate: '2026-04-28',
      itemId: 'i1',
      quantity: 2,
      shelfAisle: '4',
      shelfBay: '3',
      foundAtId: 'l1',
      notes: 'Saw it happen',
      loggedBy: 'Alice',
    }];
    const itemMap = { i1: 'Gillette Fusion' };
    const locMap = { l1: 'Near Register' };
    const csv = generateTheftCSV(incidents, itemMap, locMap);
    expect(csv).toContain('2026-04-28');
    expect(csv).toContain('"Gillette Fusion"');
    expect(csv).toContain('"Near Register"');
    expect(csv).toContain('2');
    expect(csv).toContain('"Saw it happen"');
  });

  it('escapes double quotes in fields', () => {
    const incidents = [{
      incidentDate: '2026-04-28',
      itemId: 'i1',
      quantity: 1,
      shelfAisle: null,
      shelfBay: null,
      foundAtId: null,
      notes: 'He said "hello"',
      loggedBy: 'Bob',
    }];
    const csv = generateTheftCSV(incidents, { i1: 'Test' }, {});
    expect(csv).toContain('He said ""hello""');
  });
});
```

- [ ] **Step 3: Run tests — expect failures (functions exist but tests verify specific behaviour)**

```bash
cd "C:/Users/Jeric/Desktop/Genesis Solutions/App Building/ShelfAlert"
npx react-scripts test --watchAll=false --testPathPattern=theftUtils
```

Expected: All tests pass (the functions are already implemented correctly in Step 1).

- [ ] **Step 4: Commit**

```bash
git add src/theftUtils.js src/theftUtils.test.js
git commit -m "feat: add theft utility functions with tests (chart aggregation, CSV generation)"
```

---

## Task 3: Add Mappers, Icon, Nav Entry, and State

**Files:**
- Modify: `src/ShelfAlert.jsx`

- [ ] **Step 1: Add `shield` icon to the `IC` object (after the `dollar` entry, ~line 227)**

Find:
```js
  dollar: ["M12 1v22","M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"],
};
```

Replace with:
```js
  dollar: ["M12 1v22","M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"],
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
};
```

- [ ] **Step 2: Add three mappers after `mapDept` (~line 183)**

Find:
```js
const mapDept = (d) => ({ id: d.id, code: d.code, label: d.label });
```

Replace with:
```js
const mapDept = (d) => ({ id: d.id, code: d.code, label: d.label });
const mapTheftItem = (t) => ({ id: t.id, name: t.name, resolved: t.resolved, resolvedAt: t.resolved_at, createdAt: t.created_at });
const mapTheftIncident = (i) => ({ id: i.id, itemId: i.item_id, quantity: i.quantity, shelfAisle: i.shelf_aisle, shelfBay: i.shelf_bay, foundAtId: i.found_at_id, incidentDate: i.incident_date, notes: i.notes, loggedBy: i.logged_by, loggedAt: i.logged_at });
const mapTheftLocation = (l) => ({ id: l.id, name: l.name });
```

- [ ] **Step 3: Add "High Theft Items" to the NAV array (before settings, ~line 968)**

Find:
```js
  { id: "reports",   label: "Reports",   icon: IC.report },
  { id: "settings",  label: "Settings",  icon: IC.cog },
```

Replace with:
```js
  { id: "reports",   label: "Reports",   icon: IC.report },
  { id: "theft",     label: "High Theft Items", icon: IC.shield },
  { id: "settings",  label: "Settings",  icon: IC.cog },
```

- [ ] **Step 4: Add state variables to the root `ShelfAlert()` component (after the `depts` state, ~line 982)**

Find:
```js
  const [depts, setDepts] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
```

Replace with:
```js
  const [depts, setDepts] = useState([]);
  const [theftItems, setTheftItems] = useState([]);
  const [theftIncidents, setTheftIncidents] = useState([]);
  const [theftLocations, setTheftLocations] = useState([]);
  const [showTheftForm, setShowTheftForm] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
```

- [ ] **Step 5: Verify the app still starts**

```bash
npx react-scripts start
```

Expected: App loads, "High Theft Items" appears in the sidebar, clicking it shows a blank area (view not yet rendered). No console errors.

- [ ] **Step 6: Commit**

```bash
git add src/ShelfAlert.jsx
git commit -m "feat: add shield icon, theft nav entry, mappers, and state"
```

---

## Task 4: Wire Up Data Loading

**Files:**
- Modify: `src/ShelfAlert.jsx` — `loadAll` function (~line 1003)

- [ ] **Step 1: Add theft table queries to the `Promise.all` in `loadAll`**

Find:
```js
      const [rawGaps, rawSups, rawNotifs, rawSettings, rawCode, rawCredits, rawDepts] = await Promise.all([
        q("gaps",             supabase.from("gaps").select("*").order("logged_at", { ascending: false })),
        q("suppliers",        supabase.from("suppliers").select("*").order("name")),
        q("notifications",    supabase.from("notifications").select("*").eq("read", false).order("created_at", { ascending: false }).limit(15)),
        q("store_settings",   supabase.from("store_settings").select("*").limit(1)),
        q("close_to_code",    supabase.from("close_to_code").select("*").order("use_by_date")),
        q("supplier_credits", supabase.from("supplier_credits").select("*").order("date_raised", { ascending: false })),
        q("departments",      supabase.from("departments").select("*").order("code")),
      ]);
      setGaps(rawGaps.map(mapGap));
      setSuppliers(rawSups.map(mapSupplier));
      setNotifs(rawNotifs);
      setCodeItems(rawCode.map(mapCode));
      setCredits(rawCredits.map(mapCredit));
      setDepts(rawDepts.map(mapDept));
```

Replace with:
```js
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
```

- [ ] **Step 2: Verify no console errors**

Refresh the app. Open DevTools → Console. No errors related to theft tables. (Tables are empty — that's fine.)

- [ ] **Step 3: Commit**

```bash
git add src/ShelfAlert.jsx
git commit -m "feat: load theft_items, theft_incidents, theft_locations in loadAll"
```

---

## Task 5: SVG Chart Components

**Files:**
- Modify: `src/ShelfAlert.jsx` — add three chart components before the NAV constant (~line 961)

- [ ] **Step 1: Add `WeeklyBarChart` before the NAV constant**

Find:
```js
// ─── NAV ──────────────────────────────────────────────────────────────────────
const NAV = [
```

Insert immediately before it:
```js
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
  // weeks: [{ total, isPartial }, ...]
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
  // data[weekIdx][dow] — only render weeks that have any data
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

```

- [ ] **Step 2: Verify no syntax errors**

```bash
npx react-scripts start
```

Expected: App loads without errors. No new functionality is visible yet.

- [ ] **Step 3: Commit**

```bash
git add src/ShelfAlert.jsx
git commit -m "feat: add WeeklyBarChart, MonthlyTotalsChart, MonthlyBreakdownChart SVG components"
```

---

## Task 6: Build HighTheftView Skeleton + Stats + Sub-tabs

**Files:**
- Modify: `src/ShelfAlert.jsx` — add `HighTheftView` component before the NAV constant

- [ ] **Step 1: Add the `HighTheftView` component immediately after the three chart components from Task 5**

Insert after `MonthlyBreakdownChart` and before the `// ─── NAV` line:

```js
function HighTheftView({ incidents, items, locations, numAisles, numBays, depts, session,
  onShowForm, onAddIncident, onAddItem, onToggleResolved, onDeleteIncident, onAddLocation, onDeleteLocation }) {
  const [tab, setTab] = useState("incidents");
  const [metric, setMetric] = useState("incidents");
  const [monthTab, setMonthTab] = useState("totals");
  const [statusFilter, setStatusFilter] = useState("all");
  const [itemFilter, setItemFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  // ── Quick stats ───────────────────────────────────────────────────────────
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

  // ── Derived maps ──────────────────────────────────────────────────────────
  const itemMap = Object.fromEntries(items.map(i => [i.id, i.name]));
  const locMap  = Object.fromEntries(locations.map(l => [l.id, l.name]));
  const itemResolvedMap = Object.fromEntries(items.map(i => [i.id, i.resolved]));
  const locReportCounts = {};
  incidents.forEach(inc => { if (inc.foundAtId) locReportCounts[inc.foundAtId] = (locReportCounts[inc.foundAtId] || 0) + 1; });

  // ── Filtered incidents ────────────────────────────────────────────────────
  const filtered = incidents.filter(inc => {
    if (statusFilter === "active"   && itemResolvedMap[inc.itemId])  return false;
    if (statusFilter === "resolved" && !itemResolvedMap[inc.itemId]) return false;
    if (itemFilter     && inc.itemId    !== itemFilter)     return false;
    if (locationFilter && inc.foundAtId !== locationFilter) return false;
    return true;
  });

  // ── Item stats for Items tab ──────────────────────────────────────────────
  const itemStats = items.map(item => {
    const incs = incidents.filter(inc => inc.itemId === item.id);
    const aisles = {};
    incs.forEach(inc => { if (inc.shelfAisle) aisles[inc.shelfAisle] = (aisles[inc.shelfAisle] || 0) + 1; });
    const topAisle = Object.entries(aisles).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { ...item, count: incs.length, lastDate: incs[0]?.incidentDate, topAisle };
  }).sort((a, b) => b.count - a.count);

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "var(--tm)" }}>Track, analyse, and resolve theft patterns</div>
        <button onClick={onShowForm} style={{ ...BP, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon d={IC.plus} size={14} /> Log Incident
        </button>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        <Card><div style={{ fontSize: 10, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>This Week</div><div style={{ fontSize: 28, fontWeight: 700, color: "var(--t1)", lineHeight: 1 }}>{thisWeekCount}</div><div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>incidents</div></Card>
        <Card><div style={{ fontSize: 10, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Top Item</div><div style={{ fontSize: 14, fontWeight: 700, color: "#f97316", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topItem?.name || "—"}</div><div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>{topItemId ? `${itemCounts[topItemId]} incidents` : "no data"}</div></Card>
        <Card><div style={{ fontSize: 10, color: "var(--tm)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Resolved</div><div style={{ fontSize: 28, fontWeight: 700, color: "#4ade80", lineHeight: 1 }}>{resolvedCount}</div><div style={{ fontSize: 11, color: "var(--tm)", marginTop: 2 }}>items solved</div></Card>
      </div>

      {/* Sub-tabs */}
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
    </div>
  );
}
```

- [ ] **Step 2: Add the view to the render block (~line 1220)**

Find:
```js
            {view === "settings"  && <SettingsView settings={settings} depts={depts} onSave={handleSaveSettings} saving={saving} onAddDept={handleAddDept} onUpdateDept={handleUpdateDept} onDeleteDept={handleDeleteDept} />}
```

Add immediately after it:
```js
            {view === "theft"     && <HighTheftView incidents={theftIncidents} items={theftItems} locations={theftLocations} numAisles={settings.numAisles} numBays={settings.numBays} depts={depts} session={session} onShowForm={() => setShowTheftForm(true)} onAddIncident={() => {}} onAddItem={() => {}} onToggleResolved={() => {}} onDeleteIncident={() => {}} onAddLocation={() => {}} onDeleteLocation={() => {}} />}
```

*(Handlers are stubs for now — wired up in Task 11)*

- [ ] **Step 3: Verify in browser**

Navigate to "High Theft Items" in the sidebar. Expected: Header text, three stats cards showing 0, and three sub-tabs. No errors.

- [ ] **Step 4: Commit**

```bash
git add src/ShelfAlert.jsx
git commit -m "feat: add HighTheftView skeleton with stats row and sub-tabs"
```

---

## Task 7: Incidents Tab

**Files:**
- Modify: `src/ShelfAlert.jsx` — add `TheftIncidentsList` component before `HighTheftView`

- [ ] **Step 1: Add `TheftIncidentsList` immediately before `HighTheftView`**

```js
function TheftIncidentsList({ incidents, itemMap, locMap, itemResolvedMap, items, locations,
  statusFilter, setStatusFilter, itemFilter, setItemFilter,
  locationFilter, setLocationFilter, onDelete }) {
  const fmtShelf = (aisle, bay) => aisle ? (bay ? `${aisle} · Bay ${bay}` : aisle) : "";
  return (
    <div>
      {/* Filter row */}
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
```

- [ ] **Step 2: Verify in browser**

Navigate to High Theft Items → Incidents tab. Expected: Filter pills and dropdowns visible. Empty state message shows.

- [ ] **Step 3: Commit**

```bash
git add src/ShelfAlert.jsx
git commit -m "feat: add TheftIncidentsList with filters and incident rows"
```

---

## Task 8: Log Incident Modal

**Files:**
- Modify: `src/ShelfAlert.jsx` — add `TheftIncidentForm` component before `TheftIncidentsList`

- [ ] **Step 1: Add `TheftIncidentForm` component**

```js
function TheftIncidentForm({ items, locations, numAisles, numBays, depts, session, onSave, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [search, setSearch]         = useState("");
  const [selectedItem, setSelected] = useState(null); // { id, name } or null
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
      {/* Item selector */}
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
```

- [ ] **Step 2: Add modal to the render block (~line 1249)**

Find:
```js
      {resolveTarget && <ResolveModal gapId={resolveTarget.gapId} status={resolveTarget.status} onConfirm={handleResolveConfirm} onClose={() => setResolveTarget(null)} />}
```

Add immediately after it:
```js
      {showTheftForm && <TheftIncidentForm items={theftItems} locations={theftLocations} numAisles={settings.numAisles} numBays={settings.numBays} depts={depts} session={session} onSave={handleAddTheftIncident} onClose={() => setShowTheftForm(false)} />}
```

*(`handleAddTheftIncident` is defined in Task 11 — temporarily leave a stub there if needed.)*

- [ ] **Step 3: Verify in browser**

Click "+ Log Incident". Expected: Modal opens with all fields. Item dropdown filters as you type. "+ Add new item" option appears for unknown names. Cancel closes modal.

- [ ] **Step 4: Commit**

```bash
git add src/ShelfAlert.jsx
git commit -m "feat: add TheftIncidentForm modal with hybrid item selector"
```

---

## Task 9: Items & Locations Tab

**Files:**
- Modify: `src/ShelfAlert.jsx` — add `TheftItemsTab` component before `TheftIncidentsList`

- [ ] **Step 1: Add `TheftItemsTab` component**

```js
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
      {/* Tracked Items */}
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
        <div key={item.id} style={{ background: item.resolved ? "var(--c)" : "var(--c)", border: `1px solid ${item.resolved ? "#1a5c30" : "var(--b)"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: item.resolved ? 0.8 : 1 }}>
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

      {/* Found At Locations */}
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
```

- [ ] **Step 2: Verify in browser**

Navigate to High Theft Items → Items & Locations tab. Expected: "Add Item" and "Add Location" buttons work (inline form appears). Empty state messages show.

- [ ] **Step 3: Commit**

```bash
git add src/ShelfAlert.jsx
git commit -m "feat: add TheftItemsTab with item catalog and found-at location management"
```

---

## Task 10: Charts Tab

**Files:**
- Modify: `src/ShelfAlert.jsx` — add `TheftChartsTab` component before `TheftItemsTab`

- [ ] **Step 1: Add `import` for utility functions at the top of `src/ShelfAlert.jsx` (after the existing imports, ~line 2)**

Find:
```js
import { createClient } from "@supabase/supabase-js";
```

Replace with:
```js
import { createClient } from "@supabase/supabase-js";
import { getWeeklyData, getMonthlyWeeklyTotals, getMonthlyDayBreakdown } from "./theftUtils";
```

- [ ] **Step 2: Add `TheftChartsTab` component immediately before `TheftItemsTab`**

```js
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
      {/* Metric toggle */}
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

      {/* Weekly chart */}
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

      {/* Monthly chart */}
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
```

- [ ] **Step 3: Verify in browser**

Navigate to High Theft Items → Charts tab. Expected: Weekly chart and monthly chart render. Metric toggle switches between Incidents/Quantity. Monthly tabs switch between Weekly Totals and Day Breakdown. "No incidents" messages show when data is empty.

- [ ] **Step 4: Commit**

```bash
git add src/ShelfAlert.jsx
git commit -m "feat: add TheftChartsTab with weekly and monthly SVG charts"
```

---

## Task 11: Handler Functions + Wire Up

**Files:**
- Modify: `src/ShelfAlert.jsx` — add handler functions near the other `handle*` functions (~line 1100), update view render

- [ ] **Step 1: Add theft handler functions to the root `ShelfAlert()` component after `handleDeleteDept` (~line 1161)**

Find:
```js
  const handleDismissNotif = async (id) => {
```

Insert immediately before it:
```js
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

```

- [ ] **Step 2: Replace the stub handler props in the `HighTheftView` render line (from Task 6 Step 2)**

Find:
```js
            {view === "theft"     && <HighTheftView incidents={theftIncidents} items={theftItems} locations={theftLocations} numAisles={settings.numAisles} numBays={settings.numBays} depts={depts} session={session} onShowForm={() => setShowTheftForm(true)} onAddIncident={() => {}} onAddItem={() => {}} onToggleResolved={() => {}} onDeleteIncident={() => {}} onAddLocation={() => {}} onDeleteLocation={() => {}} />}
```

Replace with:
```js
            {view === "theft"     && <HighTheftView incidents={theftIncidents} items={theftItems} locations={theftLocations} numAisles={settings.numAisles} numBays={settings.numBays} depts={depts} session={session} onShowForm={() => setShowTheftForm(true)} onAddIncident={handleAddTheftIncident} onAddItem={handleAddTheftItem} onToggleResolved={handleToggleTheftItemResolved} onDeleteIncident={handleDeleteTheftIncident} onAddLocation={handleAddTheftLocation} onDeleteLocation={handleDeleteTheftLocation} />}
```

- [ ] **Step 3: End-to-end smoke test**

1. Open the app → High Theft Items
2. Items & Locations tab → Add Location "Near Register" → appears as a chip with "0 reports"
3. Items & Locations tab → Add Item "Gillette Fusion Blades" → appears in list as Active
4. Click "+ Log Incident" → select "Gillette Fusion Blades", qty 2, today, Found At "Near Register" → Log Incident
5. Incidents tab → incident row appears
6. Items & Locations → "Near Register" now shows "1 report"
7. Charts → Weekly chart shows a bar for today
8. Items & Locations → Mark "Gillette Fusion Blades" as Resolved → turns green
9. Reload page → all data persists

- [ ] **Step 4: Commit**

```bash
git add src/ShelfAlert.jsx
git commit -m "feat: add theft handler functions and wire up all props"
```

---

## Task 12: CSV Export

**Files:**
- Modify: `src/ShelfAlert.jsx` — update import from theftUtils, add `downloadTheftCSV` helper, add Export button to `TheftIncidentsList`

- [ ] **Step 1: Update the import to include `generateTheftCSV`**

Find:
```js
import { getWeeklyData, getMonthlyWeeklyTotals, getMonthlyDayBreakdown } from "./theftUtils";
```

Replace with:
```js
import { getWeeklyData, getMonthlyWeeklyTotals, getMonthlyDayBreakdown, generateTheftCSV } from "./theftUtils";
```

- [ ] **Step 2: Add `downloadTheftCSV` helper function after the mappers (~line 184)**

Find:
```js
const mapTheftLocation = (l) => ({ id: l.id, name: l.name });
```

Add immediately after it:
```js
const downloadTheftCSV = (content, filename) => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
```

- [ ] **Step 3: Add Export CSV button to `TheftIncidentsList`**

Find (inside `TheftIncidentsList`, the filter row div):
```js
      {incidents.length === 0 && (
        <div style={{ color: "var(--tm)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>No incidents match the current filters.</div>
      )}
```

Insert immediately before it (still inside the return):
```js
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10, gap: 8 }}>
        <button onClick={() => {
          const itemMap = Object.fromEntries(items.map(i => [i.id, i.name]));
          const locMap  = Object.fromEntries(locations.map(l => [l.id, l.name]));
          const csv = generateTheftCSV(incidents, itemMap, locMap);
          downloadTheftCSV(csv, `shelfalert-theft-${new Date().toISOString().slice(0, 10)}.csv`);
        }} style={{ ...BS, padding: "5px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon d={IC.dl} size={13} /> Export CSV
        </button>
      </div>
```

- [ ] **Step 4: Verify CSV download**

1. Log a couple of test incidents
2. Click "Export CSV"
3. Open the downloaded file — verify it has the correct headers and data rows

- [ ] **Step 5: Commit**

```bash
git add src/ShelfAlert.jsx
git commit -m "feat: add CSV export to incidents tab"
```

---

## Task 13: PDF Export

**Files:**
- Modify: `src/ShelfAlert.jsx` — add print CSS, `TheftPrintReport` component, Export PDF button

- [ ] **Step 1: Add print CSS to the `CSS` constant (append before the closing backtick, ~line 1274)**

Find:
```js
  @media(max-width:680px){
```

Insert immediately before it:
```js
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
```

- [ ] **Step 2: Add `TheftPrintReport` component immediately before `TheftIncidentsList`**

```js
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
```

- [ ] **Step 3: Render `TheftPrintReport` inside `HighTheftView`'s return, after the closing sub-tab content**

Find (inside `HighTheftView`, the last line before the closing `</div>`):
```js
      {tab === "items"     && <TheftItemsTab itemStats={itemStats} locations={locations} locReportCounts={locReportCounts} onToggleResolved={onToggleResolved} onAddItem={onAddItem} onAddLocation={onAddLocation} onDeleteLocation={onDeleteLocation} />}
    </div>
  );
}
```

Replace with:
```js
      {tab === "items"     && <TheftItemsTab itemStats={itemStats} locations={locations} locReportCounts={locReportCounts} onToggleResolved={onToggleResolved} onAddItem={onAddItem} onAddLocation={onAddLocation} onDeleteLocation={onDeleteLocation} />}
      <TheftPrintReport incidents={filtered} items={items} locations={locations} />
    </div>
  );
}
```

- [ ] **Step 4: Add Export PDF button next to Export CSV in `TheftIncidentsList`**

Find (inside `TheftIncidentsList`):
```js
          <Icon d={IC.dl} size={13} /> Export CSV
        </button>
      </div>
```

Replace with:
```js
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
```

- [ ] **Step 5: Verify PDF export**

1. Log a few test incidents
2. Click "Export PDF"
3. Browser print dialog opens. Expected: Only the report content is visible — no sidebar, nav, or buttons. Content includes summary stats, items table, and incident log.

- [ ] **Step 6: Final commit**

```bash
git add src/ShelfAlert.jsx
git commit -m "feat: add PDF export via window.print() with print-only report layout"
```

---

## Self-Review Checklist

- [x] Supabase tables: `theft_items`, `theft_incidents`, `theft_locations` — Task 1
- [x] Hybrid item select (search + "Add new") — Task 8 (`TheftIncidentForm`)
- [x] Quantity field — Task 8
- [x] Date Found (defaults today, editable) — Task 8
- [x] Shelf location (aisle + bay) — Task 8
- [x] Found-at location dropdown — Task 8
- [x] Found-at location manager (add/delete with "N reports") — Task 9
- [x] Pattern history list (Incidents tab with filters) — Task 7
- [x] Weekly bar chart (Sun–Sat, orange highest bar, today highlighted) — Task 5 + Task 10
- [x] Count/Quantity metric toggle — Task 10
- [x] Monthly chart: Weekly Totals tab — Task 5 + Task 10
- [x] Monthly chart: Day Breakdown tab — Task 5 + Task 10
- [x] Resolved toggle on items (Mark Resolved / Reopen) — Task 9 + Task 11
- [x] Incidents filtered by item's resolved status — Task 7
- [x] Quick stats row (This Week, Top Item, Resolved count) — Task 6
- [x] CSV export (respects current filters) — Task 12
- [x] PDF export via window.print() — Task 13
- [x] Nav entry "High Theft Items" with shield icon — Task 3
- [x] Data loads in `loadAll` alongside existing tables — Task 4
