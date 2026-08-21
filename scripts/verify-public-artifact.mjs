import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../pages-dist/", import.meta.url));
const forbiddenPathPatterns = [
  /(^|\/)sources(\/|$)/i,
  /(^|\/)private-data(\/|$)/i,
  /(^|\/)AGENTS\.md$/i,
  /\.private\.json$/i,
  /\.(?:pem|key|env)$/i,
];
const forbiddenContentPatterns = [
  /PPL Workout plan by LLMs/i,
  /codex-preview/i,
  /react-loading-skeleton/i,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i,
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const files = await walk(root);
assert.ok(files.some((file) => file.endsWith("index.html")), "Pages artifact must contain index.html");

for (const file of files) {
  const path = relative(root, file);
  for (const pattern of forbiddenPathPatterns) {
    assert.doesNotMatch(path, pattern, `Forbidden path in Pages artifact: ${path}`);
  }
  if ([".html", ".js", ".css", ".json", ".webmanifest"].includes(extname(file))) {
    const contents = await readFile(file, "utf8");
    for (const pattern of forbiddenContentPatterns) {
      assert.doesNotMatch(contents, pattern, `Forbidden content in Pages artifact: ${path}`);
    }
  }
}

console.log(`Verified ${files.length} public artifact files.`);
