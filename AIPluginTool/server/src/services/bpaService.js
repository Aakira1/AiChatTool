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
        "You help design TechnologyOne BPA (business process automation) flows. A process has " +
        "TASKS (e.g. 'Review Certificate', 'Approve Request') and DECISIONS/branches on each task " +
        "(short labels like 'Approve', 'Reject', 'Revise', 'Completed'). Respond with ONLY valid " +
        'JSON (no prose, no code fences) of the shape {"taskNames":["string",...],' +
        '"decisions":[{"name":"string","items":["string",...]}]}. Task names are clear verb phrases; ' +
        "decision items are short outcome labels (1-3 words).",
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
  if (start === -1 || end === -1) {
    return { taskNames: [], decisions: [], raw };
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return {
      taskNames: Array.isArray(parsed.taskNames) ? parsed.taskNames.slice(0, 30) : [],
      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions.slice(0, 30).map((d) => ({
            name: String(d.name ?? "").slice(0, 120),
            items: Array.isArray(d.items) ? d.items.slice(0, 20).map((i) => String(i).slice(0, 80)) : [],
          }))
        : [],
    };
  } catch {
    return { taskNames: [], decisions: [], raw };
  }
}
