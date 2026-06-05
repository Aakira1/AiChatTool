import { getLlmConfig } from "../config/env.js";
import { isCopilotStudioConfigured, streamCopilotStudioAgent } from "./copilotStudioService.js";
import { findSimilarCases } from "../db/repositories/caseRepo.js";
import { buildResponseArtifacts } from "./artifactService.js";
import { retrieveRelevantMemories, getPreferences } from "./memoryService.js";
import { buildSystemPrompt } from "./promptBuilder.js";
import { OpenAiCompatibleAdapter } from "./llm/openAiCompatibleAdapter.js";
import { buildAttachmentContext } from "../utils/documentText.js";
import { retrieveKnowledge } from "./ragService.js";
import { describePageScreenshot } from "./visionService.js";
import { searchConnectors, buildConnectorContext } from "./connectorService.js";
import { searchWeb, buildWebContext } from "./webSearchService.js";

const adapter = new OpenAiCompatibleAdapter(getLlmConfig());

/**
 * Maps the UI "reasoning" control to an explicit instruction appended to the
 * system prompt. Without this the selector has no effect on the model.
 */
const REASONING_DIRECTIVES = {
  auto: "",
  quick:
    "Response mode: QUICK. Answer concisely and directly. Lead with the answer, keep it short, " +
    "and skip extended step-by-step reasoning unless it is essential to be correct.",
  deep:
    "Response mode: THINK DEEPER. Reason carefully before answering. Work through the problem " +
    "methodically, consider edge cases and trade-offs, and give a well-structured, thorough response.",
  research:
    "Response mode: DEEP RESEARCH. Produce a comprehensive, report-style answer. Synthesise the " +
    "provided context, organise findings under clear headings, note which sources or cases support " +
    "each point, and finish with concrete, actionable recommendations.",
};

function reasoningDirective(reasoning) {
  return REASONING_DIRECTIVES[reasoning] ?? "";
}

/**
 * Tells the model how to emit a downloadable spreadsheet artifact. The client
 * detects the fenced ```spreadsheet block, strips it from the rendered text, and
 * renders a download card that builds the real .xlsx server-side from this spec.
 */
const FILE_GENERATION_DIRECTIVE = [
  "DOWNLOADABLE SPREADSHEETS: when the user asks for a spreadsheet, Excel file, or a",
  "downloadable table, reply in this exact structure and nothing else:",
  "1. One short sentence naming the file, e.g. \"Here's your **Report Management** spreadsheet:\".",
  "2. For EACH sheet, a level-3 markdown heading with the sheet name (e.g. `### Report List`),",
  "   immediately followed by a GitHub-flavoured markdown table (a header row, a `|---|` divider",
  "   row, then one row per record). Leave a blank line between sheets.",
  "Rules: do NOT print a separate \"Title:\" line, a \"Sheets:\" list, or any prose describing the",
  "structure — the heading + table IS the structure. Keep every table well-formed (each row has",
  "the same number of `|`-separated cells as the header). The app turns these tables into a real,",
  "downloadable .xlsx automatically, so you do not need to mention downloading.",
  "",
  "DOWNLOADABLE DOCUMENTS: when the user asks for a Word document, .docx, PDF, report,",
  "letter, or memo to download, make the VERY FIRST line of your reply exactly:",
  "document format=docx,pdf title=<Title>   — plain text only, with NO **bold**, backticks,",
  "or # heading around it (use format=docx or format=pdf for a single format). After that",
  "marker line, leave a blank line, then write the document in clean markdown: start with a",
  "single `# <Title>` heading, use `## ` for section headings, normal paragraphs, `- ` bullet",
  "lists, and | tables | for tabular data. Do not repeat the title as plain bold text, and do",
  "not restate 'Title:' or 'Sections:'. The app strips the marker, renders the markdown, and",
  "attaches a download button per format, so never describe downloading.",
  "",
  "For all other requests, answer normally with no tables or document block unless they genuinely help.",
].join(" ");

export async function prepareAssistantMessages({
  history,
  latestUserMessage,
  attachments = [],
  pageContext,
  conversationId,
  connectorSources = [],
  userEmail,
  reasoning = "auto",
  sources = {},
  signal,
}) {
  const memories = retrieveRelevantMemories(latestUserMessage, conversationId);
  const cases = findSimilarCases(latestUserMessage, { limit: 5 });
  // Company knowledge (RAG) is on by default; the Sources toggle can disable it.
  const knowledgeChunks =
    sources?.companyKnowledge === false ? [] : await retrieveKnowledge(latestUserMessage);
  // Web results are opt-in via the Sources toggle.
  const webResults = sources?.webSearch
    ? await searchWeb(latestUserMessage, { limit: 5, signal }).catch(() => [])
    : [];
  const webContext = buildWebContext(webResults);
  const { artifacts } = buildResponseArtifacts(latestUserMessage, { knowledgeChunks });
  const preferences = getPreferences(userEmail);
  // The full extracted text (up to 200K chars/file) is ingested into the vector
  // store for RAG, but the model context window is small (~8K tokens for Workers
  // AI Llama). Cap what we inline into the prompt so large docs don't overflow it
  // and trigger an upstream 500. Retrieval (knowledgeChunks) surfaces the rest.
  const MAX_INLINE_ATTACHMENT_CHARS = 16_000;
  const fullAttachmentContext = buildAttachmentContext(attachments);
  const attachmentContext =
    fullAttachmentContext.length > MAX_INLINE_ATTACHMENT_CHARS
      ? `${fullAttachmentContext.slice(0, MAX_INLINE_ATTACHMENT_CHARS)}\n\n[Document(s) truncated for length — full content is searchable via retrieval. Ask about specific sections for more detail.]`
      : fullAttachmentContext;

  const connectorGroups =
    connectorSources.length > 0 && userEmail
      ? await searchConnectors(connectorSources, userEmail, latestUserMessage, { signal })
      : [];
  const connectorContext = buildConnectorContext(connectorGroups);

  let enrichedPageContext = pageContext;
  if (pageContext?.screenshot) {
    const visualDescription = await describePageScreenshot(pageContext.screenshot, {
      url: pageContext.url,
      title: pageContext.title,
    });
    enrichedPageContext = {
      ...pageContext,
      visualDescription: visualDescription ?? undefined,
      screenshot: undefined,
    };
  }

  const artifactSummary = {
    intent: artifacts.intent,
    comparison: artifacts.comparison,
    caseLinkCount: artifacts.caseLinks?.length ?? 0,
    chartCount: artifacts.metricsCharts?.length ?? 0,
  };

  // Only feed the analytics "review hints" to the model when the user actually
  // asked for metrics/comparisons/charts — otherwise the model tends to append
  // unsolicited "Imported Case Metrics / Chart Count" sections to every answer.
  const wantsAnalytics =
    /\b(metric|metrics|kpi|kpis|chart|charts|compare|comparison|reliabilit|backlog|statistic|stats|dashboard|how many|open cases|hot topics|analy)/i.test(
      latestUserMessage ?? "",
    );
  const reviewHints = wantsAnalytics
    ? `\n\nStructured review hints for this answer (expand in the response when relevant):\n${JSON.stringify(artifactSummary)}`
    : "";

  // The file-generation directive is placed FIRST so it survives the Copilot
  // Studio path, which truncates the system prompt to its first 4000 chars.
  const systemPrompt = `${FILE_GENERATION_DIRECTIVE}

${buildSystemPrompt({
    preferences,
    pageContext: enrichedPageContext,
    memories,
    cases,
    attachments,
    knowledgeChunks,
  })}${webContext ? `\n\n${webContext}` : ""}${connectorContext ? `\n\n${connectorContext}` : ""}${
    reasoningDirective(reasoning) ? `\n\n${reasoningDirective(reasoning)}` : ""
  }${reviewHints}`;

  const userContent = attachmentContext
    ? `${latestUserMessage}\n\n${attachmentContext}\n\nAnalyze the attached document(s) and relate findings to Ci/CiA transition context when relevant.`
    : latestUserMessage;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map(({ role, content }) => ({ role, content })),
    { role: "user", content: userContent },
  ];

  return { messages, knowledgeChunks, artifacts };
}

export async function* streamFromMessages({ messages, signal, aiProvider = "default" }) {
  if (aiProvider === "copilot-studio") {
    const latestUser = [...messages].reverse().find((entry) => entry.role === "user");
    const system = messages.find((entry) => entry.role === "system");
    const userText = latestUser?.content ?? "";
    const contextPrefix = system?.content
      ? `[Context from CiA Transition Assistant — use if helpful, otherwise answer as your Copilot Studio agent.]\n${system.content.slice(0, 4000)}\n\n---\n\nUser: `
      : "";
    yield* streamCopilotStudioAgent(`${contextPrefix}${userText}`, { signal });
    return;
  }

  yield* adapter.streamGenerate({ messages, signal });
}

export function resolveAiProvider(requested) {
  if (requested === "copilot-studio" && isCopilotStudioConfigured()) {
    return "copilot-studio";
  }
  if (requested === "copilot-studio" && !isCopilotStudioConfigured()) {
    throw new Error(
      "Copilot Studio agent was requested but the server is not configured. Add COPILOT_STUDIO_ENABLED=true and COPILOT_STUDIO_DIRECT_LINE_SECRET to server/.env.",
    );
  }
  return "default";
}

export async function* streamAssistantReply(options) {
  const { messages } = await prepareAssistantMessages(options);
  yield* streamFromMessages({ messages, signal: options.signal });
}
