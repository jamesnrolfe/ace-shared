import type {
  AnswerMap,
  Condition,
  LogicRule,
  Section,
  Validation,
} from "../types/form";
import type { Form } from "../types/form/form";
import { createInitialAnswerEntry } from "./answers";

export interface SectionFieldMap {
  [questionId: string]: {
    sectionId: string;
    isRepeating: boolean;
  };
}

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

export function extractQuestionIdsFromRule(
  rule: LogicRule | undefined,
): string[] {
  if (!rule) return [];

  const ids = new Set<string>();

  function traverse(node: unknown) {
    if (!node) return;
    const asRule = node as LogicRule;
    if (asRule.conditions !== undefined && Array.isArray(asRule.conditions)) {
      for (const condition of asRule.conditions) {
        traverse(condition);
      }
    }

    const asCond = node as Condition;
    if (asCond.question_id) {
      ids.add(asCond.question_id);
    }

    if (typeof asCond.value === "string" && asCond.value.startsWith("$")) {
      const refId = asCond.value.substring(1);
      ids.add(refId);
    }
  }

  traverse(rule);
  return Array.from(ids);
}

export type RuleCache = WeakMap<LogicRule, Map<string, LogicRule>>;

/**
 * Search a logic rule and replace all instances of the word 'this' with
 * the currentQuestionId provided.
 *
 * Optionally provide a map containing previously determined rules to avoid
 * new search every time. This will be updated with new finds.
 */
export function replaceThisInRule(
  rule: LogicRule | undefined,
  currentQuestionId: string,
  cache: RuleCache = new WeakMap(),
): LogicRule | undefined {
  if (!rule) return undefined;

  let questionCache = cache.get(rule);
  if (!questionCache) {
    questionCache = new Map<string, LogicRule>();
    cache.set(rule, questionCache);
  }

  const cachedRule = questionCache.get(currentQuestionId);
  if (cachedRule) {
    return cachedRule;
  }

  const THIS_KWRD = "this";

  const transformNode = (node: unknown): unknown => {
    if (!node) return node;
    const asRule = node as LogicRule;
    if (asRule.conditions !== undefined && Array.isArray(asRule.conditions)) {
      return {
        ...asRule,
        conditions: asRule.conditions.map((c) => transformNode(c)),
      };
    }

    const asCond = node as Condition;
    if (typeof asCond.question_id === "string") {
      const transformed: Condition = {
        ...asCond,
        question_id:
          asCond.question_id === THIS_KWRD
            ? currentQuestionId
            : asCond.question_id,
      };

      if (
        typeof transformed.value === "string" &&
        transformed.value === `$${THIS_KWRD}`
      ) {
        transformed.value = `$${currentQuestionId}`;
      }

      return transformed;
    }

    return node;
  };

  const result = transformNode(rule) as LogicRule;
  questionCache.set(currentQuestionId, result);
  return result;
}

export function compileFormValidations(form: Form): Validation[] {
  const compiled: Validation[] = [...(form.validations ?? [])];

  for (const section of form.sections) {
    for (const field of section.fields) {
      const qv = field.validations;
      if (!qv) continue;

      const rewrittenRule = replaceThisInRule(qv, field.question_id);

      const shownOn = (
        qv.shown_on?.length ? qv.shown_on : [field.question_id]
      ).map((id: string) => (id === "this" ? field.question_id : id));

      compiled.push({
        ...qv,
        ...rewrittenRule,
        shown_on: shownOn,
      });
    }
  }

  return compiled;
}

export function getMaxRepeatingInstanceIndex(
  section: Section,
  answers: AnswerMap,
): number {
  if (!section.repeating || !section.fields.length) return -1;

  const candidateBaseIds = new Set<string>();
  for (const field of section.fields) {
    const candidates = getRepeatingBaseIdCandidates(
      section.section_id,
      field.question_id,
    );
    for (const candidate of candidates) {
      candidateBaseIds.add(candidate);
    }
  }

  let maxInstance = -1;
  for (const key of Object.keys(answers)) {
    if (candidateBaseIds.has(key)) {
      maxInstance = Math.max(maxInstance, 0);
      continue;
    }

    const suffixInfo = parseInstanceSuffix(key);
    if (
      suffixInfo &&
      candidateBaseIds.has(suffixInfo.baseId) &&
      suffixInfo.instanceIndex >= 0
    ) {
      maxInstance = Math.max(maxInstance, suffixInfo.instanceIndex);
    }
  }

  return maxInstance;
}

export function getRepeatingInstanceCount(
  baseQuestionIds: string[],
  answers: AnswerMap,
  fieldMap: SectionFieldMap,
): number {
  if (baseQuestionIds.length === 0) return 0;

  const info = resolveFieldInfo(baseQuestionIds[0], fieldMap);
  const baseCandidates = info.sectionId
    ? getRepeatingBaseIdCandidates(info.sectionId, info.baseId)
    : [info.baseId];

  let maxInstance = -1;

  for (const key of Object.keys(answers)) {
    for (const baseId of baseCandidates) {
      if (key === baseId) {
        maxInstance = Math.max(maxInstance, 0);
      }
      if (key.startsWith(`${baseId}__`)) {
        const suffix = key.substring(baseId.length + 2);
        const instance = parseInt(suffix, 10);
        if (!Number.isNaN(instance)) {
          maxInstance = Math.max(maxInstance, instance);
        }
      }
    }
  }

  return maxInstance >= 0 ? maxInstance + 1 : 0;
}

export function addInstanceSuffix(
  questionId: string,
  instanceIndex: number,
): string {
  return `${questionId}__${instanceIndex}`;
}

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

export function transformRuleWithInstanceSuffix(
  rule: LogicRule | undefined,
  instanceIndex: number,
  fieldMap: SectionFieldMap,
  currentSectionId?: string,
): LogicRule | undefined {
  if (!rule) return undefined;

  const contextualizeQuestionId = (questionId: string): string => {
    if (!currentSectionId || questionId.includes(".")) return questionId;
    const scopedId = buildSectionQuestionId(currentSectionId, questionId);
    return fieldMap[scopedId] ? scopedId : questionId;
  };

  const transformNode = (node: unknown): unknown => {
    if (!node) return node;

    const asRule = node as LogicRule;
    if (asRule.conditions !== undefined && Array.isArray(asRule.conditions)) {
      return {
        ...asRule,
        conditions: asRule.conditions.map((c) => transformNode(c)),
      };
    }

    const asCond = node as Condition;
    if (asCond.question_id !== undefined) {
      const contextualQuestionId = contextualizeQuestionId(asCond.question_id);
      const info = resolveFieldInfo(contextualQuestionId, fieldMap);
      const scopedId =
        info.isRepeating && info.sectionId
          ? ensureSectionQuestionId(info.sectionId, info.baseId)
          : contextualQuestionId;

      const transformed: Condition = {
        ...asCond,
        question_id: info.isRepeating
          ? addInstanceSuffix(scopedId, instanceIndex)
          : contextualQuestionId,
      };

      if (typeof asCond.value === "string" && asCond.value.startsWith("$")) {
        const refId = asCond.value.substring(1);
        const contextualRefId = contextualizeQuestionId(refId);
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

    const instanceCount = getRepeatingInstanceCount(
      repeatingReferences,
      answers,
      fieldMap,
    );

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

export function removeRepeatingInstanceAnswers(
  answers: AnswerMap,
  section: Section,
  instanceIndex: number,
): AnswerMap {
  const newAnswers: AnswerMap = {};
  const candidateBaseIds = new Set<string>();

  for (const field of section.fields) {
    const candidates = getRepeatingBaseIdCandidates(
      section.section_id,
      field.question_id,
    );
    for (const baseId of candidates) {
      candidateBaseIds.add(baseId);
    }
  }

  for (const [key, entry] of Object.entries(answers)) {
    const suffixInfo = parseInstanceSuffix(key);
    if (!suffixInfo || !candidateBaseIds.has(suffixInfo.baseId)) {
      newAnswers[key] = entry;
      continue;
    }

    if (suffixInfo.instanceIndex === instanceIndex) {
      continue;
    }

    if (suffixInfo.instanceIndex > instanceIndex) {
      const shiftedKey = addInstanceSuffix(
        suffixInfo.baseId,
        suffixInfo.instanceIndex - 1,
      );
      newAnswers[shiftedKey] = entry;
      continue;
    }

    newAnswers[key] = entry;
  }

  return newAnswers;
}

export function evaluateLogicRuleWithRepeatingContext(
  rule: LogicRule | undefined,
  answers: AnswerMap,
  variables: Record<string, unknown> | undefined,
  fieldMap: SectionFieldMap,
  sectionId: string | undefined,
  instanceIndex: number | undefined,
  evaluateRule: (
    rule: LogicRule | undefined,
    answers: AnswerMap,
    variables?: Record<string, unknown>,
  ) => boolean,
) {
  if (!rule || instanceIndex === undefined || !sectionId) {
    return evaluateRule(rule, answers, variables);
  }

  const transformedRule = transformRuleWithInstanceSuffix(
    rule,
    instanceIndex,
    fieldMap,
    sectionId,
  );

  return evaluateRule(transformedRule, answers, variables);
}

export function buildSectionQuestionId(
  sectionId: string,
  questionId: string,
): string {
  return `${sectionId}.${questionId}`;
}

export function getRepeatingBaseIdCandidates(
  sectionId: string,
  questionId: string,
): string[] {
  const scoped = ensureSectionQuestionId(sectionId, questionId);
  if (scoped === questionId) return [questionId];
  return [scoped, questionId];
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

export function resolveFieldInfo(
  questionId: string | undefined,
  fieldMap: SectionFieldMap,
): { baseId: string; sectionId?: string; isRepeating?: boolean } {
  if (typeof questionId !== "string") {
    return { baseId: "" };
  }
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
 * One resolved instance of a repeating section, with answers re-keyed by the
 * plain field question_id (no section prefix, no instance suffix) so callers
 * can do a simple `instanceAnswers[field.question_id]` lookup.
 */
export interface RepeatingSectionInstance {
  readonly instanceIndex: number;
  readonly answers: AnswerMap;
}

/**
 * Returns one entry per instance of a repeating section, each containing only
 * that instance's answers.  Returns [] for non-repeating sections or sections
 * with no instances yet.
 */
export function getRepeatingSectionInstances(
  section: Section,
  answers: AnswerMap,
): RepeatingSectionInstance[] {
  if (!section.repeating) return [];
  const maxInstance = getMaxRepeatingInstanceIndex(section, answers);
  if (maxInstance < 0) return [];

  const instances: RepeatingSectionInstance[] = [];
  for (let i = 0; i <= maxInstance; i++) {
    const instanceAnswers: AnswerMap = {};
    for (const field of section.fields) {
      const scopedKey = addInstanceSuffix(
        buildSectionQuestionId(section.section_id, field.question_id),
        i,
      );
      const plainKey = addInstanceSuffix(field.question_id, i);
      const entry = answers[scopedKey] ?? answers[plainKey];
      if (entry !== undefined) {
        instanceAnswers[field.question_id] = entry;
      }
    }
    instances.push({ instanceIndex: i, answers: instanceAnswers });
  }
  return instances;
}
