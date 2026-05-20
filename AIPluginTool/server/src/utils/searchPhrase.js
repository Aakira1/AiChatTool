const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "to",
  "of",
  "in",
  "on",
  "is",
  "are",
  "was",
  "were",
  "be",
  "can",
  "you",
  "me",
  "my",
  "i",
  "we",
  "it",
  "this",
  "that",
  "with",
  "from",
  "about",
  "what",
  "how",
  "why",
  "when",
  "where",
  "which",
  "do",
  "does",
  "did",
  "please",
  "show",
  "tell",
  "help",
  "find",
  "give",
  "using",
  "use",
  "vs",
  "cia",
  "ci",
]);

export function extractSearchPhrase(message) {
  if (!message || typeof message !== "string") {
    return null;
  }

  let cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length < 4) {
    return null;
  }

  const quoted = cleaned.match(/"([^"]{3,80})"/)?.[1];
  if (quoted) {
    return quoted.trim().toLowerCase();
  }

  cleaned = cleaned
    .replace(
      /^(what('s| is) the|how do i|can you|please|show me|tell me about|help me with|summarize|compare|find)\s+/i,
      "",
    )
    .replace(/\?+$/g, "")
    .trim();

  const firstSentence = cleaned.split(/[.!?\n]/)[0]?.trim() ?? cleaned;
  const phrase = firstSentence.length > 72 ? firstSentence.slice(0, 72).trim() : firstSentence;

  if (phrase.length < 4) {
    return null;
  }

  return phrase.toLowerCase();
}

export function extractKeywordTerms(message, limit = 3) {
  const words = (message ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  const counts = {};
  for (const word of words) {
    counts[word] = (counts[word] ?? 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}
