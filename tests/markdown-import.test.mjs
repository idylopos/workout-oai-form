import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseMarkdownWorkoutData } from "../app/markdown-import.ts";

test("Markdown plans are converted into validated-shaped private data", async () => {
  const markdown = await readFile(
    new URL("../examples/fictional-demo-plan.md", import.meta.url),
    "utf8",
  );
  const data = parseMarkdownWorkoutData(markdown);

  assert.equal(data.schemaVersion, 1);
  assert.equal(data.plan.days.length, 2);
  assert.equal(data.plan.days[0].weekday, 1);
  assert.equal(data.plan.days[0].exercises.length, 2);
  assert.equal(data.plan.days[0].exercises[0].name, "Neutral-Grip Dumbbell Press");
  assert.equal(data.plan.days[0].exercises[0].substitution, "Standard Press");
  assert.equal(data.plan.days[0].exercises[0].restSeconds, 120);
  assert.equal(data.plan.days[1].exercises[0].restSeconds, 120);
  assert.deepEqual(data.sessions, []);
});

test("Markdown import rejects documents without workout-day headings", () => {
  assert.throws(
    () => parseMarkdownWorkoutData("# Notes\n\nNo structured workout here."),
    /No workout days found/,
  );
});

test("numbered protocol sections are not treated as exercises", () => {
  const data = parseMarkdownWorkoutData(`# Plan

## Day 1 (Monday): Pull A

**1. Cable Row**
- **Sets & Reps:** 3 sets × 10 reps

### 4. Post-Session Protocol: Cooldown
- **Sets & Reps:** 2 sets × 30 seconds
`);

  assert.equal(data.plan.days[0].exercises.length, 1);
  assert.equal(data.plan.days[0].exercises[0].name, "Cable Row");
});
