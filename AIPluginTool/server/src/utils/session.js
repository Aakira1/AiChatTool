import { createHmac, timingSafeEqual } from "node:crypto";

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function createSessionToken({ email, secret, maxAgeMs }) {
  const payload = {
    email,
    exp: Date.now() + maxAgeMs,
  };
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySessionToken(token, secret) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [body, signature] = token.split(".");
  const expected = createHmac("sha256", secret).update(body).digest("base64url");

  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(provided, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(body));
    if (!payload.email || !payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
