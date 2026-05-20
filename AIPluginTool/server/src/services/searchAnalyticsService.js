import { listRecentUserMessages } from "../db/repositories/conversationRepo.js";
import { extractKeywordTerms, extractSearchPhrase } from "../utils/searchPhrase.js";

export function buildChatHotTopics(limit = 8) {
  const messages = listRecentUserMessages(300);
  const counts = {};

  for (const message of messages) {
    const phrase =
      message.searchPhrase?.trim().toLowerCase() ||
      extractSearchPhrase(message.content) ||
      null;

    if (phrase) {
      counts[phrase] = (counts[phrase] ?? 0) + 1;
      continue;
    }

    for (const term of extractKeywordTerms(message.content, 2)) {
      counts[term] = (counts[term] ?? 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([term, count]) => ({ term, count, source: "chat" }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function mergeHotTopics(csvTopics = [], chatTopics = [], limit = 8) {
  const merged = new Map();

  for (const topic of csvTopics) {
    const key = topic.term.trim().toLowerCase();
    if (!key) {
      continue;
    }
    const existing = merged.get(key);
    merged.set(key, {
      term: topic.term,
      count: (existing?.count ?? 0) + topic.count,
      sources: [...new Set([...(existing?.sources ?? []), "import"])],
    });
  }

  for (const topic of chatTopics) {
    const key = topic.term.trim().toLowerCase();
    if (!key) {
      continue;
    }
    const existing = merged.get(key);
    merged.set(key, {
      term: existing?.term ?? topic.term,
      count: (existing?.count ?? 0) + topic.count,
      sources: [...new Set([...(existing?.sources ?? []), "chat"])],
    });
  }

  return [...merged.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
