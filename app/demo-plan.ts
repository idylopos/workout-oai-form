import demoData from "../examples/fictional-demo-plan.json";
import type { PrivateWorkoutData } from "./workout-types";
import { validatePrivateWorkoutData } from "./validate-import";

export function createDemoData(): PrivateWorkoutData {
  return validatePrivateWorkoutData(structuredClone(demoData));
}

