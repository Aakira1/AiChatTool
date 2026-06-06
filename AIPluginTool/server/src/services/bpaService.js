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

/**
 * Suggest task/decision names and decision items for a BPA process. Returns
 * JSON { taskNames: [...], decisions: [{ name, items: [...] }] } — parsed
 * leniently so a weak model's stray prose doesn't break it.
 */
export async function assistBpa({ prompt, tasks = [], decisions = [], signal }) {
  const context =
    `Existing tasks: ${tasks.join(", ") || "(none)"}\n` +
    `Existing decision labels: ${decisions.join(", ") || "(none)"}`;

  const messages = [
    {
      role: "system",
      content:
        "You design TechnologyOne BPA (business process automation) flows. A process is a list of " +
        "TASKS in order (clear verb phrases like 'Review Certificate', 'Approve Request'), and each " +
        "task has DECISION ITEMS — short outcome labels that branch the flow (1-3 words, e.g. " +
        "'Approve', 'Reject', 'Revise', 'Completed'). Respond with ONLY valid JSON (no prose, no code " +
        'fences) of the shape {"tasks":[{"name":"string","items":["string",...]},...]}. Order tasks ' +
        "logically; give each task the decisions that move it forward.",
    },
    {
      role: "user",
      content: `${context}\n\nRequest: ${prompt}\n\nReturn the JSON.`,
    },
  ];

  const raw = await collectStream(messages, signal);
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return { tasks: [], raw };
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.slice(0, 40).map((t) => ({
          name: String(t.name ?? "").slice(0, 120),
          items: Array.isArray(t.items) ? t.items.slice(0, 20).map((i) => String(i).slice(0, 80)) : [],
        }))
      : [];
    return { tasks: tasks.filter((t) => t.name) };
  } catch {
    return { tasks: [], raw };
  }
}
