import type { Exercise, PrivateWorkoutData, WorkoutDay } from "./workout-types";

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

type DayHeading = {
  lineIndex: number;
  dayNumber?: number;
  weekdayName?: string;
  planLabel: string;
};

function withoutStrikethrough(value: string): string {
  return value.replace(/~~.*?~~/g, "");
}

function cleanInline(value: string): string {
  return withoutStrikethrough(value)
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s/&-])([a-z])/g, (_, boundary: string, letter: string) =>
      `${boundary}${letter.toUpperCase()}`,
    );
}

function slug(value: string, fallback: string): string {
  const result = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return result || fallback;
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}-${suffix++}`;
  used.add(candidate);
  return candidate;
}

function parseDayHeading(line: string, lineIndex: number): DayHeading | null {
  const normalized = line.replace(/\*\*/g, "").trim();
  const numbered = normalized.match(
    /^#{2,6}\s+DAY\s+(\d+)\s*(?:\(([^)]+)\))?\s*:\s*(.+?)\s*$/i,
  );
  if (numbered) {
    return {
      lineIndex,
      dayNumber: Number(numbered[1]),
      weekdayName: numbered[2]?.trim(),
      planLabel: numbered[3].trim(),
    };
  }

  const weekday = normalized.match(
    /^#{2,6}\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*(?:[:·—-])\s*(.+?)\s*$/i,
  );
  if (!weekday) return null;
  return { lineIndex, weekdayName: weekday[1], planLabel: weekday[2].trim() };
}

function parseExerciseHeading(
  line: string,
): { order: number; title: string; inlinePrescription?: string } | null {
  const normalized = line.replace(/\*\*/g, "").trim();
  const match = normalized.match(/^(?:#{3,6}\s*)?(\d+)[.)]\s+(.+?)\s*$/);
  if (!match) return null;
  if (
    /^(?:session focus|pre-session protocol|main workout exercises|post-session protocol|session summary|low-impact hiit protocol)/i.test(
      match[2],
    )
  ) {
    return null;
  }
  const compact = match[2].match(/^(.+?)\s+(?:—|–|-)\s+(.+)$/);
  return {
    order: Number(match[1]),
    title: compact?.[1] ?? match[2],
    inlinePrescription: compact?.[2],
  };
}

function fieldValue(lines: string[], label: RegExp): string | undefined {
  for (const line of lines) {
    const normalized = withoutStrikethrough(line).replace(/\*\*/g, "");
    const match = normalized.match(/^\s*[-*]?\s*(?:\d+[.)]\s*)?([^:]+):\s*(.+?)\s*$/);
    if (match && label.test(match[1].trim())) return cleanInline(match[2]);
  }
  return undefined;
}

function parsePrescription(value: string): { sets: number; reps: string } | null {
  const match = value.match(/^(\d+(?:\s*[-–]\s*\d+)?)\s*(?:sets?)?\s*(?:[x×]\s*)?(.+)$/i);
  if (!match) return null;
  const setValues = [...match[1].matchAll(/\d+/g)].map((item) => Number(item[0]));
  const sets = Math.max(...setValues);
  const reps = match[2]
    .replace(/\breps?\b/gi, "")
    .replace(/\s*\((?:load|approx\.?|about)[^)]*\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!Number.isInteger(sets) || sets < 1 || sets > 20 || !reps) return null;
  return { sets, reps: reps.slice(0, 80) };
}

type InlinePrescription = {
  sets: number;
  reps: string;
  restSeconds?: number;
  cue?: string;
};

function parseInlinePrescription(value: string): InlinePrescription {
  const cleaned = cleanInline(value);
  const segments = cleaned
    .split(/\s*·\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const restSegment = segments.find((segment) => /\brest\b/i.test(segment));
  const contentSegments = segments.filter((segment) => !/\brest\b/i.test(segment));
  const cross = cleaned.match(/(\d+(?:\s*[-–]\s*\d+)?)\s*[x×]\s*([^;·]+)/i);

  if (cross && !/^Block\s+\d/i.test(cleaned)) {
    const setValues = [...cross[1].matchAll(/\d+/g)].map((item) => Number(item[0]));
    const setRange = setValues.length > 1 ? `${cross[1]} sets` : undefined;
    const startsWithPrescription = new RegExp(
      `^${cross[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[x×]`,
      "i",
    ).test(cleaned);
    const instructionSegments = startsWithPrescription ? contentSegments.slice(1) : contentSegments;
    const cueParts = [setRange ? `Source prescription: ${setRange}.` : undefined]
      .concat(instructionSegments)
      .filter((part): part is string => Boolean(part));
    return {
      sets: Math.max(...setValues),
      reps: cross[2].replace(/\breps?\b/gi, "").trim().slice(0, 80),
      restSeconds: parseRestSeconds(restSegment),
      cue: cueParts.join(" ").slice(0, 500) || undefined,
    };
  }

  const rounds = contentSegments[0]?.match(/^(\d+(?:\s*[-–]\s*\d+)?)\s+rounds?\b/i);
  if (rounds) {
    const setValues = [...rounds[1].matchAll(/\d+/g)].map((item) => Number(item[0]));
    return {
      sets: Math.max(...setValues),
      reps: (contentSegments[1] ?? "1 round").slice(0, 80),
      restSeconds: parseRestSeconds(restSegment),
      cue: contentSegments.slice(2).join(". ").slice(0, 500) || undefined,
    };
  }

  if (/^Block\s+\d/i.test(cleaned)) {
    return {
      sets: 1,
      reps: "Follow current training block",
      restSeconds: parseRestSeconds(restSegment),
      cue: contentSegments.join(". ").slice(0, 500),
    };
  }

  const timed = contentSegments[0]?.match(/^\d+(?:\s*[-–]\s*\d+)?\s*(?:min|km|breaths?)/i);
  if (timed) {
    return {
      sets: 1,
      reps: contentSegments[0].slice(0, 80),
      restSeconds: parseRestSeconds(restSegment),
      cue: contentSegments.slice(1).join(". ").slice(0, 500) || undefined,
    };
  }

  return {
    sets: 1,
    reps: /progression|performance step/i.test(cleaned) ? "Current progression step" : "As prescribed",
    restSeconds: parseRestSeconds(restSegment),
    cue: contentSegments.join(". ").slice(0, 500) || undefined,
  };
}

function parseRestSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (/active\s+rest/i.test(value)) return 0;
  const numbers = [...value.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (numbers.length === 0) return undefined;
  const maximum = Math.max(...numbers);
  return Math.round(/min/i.test(value) ? maximum * 60 : maximum);
}

function exerciseNames(rawTitle: string): { name: string; substitution?: string } {
  const title = cleanInline(rawTitle).replace(/\s+\(NEW\)\s*$/i, "").trim();
  const rightReplacement = title.match(/^(.+?)\s*(?:⇒|→|->)\s*(.+)$/);
  if (rightReplacement) {
    return {
      name: cleanInline(rightReplacement[2]).slice(0, 160),
      substitution: cleanInline(rightReplacement[1]).slice(0, 240),
    };
  }
  const leftReplacement = title.match(/^(.+?)\s*(?:←|<-)\s*(.+)$/);
  if (leftReplacement) {
    return {
      name: cleanInline(leftReplacement[1]).slice(0, 160),
      substitution: cleanInline(leftReplacement[2]).slice(0, 240),
    };
  }
  return { name: title.slice(0, 160) };
}

function planTitle(markdownLines: string[]): string {
  const heading = markdownLines.find((line) => /^#\s+\S/.test(line.trim()));
  return cleanInline(heading?.replace(/^#\s+/, "") ?? "Imported Workout Plan").slice(0, 160);
}

export function parseMarkdownWorkoutData(markdown: string): PrivateWorkoutData {
  if (!markdown.trim()) throw new Error("The Markdown file is empty.");
  if (markdown.length > 2_000_000) throw new Error("The Markdown file is larger than 2 MB.");

  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const headings = lines
    .map((line, lineIndex) => parseDayHeading(line, lineIndex))
    .filter((heading): heading is DayHeading => heading !== null);

  if (headings.length === 0) {
    throw new Error("No workout days found. Use headings such as ‘## Day 1 (Monday): Push A’. ");
  }

  const usedIds = new Set<string>();
  const days: WorkoutDay[] = [];

  headings.forEach((heading, headingIndex) => {
    const end = headings[headingIndex + 1]?.lineIndex ?? lines.length;
    const dayLines = lines.slice(heading.lineIndex + 1, end);
    const exerciseStarts = dayLines
      .map((line, lineIndex) => {
        const exercise = parseExerciseHeading(line);
        return exercise ? { ...exercise, lineIndex } : null;
      })
      .filter((exercise): exercise is {
        order: number;
        title: string;
        inlinePrescription?: string;
        lineIndex: number;
      } =>
        exercise !== null,
      );

    const focusMatch = cleanInline(heading.planLabel).match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    const shortName = titleCase((focusMatch?.[1] ?? cleanInline(heading.planLabel)).trim());
    const focus = titleCase((focusMatch?.[2] ?? shortName).trim());
    const dayBase = slug(shortName, `day-${heading.dayNumber ?? headingIndex + 1}`);
    const dayId = uniqueId(dayBase, usedIds);
    const exercises: Exercise[] = [];

    exerciseStarts.forEach((start, exerciseIndex) => {
      const blockEnd = exerciseStarts[exerciseIndex + 1]?.lineIndex ?? dayLines.length;
      const block = dayLines.slice(start.lineIndex + 1, blockEnd);
      const prescriptionText = fieldValue(block, /^(sets?\s*(?:&|and|\/)\s*reps?|prescription)$/i);
      const inline = start.inlinePrescription
        ? parseInlinePrescription(start.inlinePrescription)
        : undefined;
      if (!prescriptionText && !inline) return;
      const prescription = prescriptionText ? parsePrescription(prescriptionText) : inline;
      if (!prescription) {
        throw new Error(`Could not read sets and reps for “${cleanInline(start.title)}”.`);
      }

      const names = exerciseNames(start.title);
      const cue = (
        fieldValue(block, /^(cue|watch)$/i)?.replace(/^['“”"]+|['“”"]+$/g, "") ?? inline?.cue
      )?.slice(0, 500);
      const rest = parseRestSeconds(fieldValue(block, /^(rest|rest between sets)$/i)) ?? inline?.restSeconds;
      const substitution =
        names.substitution ?? fieldValue(block, /^alternative$/i)?.slice(0, 240);
      exercises.push({
        id: uniqueId(`${dayId}-${slug(names.name, `exercise-${start.order}`)}`, usedIds),
        name: names.name,
        sets: prescription.sets,
        reps: prescription.reps,
        restSeconds: rest,
        cue,
        substitution,
      });
    });

    if (exercises.length === 0) return;
    const weekdayKey = heading.weekdayName?.toLowerCase();
    const weekday = weekdayKey === undefined ? undefined : WEEKDAYS[weekdayKey];
    const dayPrefix = heading.weekdayName
      ? titleCase(heading.weekdayName)
      : `Day ${heading.dayNumber ?? days.length + 1}`;
    days.push({
      id: dayId,
      label: `${dayPrefix} · ${shortName}`.slice(0, 160),
      shortLabel: shortName.slice(0, 12),
      focus: focus.slice(0, 160),
      weekday,
      exercises,
    });
  });

  if (days.length === 0) {
    throw new Error("Workout days were found, but no numbered exercises had a ‘Sets & Reps’ field.");
  }

  const title = planTitle(lines);
  return {
    schemaVersion: 1,
    plan: {
      id: slug(title, "imported-markdown-plan"),
      title,
      description: "Imported from Markdown and parsed locally on this device.",
      days,
    },
    sessions: [],
  };
}
