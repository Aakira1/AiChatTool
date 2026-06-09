import { env } from "../config/env.js";

const DEFAULT_VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";
const MAX_SCREENSHOT_BYTES = 400_000;
const MAX_IMAGE_BYTES = 1_500_000;

export function isVisionConfigured() {
  return Boolean(env.cloudflareAccountId && env.cloudflareApiToken);
}

function stripDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:image\/\w+;base64,(.+)$/);
  return match ? match[1] : String(dataUrl);
}

function bytesFromBase64(base64) {
  return Buffer.byteLength(base64, "base64");
}

// Workers AI image-to-text models expect `image` as an array of byte values
// (0-255), not a base64 string.
function imageByteArray(base64) {
  return Array.from(Buffer.from(base64, "base64"));
}

/**
 * Describe a visible-tab screenshot using Workers AI vision (LLaVA).
 * Returns null if vision is unavailable or the image is too large.
 */
export async function describePageScreenshot(screenshotDataUrl, { url, title } = {}) {
  if (!screenshotDataUrl || !isVisionConfigured()) {
    return null;
  }

  const base64 = stripDataUrl(screenshotDataUrl);
  if (bytesFromBase64(base64) > MAX_SCREENSHOT_BYTES) {
    console.warn("[CiA] Screenshot too large for vision model; skipping image description.");
    return null;
  }

  const model = process.env.CLOUDFLARE_VISION_MODEL ?? DEFAULT_VISION_MODEL;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}/ai/run/${model}`;

  const prompt = [
    "You are helping a Ci to CiA transition assistant understand what the user is looking at in their browser.",
    `Page title: ${title || "Unknown"}`,
    `Page URL: ${url || "Unknown"}`,
    "Describe the visible page layout, headings, forms, tables, buttons, and any Ci/CiA or ERP-related content.",
    "Be concise (under 200 words). Mention specific labels or data the user might ask about.",
  ].join("\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.cloudflareApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image: imageByteArray(base64),
      prompt,
      max_tokens: 512,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    const message = payload.errors?.[0]?.message ?? `Vision request failed (${response.status})`;
    console.warn("[CiA] Vision describe failed:", message);
    return null;
  }

  const description =
    payload.result?.description ??
    payload.result?.response ??
    (typeof payload.result === "string" ? payload.result : null);

  return description ? String(description).trim().slice(0, 4000) : null;
}

/**
 * Describe / read a user-attached image with Workers AI vision (LLaVA). Returns
 * a detailed text description (incl. transcribed text) or null if unavailable.
 */
export async function describeImage(imageBase64, { name, userPrompt } = {}) {
  if (!imageBase64 || !isVisionConfigured()) {
    return null;
  }
  const base64 = stripDataUrl(imageBase64);
  if (bytesFromBase64(base64) > MAX_IMAGE_BYTES) {
    console.warn("[CiA] Attached image too large for vision model; skipping.");
    return null;
  }

  const model = process.env.CLOUDFLARE_VISION_MODEL ?? DEFAULT_VISION_MODEL;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}/ai/run/${model}`;

  const prompt = [
    "You are reading an image a user attached in a chat with an assistant.",
    name ? `Image file name: ${name}` : "",
    userPrompt ? `The user's message: "${String(userPrompt).slice(0, 400)}"` : "",
    "Describe the image thoroughly. Transcribe ALL visible text, numbers, table data,",
    "labels, form fields, diagrams, charts and UI elements accurately. If it is a",
    "screenshot or document, capture the structure and key values. Be detailed.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.cloudflareApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: imageByteArray(base64), prompt, max_tokens: 1024 }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      const message = payload.errors?.[0]?.message ?? `Vision request failed (${response.status})`;
      console.warn(`[CiA] Image describe failed (${response.status}) for ${name}:`, message);
      return null;
    }
    const description =
      payload.result?.description ??
      payload.result?.response ??
      (typeof payload.result === "string" ? payload.result : null);
    return description ? String(description).trim().slice(0, 6000) : null;
  } catch (error) {
    console.warn("[CiA] Image describe error:", error.message);
    return null;
  }
}
