// Zip the built dist/ folder into a Chrome Web Store-ready package.
// The zip must contain manifest.json at its ROOT, so we zip the *contents*
// of dist/, not the dist/ folder itself.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

if (!existsSync(dist)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const out = resolve(root, `onechat-v${version}.zip`);
if (existsSync(out)) rmSync(out);

if (process.platform === "win32") {
  // PowerShell Compress-Archive zips the contents when given dist\*
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${dist}\\*' -DestinationPath '${out}' -Force`,
    ],
    { stdio: "inherit" }
  );
} else {
  // macOS/Linux: zip from inside dist so paths are relative to its root
  execFileSync("zip", ["-r", "-q", out, "."], { cwd: dist, stdio: "inherit" });
}

console.log(`\n✓ Packaged: onechat-v${version}.zip`);
console.log("  Upload this at https://chrome.google.com/webstore/devconsole");
