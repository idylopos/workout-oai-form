import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("public repository excludes private project inputs", async () => {
  await assert.rejects(access(new URL("../sources/", import.meta.url)));
  await assert.rejects(access(new URL("../private-data/", import.meta.url)));
  await assert.rejects(access(new URL("../AGENTS.md", import.meta.url)));
});

test("fictional fixture carries no session history", async () => {
  const raw = await readFile(new URL("../examples/fictional-demo-plan.json", import.meta.url), "utf8");
  const fixture = JSON.parse(raw);
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.plan.id, "fictional-demo-plan");
  assert.deepEqual(fixture.sessions, []);
});

