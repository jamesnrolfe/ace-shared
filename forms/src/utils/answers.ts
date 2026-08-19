import type {
  AnswerEntry,
  AnswerValue,
  Field,
  QuestionType,
} from "../types/form";

/**
 * Convert any answer to a list of strings.
 *
 * For example, a SELECT field will output its answer as `field_answer`,
 * but for comparison, we will do this by default with other fields as `[field_answer]`.
 */
export function normaliseToKeys(v: unknown): string[] {
  if (v === null || typeof v === "undefined") return [];
  if (Array.isArray(v)) return v as string[];
  return [String(v)];
}

export function createAnswerEntry(
  questionType: QuestionType,
  value: AnswerValue,
  existing?: AnswerEntry,
): AnswerEntry {
  const now = new Date().toISOString();
  return {
    type: questionType,
    last_updated_ts: now,
    was_shown: existing?.was_shown ?? true,
    was_shown_on_submit: existing?.was_shown_on_submit ?? false,
    was_prefilled: false,
    value_initial: existing?.value_initial ?? null,
    value_current: value ?? null,
  } as AnswerEntry;
}

export function createInitialAnswerEntry(
  questionType: QuestionType,
  defaultValue: AnswerValue,
): AnswerEntry {
  return {
    type: questionType,
    last_updated_ts: null,
    was_shown: false,
    was_shown_on_submit: false,
    was_prefilled: false,
    // if default value comes in as undefined, this converts to null or empty string
    value_initial: defaultValue ?? blankShapeForQuestionType(questionType),
    value_current: defaultValue ?? blankShapeForQuestionType(questionType),
  } as AnswerEntry;
}

export function initialAnswerValue(field: Field): AnswerValue {
  const f = field as { default?: AnswerValue };
  if (f.default !== undefined) return f.default as AnswerValue;

  switch (field.question_type) {
    case "IMAGE":
      return [];
    case "QR":
      return [];
    case "MULTISELECT":
      return [];
    case "PINDROP":
      return null;
    case "GAPS":
      return {} as AnswerValue;
    case "AGREEMENT":
      return false;
    default:
      return null;
  }
}

function blankShapeForQuestionType(questionType: QuestionType): AnswerValue {
  switch (questionType) {
    case "IMAGE":
    case "QR":
    case "MULTISELECT":
      return [];
    case "GAPS":
      return {} as AnswerValue;
    default:
      return null;
  }
}

/**
 * Whether an answer entry carries a real prepopulated value.
 *
 * Compares structurally, not by reference, using JSON.stringify.
 */
export function isPrepopulated(entry: AnswerEntry | undefined): boolean {
  if (!entry) return false;
  return (
    JSON.stringify(entry.value_initial) !==
    JSON.stringify(blankShapeForQuestionType(entry.type))
  );
}
