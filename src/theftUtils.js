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
