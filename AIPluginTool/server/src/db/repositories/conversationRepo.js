import crypto from "node:crypto";
import { db } from "../client.js";

const selectConversations = db.prepare(`
  SELECT id, title, created_at AS createdAt, pinned, archived
  FROM conversations
  WHERE archived = 0
  ORDER BY pinned DESC, created_at DESC
`);

const selectArchivedConversations = db.prepare(`
  SELECT id, title, created_at AS createdAt, pinned, archived
  FROM conversations
  WHERE archived = 1
  ORDER BY created_at DESC
`);

const selectAllConversations = db.prepare(`
  SELECT id, title, created_at AS createdAt, pinned, archived
  FROM conversations
  ORDER BY pinned DESC, created_at DESC
`);

const insertConversation = db.prepare(`
  INSERT INTO conversations (id, title)
  VALUES (?, ?)
`);

const selectConversation = db.prepare(`
  SELECT id, title, created_at AS createdAt, pinned, archived
  FROM conversations
  WHERE id = ?
`);

const updateConversationTitle = db.prepare(`
  UPDATE conversations SET title = ? WHERE id = ?
`);

const updateConversationFlags = db.prepare(`
  UPDATE conversations SET pinned = ?, archived = ? WHERE id = ?
`);

const deleteMessageByIdStmt = db.prepare(`DELETE FROM messages WHERE id = ?`);

const deleteMessagesAfterStmt = db.prepare(`
  DELETE FROM messages
  WHERE conversation_id = ?
    AND created_at > (SELECT created_at FROM messages WHERE id = ?)
`);

const deleteMessagesByConversation = db.prepare(`
  DELETE FROM messages WHERE conversation_id = ?
`);

const deleteConversationById = db.prepare(`
  DELETE FROM conversations WHERE id = ?
`);

const selectMessages = db.prepare(`
  SELECT
    id,
    conversation_id AS conversationId,
    role,
    content,
    metadata,
    created_at AS createdAt
  FROM messages
  WHERE conversation_id = ?
  ORDER BY created_at ASC
`);

const selectMessageById = db.prepare(`
  SELECT
    id,
    conversation_id AS conversationId,
    role,
    content,
    metadata,
    created_at AS createdAt
  FROM messages
  WHERE id = ?
`);

const insertMessageStatement = db.prepare(`
  INSERT INTO messages (id, conversation_id, role, content, metadata)
  VALUES (?, ?, ?, ?, ?)
`);

const updateMessageMetadata = db.prepare(`
  UPDATE messages SET metadata = ? WHERE id = ?
`);

const updateMessageContent = db.prepare(`
  UPDATE messages SET content = ? WHERE id = ?
`);

const selectPastUserMessages = db.prepare(`
  SELECT
    m.id,
    m.conversation_id AS conversationId,
    m.content,
    m.metadata,
    m.created_at AS createdAt,
    (
      SELECT a.content
      FROM messages a
      WHERE a.conversation_id = m.conversation_id
        AND a.role = 'assistant'
        AND a.created_at > m.created_at
      ORDER BY a.created_at ASC
      LIMIT 1
    ) AS assistantReply
  FROM messages m
  WHERE m.role = 'user'
  ORDER BY m.created_at DESC
  LIMIT 200
`);

const selectPreferences = db.prepare(`
  SELECT key, value FROM user_preferences
`);

function parseMetadata(raw) {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function serializeMetadata(metadata) {
  return metadata ? JSON.stringify(metadata) : null;
}

function mapConversation(row) {
  return {
    ...row,
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
  };
}

export function listConversationSummaries({ includeArchived = false } = {}) {
  if (includeArchived) {
    return selectAllConversations.all().map(mapConversation);
  }
  return selectConversations.all().map(mapConversation);
}

export function listArchivedConversationSummaries() {
  return selectArchivedConversations.all().map(mapConversation);
}

export function createConversation(title) {
  const conversation = { id: crypto.randomUUID(), title };
  insertConversation.run(conversation.id, conversation.title);
  return mapConversation(selectConversation.get(conversation.id));
}

export function getConversationById(id) {
  const conversation = selectConversation.get(id);
  if (!conversation) {
    return null;
  }

  const messages = selectMessages.all(id).map((message) => ({
    ...message,
    metadata: parseMetadata(message.metadata),
  }));

  return {
    ...mapConversation(conversation),
    messages,
  };
}

export function insertMessage({ conversationId, role, content, metadata = null }) {
  const message = {
    id: crypto.randomUUID(),
    conversationId,
    role,
    content,
    metadata: serializeMetadata(metadata),
  };
  insertMessageStatement.run(
    message.id,
    message.conversationId,
    message.role,
    message.content,
    message.metadata,
  );
  return {
    ...message,
    metadata,
  };
}

export function setConversationTitle(conversationId, title) {
  updateConversationTitle.run(title.slice(0, 100), conversationId);
  return mapConversation(selectConversation.get(conversationId));
}

export function updateConversation(conversationId, { title, pinned, archived } = {}) {
  const current = selectConversation.get(conversationId);
  if (!current) {
    return null;
  }

  if (title !== undefined) {
    updateConversationTitle.run(title.slice(0, 100), conversationId);
  }

  if (pinned !== undefined || archived !== undefined) {
    const nextPinned = pinned !== undefined ? (pinned ? 1 : 0) : current.pinned;
    const nextArchived = archived !== undefined ? (archived ? 1 : 0) : current.archived;
    updateConversationFlags.run(nextPinned, nextArchived, conversationId);
  }

  return mapConversation(selectConversation.get(conversationId));
}

export function deleteMessageById(messageId) {
  deleteMessageByIdStmt.run(messageId);
}

export function deleteMessagesAfter(conversationId, messageId) {
  deleteMessagesAfterStmt.run(conversationId, messageId);
}

export function getLastUserMessage(conversationId) {
  const messages = selectMessages.all(conversationId);
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser) {
    return null;
  }
  return {
    ...lastUser,
    metadata: parseMetadata(lastUser.metadata),
  };
}

export function deleteConversation(conversationId) {
  const conversation = selectConversation.get(conversationId);
  if (!conversation) {
    return false;
  }

  deleteMessagesByConversation.run(conversationId);
  deleteConversationById.run(conversationId);
  return true;
}

export function updateUserMessageContent(messageId, content) {
  updateMessageContent.run(content.slice(0, 12_000), messageId);
  return getMessageById(messageId);
}

export function getMessageById(messageId) {
  const message = selectMessageById.get(messageId);
  if (!message) {
    return null;
  }
  return {
    ...message,
    metadata: parseMetadata(message.metadata),
  };
}

export function setMessageFeedback(messageId, rating) {
  const message = getMessageById(messageId);
  if (!message) {
    return null;
  }

  const metadata = {
    ...(message.metadata ?? {}),
    feedback: rating,
    feedbackAt: new Date().toISOString(),
  };
  updateMessageMetadata.run(serializeMetadata(metadata), messageId);
  return getMessageById(messageId);
}

const upsertPreference = db.prepare(`
  INSERT INTO user_preferences (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

export function getUserPreferences() {
  return Object.fromEntries(
    selectPreferences.all().map(({ key, value }) => [key, value]),
  );
}

export function updateUserPreferences(updates) {
  db.exec("BEGIN");
  try {
    for (const [key, value] of Object.entries(updates)) {
      upsertPreference.run(key, value);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getUserPreferences();
}

export function listRecentUserMessages() {
  return selectPastUserMessages.all().map((row) => {
    const metadata = parseMetadata(row.metadata);
    return {
      content: row.content,
      searchPhrase: metadata?.searchPhrase ?? null,
      createdAt: row.createdAt,
    };
  });
}

export function findSimilarExchanges(query, { limit = 3, excludeConversationId = null } = {}) {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length > 2);

  if (terms.length === 0) {
    return [];
  }

  const candidates = selectPastUserMessages.all();
  const scored = [];

  for (const candidate of candidates) {
    if (!candidate.assistantReply) {
      continue;
    }
    if (excludeConversationId && candidate.conversationId === excludeConversationId) {
      continue;
    }

    const haystack = `${candidate.content} ${candidate.assistantReply}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) {
        score += 1;
      }
    }
    if (score === 0) {
      continue;
    }

    const metadata = parseMetadata(candidate.metadata);
    if (metadata?.feedback === "up") {
      score += 2;
    } else if (metadata?.feedback === "down") {
      score -= 2;
    }

    scored.push({
      question: candidate.content,
      answer: candidate.assistantReply,
      score,
      pageUrl: metadata?.pageContext?.url ?? null,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
