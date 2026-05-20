import { hashPassword } from "../src/utils/password.js";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

console.log(hashPassword(password));
