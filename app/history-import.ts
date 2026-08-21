import type {
  Exercise,
  ExerciseResult,
  WorkoutDay,
  WorkoutPlan,
  WorkoutSession,
} from "./workout-types";

export const WORKOUT_HISTORY_FORMAT = "form-workout-history" as const;

const MAX_SESSIONS = 5000;
const MAX_RESULTS_PER_SESSION = 40;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new Error(`${field} must be a non-empty string under ${max} characters.`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, field, max);
}

function normalizeLookup(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[·•]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function matchOne<T>(
  input: string,
  values: T[],
  aliases: (value: T) => string[],
  field: string,
  kind: string,
): T {
  const normalized = normalizeLookup(input);
  const matches = values.filter((value) =>
    aliases(value).some((alias) => normalizeLookup(alias) === normalized),
  );
  if (matches.length === 0) {
    const article = /^[aeiou]/i.test(kind) ? "an" : "a";
    throw new Error(`${field} "${input}" does not match ${article} ${kind} in the current plan.`);
  }
  if (matches.length > 1) {
    throw new Error(`${field} "${input}" matches more than one ${kind}. Use a unique full name.`);
  }
  return matches[0];
}

function matchDay(input: string, plan: WorkoutPlan, field: string): WorkoutDay {
  return matchOne(
    input,
    plan.days,
    (day) => [day.label, day.shortLabel, day.id],
    field,
    "workout day",
  );
}

function matchExercise(input: string, day: WorkoutDay, field: string): Exercise {
  return matchOne(
    input,
    day.exercises,
    (exercise) => [exercise.name, exercise.id],
    field,
    `exercise on ${day.label}`,
  );
}

function parseDate(value: unknown, field: string): string {
  const date = requiredText(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${field} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${field} must be a real calendar date.`);
  }
  return date;
}

function parseResult(value: unknown, day: WorkoutDay, path: string): ExerciseResult {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  const exerciseName = requiredText(value.exercise, `${path}.exercise`, 160);
  const exercise = matchExercise(exerciseName, day, `${path}.exercise`);
  if (typeof value.completed !== "boolean") {
    throw new Error(`${path}.completed must be true or false.`);
  }
  return {
    exerciseId: exercise.id,
    completed: value.completed,
    load: optionalText(value.load, `${path}.load`, 40),
    reps: optionalText(value.reps, `${path}.reps`, 40),
    rpe: optionalText(value.rpe, `${path}.rpe`, 20),
    discomfort: optionalText(value.discomfort, `${path}.discomfort`, 20),
  };
}

function parseSession(value: unknown, plan: WorkoutPlan, index: number): WorkoutSession {
  const path = `sessions[${index}]`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  const date = parseDate(value.date, `${path}.date`);
  const dayName = requiredText(value.day, `${path}.day`, 160);
  const day = matchDay(dayName, plan, `${path}.day`);
  if (typeof value.finished !== "boolean") {
    throw new Error(`${path}.finished must be true or false.`);
  }
  if (!Array.isArray(value.exercises) || value.exercises.length > MAX_RESULTS_PER_SESSION) {
    throw new Error(`${path}.exercises must be an array with at most ${MAX_RESULTS_PER_SESSION} entries.`);
  }
  const results = value.exercises.map((result, resultIndex) =>
    parseResult(result, day, `${path}.exercises[${resultIndex}]`),
  );
  if (new Set(results.map((result) => result.exerciseId)).size !== results.length) {
    throw new Error(`${path}.exercises contains the same exercise more than once.`);
  }
  return {
    id: `history-${date}-${day.id}`,
    date,
    dayId: day.id,
    completedAt: value.finished ? `${date}T12:00:00.000Z` : undefined,
    notes: optionalText(value.notes, `${path}.notes`, 2000),
    results,
  };
}

export function isWorkoutHistoryImport(value: unknown): boolean {
  return isRecord(value) && value.format === WORKOUT_HISTORY_FORMAT;
}

export function parseWorkoutHistoryImport(value: unknown, plan: WorkoutPlan): WorkoutSession[] {
  if (!isRecord(value)) throw new Error("The workout history file must contain a JSON object.");
  if (value.format !== WORKOUT_HISTORY_FORMAT) {
    throw new Error(`Workout history format must be "${WORKOUT_HISTORY_FORMAT}".`);
  }
  if (value.version !== 1) {
    throw new Error("Unsupported workout history version. This app currently accepts version 1.");
  }
  if (!Array.isArray(value.sessions) || value.sessions.length > MAX_SESSIONS) {
    throw new Error(`sessions must be an array with at most ${MAX_SESSIONS} entries.`);
  }
  const sessions = value.sessions.map((session, index) => parseSession(session, plan, index));
  const keys = sessions.map((session) => `${session.date}\u0000${session.dayId}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error("Workout history contains more than one session for the same date and workout day.");
  }
  return sessions;
}

export function mergeWorkoutHistorySessions(
  existing: WorkoutSession[],
  imported: WorkoutSession[],
): WorkoutSession[] {
  const merged = new Map(existing.map((session) => [`${session.date}\u0000${session.dayId}`, session]));
  for (const session of imported) {
    const key = `${session.date}\u0000${session.dayId}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, session);
      continue;
    }
    const results = new Map(current.results.map((result) => [result.exerciseId, result]));
    for (const result of session.results) results.set(result.exerciseId, result);
    merged.set(key, {
      ...current,
      completedAt: session.completedAt ?? current.completedAt,
      notes: session.notes ?? current.notes,
      results: [...results.values()],
    });
  }
  return [...merged.values()];
}
