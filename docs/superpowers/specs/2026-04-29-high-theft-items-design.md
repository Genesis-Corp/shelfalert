# High Theft Items — Design Spec
**Date:** 2026-04-29  
**Status:** Approved

---

## Overview

A new "High Theft Items" section in ShelfAlert for logging, tracking, and resolving theft incidents. The goal is to surface patterns — which items are stolen most, when, from where, and where they end up — so that counter-measures can be identified and confirmed as effective.

---

## Navigation

- New entry in the `NAV` array: `{ id: "theft", label: "High Theft Items", icon: IC.shield }`
- A `shield` SVG path is added to the `IC` icon dictionary
- No badge/count on the nav item (no urgency metric needed for this view)

---

## Data Model

Three new Supabase tables:

### `theft_items` — Item catalog
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | Item display name |
| `resolved` | boolean | Default `false` |
| `resolved_at` | timestamptz | Nullable — set when resolved |
| `created_at` | timestamptz | |

### `theft_incidents` — Incident log
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `item_id` | uuid FK → theft_items | |
| `quantity` | integer | How many units missing |
| `shelf_aisle` | text | Nullable — aisle item came from |
| `shelf_bay` | text | Nullable — bay within that aisle |
| `found_at_id` | uuid FK → theft_locations | Nullable |
| `incident_date` | date | When theft was detected (defaults to today, editable) |
| `notes` | text | Nullable |
| `logged_by` | text | Display name of logged-in user |
| `logged_at` | timestamptz | |

### `theft_locations` — Found-at location list
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | e.g. "Near Register", "Car Park" |
| `created_at` | timestamptz | |

---

## Mappers

```js
mapTheftItem(t)      → { id, name, resolved, resolvedAt, createdAt }
mapTheftIncident(i)  → { id, itemId, quantity, shelfAisle, shelfBay, foundAtId, incidentDate, notes, loggedBy, loggedAt }
mapTheftLocation(l)  → { id, name }
```

---

## Page Structure

The view is a single `HighTheftView` component function added to `ShelfAlert.jsx`, following the existing pattern of all other views.

### Header
- Title: "High Theft Items"
- Subtitle: "Track, analyse, and resolve theft patterns"
- "+ Log Incident" button (primary, top-right) — opens Log Incident modal

### Quick Stats Row (3 cards)
1. **This Week** — count of incidents in the current Sun–Sat week
2. **Top Item** — item name with most incidents (active items only), incident count below
3. **Resolved** — count of items marked resolved

### Sub-tabs
Three tabs within the view:

1. **Incidents** — default tab
2. **Charts**
3. **Items & Locations**

---

## Tab 1: Incidents

A chronological list of all logged incidents, newest first.

**Filters (row above list):**
- Status pills: All | Active | Resolved — filters by whether the incident's linked *item* is currently resolved or active
- "Filter by item" dropdown
- "Filter by location" dropdown

**Incident row:**
- Item name (bold)
- `Qty: N · Aisle X · Bay Y → Found At Location · Date`
- Status badge reflects the linked item's resolved status: Active (blue) or Resolved (green). There is no per-incident status field.

---

## Tab 2: Charts

### Controls
- Toggle (top-right): **Incidents** | **Quantity** — switches the Y-axis metric across both charts

### Weekly Bar Chart
- Title: "This Week" + date range (e.g. "27 Apr – 3 May")
- X-axis: Sun Mon Tue Wed Thu Fri Sat
- Y-axis: incident count OR total quantity (per toggle)
- The highest bar of the current week is highlighted in orange; all others in the app's accent green (`var(--a)`)
- Note below: "Today is [Day] — [N] incidents so far"
- Built as a custom inline SVG (no chart library)

### Monthly Comparison Chart
- Title: current month + year (e.g. "April 2026")
- Two tabs:
  - **Weekly Totals** — one bar per week (Wk 1–4), showing the week's total. Current (incomplete) week shown at reduced opacity with a "▸ in progress" label
  - **Day Breakdown** — grouped bars for Sun–Sat, one bar per week of the month, differentiated by opacity. Lets you see "Week 3 Mondays were the worst"
- Built as custom inline SVG

---

## Tab 3: Items & Locations

Two sections separated by a divider:

### Tracked Items
- "+ Add Item" button (top-right)
- Each item card shows:
  - Item name
  - Total incident count, last incident date, most common shelf aisle
  - Status badge: Active (blue) | Resolved (green)
  - "Mark Resolved" button (active items) or "Reopen" button (resolved items)
- Resolved items remain visible with a green border and reduced opacity — preserving the win, allowing reopen if theft resumes

### Found At Locations
- "+ Add Location" button (top-right)
- Locations shown as pill chips
- Each chip: location name + `N reports` (count of incidents at that location) + delete (✕) button
- Locations cannot be deleted if they have reports attached (show a warning)

---

## Log Incident Modal

Triggered by "+ Log Incident" button. Uses the existing `Modal` component.

**Fields:**
1. **Item** — searchable dropdown of `theft_items`. Typing filters the list. If no match, shows `+ Add "[typed text]" as new item` at the bottom of the dropdown, which creates the item in `theft_items` and selects it.
2. **Quantity** — number input, min 1
3. **Date Found** — date input, defaults to today, editable
4. **Shelf Location** — aisle dropdown + bay dropdown (same `buildAisleOptions` / `buildBayOptions` helpers used elsewhere). Both optional.
5. **Found At** — dropdown of `theft_locations`. Optional.
6. **Notes** — textarea, optional

**Actions:** "Log Incident" (primary) | "Cancel"

On save: inserts to `theft_incidents`, prepends to local state.

---

## Export / Security Report

An "Export" button lives in the Incidents tab header (alongside the filters). It exports the currently filtered incident list — so the user can scope by date, item, or location before exporting.

Two formats, offered as separate buttons or a dropdown:

### CSV Export
Client-side generation using a `Blob` — no server call needed.

**Columns:**
| Date | Item | Quantity | Shelf Aisle | Shelf Bay | Found At | Notes | Logged By |

- Filename: `shelfalert-theft-[YYYY-MM-DD].csv`
- Respects active filters (exports what the user is currently viewing)
- Opens a download dialog immediately

### PDF Summary Report
Client-side generation using the browser's `window.print()` with a dedicated print stylesheet — no PDF library needed.

**Contents:**
1. Store name + report date range
2. Summary stats: total incidents, total quantity, top item, most common found-at location
3. Active items table: item name, incident count, last seen, most common shelf location, status
4. Full incident log table (same columns as CSV)

- Triggered via a hidden `<div id="theft-print-report">` that is only visible when `window.print()` is called
- Print CSS hides all app chrome (sidebar, nav, buttons) and shows only the report div
- Filename suggested via `document.title` swap before print

### Implementation note
Both exports are pure client-side — no new dependencies. CSV uses `URL.createObjectURL(new Blob(...))`. PDF uses `window.print()` with `@media print` CSS already injected into the app's `<style>` block.

---

## Implementation Approach

- All code added inline to `ShelfAlert.jsx`, following existing patterns
- No new npm packages — charts built as custom SVG components, exports are client-side
- New state in root `ShelfAlert()` component:
  ```js
  const [theftItems, setTheftItems] = useState([]);
  const [theftIncidents, setTheftIncidents] = useState([]);
  const [theftLocations, setTheftLocations] = useState([]);
  ```
- Data loaded in the existing `useEffect` data-fetch block alongside gaps, suppliers, etc.
- Handler functions follow the `handle*` naming convention already in use

---

## Out of Scope

- Linking incidents to suppliers (theft is not supplier-related)
- Per-incident notes editing after save (log-and-done, same as other views)
