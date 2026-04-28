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

function getTomorrowDayInTimezone(timezone: string): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "long",
  }).format(tomorrow);
}

// ── Email builder ────────────────────────────────────────────

function buildEmailHtml(
  supplierName: string,
  repName: string,
  gaps: any[],
  isToday: boolean
): string {
  const gapRows = gaps
    .map(
      (g) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;color:#e8edf5;font-size:14px;">${g.description}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;color:#9ba8bb;font-size:13px;">${g.aisle}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;font-size:12px;">
          <span style="background:${g.priority === "high" ? "#3d1a1a" : "#1a1a2e"};color:${g.priority === "high" ? "#ff7070" : "#60a5fa"};padding:2px 8px;border-radius:10px;font-weight:700;">
            ${g.priority.toUpperCase()}
          </span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #1e2430;color:#5a6478;font-size:12px;">${g.notes || "—"}</td>
      </tr>
    `
    )
    .join("");

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
      <h2 style="color:#e8edf5;font-size:20px;margin:0 0 8px;">
        ${isToday ? "🔔 Rep Visit TODAY" : "📅 Rep Visit TOMORROW"}
      </h2>
      <p style="color:#9ba8bb;font-size:14px;margin:0 0 20px;">
        <strong style="color:#e8edf5;">${supplierName}</strong> — ${repName} is due in ${isToday ? "today" : "tomorrow"}.
        There ${gaps.length === 1 ? "is" : "are"} <strong style="color:#00e5b0;">${gaps.length} open gap${gaps.length === 1 ? "" : "s"}</strong> to raise.
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #1e2430;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#131720;">
            <th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Product</th>
            <th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Location</th>
            <th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Priority</th>
            <th style="padding:10px 12px;text-align:left;color:#5a6478;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Notes</th>
          </tr>
        </thead>
        <tbody>${gapRows}</tbody>
      </table>
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

    const { timezone, notif_time, store_email, store_name } = settings;
    const [notifHour] = notif_time.split(":").map(Number);
    const currentHour = getCurrentHourInTimezone(timezone);
    const todayDay = getCurrentDayInTimezone(timezone);
    const tomorrowDay = getTomorrowDayInTimezone(timezone);

    // Only run at the configured notification hour
    if (currentHour !== notifHour) {
      // Still process missed-item 2-day reminders every hour
      await markMissedReminders(timezone);
      return new Response("Not notification hour yet", { status: 200 });
    }

    // Load all suppliers with open gaps
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("*");

    let emailsSent = 0;

    for (const supplier of suppliers || []) {
      const isToday = supplier.visit_day === todayDay;
      const isTomorrow = supplier.visit_day === tomorrowDay;

      if (!isToday && !isTomorrow) continue;

      // Load open gaps for this supplier
      const { data: gaps } = await supabase
        .from("gaps")
        .select("*")
        .eq("supplier_id", supplier.id)
        .in("status", ["open", "missed"]);

      if (!gaps || gaps.length === 0) continue;

      // Build and send email via Resend
      const subject = isToday
        ? `[ShelfAlert] ${supplier.name} rep is in TODAY — ${gaps.length} open gap${gaps.length === 1 ? "" : "s"}`
        : `[ShelfAlert] ${supplier.name} rep due TOMORROW — ${gaps.length} open gap${gaps.length === 1 ? "" : "s"}`;

      const html = buildEmailHtml(
        supplier.name,
        supplier.contact,
        gaps,
        isToday
      );

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ShelfAlert <noreply@shelfalert.app>",
          to: [store_email],
          subject,
          html,
        }),
      });

      if (emailRes.ok) {
        emailsSent++;
        // Create in-app notification too
        await supabase.from("notifications").insert({
          type: isToday ? "urgent" : "warning",
          text: `${supplier.name} rep ${isToday ? "TODAY" : "TOMORROW"} — ${gaps.length} open gap${gaps.length === 1 ? "" : "s"}. Email sent to ${store_email}.`,
        });
      }
    }

    // Run missed-item reminder check
    await markMissedReminders(timezone);

    return new Response(
      JSON.stringify({ ok: true, emailsSent }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
