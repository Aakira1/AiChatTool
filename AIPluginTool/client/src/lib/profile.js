const DEFAULT_PROFILE = {
  profile_name: "Ayden Beggs",
  profile_email: "ayden.beggs@technologyone.com",
  profile_role: "Transition Analyst",
  profile_team: "Ci → CiA Transition Program",
  profile_environment: "demo",
  notifications_enabled: "true",
  response_style: "concise and practical",
  tone: "friendly and direct",
  format: "use bullet points when listing steps",
};

export function getInitials(name) {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return "AB";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function normalizeProfile(raw = {}) {
  return { ...DEFAULT_PROFILE, ...raw };
}

export function environmentLabel(value) {
  const labels = {
    demo: "Demo",
    uat: "UAT",
    production: "Production",
  };
  return labels[value] ?? value;
}
