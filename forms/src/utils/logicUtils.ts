import {
  type Condition,
  type Form,
  isCondition,
  isRule,
  type LogicRule,
  type Validation,
} from "../types/form";

/**
 * Collect every question ID referenced anywhere within a logic rule.
 *
 * Walks nested conditions recursively, and also takes questions referenced
 * via $-notation (e.g. `value: $question_id`).
 */
export function extractQuestionIdsFromRule(
  rule: LogicRule | undefined,
): string[] {
  if (!rule) return [];

  // use a set to catch dupes
  const ids = new Set<string>();

  function traverse(node: unknown) {
    if (!node) return;
    if (isRule(node)) {
      for (const condition of node.conditions) {
        traverse(condition);
      }
    }

    if (isCondition(node)) {
      ids.add(node.question_id);

      // catch $-notation
      if (typeof node.value === "string" && node.value.startsWith("$")) {
        const refId = node.value.substring(1);
        ids.add(refId);
      }
    }
  }

  traverse(rule);
  // set -> arr
  return Array.from(ids);
}

/**
 * Momoises the result of a {@link replaceThisInRule} per rule, per question ID,
 * so a rule shared across many `this`-relative contexts (e.g. field options)
 * isn't rewalked every time.
 */
export type RuleCache = WeakMap<LogicRule, Map<string, LogicRule>>;

/**
 * Search a logic rule and replace all instances of the word `this` with
 * the current questionId provided.
 *
 * Optionally provide a map containing previously determined rules to
 * avoid new search every time (see {@link RuleCache} type). This will
 * be updated with new finds.
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
    if (isRule(node)) {
      return {
        ...node,
        conditions: node.conditions.map((c) => transformNode(c)),
      };
    }

    if (isCondition(node)) {
      const transformed: Condition = {
        ...node,
        question_id:
          node.question_id === THIS_KWRD ? currentQuestionId : node.question_id,
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
      const fieldVal = field.validations;
      if (!fieldVal) continue;

      const rewrittenRule = replaceThisInRule(fieldVal, field.question_id);

      // field level validations are allowed to specify `this` in their shown_on,
      // or furthermore not specify it at all and implicitly provide [this].
      const shownOn = (
        fieldVal.shown_on?.length ? fieldVal.shown_on : [field.question_id]
      ).map((id: string) => (id === "this" ? field.question_id : id));

      compiled.push({
        ...fieldVal,
        ...rewrittenRule,
        shown_on: shownOn,
      });
    }
  }

  return compiled;
}
