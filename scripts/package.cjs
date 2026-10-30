const { copyFileSync, cpSync, mkdirSync, rmSync } = require("node:fs");
const path = require("node:path");

const target = process.argv[2];
if (target !== "firefox" && target !== "chromium") {
  console.error("Usage: node scripts/package.cjs <firefox|chromium>");
  process.exit(1);
}

const root = path.join(__dirname, "..");
const output = path.join(root, "dist", target);
const manifest = target === "firefox" ? "manifest.json" : "manifest.chromium.json";

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
copyFileSync(path.join(root, manifest), path.join(output, "manifest.json"));
for (const resource of ["background.js", "popup", "icons", "LICENSE"]) {
  cpSync(path.join(root, resource), path.join(output, resource), { recursive: true });
}
console.log(`Packaged ${target}: ${output}`);