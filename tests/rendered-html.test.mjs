import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("static build contains the private training application shell", async () => {
  const html = await readFile(new URL("../pages-dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Form · Private training log<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/i);
  assert.match(html, /assets\/index-[^"']+\.js/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("GitHub Pages entry declares a closed network policy", async () => {
  const html = await readFile(new URL("../pages-dist/index.html", import.meta.url), "utf8");
  assert.match(html, /connect-src 'none'/i);
  assert.match(html, /form-action 'none'/i);
  assert.match(html, /manifest\.webmanifest/i);
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/i);
});
