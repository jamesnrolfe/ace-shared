import type {
  AnswerEntry,
  AnswerMap,
  AnswerValue,
  FormVariables,
  FormVariableValue,
  QuestionType,
  ValidationErrors,
} from "../types/form";
import { createAnswerEntry } from "../utils/answers";

/**
 * Reactive state for one in-progress form instance: its answers, any
 * validation errors currently attached to those answers, computed/derived
 * form variables, and whether a save is in flight.
 *
 * Platform-agnostic - contains no reference to how the form is rendered,
 * persisted, or submitted. Consumers (mobile, web) own seeding, drafts,
 * and submission transport; this only tracks the live in-memory state of
 * one form instance.
 */
export interface FormEngineState {
  /** Current answer for every question that has been touched or seeded. */
  answers: AnswerMap;
  /** Current validation errors, keyed by `question_id`. */
  errors: ValidationErrors;
  /** Current evaluated form-level variables. */
  variables: FormVariables;
  /**
   * Whether a save/submit is currently in flight.
   *
   * Purely informational - the engine never reads this to block mutations.
   * Consumers set it via the `setSaving` action to drive their own UI (e.g.
   * disabling inputs while a save request is outstanding).
   */
  isSaving: boolean;
}

export type FormEngineAction =
  | {
      type: "setAnswer";
      questionId: string;
      entry?: AnswerEntry;
      value?: AnswerValue;
      questionType?: QuestionType;
    }
  | { type: "setAnswers"; answers: AnswerMap }
  | { type: "mergeAnswers"; answers: AnswerMap }
  | { type: "setErrors"; errors: ValidationErrors }
  | { type: "mergeErrors"; errors: ValidationErrors }
  | { type: "clearError"; questionId: string }
  | { type: "clearAllErrors" }
  | { type: "setSaving"; isSaving: boolean }
  | { type: "reset" }
  | { type: "batchMarkShown"; questionIds: string[] }
  | { type: "setVariable"; variableId: string; value: FormVariableValue }
  | { type: "mergeVariables"; variables: FormVariables }
  | { type: "setVariables"; variables: FormVariables };

/**
 * Pure reducer driving {@link FormEngineState}.
 *
 * `setAnswer` without an explicit `entry` builds one via
 * {@link createAnswerEntry}, preserving `value_initial`/`was_shown` from
 * any existing entry for that question. Setting an answer always clears
 * that question's error, since the error was computed against the old
 * value and must be recomputed against the new one.
 */
export function formEngineReducer(
  state: FormEngineState,
  action: FormEngineAction,
): FormEngineState {
  switch (action.type) {
    case "setAnswer": {
      let newEntry: AnswerEntry | undefined = action.entry;
      if (!newEntry) {
        if (!action.questionType) {
          // Can't build a proper entry without knowing the question type -
          // leave state unchanged rather than writing a malformed entry.
          return state;
        }
        const existing = state.answers[action.questionId];
        newEntry = createAnswerEntry(
          action.questionType,
          action.value ?? null,
          existing,
        );
      }
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.questionId]: newEntry,
        },
        errors: (() => {
          const newErrors = { ...state.errors };
          delete newErrors[action.questionId];
          return newErrors;
        })(),
      };
    }
    case "setAnswers":
      return { ...state, answers: action.answers };
    case "mergeAnswers":
      return { ...state, answers: { ...state.answers, ...action.answers } };
    case "setErrors":
      return { ...state, errors: action.errors };
    case "clearAllErrors":
      return { ...state, errors: {} };
    case "mergeErrors":
      return { ...state, errors: { ...state.errors, ...action.errors } };
    case "setSaving":
      return { ...state, isSaving: action.isSaving };
    case "reset":
      return { answers: {}, errors: {}, variables: {}, isSaving: false };
    case "batchMarkShown": {
      const newAnswers = { ...state.answers };
      for (const q of action.questionIds) {
        const existing = newAnswers[q];
        if (existing && !existing.was_shown) {
          newAnswers[q] = { ...existing, was_shown: true };
        }
      }
      return { ...state, answers: newAnswers };
    }
    case "clearError": {
      const newErrors = { ...state.errors };
      delete newErrors[action.questionId];
      return { ...state, errors: newErrors };
    }
    case "setVariable":
      return {
        ...state,
        variables: { ...state.variables, [action.variableId]: action.value },
      };
    case "setVariables":
      return { ...state, variables: { ...action.variables } };
    case "mergeVariables":
      return {
        ...state,
        variables: { ...state.variables, ...action.variables },
      };
    default:
      return state;
  }
}
