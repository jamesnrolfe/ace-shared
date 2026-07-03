import type { AnswerValue, ErrorCode, ErrorMessage, Field } from "../types/form";
import { isFieldWithMinMax } from "../types/form";
import type { MaterialsValue } from "../types/form/MaterialsInterface";
import { DEFAULT_DOUBLE_GAPS, DEFAULT_SINGLE_GAPS } from "../types/values";

export function createError(code: ErrorCode, message: string): ErrorMessage {
  return { code, message };
}

export function isValueEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function answerIsRequired(
  required: boolean,
  field: Field,
  value: AnswerValue,
): ErrorMessage | null {
  if (required) {
    if (field.question_type === "GAPS") {
      let expectedGaps: string[] = [];
      if (Array.isArray(field.measurements) && field.measurements.length > 0) {
        expectedGaps = field.measurements;
      } else {
        const isDouble = field.door_type.toUpperCase() === "DOUBLE";
        expectedGaps = isDouble ? DEFAULT_DOUBLE_GAPS : DEFAULT_SINGLE_GAPS;
      }

      const measurements =
        (value as Record<string, { value: number | null }>) || {};
      const isMissingGaps = expectedGaps.some((gapType) => {
        const gapVal = measurements[gapType]?.value;
        return gapVal === null || gapVal === undefined;
      });

      if (isMissingGaps) {
        return createError(
          "REQUIRED",
          "This field is required. All gap measurements must be completed.",
        );
      }
    }

    if (field.question_type === "MATERIALS") {
      const materials = (value as MaterialsValue) || [];

      if (materials.length === 0) {
        return null;
      }

      for (let i = 0; i < materials.length; i++) {
        const mat = materials[i];

        if (!mat.selected_material || mat.selected_material === "_unselected") {
          continue;
        }

        const optionDef = field.options?.find(
          (o) => o.key === mat.selected_material,
        );
        if (!optionDef) continue;

        const missingAttribute = optionDef.attributes?.some((attr) => {
          const isAttrRequired = attr.required ?? true;
          if (!isAttrRequired) return false;
          const attrVal = mat.attributes?.[attr.key];
          return isValueEmpty(attrVal);
        });

        if (missingAttribute) {
          const matName = optionDef.display || mat.selected_material;
          return createError(
            "REQUIRED",
            `This field is required. Some options for ${matName} are not complete.`,
          );
        }
      }

      return null;
    }

    if (field.question_type === "AGREEMENT") {
      return value === true
        ? null
        : createError("REQUIRED", "This field is required.");
    }

    if (isValueEmpty(value))
      return createError("REQUIRED", "This field is required.");
  }
  return null;
}

export function answerExceedsLengthRestrictions(
  field: Field,
  value: AnswerValue,
): ErrorMessage | null {
  if (isFieldWithMinMax(field) && typeof field.answer_minimum === "number") {
    if (!Array.isArray(value)) return null;
    if (value.length < field.answer_minimum) {
      return createError(
        "VALIDATION_MIN_ITEMS",
        `Please select at least ${field.answer_minimum} items.`,
      );
    }
  }

  if (isFieldWithMinMax(field) && typeof field.answer_maximum === "number") {
    if (!Array.isArray(value)) return null;
    if (value.length > field.answer_maximum) {
      return createError(
        "VALIDATION_MAX_ITEMS",
        `Please select at most ${field.answer_maximum} options.`,
      );
    }
  }

  return null;
}
