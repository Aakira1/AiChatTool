import { findSimilarExchanges, getUserPreferences } from "../db/repositories/conversationRepo.js";

export function retrieveRelevantMemories(query, excludeConversationId) {
  return findSimilarExchanges(query, {
    limit: 3,
    excludeConversationId,
  });
}

export function getPreferences() {
  return getUserPreferences();
}
