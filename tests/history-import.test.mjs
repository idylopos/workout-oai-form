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
      weekday: 1,
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
          exerciseName: "Goblet squat",
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

test("history imports reject weekday names that match multiple plan days", () => {
  assert.throws(
    () =>
      parseWorkoutHistoryImport(
        {
          format: "form-workout-history",
          version: 1,
          sessions: [
            {
              date: "2026-01-15",
              day: "Monday",
              finished: true,
              exercises: [],
            },
          ],
        },
        {
          ...plan,
          days: [
            ...plan.days,
            {
              ...plan.days[0],
              id: "strength-a-2",
              label: "Monday · Strength A 2",
            },
          ],
        },
      ),
    /matches more than one workout day/,
  );
});

test("weekday-only sessions preserve exercises removed from the current plan", () => {
  const driftedPlan = {
    id: "drifted-plan",
    title: "Drifted plan",
    days: [
      {
        id: "pull-a",
        label: "Wednesday · Pull A + Mobility A",
        shortLabel: "Pull A",
        focus: "Pull",
        weekday: 3,
        exercises: [{ id: "face-pull", name: "Face pull", sets: 3, reps: "12" }],
      },
    ],
  };
  const sessions = parseWorkoutHistoryImport(
    {
      format: "form-workout-history",
      version: 1,
      sessions: [
        {
          date: "2026-07-29",
          day: "Wednesday",
          finished: true,
          exercises: [
            { exercise: "Face pull", completed: true, reps: "12 / 12 / 12" },
            { exercise: "Legacy calf stretch", completed: true, reps: "30 sec" },
          ],
        },
      ],
    },
    driftedPlan,
  );

  assert.equal(sessions[0].dayId, "pull-a");
  assert.equal(sessions[0].results[0].exerciseId, "face-pull");
  assert.equal(sessions[0].results[0].exerciseName, "Face pull");
  assert.match(sessions[0].results[1].exerciseId, /^archived-/);
  assert.equal(sessions[0].results[1].exerciseName, "Legacy calf stretch");
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
