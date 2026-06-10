import { getLlmConfig } from "../config/env.js";
import { OpenAiCompatibleAdapter } from "./llm/openAiCompatibleAdapter.js";

const adapter = new OpenAiCompatibleAdapter(getLlmConfig());

async function collectStream(messages, signal) {
  let text = "";
  for await (const token of adapter.streamGenerate({ messages, signal })) {
    text += token;
  }
  return text.trim();
}

function parseJsonLoose(raw) {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Controller for an agentic conversation with an on-page AI (e.g. Rovo).
 * Given the user's goal and the exchange so far, decide the next step: either
 * ask the page AI another question, or finish with a synthesized answer.
 *
 * transcript: [{ from: "agent" | "rovo", text }]
 * returns: { action: "ask", message } | { action: "done", final }
 */
export async function planRelayStep({
  goal,
  transcript = [],
  turn = 1,
  maxTurns = 4,
  partnerName = "the page AI",
  signal,
}) {
  const lastTurn = turn >= maxTurns;

  const convo = transcript
    .map((t) => `${t.from === "rovo" ? partnerName : "You (asked)"}: ${t.text}`)
    .join("\n\n");

  const system = [
    `You are an orchestration agent. Your job is to achieve the user's GOAL by consulting`,
    `${partnerName}, which is another AI that has live access to the user's systems (e.g.`,
    `Jira/Confluence). You cannot access those systems yourself — you ask ${partnerName}, read its`,
    `answer, and decide the next move.`,
    ``,
    `How to converse — talk to ${partnerName} like a colleague, naturally, one question at a time:`,
    `- Turn 1: ask ONE clear, conversational question that covers the whole goal (a short paragraph,`,
    `  written the way a person would ask — not a list of demands). ${partnerName} only sees the`,
    `  message you send, so include the context it needs.`,
    `- READ ITS ANSWER THOROUGHLY before deciding anything. Quote it to yourself: what did it actually`,
    `  say? What is missing, vague, or possibly wrong relative to the goal?`,
    `- If you are not satisfied, go back to it naturally — e.g. "Thanks — you mentioned X, but I'm`,
    `  still unclear on Y. Could you confirm whether …?" Push back politely on anything that seems`,
    `  wrong. One focused follow-up per turn.`,
    `- Keep this back-and-forth going until you BOTH agree: i.e. ${partnerName} has confirmed the key`,
    `  facts and nothing needed for the goal is missing or contradictory. When validating, ask for`,
    `  explicit confirmation ("So to confirm, X works like Y — is that right?").`,
    `- Never re-ask something it already answered clearly, and never wander to a new topic.`,
    `- This is turn ${turn} of at most ${maxTurns}.`,
    lastTurn ? `- This is the LAST turn: you MUST finish now with action "done".` : ``,
    ``,
    `When you finish ("done"), write the final answer for the USER (not for ${partnerName}):`,
    `start with a short "**Conclusion:** …" paragraph giving the agreed answer in plain language,`,
    `then the supporting details/steps drawn from what ${partnerName} confirmed. If you had to stop`,
    `before full agreement, say plainly which points remain unconfirmed.`,
    ``,
    `Respond with ONLY valid JSON (no prose, no code fences), one of:`,
    `{"action":"ask","message":"<your next conversational message to ${partnerName}>"}`,
    `{"action":"done","final":"<Conclusion + supporting details for the user>"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `GOAL: ${goal}`,
    ``,
    transcript.length ? `Conversation so far:\n${convo}` : `No messages exchanged yet.`,
    ``,
    `Decide the next step and return the JSON.`,
  ].join("\n");

  const raw = await collectStream(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    signal,
  );

  const parsed = parseJsonLoose(raw);
  // If we can't parse, or it's the last turn but the model still wants to ask,
  // DON'T leak raw JSON — signal the caller to run a dedicated conclusion pass.
  if (!parsed || (parsed.action !== "ask" && parsed.action !== "done")) {
    return { action: "done", final: "", needsConclusion: true };
  }
  if (parsed.action === "ask") {
    const message = String(parsed.message ?? "").trim().slice(0, 2000);
    if (!message || lastTurn) {
      return { action: "done", final: "", needsConclusion: true };
    }
    return { action: "ask", message };
  }
  const final = String(parsed.final ?? "").trim();
  if (!final || /^\{?\s*"?action"?\s*:/.test(final)) {
    return { action: "done", final: "", needsConclusion: true };
  }
  return { action: "done", final: final.slice(0, 8000) };
}

/**
 * Final pass: write the user-facing CONCLUSION from the whole exchange. Always
 * returns clean prose (never JSON, never another question to the partner).
 */
export async function concludeRelay({ goal, transcript = [], partnerName = "the page AI", signal }) {
  const convo = transcript
    .map((t) => `${t.from === "rovo" ? partnerName : "You asked"}: ${t.text}`)
    .join("\n\n");

  const system = [
    `You are summarising a conversation an agent had with ${partnerName} to answer a user's GOAL.`,
    `Write the final answer FOR THE USER — clear, well-organised prose. Do NOT output JSON, do NOT`,
    `address ${partnerName}, do NOT ask any more questions.`,
    `Format:`,
    `- Start with "**Conclusion:** " and a 1–3 sentence direct answer to the goal in plain language.`,
    `- Then "**Details:**" with the supporting steps/facts that ${partnerName} actually confirmed`,
    `  (use short markdown bullets or a small table where it helps).`,
    `- If anything needed for the goal was NOT confirmed or is uncertain, add "**Still unclear:**" and`,
    `  list it briefly. Never invent facts that ${partnerName} did not provide.`,
  ].join("\n");

  const user = [
    `GOAL: ${goal}`,
    ``,
    transcript.length ? `Conversation:\n${convo}` : `No usable answers were obtained.`,
    ``,
    `Write the final Conclusion + Details for the user now.`,
  ].join("\n");

  const out = await collectStream(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    signal,
  );
  const text = out.replace(/^```(?:markdown)?/i, "").replace(/```$/, "").trim();
  return text.slice(0, 8000) || "I couldn't reach a clear conclusion from the conversation.";
}
