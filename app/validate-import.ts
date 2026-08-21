import {
  CURRENT_SCHEMA_VERSION,
  type Exercise,
  type PrivateWorkoutData,
  type WorkoutDay,
  type WorkoutPlan,
  type WorkoutSession,
} from "./workout-types";

const MAX_DAYS = 14;
const MAX_EXERCISES_PER_DAY = 40;
const MAX_SESSIONS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max = 240): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new Error(`${field} must be a non-empty string under ${max} characters.`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string, max = 1000): string | undefined {
  if (value === undefined) return undefined;
  return text(value, field, max);
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${field} must be a whole number between ${min} and ${max}.`);
  }
  return Number(value);
}

function parseExercise(value: unknown, path: string): Exercise {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  return {
    id: text(value.id, `${path}.id`, 80),
    name: text(value.name, `${path}.name`, 160),
    sets: integer(value.sets, `${path}.sets`, 1, 20),
    reps: text(value.reps, `${path}.reps`, 80),
    restSeconds:
      value.restSeconds === undefined
        ? undefined
        : integer(value.restSeconds, `${path}.restSeconds`, 0, 1800),
    cue: optionalText(value.cue, `${path}.cue`, 500),
    substitution: optionalText(value.substitution, `${path}.substitution`, 240),
  };
}

function parseDay(value: unknown, index: number): WorkoutDay {
  const path = `plan.days[${index}]`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  if (!Array.isArray(value.exercises) || value.exercises.length === 0) {
    throw new Error(`${path}.exercises must contain at least one exercise.`);
  }
  if (value.exercises.length > MAX_EXERCISES_PER_DAY) {
    throw new Error(`${path} contains too many exercises.`);
  }
  return {
    id: text(value.id, `${path}.id`, 80),
    label: text(value.label, `${path}.label`, 160),
    shortLabel: text(value.shortLabel, `${path}.shortLabel`, 12),
    focus: text(value.focus, `${path}.focus`, 160),
    weekday:
      value.weekday === undefined ? undefined : integer(value.weekday, `${path}.weekday`, 0, 6),
    durationMinutes:
      value.durationMinutes === undefined
        ? undefined
        : integer(value.durationMinutes, `${path}.durationMinutes`, 1, 600),
    exercises: value.exercises.map((exercise, exerciseIndex) =>
      parseExercise(exercise, `${path}.exercises[${exerciseIndex}]`),
    ),
  };
}

function parsePlan(value: unknown): WorkoutPlan {
  if (!isRecord(value)) throw new Error("plan must be an object.");
  if (!Array.isArray(value.days) || value.days.length === 0 || value.days.length > MAX_DAYS) {
    throw new Error(`plan.days must contain between 1 and ${MAX_DAYS} days.`);
  }
  const plan = {
    id: text(value.id, "plan.id", 80),
    title: text(value.title, "plan.title", 160),
    description: optionalText(value.description, "plan.description", 500),
    days: value.days.map(parseDay),
  };
  const ids = plan.days.flatMap((day) => [day.id, ...day.exercises.map((exercise) => exercise.id)]);
  if (new Set(ids).size !== ids.length) throw new Error("All day and exercise IDs must be unique.");
  return plan;
}

function parseSessions(value: unknown, plan: WorkoutPlan): WorkoutSession[] {
  if (!Array.isArray(value) || value.length > MAX_SESSIONS) {
    throw new Error(`sessions must be an array with at most ${MAX_SESSIONS} entries.`);
  }
  const validDays = new Set(plan.days.map((day) => day.id));
  return value.map((session, index) => {
    const path = `sessions[${index}]`;
    if (!isRecord(session)) throw new Error(`${path} must be an object.`);
    const dayId = text(session.dayId, `${path}.dayId`, 80);
    if (!validDays.has(dayId)) throw new Error(`${path}.dayId does not exist in this plan.`);
    if (!Array.isArray(session.results)) throw new Error(`${path}.results must be an array.`);
    return {
      id: text(session.id, `${path}.id`, 120),
      date: text(session.date, `${path}.date`, 20),
      dayId,
      completedAt: optionalText(session.completedAt, `${path}.completedAt`, 60),
      notes: optionalText(session.notes, `${path}.notes`, 2000),
      results: session.results.map((result, resultIndex) => {
        const resultPath = `${path}.results[${resultIndex}]`;
        if (!isRecord(result)) throw new Error(`${resultPath} must be an object.`);
        if (typeof result.completed !== "boolean") {
          throw new Error(`${resultPath}.completed must be true or false.`);
        }
        return {
          exerciseId: text(result.exerciseId, `${resultPath}.exerciseId`, 80),
          completed: result.completed,
          load: optionalText(result.load, `${resultPath}.load`, 40),
          reps: optionalText(result.reps, `${resultPath}.reps`, 40),
          rpe: optionalText(result.rpe, `${resultPath}.rpe`, 20),
          discomfort: optionalText(result.discomfort, `${resultPath}.discomfort`, 20),
        };
      }),
    };
  });
}

export function validatePrivateWorkoutData(value: unknown): PrivateWorkoutData {
  if (!isRecord(value)) throw new Error("The imported file must contain a JSON object.");
  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version. This app currently accepts version ${CURRENT_SCHEMA_VERSION}.`);
  }
  const plan = parsePlan(value.plan);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: optionalText(value.exportedAt, "exportedAt", 60),
    plan,
    sessions: parseSessions(value.sessions, plan),
  };
}

