import type { AnswerMap, Field } from "../types/form";
import type { Form, FormVariables } from "../types/form/form";
import {
  createAnswerEntry,
  evaluateLogicRule,
  normaliseToKeys,
  type RuleCache,
  replaceThisInRule,
} from "../utils";

export interface FieldCorrectionsResult {
  answers: AnswerMap;
  variables: FormVariables;
}

/**
 * Tracks, per question_id, the keys a previous pass auto-cleared - so a
 * schema where an option's own visibility depends on this field's own
 * answer can't ping-pong forever between clearing and reselecting the same
 * key. Owned by the caller (one per form instance, alongside ruleCacheRef)
 * and mutated in place by {@link computeFieldCorrections}.
 */
export type LastAutoClearedMap = Map<string, string[]>;

function isSelectOrMultiSelect(
  field: Field,
): field is Extract<Field, { question_type: "SELECT" | "MULTISELECT" }> {
  return (
    field.question_type === "SELECT" || field.question_type === "MULTISELECT"
  );
}

/**
 * Computes, for every non-repeating SELECT/MULTISELECT field, whether its
 * current answer needs correcting: any currently-selected key that's no
 * longer a visible option gets stripped, or (if nothing's selected, the
 * field has `prefill` enabled, and there's exactly one visible option)
 * that option gets selected automatically.
 *
 * Pure and synchronous - meant to run once per answers/variables change as
 * part of the engine's own recompute cycle (see the effect in
 * useFormEngine.ts), the same way form variables are recomputed centrally,
 * rather than by each field's own component watching its dependencies and
 * correcting itself via setAnswer. The latter is what used to live in
 * SelectInputField - N independent per-field effects each racing every
 * other field's re-renders (and the transition setAnswer dispatches
 * inside) is what caused Maximum update depth exceeded on freshly-seeded
 * forms, since a burst of ~200 unrelated answers settling could starve any
 * one field's own corrective write from ever landing. A single pass over
 * the whole form, dispatched once, can't race itself.
 *
 * Returns only the fields that actually need a write - an empty result
 * means the form is already internally consistent. Mirrors setAnswer's own
 * on_set semantics (field-level on_set fires for any write, option-level
 * on_set only for newly-added keys) so prefill continues to trigger on_set
 * the same way a real user selection would.
 */
export function computeFieldCorrections(
  definition: Form,
  answers: AnswerMap,
  variables: FormVariables,
  lastAutoCleared: LastAutoClearedMap,
  ruleCache?: RuleCache,
): FieldCorrectionsResult {
  const answerPatch: AnswerMap = {};
  const variablePatch: FormVariables = {};

  for (const section of definition.sections) {
    if (section.repeating) continue;

    for (const field of section.fields) {
      if (!isSelectOrMultiSelect(field)) continue;

      const isMulti = field.question_type === "MULTISELECT";
      const questionId = field.question_id;
      const entry = answers[questionId];
      const selectedKeys = normaliseToKeys(entry?.value_current ?? null);

      const visibleKeys = field.options
        .filter((opt) =>
          evaluateLogicRule(
            replaceThisInRule(opt.show_if, questionId, ruleCache),
            answers,
            variables,
          ),
        )
        .map((opt) => opt.key);

      const invalidKeys = selectedKeys.filter(
        (key) => !visibleKeys.includes(key),
      );

      let nextValue: string | string[] | null | undefined;

      if (invalidKeys.length > 0) {
        nextValue = isMulti
          ? selectedKeys.filter((key) => visibleKeys.includes(key))
          : null;
        lastAutoCleared.set(questionId, invalidKeys);
      } else {
        const clearedForField = lastAutoCleared.get(questionId) ?? [];
        if (selectedKeys.length === 0 && clearedForField.length > 0) {
          lastAutoCleared.delete(questionId);
        }
        const stillGuarded = lastAutoCleared.get(questionId) ?? [];
        if (
          field.prefill &&
          selectedKeys.length === 0 &&
          visibleKeys.length === 1 &&
          !stillGuarded.includes(visibleKeys[0])
        ) {
          const onlyKey = visibleKeys[0];
          // console.debug(
          //   `[fieldCorrections] Prefilling value '${onlyKey}' for question '${questionId}'`,
          // );
          nextValue = isMulti ? [onlyKey] : onlyKey;
        }
      }

      if (nextValue === undefined) continue;

      answerPatch[questionId] = createAnswerEntry(
        field.question_type,
        nextValue,
        entry,
      );

      if (Array.isArray(field.on_set)) {
        for (const on of field.on_set) {
          variablePatch[on.variable_id] = on.value;
        }
      }
      const addedKeys = normaliseToKeys(nextValue).filter(
        (key) => !selectedKeys.includes(key),
      );
      for (const key of addedKeys) {
        const opt = field.options.find((o) => o.key === key);
        if (opt && Array.isArray(opt.on_set)) {
          for (const on of opt.on_set) {
            variablePatch[on.variable_id] = on.value;
          }
        }
      }
    }
  }

  return { answers: answerPatch, variables: variablePatch };
}
