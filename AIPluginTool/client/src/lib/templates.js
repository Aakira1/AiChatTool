// Prompt templates that prefill the composer with a well-structured request.
// They lean on the file-generation pipeline so the assistant returns a clean,
// downloadable deliverable instead of free-form prose. Each `prompt` is inserted
// into the input box for the user to tweak before sending.

export const TEMPLATES = [
  {
    id: "status-report",
    label: "Status report",
    icon: "📈",
    description: "Weekly progress report (Word/PDF)",
    prompt:
      "Create a downloadable Word and PDF status report titled \"Weekly Status Report\". " +
      "Use these sections as ## headings: Summary, Progress This Week, Blockers, Risks, " +
      "and Next Steps. Put 2-3 bullet points of realistic placeholder content under each " +
      "so I can edit them.",
  },
  {
    id: "meeting-minutes",
    label: "Meeting minutes",
    icon: "🗒️",
    description: "Structured minutes (Word/PDF)",
    prompt:
      "Create a downloadable Word document titled \"Meeting Minutes\". Include: a header table " +
      "with Date, Attendees, and Purpose; an ## Agenda section; a ## Discussion section; a " +
      "## Decisions section; and an ## Action Items table with columns Owner, Action, Due Date. " +
      "Use placeholder content I can replace.",
  },
  {
    id: "migration-checklist",
    label: "Migration checklist",
    icon: "✅",
    description: "Fillable CiA migration checklist (PDF form)",
    prompt:
      "Create a fillable migration checklist for a Ci → CiA transition. Group items under " +
      "## section headings (Pre-migration, Data, Cutover, Validation, Post-migration) and write " +
      "each item as a checkbox line like \"- [ ] item\". Keep it practical and specific.",
  },
  {
    id: "project-brief",
    label: "Project brief",
    icon: "📋",
    description: "One-page project brief (Word/PDF)",
    prompt:
      "Create a downloadable Word and PDF project brief. Use a single # title and ## sections: " +
      "Background, Objectives, Scope, Stakeholders, Timeline, and Success Criteria. Include a " +
      "Timeline table with Milestone and Target Date columns. Use editable placeholder content.",
  },
  {
    id: "comparison-sheet",
    label: "Comparison sheet",
    icon: "📊",
    description: "CI vs CiA comparison (Excel)",
    prompt:
      "Create a downloadable spreadsheet comparing CI and CiA across key dimensions. Use a " +
      "markdown table with columns: Dimension, CI, CiA, Notes. Cover terminology, process, " +
      "search/reliability, and reporting. Fill it with accurate, concise content.",
  },
  {
    id: "risk-register",
    label: "Risk register",
    icon: "⚠️",
    description: "Risk register (Excel/Word)",
    prompt:
      "Create a downloadable risk register as a markdown table with columns: ID, Risk, Likelihood, " +
      "Impact, Mitigation, Owner. Include 6-8 realistic example rows for a CiA transition project " +
      "that I can edit.",
  },
  {
    id: "intake-form",
    label: "Intake form",
    icon: "📝",
    description: "Fillable request form (PDF form)",
    prompt:
      "Create a fillable intake/request form. Group fields under ## sections (Requester Details, " +
      "Request, Approval). Use \"Label:\" lines for text fields (e.g. \"Full Name:\", \"Email:\", " +
      "\"Department:\", \"Description:\") and \"- [ ] \" checkboxes for any options.",
  },
];
