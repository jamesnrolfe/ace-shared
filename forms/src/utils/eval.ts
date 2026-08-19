import jexl from "jexl";

jexl.addFunction("toLowerCase", (v: unknown) => String(v ?? "").toLowerCase());
jexl.addFunction("endsWith", (v: unknown, suffix: string) =>
  String(v ?? "").endsWith(suffix),
);
jexl.addFunction("startsWith", (v: unknown, prefix: string) =>
  String(v ?? "").startsWith(prefix),
);

import type { AnswerMap, AnswerValue } from "../types/form";
import type {
  Form,
  FormVariable,
  FormVariables,
  FormVariableValue,
} from "../types/form/form";
import { createInitialAnswerEntry } from "./answers";

export function buildJexlContext(
  answers: AnswerMap,
): Record<string, AnswerValue> {
  const context: Record<string, AnswerValue> = {};

  for (const [questionId, entry] of Object.entries(answers)) {
    context[questionId] = entry?.value_current ?? null;
  }

  return context;
}

export async function evaluateAllVariables(
  variablesDefinition: FormVariable[],
  answers: AnswerMap,
  currentVariablesState: FormVariables = {},
): Promise<FormVariables> {
  const newVariables: FormVariables = { ...currentVariablesState };
  const baseContext = buildJexlContext(answers);

  for (const variable of variablesDefinition) {
    if (variable.eval) {
      try {
        const evalContext = { ...baseContext, ...newVariables };
        const result = await jexl.eval(variable.eval, evalContext);
        newVariables[variable.id] = result as FormVariableValue;
      } catch (err) {
        console.warn(`[VarEval] Eval failed for ${variable.id}:`, err);
        newVariables[variable.id] = variable.default ?? null;
      }
    } else {
      if (!(variable.id in newVariables)) {
        newVariables[variable.id] = variable.default ?? null;
      }
    }
  }
  return newVariables;
}

export async function evaluateFieldInitialValues(
  definition: Form,
  seededAnswers: AnswerMap,
  seededVariables: FormVariables,
): Promise<AnswerMap> {
  const newAnswers = { ...seededAnswers };

  for (const section of definition.sections) {
    if (section.repeating) continue;

    for (const field of section.fields) {
      if (field.start === "EVAL" && field.eval) {
        const entry = newAnswers[field.question_id];

        const hasUserValue =
          entry &&
          entry.value_current !== null &&
          entry.value_current !== entry.value_initial;

        if (!hasUserValue) {
          try {
            const context = {
              ...seededVariables,
              ...buildJexlContext(newAnswers),
            };
            const result = await jexl.eval(field.eval, context);
            newAnswers[field.question_id] = createInitialAnswerEntry(
              field.question_type,
              result as AnswerValue,
            );
          } catch (err) {
            console.warn(`[FieldEval] Failed for ${field.question_id}:`, err);
          }
        }
      }
    }
  }

  return newAnswers;
}
