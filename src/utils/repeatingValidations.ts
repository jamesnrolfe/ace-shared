import type {
  AnswerMap,
  Condition,
  LogicRule,
  Section,
  Validation,
} from "../types/form";
import type { Form } from "../types/form/form";
import { createInitialAnswerEntry } from "./answers";

/**
 * Lookup table from a question ID to which section it belongs to and
 * whether that section repeats.
 *
 * Keyed by both the plain `question_id` and its section-scoped form
 * (`section_id.question_id`), so callers can look up a field by whichever
 * form of the ID they have on hand. See {@link buildSectionFieldMap}.
 */
export interface SectionFieldMap {
  [questionId: string]: {
    sectionId: string;
    isRepeating: boolean;
  };
}

/**
 * Build a {@link SectionFieldMap} for every field in a form.
 *
 * Each field is registered under its section-scoped ID
 * (`section_id.question_id`), and also under its plain `question_id` if that
 * plain ID isn't already claimed by an earlier field.
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
 * Collect every question ID referenced anywhere within a logic rule.
 *
 * Walks nested conditions recursively, and also picks up question IDs used
 * as a `$question_id` value reference (rather than as the condition's own
 * `question_id`). Used to detect which validations/rules touch fields in a
 * repeating section, so they can be expanded per-instance.
 */
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

/**
 * Memoises the result of {@link replaceThisInRule} per rule, per question ID,
 * so a rule shared across many `this`-relative contexts (e.g. field options)
 * isn't re-walked on every evaluation.
 */
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

/**
 * Compile a full list of Form Validations, replacing `this` keyword in each
 * instance with the relevant question id.
 *
 * This combines top level `form.validations` with field level `field.validations`
 * into a single list of validations.
 */
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

/**
 * Get the maximum instance of a repeating instance, based on the answers
 * provided.
 */
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

/**
 * Count how many instances of a repeating section exist, based on answers.
 *
 * Only the first ID in `baseQuestionIds` is used to locate the section (via
 * `fieldMap`); the rest are assumed to belong to the same section. Unlike
 * {@link getMaxRepeatingInstanceIndex}, this returns a count (0 when no
 * instances exist) rather than a highest index (-1 when none exist).
 */
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

/**
 * Helper to generate a `question_id` with an instance suffix.
 *
 * Returns `[ question_id ]__[ instanceIndex ]`.
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

/**
 * Rewrite a logic rule so that any question ID belonging to a repeating
 * section points at one specific instance of that section.
 *
 * For each condition's `question_id` (and any `$question_id` value
 * reference): if `currentSectionId` is given and the ID is unscoped, it is
 * first scoped to that section (`section_id.question_id`). Then, if the
 * resolved field is repeating, the ID is suffixed with `instanceIndex`
 * (`section_id.question_id__N`); non-repeating fields are left as their
 * contextualized ID, unsuffixed. Conditions targeting fields outside a
 * repeating section are unaffected. This is what lets a single `show_if`/
 * `required`/validation rule defined once on a repeating field's schema be
 * evaluated separately against each instance's own answers.
 */
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

/**
 * Expand a form's validations so that any validation referencing a
 * repeating field becomes one validation per existing instance.
 *
 * Validations that don't reference any repeating field are passed through
 * unchanged. For validations that do, one copy is produced per instance
 * (via {@link transformRuleWithInstanceSuffix}) up to however many instances
 * currently exist ({@link getRepeatingInstanceCount}), with `shown_on`
 * rewritten to point at that instance's suffixed question IDs. If
 * `validations` is omitted, `form.validations` is used.
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

/**
 * Remove one instance of a repeating section from an answer map, shifting
 * all later instances down by one so indices stay contiguous.
 *
 * Answers for fields outside the target section are left untouched. Matches
 * both scoped and unscoped instance keys via {@link getRepeatingBaseIdCandidates},
 * so it's safe to call regardless of which convention the caller used to
 * write the instance's answers.
 */
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

/**
 * Evaluate a logic rule for one instance of a repeating field, or fall back
 * to a plain evaluation if there's no repeating context to apply.
 *
 * When `sectionId` and `instanceIndex` are both provided, the rule is first
 * rewritten via {@link transformRuleWithInstanceSuffix} so its conditions
 * target that specific instance's answers, then handed to `evaluateRule`
 * (typically `evaluateLogicRule`). Otherwise `rule` is evaluated as-is. This
 * wrapper exists so callers evaluating show_if/required/validation rules
 * don't need to branch on whether the field is repeating themselves.
 */
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

/**
 * Prefix a question ID with its section ID, unconditionally.
 *
 * Returns `section_id.question_id`. Prefer {@link ensureSectionQuestionId}
 * when the question ID might already be scoped or dotted.
 */
export function buildSectionQuestionId(
  sectionId: string,
  questionId: string,
): string {
  return `${sectionId}.${questionId}`;
}

/**
 * Get every key an answer for this field might be stored under, without
 * an instance suffix.
 *
 * Returns the section-scoped ID and the plain `question_id` when they
 * differ (via {@link ensureSectionQuestionId}), or just `[question_id]` when
 * scoping wouldn't change it. Used wherever an answer map might have been
 * written by either convention, so lookups (and instance discovery) match
 * both.
 */
export function getRepeatingBaseIdCandidates(
  sectionId: string,
  questionId: string,
): string[] {
  const scoped = ensureSectionQuestionId(sectionId, questionId);
  if (scoped === questionId) return [questionId];
  return [scoped, questionId];
}

/**
 * Scope a question ID to its section, unless it's already scoped.
 *
 * Returns `questionId` unchanged if `sectionId` is falsy, if `questionId`
 * already starts with `section_id.`, or if `questionId` already contains a
 * `.` (assumed to be scoped to some other section already). Otherwise
 * returns `section_id.question_id`.
 */
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
 * Look up which section a question ID belongs to, and whether it's
 * repeating, tolerating scoped, unscoped, and instance-suffixed forms of
 * the ID.
 *
 * Strips any instance suffix first, then tries the ID as-is against
 * `fieldMap`; if that misses and the ID contains a `.`, it retries with the
 * segment after the first dot (in case the ID was scoped to a section that
 * isn't in `fieldMap`, e.g. a stale or cross-form reference). Falls back to
 * `{ baseId: questionId }` with no section/repeating info if nothing
 * matches.
 */
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
