export const terminologyMappings = [
  {
    ciTerm: "Rate Qualifier",
    ciaTerm: "Levy",
    notes: [
      "Levies are configured at the Charge Group level",
      "Multiple levies can stack on a single property",
      "See the Charge Configuration guide for setup steps",
    ],
    sources: [
      { title: "CiA Charge Configuration Guide", meta: "Docs • Updated recently" },
      { title: "Ci → CiA Migration Glossary", meta: "Internal KB • v2.4" },
      { title: "Levy Setup Walkthrough", meta: "Demo Video • 4:32" },
    ],
  },
  {
    ciTerm: "Charge Group",
    ciaTerm: "Charge Package",
    notes: [
      "Charge packages group related levies and controls",
      "Migration requires mapping legacy group codes",
    ],
    sources: [
      { title: "Charge Package Mapping Sheet", meta: "Internal KB" },
      { title: "CiA Billing Controls Overview", meta: "Docs" },
    ],
  },
  {
    ciTerm: "Property Type",
    ciaTerm: "Asset Classification",
    notes: [
      "Asset classification drives levy eligibility",
      "Validate lookup tables before transition",
    ],
    sources: [
      { title: "Property Type Mapping Reference", meta: "Docs • CiA 2025.2" },
    ],
  },
  {
    ciTerm: "CDD Template",
    ciaTerm: "Transition Design Pack",
    notes: [
      "Council policy packs attach to the design pack workflow",
      "Sign-off requires levy mapping completeness",
    ],
    sources: [{ title: "CDD Transition Checklist", meta: "Internal KB" }],
  },
  {
    ciTerm: "Valuation Import",
    ciaTerm: "Asset Valuation Feed",
    notes: [
      "Feed schedules differ between Ci batch and CiA API imports",
      "Validate control totals after each load",
    ],
    sources: [{ title: "Valuation Feed Runbook", meta: "Ops Guide" }],
  },
];

export function findTerminologyMapping(query) {
  const lower = query.toLowerCase();
  return terminologyMappings.find(
    (entry) =>
      lower.includes(entry.ciTerm.toLowerCase()) ||
      lower.includes(entry.ciaTerm.toLowerCase()) ||
      lower.includes("rate qualifier") ||
      lower.includes("equivalent"),
  );
}
