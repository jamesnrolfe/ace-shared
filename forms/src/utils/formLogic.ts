import { withTiming } from "../../../ts-utils";
import type { AnswerMap, AnswerValue } from "../types/form";
import type {
  BaseOperator,
  Condition,
  LogicRule,
  Mode,
  Operator,
  VariableCondition,
} from "../types/form/logic";

type compareValue = Condition["value"] | AnswerValue | number | null;

function isLogicRuleNode(node: unknown): node is LogicRule {
  return (
    !!node &&
    typeof node === "object" &&
    Array.isArray((node as { conditions?: unknown }).conditions)
  );
}

function evaluateNode(
  node: Condition | VariableCondition | LogicRule | undefined,
  answers: AnswerMap,
  variables?: Record<string, unknown>,
): boolean {
  if (!node) return true;

  if (isLogicRuleNode(node)) {
    const rule = node as LogicRule;
    if (!rule.conditions || rule.conditions.length === 0) return true;

    const results = rule.conditions.map((child) =>
      evaluateNode(
        child as Condition | VariableCondition | LogicRule,
        answers,
        variables,
      ),
    );

    if (rule.require === "any") {
      return results.some((r) => r === true);
    }
    return results.every((r) => r === true);
  }

  return evaluateSingleCondition(
    node as Condition | VariableCondition,
    answers,
    variables,
  );
}

/**
 * Top-level evaluator for logic rules.
 * Evaluate a given rule and return a boolean pass/fail.
 * Conditions may be nested.
 */
export const evaluateLogicRule = withTiming(
  "evaluateLogicRule",
  function evaluateLogicRule(
    rule: LogicRule | undefined,
    answers: AnswerMap,
    variables?: Record<string, unknown>,
  ): boolean {
    if (!rule) return true;
    return evaluateNode(rule as LogicRule, answers, variables);
  },
);

function compareCandidate(
  left: compareValue,
  operator: Operator,
  targetValue: compareValue,
): boolean {
  const { mode, baseOp } = parseOperator(operator, {
    left: left,
    targetValue: targetValue,
  });

  if (mode === "length") {
    let valueToCheck: compareValue = left;
    if (Array.isArray(left)) {
      valueToCheck = left.length;
    } else if (typeof left === "string") {
      valueToCheck = left.length;
    } else {
      return false;
    }
    return compareValues(valueToCheck, baseOp, targetValue);
  }

  return compareValues(left as compareValue, baseOp, targetValue);
}

function evaluateSingleCondition(
  condition: Condition | VariableCondition,
  answers: AnswerMap,
  variables?: Record<string, unknown>,
): boolean {
  if ((condition as VariableCondition).variable_id !== undefined) {
    const vc = condition as VariableCondition;

    let left: compareValue = null;
    if (variables && vc.variable_id in variables) {
      left = variables[vc.variable_id] as compareValue;
    } else {
      const answerEntry = answers[vc.variable_id];
      if (answerEntry) {
        left = answerEntry.value_current ?? null;
      }
    }

    const targetValue = resolveValue(vc.value as Condition["value"], answers);
    return compareCandidate(left, vc.operator as Operator, targetValue);
  }

  const cond = condition as Condition;
  const { question_id, operator, value } = cond;

  const entry = answers[question_id];
  let rawAnswer = entry?.value_current ?? null;

  if (rawAnswer === null && variables && question_id in variables) {
    rawAnswer = variables[question_id] as compareValue;
  }

  const targetValue = resolveValue(value, answers);

  if (cond.field) {
    const candidates: compareValue[] = [];

    const extractFromSingle = (item: compareValue) => {
      if (!cond.field || cond.field === "." || cond.field === "") {
        candidates.push(item);
        return;
      }

      if (item === null || item === undefined || typeof item !== "object") {
        return;
      }

      const vals = extractValuesFromObject(item, cond.field);
      for (const v of vals) candidates.push(v);
    };

    if (Array.isArray(rawAnswer)) {
      for (const it of rawAnswer) {
        extractFromSingle(it as compareValue);
      }
    } else {
      extractFromSingle(rawAnswer);
    }

    if (candidates.length === 0) return false;

    const scope = (cond.scope ?? "any").toLowerCase();
    switch (scope) {
      case "any":
        return candidates.some((c) =>
          compareCandidate(c, operator as Operator, targetValue),
        );
      case "all":
        return candidates.every((c) =>
          compareCandidate(c, operator as Operator, targetValue),
        );
      default:
        return candidates.some((c) =>
          compareCandidate(c, operator as Operator, targetValue),
        );
    }
  }

  return compareCandidate(rawAnswer, operator as Operator, targetValue);
}

function compareValues(
  a: compareValue,
  op: BaseOperator,
  b: compareValue,
): boolean {
  // "in"/"nin" fall through to the switch below even when a value is
  // null/undefined - their target is usually an array, and the switch's
  // String()-based membership check already handles a literal `null` member
  // correctly (e.g. `null nin [null, 'Unknown']` must be false, since null
  // IS in that list - a blanket "null short-circuits to true" would get
  // that backwards).
  if (
    op !== "in" &&
    op !== "nin" &&
    (a === null || a === undefined || b === null || b === undefined)
  ) {
    if (
      op === "eq" ||
      op === "=" ||
      op === "==" ||
      op === "===" ||
      op === "equals" ||
      op === "is"
    )
      return a === b;
    if (
      op === "neq" ||
      op === "!=" ||
      op === "!==" ||
      op === "does not equal" ||
      op === "is not"
    )
      return a !== b;
    // handled negated operators so they return true whe evaluated against
    // null/undefined
    if (
      op === "nstarts_with" ||
      op === "nstarts" ||
      op === "nstartswith" ||
      op === "nends_with" ||
      op === "nends" ||
      op === "nendswith" ||
      op === "ncontains" ||
      op === "nincludes" ||
      op === "nhas" ||
      op === "does not contain" ||
      op === "does not include" ||
      op === "does not have"
    ) {
      return true;
    }
    return false;
  }

  switch (op) {
    case "=":
    case "==":
    case "===":
    case "equals":
    case "is":
    case "eq":
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        const sortedA = a.map(String).sort();
        const sortedB = b.map(String).sort();
        return sortedA.every((val, i) => val === sortedB[i]);
      }
      if (Array.isArray(a) || Array.isArray(b)) return false;
      return String(a) === String(b);

    case "!=":
    case "!==":
    case "does not equal":
    case "is not":
    case "neq":
      return !compareValues(a, "eq", b);

    case ">":
    case "greater than":
    case "gt":
      return Number(a) > Number(b);

    case "<":
    case "less than":
    case "lt":
      return Number(a) < Number(b);

    case ">=":
    case "greater than or equal to":
    case "gte":
      return Number(a) >= Number(b);

    case "<=":
    case "less than or equal to":
    case "lte":
      return Number(a) <= Number(b);

    case "includes":
    case "has":
    case "contains":
    case "in":
      if (op === "in") {
        const t = a;
        a = b;
        b = t;
      }
      if (Array.isArray(a)) {
        const aStrSet = new Set(a.map(String));
        const bValues = Array.isArray(b) ? b : [b];
        return bValues.every((v) => aStrSet.has(String(v)));
      }
      if (Array.isArray(b)) {
        const bStrSet = new Set(b.map(String));
        const aValues = Array.isArray(a) ? a : [a];
        return aValues.every((v) => bStrSet.has(String(v)));
      }
      if (typeof a === "string") {
        return a.includes(String(b));
      }
      return false;

    case "ncontains":
    case "nincludes":
    case "nhas":
    case "does not contain":
    case "does not include":
    case "does not have":
    case "nin":
      if (op === "nin") {
        const t = a;
        a = b;
        b = t;
      }
      if (Array.isArray(a)) {
        const aStrSet = new Set(a.map(String));
        const bValues = Array.isArray(b) ? b : [b];
        return bValues.every((v) => !aStrSet.has(String(v)));
      }
      if (Array.isArray(b)) {
        const bStrSet = new Set(b.map(String));
        const aValues = Array.isArray(a) ? a : [a];
        return aValues.every((v) => !bStrSet.has(String(v)));
      }
      if (typeof a === "string") {
        return !a.includes(String(b));
      }
      return true;

    case "re":
    case "regex":
    case "test":
    case "~":
    case "matches":
      try {
        const re = new RegExp(String(b ?? ""));
        if (Array.isArray(a)) {
          return a.some((el) => typeof el === "string" && re.test(el));
        }
        return typeof a === "string" ? re.test(a) : false;
      } catch {
        return false;
      }

    case "starts_with":
    case "starts":
    case "startswith":
      if (typeof a === "number") a = String(a);
      if (typeof b === "number") b = String(b);
      if (typeof a === "string" && typeof b === "string") {
        return a.startsWith(b);
      }
      if (Array.isArray(a) && Array.isArray(b)) {
        const left = a as unknown[];
        const right = b as unknown[];
        if (right.length > left.length) return false;
        const leftStart = left.slice(0, b.length);
        return leftStart.every((val, i) => String(val) === String(right[i]));
      }
      return false;

    case "nstarts_with":
    case "nstarts":
    case "nstartswith":
      return !compareValues(a, "startswith", b);

    case "ends":
    case "ends_with":
    case "endswith":
      if (typeof a === "number") a = String(a);
      if (typeof b === "number") b = String(b);
      if (typeof a === "string" && typeof b === "string") {
        return a.endsWith(b);
      }
      if (Array.isArray(a) && Array.isArray(b)) {
        const left = a as unknown[];
        const right = b as unknown[];
        if (right.length > left.length) return false;
        const leftEnd = left.slice(left.length - right.length);
        return leftEnd.every((val, i) => String(val) === String(right[i]));
      }
      return false;

    case "nends_with":
    case "nends":
    case "nendswith":
      return !compareValues(a, "endswith", b);

    default:
      return false;
  }
}

function resolveValue(
  value: Condition["value"],
  answers: AnswerMap,
): compareValue {
  if (typeof value === "string" && value.startsWith("$")) {
    const targetId = value.substring(1);
    const entry = answers[targetId];
    return entry?.value_current ?? null;
  }
  return value;
}

function parseOperator(
  op: Operator,
  debug: { left?: unknown; targetValue?: unknown },
): { mode: Mode; baseOp: BaseOperator } {
  if (!op) {
    console.warn(
      `[parseOperator] Missing operator. Found ${op} surrounded by left=${debug.left}, targetValue=${debug.targetValue}. Defaulting to eq.`,
    );
    return { mode: "value", baseOp: "eq" };
  }
  if (op.startsWith("length_")) {
    return {
      mode: "length",
      baseOp: op.replace("length_", "") as BaseOperator,
    };
  }
  return {
    mode: "value",
    baseOp: op as BaseOperator,
  };
}

function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === "object" && u !== null && !Array.isArray(u);
}

function getAtPath(root: unknown, path: string): unknown {
  if (!path || path === ".") return root;
  const parts = path.split(".");
  let cur: unknown = root;
  for (const p of parts) {
    if (!isRecord(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[p];
    if (typeof cur === "undefined") return undefined;
  }
  return cur;
}

function extractValuesFromObject(
  obj: unknown,
  fieldPath: string,
): compareValue[] {
  if (obj === null || typeof obj === "undefined" || !fieldPath) return [];

  const wildcardIndex = fieldPath.indexOf("[]");
  if (wildcardIndex !== -1) {
    const before = fieldPath.slice(0, wildcardIndex).replace(/^\./, "");
    const after = fieldPath.slice(wildcardIndex + 2);
    const arrCandidate = getAtPath(obj, before);

    if (!Array.isArray(arrCandidate)) return [];

    const path = after.startsWith(".") ? after.slice(1) : after;
    const out: compareValue[] = [];

    for (const el of arrCandidate) {
      if (!path) {
        out.push(el as compareValue);
      } else {
        const val = getAtPath(el, path);
        if (typeof val !== "undefined") out.push(val as compareValue);
      }
    }
    return out;
  }

  const value = getAtPath(obj, fieldPath);
  if (typeof value === "undefined" || value === null) return [];

  if (Array.isArray(value)) {
    return value.map((v) => v as compareValue);
  }

  return [value as compareValue];
}
