export const CURRENT_SCHEMA_VERSION = 1 as const;

export type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds?: number;
  cue?: string;
  substitution?: string;
};

export type WorkoutDay = {
  id: string;
  label: string;
  shortLabel: string;
  focus: string;
  weekday?: number;
  durationMinutes?: number;
  exercises: Exercise[];
};

export type WorkoutPlan = {
  id: string;
  title: string;
  description?: string;
  days: WorkoutDay[];
};

export type ExerciseResult = {
  exerciseId: string;
  exerciseName?: string;
  completed: boolean;
  load?: string;
  reps?: string;
  rpe?: string;
  discomfort?: string;
};

export type WorkoutSession = {
  id: string;
  date: string;
  dayId: string;
  completedAt?: string;
  notes?: string;
  results: ExerciseResult[];
};

export type PrivateWorkoutData = {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  exportedAt?: string;
  plan: WorkoutPlan;
  sessions: WorkoutSession[];
};
