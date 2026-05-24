import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(serverRoot, ".env") });

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const model = process.env.CLOUDFLARE_MODEL ?? "@cf/meta/llama-3.1-8b-instruct";

console.log("accountId set:", Boolean(accountId), "len:", accountId?.length ?? 0);
console.log("token set:", Boolean(token), "len:", token?.length ?? 0);

if (!accountId || !token) {
  console.error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in server/.env");
  process.exit(1);
}

const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    stream: false,
    messages: [{ role: "user", content: "ping" }],
  }),
});

const text = await res.text();
console.log("chat/completions status:", res.status);
console.log("chat/completions body:", text.slice(0, 500));

const verify = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
  headers: { Authorization: `Bearer ${token}` },
});
const verifyText = await verify.text();
console.log("token verify status:", verify.status);
console.log("token verify body:", verifyText.slice(0, 500));

const account = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const accountText = await account.text();
console.log("account lookup status:", account.status);
console.log("account lookup body:", accountText.slice(0, 500));
