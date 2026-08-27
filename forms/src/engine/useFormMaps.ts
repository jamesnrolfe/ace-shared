import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { AnswerMap } from "../types/form";
import type { Form, FormVariables } from "../types/form/form";
import {
  buildFormDependencyGraph,
  type FormDependencyGraph,
  type RuleCache,
  replaceThisInRule,
} from "../utils";
import { isPrepopulated } from "../utils/answers";
import { evaluateLogicRule } from "../utils/formLogic";
import {
  addInstanceSuffix,
  buildSectionQuestionId,
  evaluateLogicRuleWithRepeatingContext,
  getRepeatingInstanceCount,
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

/** Question/variable IDs whose value differs (by reference) between two
 * renders' worth of answers/variables - `undefined` `prev` means "first
 * render", handled separately by the caller rather than here. Reference
 * comparison is enough: the engine reducer always replaces an entry with a
 * new object when its value changes and never touches untouched entries
 * (see formEngineReducer's `setAnswer`), so this can't miss a real change
 * or false-positive on an unrelated one. */
function changedIds(
  next: Record<string, unknown>,
  prev: Record<string, unknown>,
): Set<string> {
  const changed = new Set<string>();
  for (const key of Object.keys(next)) {
    if (next[key] !== prev[key]) changed.add(key);
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next)) changed.add(key);
  }
  return changed;
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
 *
 * `visibilityMap`/`requiredMap` only re-evaluate the specific non-repeating
 * fields/sections a given answers/variables change could actually affect
 * (via `buildFormDependencyGraph`), instead of every field in the form -
 * on a large form this is the difference between one rule evaluation and
 * hundreds, per keystroke. Repeating sections keep the original full-sweep
 * behaviour, since their field count is itself runtime data that doesn't
 * fit a dependency index built once from the static definition.
 */
export function useFormMaps({
  definition,
  answers,
  variables,
  fieldMap,
  ruleCacheRef,
}: UseFormMapsParams): UseFormMapsResult {
  const dependencyGraph: FormDependencyGraph = useMemo(
    () => buildFormDependencyGraph(definition),
    [definition],
  );

  // Snapshots of the previous render's inputs/output, mutated in place
  // inside the useMemo bodies below - deliberately not useRef+useEffect
  // (which would lag a render behind), since the diff needs "what changed
  // since the last time *this* memo ran", available synchronously.
  const prevVisibilityInputsRef = useRef<{
    answers: AnswerMap;
    variables: FormVariables;
    map: BooleanMap;
  } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ruleCacheRef intentionally omitted, see field doc
  const visibilityMap = useMemo<BooleanMap>(() => {
    const prev = prevVisibilityInputsRef.current;

    // Scope of non-repeating fields/sections that actually need
    // re-evaluating this render. `null` means "everything" (first render,
    // or definition identity changed under us).
    let affectedFieldIds: Set<string> | null = null;
    let affectedSectionIds: Set<string> | null = null;

    if (prev) {
      const changed = new Set([
        ...changedIds(answers, prev.answers),
        ...changedIds(variables, prev.variables),
      ]);

      affectedSectionIds = new Set<string>();
      affectedFieldIds = new Set<string>();
      for (const id of changed) {
        for (const sectionId of dependencyGraph.sectionVisibilityDependents.get(
          id,
        ) ?? []) {
          affectedSectionIds.add(sectionId);
        }
        for (const fieldId of dependencyGraph.fieldVisibilityDependents.get(
          id,
        ) ?? []) {
          affectedFieldIds.add(fieldId);
        }
      }
      // A section's own visibility changing (or being re-checked) gates
      // every field in it, regardless of whether that field's own rule
      // references what changed - it must be recomputed too.
      for (const sectionId of affectedSectionIds) {
        for (const fieldId of dependencyGraph.nonRepeatingFieldsBySectionId.get(
          sectionId,
        ) ?? []) {
          affectedFieldIds.add(fieldId);
        }
      }
    }

    const map: BooleanMap = prev ? { ...prev.map } : {};

    for (const section of definition.sections) {
      if (section.repeating) {
        // Unchanged from the original full-sweep behaviour - instance
        // count is runtime data, not something the static dependency
        // graph can index ahead of time.
        const sectionVisible = evaluateLogicRule(
          section.show_if,
          answers,
          variables,
        );
        map[section.section_id] = sectionVisible;

        const instanceCount = getRepeatingInstanceCount(section, answers);
        for (let i = 0; i <= instanceCount; i++) {
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
        continue;
      }

      if (!affectedSectionIds || affectedSectionIds.has(section.section_id)) {
        map[section.section_id] = evaluateLogicRule(
          section.show_if,
          answers,
          variables,
        );
      }
      const sectionVisible = map[section.section_id];

      for (const field of section.fields) {
        if (!affectedFieldIds || affectedFieldIds.has(field.question_id)) {
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
      }
    }

    prevVisibilityInputsRef.current = { answers, variables, map };
    return map;
  }, [definition.sections, answers, variables, fieldMap, dependencyGraph]);

  const prevRequiredInputsRef = useRef<{
    answers: AnswerMap;
    variables: FormVariables;
    map: BooleanMap;
  } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ruleCacheRef intentionally omitted, see field doc
  const requiredMap = useMemo<BooleanMap>(() => {
    const prev = prevRequiredInputsRef.current;

    let affectedFieldIds: Set<string> | null = null;
    if (prev) {
      const changed = new Set([
        ...changedIds(answers, prev.answers),
        ...changedIds(variables, prev.variables),
      ]);
      affectedFieldIds = new Set<string>();
      for (const id of changed) {
        for (const fieldId of dependencyGraph.fieldRequiredDependents.get(
          id,
        ) ?? []) {
          affectedFieldIds.add(fieldId);
        }
      }
    }

    const map: BooleanMap = prev ? { ...prev.map } : {};

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

        if (affectedFieldIds && !affectedFieldIds.has(field.question_id)) {
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

    prevRequiredInputsRef.current = { answers, variables, map };
    return map;
  }, [definition.sections, answers, variables, dependencyGraph]);

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
