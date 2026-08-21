import {
  type AnswerMap,
  type Condition,
  Field,
  isCondition,
  isRule,
  type LogicRule,
  type Section,
  type Validation,
} from "../types/form";
import type { Form } from "../types/form/form";
import { createInitialAnswerEntry } from "./answers";
import { extractQuestionIdsFromRule } from "./logicUtils";

/**
 * Prefix a question ID with its section ID, unconditionally.
 */
export function buildSectionQuestionId(
  sectionId: string,
  questionId: string,
): string {
  return `${sectionId}.${questionId}`;
}

export function ensureSectionQuestionId(
  sectionId: string,
  questionId: string,
): string {
  if (!sectionId) return questionId;
  if (questionId.startsWith(`${sectionId}.`)) return questionId;
  if (questionId.includes(".")) return questionId;
  return buildSectionQuestionId(sectionId, questionId);
}

/**
 * Generates `"${question_id}__${instance_index}"`.
 */
export function addInstanceSuffix(
  questionId: string,
  instanceIndex: number,
): string {
  return `${questionId}__${instanceIndex}`;
}

/**
 * Attempt to determine the instance index from the suffix of a `question_id`.
 *
 * If found, returns the `baseId` of the question, and the `instanceIndex` found.
 */
export function parseInstanceSuffix(questionId: string | undefined): {
  baseId: string;
  instanceIndex: number;
} | null {
  if (typeof questionId !== "string") return null;
  const match = questionId.match(/^(.+?)__(\d+)$/);
  if (!match) return null;
  return {
    baseId: match[1],
    instanceIndex: parseInt(match[2], 10),
  };
}

export function resolveFieldInfo(
  questionId: string | undefined,
  fieldMap: SectionFieldMap,
): { baseId: string; sectionId?: string; isRepeating?: boolean } {
  if (typeof questionId !== "string") return { baseId: "" };

  const suffixInfo = parseInstanceSuffix(questionId);
  const unsuffixed = suffixInfo?.baseId ?? questionId;
  const direct = fieldMap[unsuffixed];
  if (direct) return { baseId: unsuffixed, ...direct };

  if (unsuffixed.includes(".")) {
    const baseId = unsuffixed.split(".").slice(1).join(".");
    const info = fieldMap[baseId];
    if (info) return { baseId, ...info };
  }

  return { baseId: unsuffixed };
}
/**
 * Lookup table from a question ID to which section it belongs to and
 * whever that section repeats.
 *
 * Keyed by both plain `question_id` and its section-scoped form
 * `section_id.question_id` so callers can lookup a field by whichever they
 * have on hand.
 *
 * Note that it is safer to query the section-scoped key, since this has
 * no chance of collision with another key in the form.
 *
 * See {@link buildSectionFieldMap}.
 */
export interface SectionFieldMap {
  [questionId: string]: {
    sectionId: string;
    isRepeating: boolean;
  };
}

/**
 * Build a {@link SectionFieldMap} for every field in the form.
 *
 * Each field is registered under its section-scoped ID `section_id.question_id`
 * and also under its plain `question_id` if that plain ID isn't already
 * claimed by another field.
 */
export function buildSectionFieldMap(form: Form): SectionFieldMap {
  const map: SectionFieldMap = {};

  for (const section of form.sections) {
    for (const field of section.fields) {
      const info = {
        sectionId: section.section_id,
        isRepeating: section.repeating ?? false,
      };

      const scopedId = buildSectionQuestionId(
        section.section_id,
        field.question_id,
      );
      map[scopedId] = info;

      if (!map[field.question_id]) {
        map[field.question_id] = info;
      }
    }
  }

  return map;
}

/**
 * How many instances of a repeating section current exist, based on answers.
 *
 * Every repeating fields answer is stored under exactly one key -
 * `section_id.question_id__N` - so this scans for the highest `N` seen
 * across the sections fields and returns that count.
 *
 * Returns 0 for a non-repeating section, or one with no instances yet.
 */
export function getRepeatingInstanceCount(
  section: Section,
  answers: AnswerMap,
): number {
  if (!section.repeating || !section.fields.length) return 0;

  const baseIds = new Set(
    section.fields.map((field) =>
      buildSectionQuestionId(section.section_id, field.question_id),
    ),
  );

  let maxInstance = -1;
  for (const key of Object.keys(answers)) {
    const suffixInfo = parseInstanceSuffix(key);
    if (suffixInfo && baseIds.has(suffixInfo.baseId)) {
      maxInstance = Math.max(maxInstance, suffixInfo.instanceIndex);
    }
  }

  return maxInstance + 1;
}

/**
 * Rewrite a logic rule so that any question ID belonging to a repeating
 * section points at one specific instance of that section.
 *
 * For each condition's `question_id` (any any `$question_id` value reference):
 * - if `currentSectionId` is given and the ID is unscoped, it is first scoped
 *   to that section (`section_id.question_id`)
 * - then if the resolved field is repeating, the ID is suffixed with
 *   `instanceIndex` (`section_id.question_id__N`)
 *   - non-repeating fields are left as their normal ID
 * - conditions targeting fields outside a repeating section are unaffected
 */
export function transformRuleWithInstanceSuffix(
  rule: LogicRule | undefined,
  instanceIndex: number,
  fieldMap: SectionFieldMap,
  currentSectionId?: string,
): LogicRule | undefined {
  if (!rule) return undefined;

  const contextualiseQuestionId = (questionId: string): string => {
    if (!currentSectionId || questionId.includes(".")) return questionId;
    const scopedId = buildSectionQuestionId(currentSectionId, questionId);
    return fieldMap[scopedId] ? scopedId : questionId;
  };

  const transformNode = (node: unknown): unknown => {
    if (!node) return node;

    if (isRule(node)) {
      return {
        ...node,
        conditions: node.conditions.map((c) => transformNode(c)),
      };
    }

    if (isCondition(node)) {
      const contextualQuestionId = contextualiseQuestionId(node.question_id);
      const info = resolveFieldInfo(contextualQuestionId, fieldMap);
      const scopedId =
        info.isRepeating && info.sectionId
          ? ensureSectionQuestionId(info.sectionId, info.baseId)
          : contextualQuestionId;

      const transformed: Condition = {
        ...node,
        question_id: info.isRepeating
          ? addInstanceSuffix(scopedId, instanceIndex)
          : contextualQuestionId,
      };

      if (typeof node.value === "string" && node.value.startsWith("$")) {
        const refId = node.value.substring(1);
        const contextualRefId = contextualiseQuestionId(refId);
        const refInfo = resolveFieldInfo(contextualRefId, fieldMap);
        if (refInfo.isRepeating && refInfo.sectionId) {
          const scopedRef = ensureSectionQuestionId(
            refInfo.sectionId,
            refInfo.baseId,
          );
          transformed.value = `$${addInstanceSuffix(scopedRef, instanceIndex)}`;
        } else {
          transformed.value = `$${contextualRefId}`;
        }
      }

      return transformed;
    }

    return node;
  };

  return transformNode(rule) as LogicRule | undefined;
}

/**
 * Expand a form's validations so that any validation referencing a
 * repeating field becomes on validation per existing instance.
 *
 * Validations that don't reference any repeating fields are unaffected.
 */
export function expandValidationsForRepeating(
  form: Form,
  answers: AnswerMap,
  validations?: Validation[],
): Validation[] {
  const fieldMap = buildSectionFieldMap(form);
  const expanded: Validation[] = [];
  const sourceValidations = validations ?? form.validations ?? [];

  for (const validation of sourceValidations) {
    const referencedIds = extractQuestionIdsFromRule(validation);

    const repeatingReferences = referencedIds.filter(
      (qId) => resolveFieldInfo(qId, fieldMap).isRepeating,
    );

    if (repeatingReferences.length === 0) {
      expanded.push(validation);
      continue;
    }

    const referenceSectionId = resolveFieldInfo(
      repeatingReferences[0],
      fieldMap,
    ).sectionId;
    const section = form.sections.find(
      (s) => s.section_id === referenceSectionId,
    );
    const instanceCount = section
      ? getRepeatingInstanceCount(section, answers)
      : 0;

    for (let i = 0; i < instanceCount; i++) {
      const transformedRule = transformRuleWithInstanceSuffix(
        validation as LogicRule,
        i,
        fieldMap,
      );

      const transformedShownOn = validation.shown_on.map((shownQId) => {
        const shownInfo = resolveFieldInfo(shownQId, fieldMap);
        if (shownInfo.isRepeating && shownInfo.sectionId) {
          const scopedShownId = ensureSectionQuestionId(
            shownInfo.sectionId,
            shownInfo.baseId,
          );
          return addInstanceSuffix(scopedShownId, i);
        }
        return shownQId;
      });

      expanded.push({
        ...validation,
        ...transformedRule,
        shown_on: transformedShownOn,
      });
    }
  }

  return expanded;
}

/**
 * Build a fresh, empty answer entry for every field in a section, scoped to
 * one repeating instance.
 *
 * Keys are `section_id.question_id__instanceIndex`. Use this when a user
 * adds a new instance of a repeating section, then merge the result into
 * the existing answer map (existing keys should take precedence if you only
 * want to fill in gaps).
 */
export function buildRepeatingInstanceAnswers(
  section: Section,
  instanceIndex: number,
): AnswerMap {
  const newAnswers: AnswerMap = {};

  for (const field of section.fields) {
    const baseId = buildSectionQuestionId(
      section.section_id,
      field.question_id,
    );
    const newQuestionId = addInstanceSuffix(baseId, instanceIndex);
    newAnswers[newQuestionId] = createInitialAnswerEntry(
      field.question_type,
      null,
    );
  }

  return newAnswers;
}

export interface RepeatingSectionInstance {
  readonly instanceIndex: number;
  readonly answers: AnswerMap;
}

/**
 * Returns one entry per instance of a repeating section, each containing
 * only that instance's answers. Returns [] for non-repeating sections
 * or sections with no instances yet.
 */
export function getRepeatingSectionInstances(
  section: Section,
  answers: AnswerMap,
): RepeatingSectionInstance[] {
  if (!section.repeating) return [];
  const instanceCount = getRepeatingInstanceCount(section, answers);
  if (instanceCount === 0) return [];

  const instances: RepeatingSectionInstance[] = [];
  for (let i = 0; i < instanceCount; i++) {
    const instanceAnswers: AnswerMap = {};
    for (const field of section.fields) {
      const scopedKey = addInstanceSuffix(
        buildSectionQuestionId(section.section_id, field.question_id),
        i,
      );
      const entry = answers[scopedKey];
      if (entry !== undefined) {
        instanceAnswers[field.question_id] = entry;
      }
    }
    instances.push({ instanceIndex: i, answers: instanceAnswers });
  }
  return instances;
}

export interface RepeatingInstanceField {
  readonly field: Field;
  readonly questionId: string;
}

/**
 * Every field of a repeating section, paired with its instance-scoped answer
 * key for one instance.
 *
 * Callers that render or look up one instance of a repeating section (a
 * form UI, an edit view) can map over this instead of re-deriving
 * `section_id.question_id__N` themselves at every call site.
 */
export function getRepeatingInstanceFields(
  section: Section,
  instanceIndex: number,
): RepeatingInstanceField[] {
  return section.fields.map((field) => ({
    field,
    questionId: addInstanceSuffix(
      buildSectionQuestionId(section.section_id, field.question_id),
      instanceIndex,
    ),
  }));
}
