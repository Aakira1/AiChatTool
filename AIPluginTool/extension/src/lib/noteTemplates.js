// Ready-made note templates for the Notepad's template generator. Each returns
// an HTML fragment inserted into the rich-text editor. They are tailored to
// CiA / P&R transition consulting work but are useful for any project note.
//
// Templates are deliberately "featureful": branded callout banners, colour-coded
// status/severity pills, KPI strips, meta grids, checklists and legends — so a
// freshly-inserted note already looks like a finished document.

const longDate = () =>
  new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
const shortDate = () => new Date().toLocaleDateString("en-AU");

const BORDER = "border:1px solid #d8cdef;padding:6px 9px;vertical-align:top;";
const TH = "border:1px solid #d8cdef;padding:6px 9px;background:#f4eefb;font-weight:600;text-align:left;color:#2d1b69;";

// ── building blocks ──────────────────────────────────────────────────────────

function banner(emoji, title, subtitle) {
  return `<div style="border-left:4px solid #7c3aed;background:linear-gradient(90deg,#f4eefb,rgba(244,238,251,0));padding:10px 14px;border-radius:8px;margin:2px 0 12px;">
<div style="font-size:16px;font-weight:700;color:#2d1b69;">${emoji} ${title}</div>
${subtitle ? `<div style="font-size:11.5px;color:#6b6285;margin-top:2px;">${subtitle}</div>` : ""}
</div>`;
}

function pill(text, color) {
  const tint = { purple: ["#ede9fe", "#6d28d9"], green: ["#dcfce7", "#15803d"], amber: ["#fef3c7", "#b45309"], red: ["#fee2e2", "#b91c1c"], blue: ["#dbeafe", "#1d4ed8"], grey: ["#eef0f4", "#475569"] }[color] || ["#eef0f4", "#475569"];
  return `<span style="display:inline-block;padding:1px 9px;border-radius:999px;background:${tint[0]};color:${tint[1]};font-size:10.5px;font-weight:700;">${text}</span>`;
}

function legend(pairs) {
  return `<p style="margin:6px 0 10px;font-size:11px;color:#6b6285;">Legend: ${pairs.map(([t, c]) => pill(t, c)).join(" ")}</p>`;
}

function callout(emoji, label, color) {
  const tint = { amber: ["#fffbeb", "#fcd34d"], blue: ["#eff6ff", "#bfdbfe"], green: ["#f0fdf4", "#bbf7d0"] }[color] || ["#faf7ff", "#e5d9f7"];
  return `<div style="background:${tint[0]};border:1px solid ${tint[1]};border-radius:8px;padding:9px 12px;margin:8px 0;font-size:12px;"><strong>${emoji} ${label}</strong> </div>`;
}

function metaGrid(rows) {
  return `<table style="border-collapse:collapse;width:100%;margin:4px 0 12px;font-size:12px;"><tbody>${rows
    .map(([k, v]) => `<tr><td style="padding:3px 10px 3px 0;color:#6b6285;width:38%;white-space:nowrap;">${k}</td><td style="padding:3px 0;border-bottom:1px solid #eee;">${v || ""}</td></tr>`)
    .join("")}</tbody></table>`;
}

function table(headers, rows = 3) {
  const head = `<tr>${headers.map((h) => `<th style="${TH}">${h}</th>`).join("")}</tr>`;
  const cell = `<td style="${BORDER}"></td>`;
  const body = Array.from({ length: rows }, () => `<tr>${headers.map(() => cell).join("")}</tr>`).join("");
  return `<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:12px;"><tbody>${head}${body}</tbody></table>`;
}

function checklist(items) {
  return `<ul style="list-style:none;padding-left:2px;margin:6px 0;">${items
    .map((i) => `<li style="margin:3px 0;">☐ ${i}</li>`)
    .join("")}</ul>`;
}

function kpis(cards) {
  return `<table style="border-collapse:separate;border-spacing:8px 0;width:100%;margin:4px 0 8px;"><tbody><tr>${cards
    .map(([label, val]) => `<td style="background:#f4eefb;border:1px solid #e5d9f7;border-radius:10px;padding:10px;text-align:center;width:${Math.floor(100 / cards.length)}%;"><div style="font-size:20px;font-weight:800;color:#2d1b69;">${val}</div><div style="font-size:10px;color:#6b6285;text-transform:uppercase;letter-spacing:.04em;">${label}</div></td>`)
    .join("")}</tr></tbody></table>`;
}

// ── templates ────────────────────────────────────────────────────────────────

export const NOTE_TEMPLATES = [
  {
    id: "feedback",
    icon: "📣",
    label: "Feedback log",
    desc: "Stage feedback & issue resolution",
    html: () => banner("📣", "Transition Feedback Log", `Stage 1B · Logged ${longDate()}`) +
      metaGrid([["Customer / Project", ""], ["Stage", "1B"], ["Logged by", ""]]) +
      callout("ℹ️", "How to use:") +
      `<p style="font-size:11.5px;color:#6b6285;margin:-4px 0 8px;">Record anything that was meant to transition but didn't, charges out of balance, or other observations — and how each was resolved. If an item is a suspected bug, raise a support ticket and capture its number.</p>` +
      legend([["Open", "amber"], ["In progress", "blue"], ["Resolved", "green"], ["Bug → ticket", "red"]]) +
      table(["Date", "Area / Record", "Issue / Observation", "Bug?", "Ticket #", "Resolution", "Status"], 5) +
      `<h4>Follow-up actions</h4>` + checklist(["", ""]),
  },
  {
    id: "reconciliation",
    icon: "⚖️",
    label: "Reconciliation review",
    desc: "Records & charges out of balance",
    html: () => banner("⚖️", "Reconciliation Review", `${longDate()}`) +
      metaGrid([["Reviewer", ""], ["Environment", "Production"], ["Source extract", ""]]) +
      kpis([["Records checked", "—"], ["Not transitioned", "—"], ["Out of balance", "$—"]]) +
      `<h4>Records that did not transition</h4>` +
      table(["Record / Ref", "Expected", "Actual", "Reason", "Resolution"], 4) +
      `<h4>Charges out of balance</h4>` +
      table(["Account / Charge", "Expected $", "Actual $", "Variance $", "Resolution"], 4) +
      callout("📌", "Summary & sign-off:", "blue"),
  },
  {
    id: "meeting",
    icon: "📝",
    label: "Meeting notes",
    desc: "Agenda, decisions, actions",
    html: () => banner("📝", "Meeting Notes", longDate()) +
      metaGrid([["Attendees", ""], ["Apologies", ""], ["Purpose", ""]]) +
      `<h4>Agenda</h4>` + checklist(["", "", ""]) +
      `<h4>Discussion</h4><ul><li></li></ul>` +
      `<h4>Decisions</h4><ul><li></li></ul>` +
      `<h4>Actions</h4>` + table(["Action", "Owner", "Due", "Status"], 3),
  },
  {
    id: "status",
    icon: "📊",
    label: "Status report",
    desc: "PM status / RAG summary",
    html: () => banner("📊", "Project Status Report", `Week of ${shortDate()}`) +
      `<p style="margin:0 0 8px;">Overall status: ${pill("🟢 On track", "green")} ${pill("🟡 At risk", "amber")} ${pill("🔴 Off track", "red")} <span style="font-size:11px;color:#6b6285;">— delete the ones that don't apply</span></p>` +
      kpis([["% Complete", "—"], ["Open risks", "—"], ["Days to go-live", "—"]]) +
      `<h4>Executive summary</h4><p></p>` +
      `<h4>Accomplishments this period</h4><ul><li></li></ul>` +
      `<h4>Planned next period</h4><ul><li></li></ul>` +
      `<h4>Key milestones</h4>` + table(["Milestone", "Target", "Status"], 3) +
      `<h4>Risks &amp; issues</h4>` + table(["Item", "Impact", "Mitigation", "Owner"], 3),
  },
  {
    id: "risk",
    icon: "⚠️",
    label: "Risk & issue log",
    desc: "Scored risks, issues & owners",
    html: () => banner("⚠️", "Risk &amp; Issue Log", `Updated ${longDate()}`) +
      legend([["Low", "green"], ["Medium", "amber"], ["High", "red"]]) +
      table(["ID", "Risk / Issue", "Likelihood", "Impact", "Severity", "Mitigation / Action", "Owner", "Status"], 5),
  },
  {
    id: "runsheet",
    icon: "🚀",
    label: "Go-live run sheet",
    desc: "Cutover steps, go/no-go, rollback",
    html: () => banner("🚀", "Go-Live Run Sheet", `Go-live ${shortDate()}`) +
      metaGrid([["Customer / Project", ""], ["Cutover window", ""], ["Bridge / comms", ""]]) +
      `<h4>Pre-checks</h4>` + checklist(["UAT signed off", "Backups verified", "Stakeholders notified", "Rollback plan confirmed"]) +
      `<h4>Cutover steps</h4>` + table(["#", "Task", "Owner", "Planned", "Done", "Notes"], 6) +
      `<h4>Go / No-go</h4><p>Decision: ${pill("GO", "green")} ${pill("NO-GO", "red")} &nbsp; Approver: ____________ &nbsp; Time: ______</p>` +
      callout("↩️", "Rollback trigger & steps:", "amber"),
  },
  {
    id: "supportticket",
    icon: "🎫",
    label: "Support ticket",
    desc: "Suspected bug write-up",
    html: () => banner("🎫", "Support Ticket — Suspected Bug", `Logged ${longDate()}`) +
      `<p style="margin:0 0 6px;">Severity: ${pill("S1 Critical", "red")} ${pill("S2 High", "amber")} ${pill("S3 Medium", "blue")} ${pill("S4 Low", "grey")}</p>` +
      metaGrid([["Ticket #", ""], ["Environment / Stage", ""], ["Module / Area", ""], ["Reported by", ""]]) +
      `<p><strong>Summary:</strong> </p>` +
      `<h4>Steps to reproduce</h4><ol><li></li><li></li></ol>` +
      metaGrid([["Expected result", ""], ["Actual result", ""], ["Impact / Workaround", ""]]) +
      callout("📎", "Attachments / screenshots:", "blue"),
  },
  {
    id: "standup",
    icon: "☀️",
    label: "Daily stand-up",
    desc: "Yesterday / today / blockers",
    html: () => banner("☀️", "Daily Stand-up", longDate()) +
      `<h4>✅ Yesterday</h4>` + checklist([""]) +
      `<h4>🎯 Today</h4>` + checklist([""]) +
      `<h4>🚧 Blockers</h4>` + checklist([""]) +
      `<p style="font-size:11.5px;color:#6b6285;">Confidence: ${pill("On track", "green")} ${pill("At risk", "amber")} ${pill("Blocked", "red")}</p>`,
  },
  {
    id: "decision",
    icon: "✅",
    label: "Decision log",
    desc: "Options weighed & decision",
    html: () => banner("✅", "Decision Record", longDate()) +
      metaGrid([["Decision owner", ""], ["Date", shortDate()], ["Status", "Proposed"]]) +
      `<p><strong>Context / problem:</strong> </p>` +
      `<h4>Options considered</h4>` + table(["Option", "Pros", "Cons"], 3) +
      callout("✅", "Decision & rationale:", "green") +
      `<p><strong>Consequences / follow-ups:</strong> </p>`,
  },
];
