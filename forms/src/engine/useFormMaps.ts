import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { AnswerMap } from "../types/form";
import type { Form, FormVariables } from "../types/form/form";
import { isPrepopulated } from "../utils/answers";
import { evaluateLogicRule } from "../utils/formLogic";
import {
  addInstanceSuffix,
  buildSectionQuestionId,
  evaluateLogicRuleWithRepeatingContext,
  getMaxRepeatingInstanceIndex,
  type RuleCache,
  replaceThisInRule,
  type SectionFieldMap,
} from "../utils/repeatingValidations";

type BooleanMap = Record<string, boolean>;

export interface UseFormMapsParams {
  definition: Form;
  answers: AnswerMap;
  variables: FormVariables;
  /** Stable map of question ID -> section metadata, built once from the definition via `buildSectionFieldMap`. */
  fieldMap: SectionFieldMap;
  /**
   * Ref to the WeakMap rule cache shared across the form session.
   *
   * Intentionally excluded from memo deps - it mutates without triggering
   * renders, and including it would cause infinite recomputation.
   */
  ruleCacheRef: RefObject<RuleCache>;
}

export interface UseFormMapsResult {
  visibilityMap: BooleanMap;
  requiredMap: BooleanMap;
  editableMap: BooleanMap;
  /** Ref to {@link UseFormMapsResult.visibilityMap} for use in stable callbacks. */
  visibilityMapRef: RefObject<BooleanMap>;
  /** Ref to {@link UseFormMapsResult.requiredMap} for use in stable callbacks. */
  requiredMapRef: RefObject<BooleanMap>;
  /** Ref to {@link UseFormMapsResult.editableMap} for use in stable callbacks. */
  editableMapRef: RefObject<BooleanMap>;
}

/**
 * Computes reactive visibility, required and editable maps for a form instance.
 *
 * Each map is keyed by question ID (or suffixed instance id for repeating
 * sections) and recomputed whenever answers or variables change. Ref-backed
 * copies are also returned so that stable callbacks (see `useFormEngine`)
 * can read the latest values without listing them as memo deps.
 *
 * Platform-agnostic: depends only on the form schema and live answer/variable
 * state, never on how the form is rendered.
 */
export function useFormMaps({
  definition,
  answers,
  variables,
  fieldMap,
  ruleCacheRef,
}: UseFormMapsParams): UseFormMapsResult {
  // biome-ignore lint/correctness/useExhaustiveDependencies: ruleCacheRef intentionally omitted, see field doc
  const visibilityMap = useMemo<BooleanMap>(() => {
    const map: BooleanMap = {};

    for (const section of definition.sections) {
      const sectionVisible = evaluateLogicRule(
        section.show_if,
        answers,
        variables,
      );
      map[section.section_id] = sectionVisible;

      if (!section.repeating) {
        for (const field of section.fields) {
          map[field.question_id] =
            sectionVisible &&
            evaluateLogicRule(
              replaceThisInRule(
                field.show_if,
                field.question_id,
                ruleCacheRef.current,
              ),
              answers,
              variables,
            );
        }
      } else {
        const maxInstance = getMaxRepeatingInstanceIndex(section, answers);
        for (let i = 0; i <= maxInstance; i++) {
          for (const field of section.fields) {
            const suffixedId = addInstanceSuffix(
              buildSectionQuestionId(section.section_id, field.question_id),
              i,
            );
            map[suffixedId] =
              sectionVisible &&
              evaluateLogicRuleWithRepeatingContext(
                replaceThisInRule(
                  field.show_if,
                  field.question_id,
                  ruleCacheRef.current,
                ),
                answers,
                variables,
                fieldMap,
                section.section_id,
                i,
                evaluateLogicRule,
              );
          }
        }
      }
    }

    return map;
  }, [definition.sections, answers, variables, fieldMap]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ruleCacheRef intentionally omitted, see field doc
  const requiredMap = useMemo<BooleanMap>(() => {
    const map: BooleanMap = {};

    for (const section of definition.sections) {
      // Repeating field required-ness is resolved per-instance by the engine's isFieldRequired.
      if (section.repeating) continue;

      for (const field of section.fields) {
        if (
          typeof field.required === "boolean" ||
          field.required === undefined
        ) {
          map[field.question_id] = !!field.required;
          continue;
        }
        map[field.question_id] = evaluateLogicRule(
          replaceThisInRule(
            field.required,
            field.question_id,
            ruleCacheRef.current,
          ),
          answers,
          variables,
        );
      }
    }

    return map;
  }, [definition.sections, answers, variables]);

  const editableMap = useMemo<BooleanMap>(() => {
    const map: BooleanMap = {};

    for (const section of definition.sections) {
      for (const field of section.fields) {
        if (field.if_prepopulated === "DISABLE") {
          // field disabled if was initially prepopulated
          map[field.question_id] = !isPrepopulated(answers[field.question_id]);
        }
      }
    }

    return map;
  }, [definition.sections, answers]);

  const visibilityMapRef = useRef(visibilityMap);
  const requiredMapRef = useRef(requiredMap);
  const editableMapRef = useRef(editableMap);

  useEffect(() => {
    visibilityMapRef.current = visibilityMap;
  }, [visibilityMap]);
  useEffect(() => {
    requiredMapRef.current = requiredMap;
  }, [requiredMap]);
  useEffect(() => {
    editableMapRef.current = editableMap;
  }, [editableMap]);

  return {
    visibilityMap,
    requiredMap,
    editableMap,
    visibilityMapRef,
    requiredMapRef,
    editableMapRef,
  };
}
