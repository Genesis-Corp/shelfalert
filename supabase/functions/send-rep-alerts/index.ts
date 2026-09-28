// ============================================================
// ShelfAlert — Supabase Edge Function
// File: supabase/functions/send-rep-alerts/index.ts
//
// Deploy with:
//   supabase functions deploy send-rep-alerts
//
// Schedule (cron) — set in Supabase Dashboard > Edge Functions
// > Schedules:  0 * * * *   (runs every hour, function checks timezone)
//
// Required secrets (set via Supabase Dashboard > Settings > Secrets):
//   RESEND_API_KEY   — from resend.com (free tier)
//   SUPABASE_URL     — auto-available in Edge Functions
//   SUPABASE_SERVICE_ROLE_KEY — auto-available in Edge Functions
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const EMAIL_FROM = Deno.env.get("EMAIL_FROM"); // Verified sender in Resend
const EMAIL_REPLY_TO = "Jerichosams@gmail.com";

// ── Helpers ──────────────────────────────────────────────────

function getCurrentDayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "long",
  }).format(new Date());
}

function getCurrentHourInTimezone(timezone: string): number {
  return parseInt(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
}

// ── Email builder ────────────────────────────────────────────
// One summary email per morning run — not one email per rep.

function buildSummaryEmailHtml(
  reps: { supplier: any; gaps: any[]; codeItems: any[] }[],
  todayDay: string
): string {
  const repRows = reps
    .map(
      ({ supplier }) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;color:#e8edf5;font-size:14px;">${supplier.name}${supplier.contact ? ` — ${supplier.contact}` : ""}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;color:#9ba8bb;font-size:13px;">${supplier.phone || "—"}</td>
      </tr>
    `
    )
    .join("");

  const gapRows = reps
    .flatMap(({ supplier, gaps }) =>
      gaps.map(
        (g) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;color:#e8edf5;font-size:14px;">${g.description}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;color:#9ba8bb;font-size:13px;">${supplier.name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;color:#9ba8bb;font-size:13px;">${g.aisle || "—"}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;font-size:12px;">
          <span style="background:${g.priority === "high" ? "#3d1a1a" : "#1a1a2e"};color:${g.priority === "high" ? "#ff7070" : "#60a5fa"};padding:2px 8px;border-radius:10px;font-weight:700;">
            ${(g.priority || "normal").toUpperCase()}
          </span>
        </td>
      </tr>
    `
      )
    )
    .join("");

  const codeRows = reps
    .flatMap(({ supplier, codeItems }) =>
      codeItems.map(
        (c) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;color:#e8edf5;font-size:14px;">${c.description}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;color:#9ba8bb;font-size:13px;">${supplier.name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;color:#e8edf5;font-size:13px;">${c.use_by_date}</td>
      </tr>
    `
      )
    )
    .join("");

  const section = (title: string, headerCells: string, rows: string, emptyLabel: string) => `
    <h2 style="color:#e8edf5;font-size:16px;margin:24px 0 10px;">${title}</h2>
    ${
      rows
        ? `<table style="width:100%;border-collapse:collapse;border:1px solid #1e2430;border-radius:8px;overflow:hidden;">
            <thead><tr style="background:#131720;">${headerCells}</tr></thead>
            <tbody>${rows}</tbody>
          </table>`
        : `<p style="color:#5a6478;font-size:13px;margin:0;">${emptyLabel}</p>`
    }
  `;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="background:#0a0c0f;font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="margin-bottom:24px;">
      <span style="font-size:28px;font-weight:900;color:#00e5b0;letter-spacing:-1px;">ShelfAlert</span>
    </div>
    <div style="background:#0f1217;border:1px solid #1e2430;border-radius:12px;padding:28px;margin-bottom:20px;">
      <h2 style="color:#e8edf5;font-size:20px;margin:0 0 4px;">Morning Summary — ${todayDay}</h2>
      <p style="color:#9ba8bb;font-size:14px;margin:0;">Reps due in today, and the open gaps and near-code items to raise with them.</p>

      ${section(
        "Reps due in today",
        `<th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Rep</th>
         <th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Phone</th>`,
        repRows,
        "No reps due in today."
      )}

      ${section(
        "Gaps to raise",
        `<th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Product</th>
         <th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Supplier</th>
         <th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Location</th>
         <th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Priority</th>`,
        gapRows,
        "No open gaps for today's reps."
      )}

      ${section(
        "Near-code items",
        `<th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Product</th>
         <th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Supplier</th>
         <th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Use By</th>`,
        codeRows,
        "No near-code items for today's reps."
      )}
    </div>
    <p style="color:#5a6478;font-size:12px;text-align:center;">ShelfAlert · Automated reminder · Do not reply to this email</p>
  </div>
</body>
</html>
  `;
}

// ── Missed-item reminder logic ────────────────────────────────
// Sends a 2-day reminder for missed gaps, unless a rep visit is
// within the next 2 days (in which case the pre-visit email covers it).

async function markMissedReminders(timezone: string) {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const { data: missedGaps } = await supabase
    .from("gaps")
    .select("id, description, last_reminded_at")
    .eq("status", "missed");

  for (const gap of missedGaps || []) {
    const lastReminded = gap.last_reminded_at
      ? new Date(gap.last_reminded_at)
      : null;
    const needsReminder = !lastReminded || lastReminded < twoDaysAgo;

    if (needsReminder) {
      // Insert in-app notification
      await supabase.from("notifications").insert({
        type: "alert",
        text: `Missed item still unresolved: "${gap.description}"`,
      });
      // Update last reminded timestamp
      await supabase
        .from("gaps")
        .update({ last_reminded_at: now.toISOString() })
        .eq("id", gap.id);
    }
  }
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (_req) => {
  try {
    // Load store settings
    const { data: settings } = await supabase
      .from("store_settings")
      .select("*")
      .single();

    if (!settings) {
      return new Response("No store settings found", { status: 400 });
    }

    const { timezone, notif_time, store_email } = settings;
    const [notifHour] = notif_time.split(":").map(Number);
    const currentHour = getCurrentHourInTimezone(timezone);
    const todayDay = getCurrentDayInTimezone(timezone);

    // Only run at the configured notification hour
    if (currentHour !== notifHour) {
      // Still process missed-item 2-day reminders every hour
      await markMissedReminders(timezone);
      return new Response("Not notification hour yet", { status: 200 });
    }

    if (!RESEND_API_KEY || !EMAIL_FROM || !store_email) {
      console.error("Email configuration missing: RESEND_API_KEY, EMAIL_FROM or store_email");
      return new Response("Email sender or recipient is not configured", { status: 503 });
    }

    // Reps (suppliers) due in today
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("*")
      .eq("visit_day", todayDay);

    const repsToday = suppliers || [];

    if (repsToday.length === 0) {
      await markMissedReminders(timezone);
      return new Response("No reps due in today", { status: 200 });
    }

    const supplierIds = repsToday.map((s) => s.id);

    // Open gaps from today's reps
    const { data: allGaps } = await supabase
      .from("gaps")
      .select("*")
      .in("supplier_id", supplierIds)
      .in("status", ["open", "missed"]);

    // Near-code items from today's reps
    const { data: allCodeItems } = await supabase
      .from("close_to_code")
      .select("*")
      .in("supplier_id", supplierIds)
      .eq("status", "active");

    const reps = repsToday.map((supplier) => ({
      supplier,
      gaps: (allGaps || []).filter((g) => g.supplier_id === supplier.id),
      codeItems: (allCodeItems || []).filter((c) => c.supplier_id === supplier.id),
    }));

    const totalGaps = reps.reduce((sum, r) => sum + r.gaps.length, 0);

    const subject = `[ShelfAlert] Morning summary — ${repsToday.length} rep${repsToday.length === 1 ? "" : "s"} due in today, ${totalGaps} open gap${totalGaps === 1 ? "" : "s"}`;
    const html = buildSummaryEmailHtml(reps, todayDay);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        reply_to: EMAIL_REPLY_TO,
        to: [store_email],
        subject,
        html,
      }),
    });

    let emailSent = false;
    if (emailRes.ok) {
      emailSent = true;
      await supabase.from("notifications").insert({
        type: "urgent",
        text: `Morning summary sent to ${store_email} — ${repsToday.length} rep${repsToday.length === 1 ? "" : "s"} due in today, ${totalGaps} open gap${totalGaps === 1 ? "" : "s"}.`,
      });
    } else {
      console.error("Resend rejected notification", emailRes.status, await emailRes.text());
    }

    // Run missed-item reminder check
    await markMissedReminders(timezone);

    return new Response(
      JSON.stringify({ ok: emailSent, emailSent }),
      { status: emailSent ? 200 : 502, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
