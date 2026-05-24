import { getLlmConfig } from "../config/env.js";
import { findSimilarCases } from "../db/repositories/caseRepo.js";
import { buildResponseArtifacts } from "./artifactService.js";
import { retrieveRelevantMemories, getPreferences } from "./memoryService.js";
import { buildSystemPrompt } from "./promptBuilder.js";
import { OpenAiCompatibleAdapter } from "./llm/openAiCompatibleAdapter.js";
import { buildAttachmentContext } from "../utils/documentText.js";
import { retrieveKnowledge } from "./ragService.js";
import { describePageScreenshot } from "./visionService.js";

const adapter = new OpenAiCompatibleAdapter(getLlmConfig());

export async function prepareAssistantMessages({
  history,
  latestUserMessage,
  attachments = [],
  pageContext,
  conversationId,
}) {
  const memories = retrieveRelevantMemories(latestUserMessage, conversationId);
  const cases = findSimilarCases(latestUserMessage, { limit: 5 });
  const knowledgeChunks = await retrieveKnowledge(latestUserMessage);
  const { artifacts } = buildResponseArtifacts(latestUserMessage, { knowledgeChunks });
  const preferences = getPreferences();
  const attachmentContext = buildAttachmentContext(attachments);

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
  })}

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

export async function* streamFromMessages({ messages, signal }) {
  yield* adapter.streamGenerate({ messages, signal });
}

export async function* streamAssistantReply(options) {
  const { messages } = await prepareAssistantMessages(options);
  yield* streamFromMessages({ messages, signal: options.signal });
}
