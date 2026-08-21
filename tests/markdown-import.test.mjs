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

test("compact exercise lines preserve prescriptions, rest, cues, and alternatives", () => {
  const data = parseMarkdownWorkoutData(`# Compact Plan

### Monday — Legs A + bicycle

#### Exercises and activities
1. **Box squat** — 3 × 5–8 · rest 3 min
   - **Watch:** Keep each repetition controlled.

2. **Assisted curl** — 1–2 × 3–5 · rest 2 min
   - **Alternative:** Use a machine curl for 2 × 8–12.

3. **Mobility flow** — 2 rounds · 45 sec / side

4. **Easy run** — Block 1: 25 min easy · Block 2: 30 min easy

5. **Pull-up progression** — Choose your current performance step below · rest 3 min
`);

  const exercises = data.plan.days[0].exercises;
  assert.equal(exercises.length, 5);
  assert.deepEqual(
    exercises.map(({ name, sets, reps, restSeconds }) => ({ name, sets, reps, restSeconds })),
    [
      { name: "Box squat", sets: 3, reps: "5–8", restSeconds: 180 },
      { name: "Assisted curl", sets: 2, reps: "3–5", restSeconds: 120 },
      { name: "Mobility flow", sets: 2, reps: "45 sec / side", restSeconds: undefined },
      { name: "Easy run", sets: 1, reps: "Follow current training block", restSeconds: undefined },
      { name: "Pull-up progression", sets: 1, reps: "Current progression step", restSeconds: 180 },
    ],
  );
  assert.equal(exercises[0].cue, "Keep each repetition controlled.");
  assert.match(exercises[1].cue, /Source prescription: 1–2 sets/);
  assert.equal(exercises[1].substitution, "Use a machine curl for 2 × 8–12.");
});
