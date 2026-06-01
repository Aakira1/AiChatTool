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

const adapter = new OpenAiCompatibleAdapter(getLlmConfig());

export async function prepareAssistantMessages({
  history,
  latestUserMessage,
  attachments = [],
  pageContext,
  conversationId,
  connectorSources = [],
  userEmail,
  signal,
}) {
  const memories = retrieveRelevantMemories(latestUserMessage, conversationId);
  const cases = findSimilarCases(latestUserMessage, { limit: 5 });
  const knowledgeChunks = await retrieveKnowledge(latestUserMessage);
  const { artifacts } = buildResponseArtifacts(latestUserMessage, { knowledgeChunks });
  const preferences = getPreferences();
  const attachmentContext = buildAttachmentContext(attachments);

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

  const systemPrompt = `${buildSystemPrompt({
    preferences,
    pageContext: enrichedPageContext,
    memories,
    cases,
    attachments,
    knowledgeChunks,
  })}${connectorContext ? `\n\n${connectorContext}` : ""}

Structured review hints for this answer (expand in the response when relevant):
${JSON.stringify(artifactSummary)}`;

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
