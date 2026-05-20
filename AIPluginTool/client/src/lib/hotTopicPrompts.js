const ICONS = ["🔥", "🔍", "📊", "📋", "⚡"];

/** Shown before any CI/CIA CSV data is imported */
export const DEFAULT_HOT_TOPIC_PROMPTS = [
  {
    term: "rate qualifier",
    label: "🔄 Ci → CiA: Rate Qualifier",
    text: "What's the CiA equivalent of a Rate Qualifier?",
    sources: ["import"],
  },
  {
    term: "cdd draft",
    label: "📋 Start a CDD draft",
    text: "Help me start a CDD draft for a new council transition.",
    sources: ["import"],
  },
  {
    term: "similar cases",
    label: "🔍 Find similar cases",
    text: "Find similar cases for billing issue transitions.",
    sources: ["chat"],
  },
  {
    term: "ci vs cia metrics",
    label: "📊 Compare CI vs CIA metrics",
    text: "Show CI vs CIA open cases and search reliability comparison.",
    sources: ["import"],
  },
  {
    term: "charge controls",
    label: "⚡ Validate charge controls",
    text: "Run a charge control validation against my source environment.",
    sources: ["import"],
  },
];

function titleCase(term) {
  return term
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function sourceBadge(sources = []) {
  if (sources.includes("chat") && sources.includes("import")) {
    return "↗";
  }
  if (sources.includes("chat")) {
    return "💬";
  }
  if (sources.includes("import")) {
    return "📊";
  }
  return "";
}

function buildPromptText(term) {
  const lower = term.toLowerCase();

  if (lower.includes("rate") || lower.includes("levy") || lower.includes("qualifier")) {
    return `What's the CiA equivalent of "${term}"? Show matching CI/CIA cases and terminology.`;
  }
  if (lower.includes("cdd")) {
    return `Help me with "${term}" using patterns from imported CI/CIA transition cases.`;
  }
  if (lower.includes("charge control")) {
    return `Run a charge control review for "${term}" using stored CI/CIA case outcomes.`;
  }
  if (lower.includes("similar") || lower.includes("find")) {
    return `Find similar cases related to "${term}" in the imported CI/CIA dataset.`;
  }
  if (lower.includes("compare") || lower.includes("metric") || lower.includes("reliability")) {
    return `Compare CI vs CIA metrics for "${term}" — open cases, reliability, and trends.`;
  }
  if (lower.includes("billing") || lower.includes("invoice") || lower.includes("refund")) {
    return `Summarize "${term}" cases: likely resolutions and CI vs CIA differences.`;
  }

  return `What do imported CI/CIA cases and recent chats show for "${term}"?`;
}

function truncate(term, max = 28) {
  if (term.length <= max) {
    return titleCase(term);
  }
  return `${titleCase(term.slice(0, max - 1))}…`;
}

/**
 * @param {{ term: string, count: number, sources?: string[] }[]} hotTopics
 * @returns {{ term: string, label: string, text: string, sources: string[] }[]}
 */
export function buildPromptsFromHotTopics(hotTopics = []) {
  if (!hotTopics.length) {
    return DEFAULT_HOT_TOPIC_PROMPTS;
  }

  return hotTopics.slice(0, 5).map((topic, index) => {
    const sources = topic.sources ?? (topic.source ? [topic.source] : []);
    const badge = sourceBadge(sources);
    return {
      term: topic.term,
      sources,
      label: `${ICONS[index % ICONS.length]}${badge ? ` ${badge}` : ""} ${truncate(topic.term)} (${topic.count})`,
      text: buildPromptText(topic.term),
    };
  });
}
