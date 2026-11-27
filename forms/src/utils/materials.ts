import type { AnswerEntry, AnswerMap } from "../types/form";
import type { LogicRule } from "../types/form/logic";
import type {
  MaterialAttribute,
  MaterialEntry,
  MaterialOption,
} from "../types/form/MaterialsInterface";
import { evaluateLogicRule } from "./formLogic";

/**
 * Returns an attribute's `show_if` rule, if it has one.
 *
 * `MaterialAttribute` types its extra keys as `any`, so this narrows it in one
 * place.
 */
export function getAttributeShowIf(
  attribute: MaterialAttribute,
): LogicRule | undefined {
  const rule: unknown = attribute.show_if;
  return rule && typeof rule === "object" ? (rule as LogicRule) : undefined;
}

/**
 * Builds an answer map from one material's attributes, keyed by attribute key.
 *
 * Lets an attribute's `show_if` be evaluated against the other attributes of
 * the same material, as if they were the only questions in the form. Rules
 * can't see anything outside the material.
 */
export function buildMaterialAnswerMap(
  option: MaterialOption,
  entry: MaterialEntry,
): AnswerMap {
  const answers: AnswerMap = {};
  for (const attribute of option.attributes) {
    answers[attribute.key] = {
      type: attribute.question_type,
      last_updated_ts: null,
      was_shown: true,
      was_shown_on_submit: true,
      was_prefilled: false,
      value_initial: null,
      value_current: entry.attributes?.[attribute.key] ?? null,
    } as AnswerEntry;
  }
  return answers;
}

/**
 * Returns whether an attribute shows, given its material's answers from
 * {@link buildMaterialAnswerMap}. One without a `show_if` always shows.
 */
export function isMaterialAttributeVisible(
  attribute: MaterialAttribute,
  materialAnswers: AnswerMap,
): boolean {
  return evaluateLogicRule(getAttributeShowIf(attribute), materialAnswers);
}
