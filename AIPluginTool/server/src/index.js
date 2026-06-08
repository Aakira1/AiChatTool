import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.port, () => {
  console.log(`Server listening at http://localhost:${env.port}`);
});

// For debugging env variables
// console.log(env.authEnabled);
// console.log(env.authEmail);
// console.log(env.authPasswordPlain);
// console.log(env.authSecret);
// console.log(env.oauthProviders);
// console.log(env.publicServerUrl);
// console.log(env.openaiApiKey);
// console.log(env.openaiApiBaseUrl);
// console.log(env.openaiEmbeddingModel);
// console.log(env.ragTopK);
// console.log(env.vectorizeIndexName);
// console.log(env.cloudflareAccountId);
// console.log(env.cloudflareApiToken);
// console.log(env.vectorizeIndexName);
// console.log(env.cloudflareEmbeddingModel);
// console.log(env.ragTopK);