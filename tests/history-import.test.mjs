import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isWorkoutHistoryImport,
  mergeWorkoutHistorySessions,
  parseWorkoutHistoryImport,
} from "../app/history-import.ts";
import { parseMarkdownWorkoutData } from "../app/markdown-import.ts";

const plan = {
  id: "test-plan",
  title: "Test plan",
  days: [
    {
      id: "strength-a",
      label: "Monday · Strength A",
      shortLabel: "Mon",
      focus: "Strength",
      exercises: [
        { id: "goblet-squat", name: "Goblet squat", sets: 3, reps: "8–10" },
        { id: "cable-row", name: "Seated cable row", sets: 3, reps: "10–12" },
      ],
    },
  ],
};

test("history imports match readable names and produce app sessions", () => {
  const source = {
    format: "form-workout-history",
    version: 1,
    sessions: [
      {
        date: "2026-01-15",
        day: "monday - strength a",
        finished: true,
        notes: "Felt steady.",
        exercises: [
          {
            exercise: "GOBLET SQUAT",
            completed: true,
            load: "16 kg",
            reps: "10 / 10 / 9",
            rpe: "8",
            discomfort: "0",
          },
        ],
      },
    ],
  };

  assert.equal(isWorkoutHistoryImport(source), true);
  const sessions = parseWorkoutHistoryImport(source, plan);
  assert.deepEqual(sessions, [
    {
      id: "history-2026-01-15-strength-a",
      date: "2026-01-15",
      dayId: "strength-a",
      completedAt: "2026-01-15T12:00:00.000Z",
      notes: "Felt steady.",
      results: [
        {
          exerciseId: "goblet-squat",
          completed: true,
          load: "16 kg",
          reps: "10 / 10 / 9",
          rpe: "8",
          discomfort: "0",
        },
      ],
    },
  ]);
});

test("history imports reject names that are absent from the current plan", () => {
  assert.throws(
    () =>
      parseWorkoutHistoryImport(
        {
          format: "form-workout-history",
          version: 1,
          sessions: [
            {
              date: "2026-01-15",
              day: "Monday — Strength A",
              finished: true,
              exercises: [{ exercise: "Invented movement", completed: true }],
            },
          ],
        },
        plan,
      ),
    /does not match an exercise/,
  );
});

test("history merge preserves existing fields and overwrites supplied exercise results", () => {
  const existing = [
    {
      id: "existing-session",
      date: "2026-01-15",
      dayId: "strength-a",
      notes: "Keep this note.",
      results: [
        { exerciseId: "goblet-squat", completed: false },
        { exerciseId: "cable-row", completed: true, reps: "12" },
      ],
    },
  ];
  const imported = [
    {
      id: "history-2026-01-15-strength-a",
      date: "2026-01-15",
      dayId: "strength-a",
      completedAt: "2026-01-15T12:00:00.000Z",
      results: [{ exerciseId: "goblet-squat", completed: true, reps: "10" }],
    },
  ];

  assert.deepEqual(mergeWorkoutHistorySessions(existing, imported), [
    {
      id: "existing-session",
      date: "2026-01-15",
      dayId: "strength-a",
      completedAt: "2026-01-15T12:00:00.000Z",
      notes: "Keep this note.",
      results: [
        { exerciseId: "goblet-squat", completed: true, reps: "10" },
        { exerciseId: "cable-row", completed: true, reps: "12" },
      ],
    },
  ]);
});

test("the downloadable plan and history templates work together", async () => {
  const markdown = await readFile(
    new URL("../public/templates/plan-import-template.md", import.meta.url),
    "utf8",
  );
  const history = JSON.parse(
    await readFile(
      new URL("../public/templates/workout-history-import-template.json", import.meta.url),
      "utf8",
    ),
  );
  const data = parseMarkdownWorkoutData(markdown);
  const sessions = parseWorkoutHistoryImport(history, data.plan);

  assert.equal(data.plan.days.length, 2);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].results.length, 2);
});
