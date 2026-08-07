import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useTransition,
} from "react";
import {
  type AnswerEntry,
  type AnswerMap,
  type AnswerValue,
  type ErrorMessage,
  type Field,
  isFieldWithOptions,
  type MaterialEntry,
  type MaterialsValue,
  type QuestionType,
  type ValidationErrors,
} from "../types/form";
import type {
  Form,
  FormVariables,
  FormVariableValue,
} from "../types/form/form";
import type { LogicRule } from "../types/form/logic";
import {
  createInitialAnswerEntry,
  initialAnswerValue,
  normaliseToKeys,
} from "../utils/answers";
import { evaluateAllVariables } from "../utils/eval";
import {
  answerExceedsLengthRestrictions,
  answerIsRequired,
} from "../utils/form";
import { evaluateLogicRule } from "../utils/formLogic";
import {
  addInstanceSuffix,
  buildRepeatingInstanceAnswers,
  buildSectionFieldMap,
  buildSectionQuestionId,
  compileFormValidations,
  evaluateLogicRuleWithRepeatingContext,
  expandValidationsForRepeating,
  extractQuestionIdsFromRule,
  getMaxRepeatingInstanceIndex,
  getRepeatingBaseIdCandidates,
  parseInstanceSuffix,
  type RuleCache,
  removeRepeatingInstanceAnswers,
  replaceThisInRule,
  resolveFieldInfo,
  type SectionFieldMap,
} from "../utils/repeatingValidations";
import { type FormEngineState, formEngineReducer } from "./reducer";
import { useFormMaps } from "./useFormMaps";

export interface FormEngineOptions {
  /** When true, {@link FormEngineActions.isFieldEditable} always returns false. */
  readOnly?: boolean;
  /**
   * Seed the engine with an existing answer map instead of building a blank
   * one from the form definition. Use this when the answers already exist
   * up front (e.g. an admin viewer/editor loading a submitted report) - it
   * skips the mobile app's async seeding/draft-recovery flow entirely.
   */
  initialAnswers?: AnswerMap;
  /** Seed the engine with existing form variables. Paired with {@link initialAnswers}. */
  initialVariables?: FormVariables;
}

export interface FormEngineActions {
  /** Look up a field definition by question ID, tolerating scoped and instance-suffixed forms of the ID. */
  findField(questionId: string): Field | undefined;
  /** Whether a field is currently visible given the current answers and variables. */
  isFieldVisible(fieldId: string): boolean;
  /** Whether a field is currently editable. Always false when the engine is read-only. Respects `disable_if`. */
  isFieldEditable(questionId: string): boolean;
  /** Whether a field is currently required given the current answers and variables. */
  isFieldRequired(questionId: string): boolean;

  /** Sets a single answer and runs any `on_set` logic defined on the field or its selected option(s). */
  setAnswer(
    questionId: string,
    value: AnswerValue,
    questionType: QuestionType,
  ): void;
  /** Batch-sets multiple answers at once, bypassing `on_set` logic. */
  setAnswers(answers: AnswerMap): void;
  /** Merges a batch of answers into the current answer map - existing keys not present in `answers` are preserved. Bypasses `on_set` logic. */
  mergeAnswers(answers: AnswerMap): void;
  /** Sets a form-level variable directly. */
  setVariable(variableId: string, value: FormVariableValue): void;
  /** Merges a batch of variables into the current variable map - existing keys not present in `variables` are preserved. */
  mergeVariables(variables: FormVariables): void;
  /** Marks whether a save/submit is in flight. Purely informational. */
  setSaving(isSaving: boolean): void;

  /** Validates a single field and writes any error to state. Returns true if valid. */
  validateField(questionId: string, value: AnswerValue): boolean;
  /** Validates all currently-visible fields, writing errors to state. Returns true if all pass. */
  validateAllFields(): boolean;
  /** Evaluates all top-level/question-level validation rules. Writes errors to state. Returns true if all pass. */
  evaluateValidations(): boolean;
  /** Runs {@link validateAllFields} and {@link evaluateValidations} together, clearing prior errors first. Intended for submit-time use. */
  validateAll(): boolean;

  /** Clears the stored error for a single field. */
  clearError(questionId: string): void;
  /** Clears all stored errors. */
  clearAllErrors(): void;

  /** Appends a new blank instance to a repeating section. */
  addRepeatingInstance(sectionId: string): void;
  /** Removes one instance of a repeating section, shifting later instances down. */
  deleteRepeatingInstance(sectionId: string, instanceIndex: number): void;

  /** Resets all answers, errors and variables back to a blank state. */
  reset(): void;
  /**
   * Returns a copy of the current answers annotated with `was_shown_on_submit`,
   * with hidden-but-prefillable SELECT/MULTISELECT/SWITCH answers filled in,
   * and unselected MATERIALS entries stripped.
   *
   * @warning Intended for use exclusively at submission/save time.
   */
  getSubmissionAnswers(): AnswerMap;

  /**
   * Marks a field as physically unavailable (e.g. a pin-drop field with no
   * drawing to place it on). Suppresses both required and visible checks
   * for the field regardless of its `show_if`/`required` rules.
   */
  markFieldUnavailable(questionId: string): void;
  /** Clears a field's unavailability marker set via {@link markFieldUnavailable}. */
  markFieldAvailable(questionId: string): void;
}

export interface UseFormEngineResult {
  state: FormEngineState & {
    visibilityMap: Record<string, boolean>;
    requiredMap: Record<string, boolean>;
    editableMap: Record<string, boolean>;
  };
  actions: FormEngineActions;
  /**
   * Stable schema-derived lookups, memoised on `definition` identity only -
   * never on live answers/variables. Exposed so app-specific layers built on
   * top of the engine (seeding, prefill, drafts) can reuse the same field
   * lookups the engine itself uses, rather than recomputing them.
   */
  derived: {
    /** Question ID (plain and section-scoped) -> which section it belongs to, and whether that section repeats. */
    fieldMap: SectionFieldMap;
    /** Plain `question_id` -> its field definition. First field wins on duplicate IDs. */
    fieldByQuestionId: Map<string, Field>;
  };
}

function buildInitialState(
  definition: Form,
  initialAnswers?: AnswerMap,
  initialVariables?: FormVariables,
): FormEngineState {
  if (initialAnswers) {
    return {
      answers: initialAnswers,
      errors: {},
      variables: initialVariables ?? {},
      isSaving: false,
    };
  }

  const answers: AnswerMap = {};
  for (const section of definition.sections) {
    if (section.repeating) continue;
    for (const field of section.fields) {
      answers[field.question_id] = createInitialAnswerEntry(
        field.question_type,
        initialAnswerValue(field),
      );
    }
  }
  return {
    answers,
    errors: {},
    variables: initialVariables ?? {},
    isSaving: false,
  };
}

/**
 * Drives the full lifecycle of one form instance: answers, derived
 * variables, visibility/required/editable resolution, validation, and
 * repeating-section instance management.
 *
 * This is the platform-agnostic core shared by every app that renders an
 * ace form (mobile, web). It owns none of: persistence (drafts, local
 * caching), seeding from external sources (previous visits, work objects),
 * or submission transport - those stay app-specific and are layered on top
 * by calling {@link FormEngineActions.setAnswers}/{@link FormEngineActions.setVariable}
 * after mount, and {@link FormEngineActions.getSubmissionAnswers} at save time.
 *
 * @param definition The form schema to drive. Changing identity resets memoised lookups but not answers.
 * @param options See {@link FormEngineOptions}.
 */
export function useFormEngine(
  definition: Form,
  options: FormEngineOptions = {},
): UseFormEngineResult {
  const { readOnly = false, initialAnswers, initialVariables } = options;

  const [state, dispatch] = useReducer(formEngineReducer, definition, (def) =>
    buildInitialState(def, initialAnswers, initialVariables),
  );
  const [isAnswerPending, startAnswerTransition] = useTransition();

  // Refs for callbacks that need the latest state without listing it as a dep
  // (keeps action identities stable across renders).
  const answersRef = useRef(state.answers);
  useEffect(() => {
    answersRef.current = state.answers;
  }, [state.answers]);

  const variablesRef = useRef(state.variables);
  useEffect(() => {
    variablesRef.current = state.variables;
  }, [state.variables]);

  const fieldMap: SectionFieldMap = useMemo(
    () => buildSectionFieldMap(definition),
    [definition],
  );

  const ruleCacheRef = useRef<RuleCache>(new WeakMap());
  const unavailableFieldsRef = useRef<Set<string>>(new Set());

  const fieldByQuestionId = useMemo(() => {
    const map = new Map<string, Field>();
    for (const section of definition.sections) {
      for (const field of section.fields) {
        if (
          typeof field.question_id !== "string" ||
          !field.question_id.trim()
        ) {
          continue;
        }
        if (!map.has(field.question_id)) {
          map.set(field.question_id, field);
        }
      }
    }
    return map;
  }, [definition.sections]);

  const fieldByScopedQuestionId = useMemo(() => {
    const map = new Map<string, Field>();
    for (const section of definition.sections) {
      for (const field of section.fields) {
        if (
          typeof field.question_id !== "string" ||
          !field.question_id.trim()
        ) {
          continue;
        }
        map.set(
          buildSectionQuestionId(section.section_id, field.question_id),
          field,
        );
      }
    }
    return map;
  }, [definition.sections]);

  const compiledValidations = useMemo(
    () => compileFormValidations(definition),
    [definition],
  );

  const {
    visibilityMap,
    requiredMap,
    editableMap,
    visibilityMapRef,
    editableMapRef,
    requiredMapRef,
  } = useFormMaps({
    definition,
    answers: state.answers,
    variables: state.variables,
    fieldMap,
    ruleCacheRef,
  });

  // Auto-recompute declared form variables whenever the answers/variables they depend on change.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const evaluatedVars = await evaluateAllVariables(
        definition.variables || [],
        state.answers,
        state.variables,
      );
      if (!mounted) return;
      if (JSON.stringify(evaluatedVars) !== JSON.stringify(state.variables)) {
        dispatch({ type: "setVariables", variables: evaluatedVars });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [definition, state.answers, state.variables]);

  // Mark fields as "shown" the first time they become visible - drives was_shown for submission bookkeeping.
  useEffect(() => {
    const toMark: string[] = [];

    for (const section of definition.sections) {
      if (section.repeating) continue;

      const hasUnshownField = section.fields.some((field) => {
        const entry = state.answers[field.question_id];
        return !!entry && !entry.was_shown;
      });
      if (!hasUnshownField) continue;

      const sectionVisible = evaluateLogicRule(
        section.show_if,
        state.answers,
        state.variables,
      );
      if (!sectionVisible) continue;

      for (const field of section.fields) {
        const entry = state.answers[field.question_id];
        if (!entry || entry.was_shown) continue;

        const visible = evaluateLogicRule(
          replaceThisInRule(
            field.show_if,
            field.question_id,
            ruleCacheRef.current,
          ),
          state.answers,
          state.variables,
        );
        if (visible) toMark.push(field.question_id);
      }
    }

    if (toMark.length > 0) {
      startTransition(() => {
        dispatch({ type: "batchMarkShown", questionIds: toMark });
      });
    }
  }, [definition, state.answers, state.variables]);

  const normalizeQuestionIdForLookup = useCallback(
    (questionId: string): string => {
      const suffixInfo = parseInstanceSuffix(questionId);
      const baseId = suffixInfo?.baseId ?? questionId;

      if (baseId.includes(".")) {
        const unscopedId = baseId.split(".").slice(1).join(".");
        if (fieldMap[baseId] || fieldMap[unscopedId]) return unscopedId;
      }

      return baseId;
    },
    [fieldMap],
  );

  const findField = useCallback(
    (questionId: string): Field | undefined => {
      const suffixInfo = parseInstanceSuffix(questionId);
      const baseId = suffixInfo?.baseId ?? questionId;

      if (baseId.includes(".")) {
        const scopedMatch = fieldByScopedQuestionId.get(baseId);
        if (scopedMatch) return scopedMatch;
      }

      const normalizedId = normalizeQuestionIdForLookup(questionId);
      return fieldByQuestionId.get(normalizedId);
    },
    [fieldByQuestionId, fieldByScopedQuestionId, normalizeQuestionIdForLookup],
  );

  const setAnswer = useCallback(
    (questionId: string, value: AnswerValue, questionType: QuestionType) => {
      const prevEntry = answersRef.current[questionId];
      const prevValue =
        prevEntry?.value_current === undefined
          ? null
          : prevEntry?.value_current;

      const field = findField(questionId);
      // Every dispatch here feeds state.answers/state.variables, which
      // useFormMaps (below) needs to recompute visibility/required for every
      // field in the whole form. This becomes expensive on large forms.
      // Making it a transition, as done below, tells react that this update
      // is low-priority; it keeps whatever's already on the screen responsive,
      // and commits the recomputed visibility/required maps once ready rather
      // than blocking the frame. This avoids some of the noticable lag spikes
      // when changing an option that renders a lot of new fields.
      //
      // NOTE: because the commit itself is deferred, `answersRef`/`variablesRef`
      // any any of their readers wont reflect this change until the transition
      // actually finishes - a sync call to isFieldVisible() immediately after
      // setAnswer() can briefly observe pre-update values. This should be fine
      // here, since this is build for user actions, which will almost never be
      // fast enough to observe this sort of behaviour. Just note that if something
      // needs to happen on the same tick, then this might cause issues.
      startAnswerTransition(() => {
        dispatch({ type: "setAnswer", questionId, value, questionType });

        if (!field) return;

        // We still support on_set notation, but this is not recommended
        // to be used ever really, favour eval defined variables.
        if (Array.isArray(field.on_set)) {
          for (const on of field.on_set) {
            dispatch({
              type: "setVariable",
              variableId: on.variable_id,
              value: on.value,
            });
          }
        }

        const newKeys = normaliseToKeys(value);
        const oldKeys = normaliseToKeys(prevValue);
        const addedKeys = newKeys.filter((k) => !oldKeys.includes(k));

        if (isFieldWithOptions(field)) {
          for (const key of addedKeys) {
            const opt = field.options?.find((o) => o.key === key);
            if (opt && Array.isArray(opt.on_set)) {
              for (const on of opt.on_set) {
                dispatch({
                  type: "setVariable",
                  variableId: on.variable_id,
                  value: on.value,
                });
              }
            }
          }
        }
      });
    },
    [findField, startAnswerTransition],
  );

  const setAnswers = useCallback((answers: AnswerMap) => {
    dispatch({ type: "setAnswers", answers });
  }, []);

  const mergeAnswers = useCallback((answers: AnswerMap) => {
    dispatch({ type: "mergeAnswers", answers });
  }, []);

  const setVariable = useCallback(
    (variableId: string, value: FormVariableValue) => {
      dispatch({ type: "setVariable", variableId, value });
    },
    [],
  );

  const mergeVariables = useCallback((variables: FormVariables) => {
    dispatch({ type: "mergeVariables", variables });
  }, []);

  const setSaving = useCallback((isSaving: boolean) => {
    dispatch({ type: "setSaving", isSaving });
  }, []);

  const clearError = useCallback((questionId: string) => {
    dispatch({ type: "clearError", questionId });
  }, []);

  const clearAllErrors = useCallback(() => {
    dispatch({ type: "clearAllErrors" });
  }, []);

  const mergeErrors = useCallback((errors: ValidationErrors) => {
    if (Object.keys(errors).length === 0) return;
    dispatch({ type: "mergeErrors", errors });
  }, []);

  const markFieldUnavailable = useCallback((questionId: string) => {
    unavailableFieldsRef.current.add(questionId);
  }, []);

  const markFieldAvailable = useCallback((questionId: string) => {
    unavailableFieldsRef.current.delete(questionId);
  }, []);

  const isFieldVisible = useCallback(
    (fieldId: string) => {
      if (unavailableFieldsRef.current.has(fieldId)) return false;

      const mapped = visibilityMapRef.current[fieldId];
      if (mapped !== undefined) return mapped;

      const suffixInfo = parseInstanceSuffix(fieldId);
      const baseFieldId = suffixInfo?.baseId ?? fieldId;
      const baseField = findField(baseFieldId);
      const fieldInfo = resolveFieldInfo(baseFieldId, fieldMap);
      if (!baseField) return true;

      // hide_if takes priority over show_if. Cannot really apply to repeating
      // fields, since they can't be reliably prepopulated per-instance.
      if (baseField.hide_if === "PREPOPULATED") {
        const entry = answersRef.current[baseField.question_id];
        if (entry?.value_initial !== null) return false;
      }

      const rule = replaceThisInRule(
        baseField.show_if,
        baseField.question_id,
        ruleCacheRef.current,
      );
      if (suffixInfo && fieldInfo.isRepeating) {
        return evaluateLogicRuleWithRepeatingContext(
          rule,
          answersRef.current,
          variablesRef.current,
          fieldMap,
          fieldInfo.sectionId,
          suffixInfo.instanceIndex,
          evaluateLogicRule,
        );
      }

      return evaluateLogicRule(rule, answersRef.current, variablesRef.current);
    },
    [findField, fieldMap, visibilityMapRef],
  );

  const isFieldRequired = useCallback(
    (questionId: string): boolean => {
      if (unavailableFieldsRef.current.has(questionId)) return false;
      const suffixInfo = parseInstanceSuffix(questionId);
      if (!suffixInfo) {
        const mapped = requiredMapRef.current[questionId];
        if (mapped !== undefined) return mapped;
      }
      const baseFieldId = suffixInfo?.baseId ?? questionId;
      const field = findField(baseFieldId);
      if (!field) return false;

      if (typeof field.required === "boolean" || field.required === undefined) {
        return !!field.required;
      }

      const requiredRule = replaceThisInRule(
        field.required,
        field.question_id,
        ruleCacheRef.current,
      );
      const fieldInfo = resolveFieldInfo(baseFieldId, fieldMap);

      if (suffixInfo && fieldInfo.isRepeating) {
        return evaluateLogicRuleWithRepeatingContext(
          requiredRule,
          answersRef.current,
          variablesRef.current,
          fieldMap,
          fieldInfo.sectionId,
          suffixInfo.instanceIndex,
          evaluateLogicRule,
        );
      }

      return evaluateLogicRule(
        requiredRule,
        answersRef.current,
        variablesRef.current,
      );
    },
    [findField, requiredMapRef, fieldMap],
  );

  const getFieldError = useCallback(
    (questionId: string, value: AnswerValue): ErrorMessage | null => {
      const field = findField(questionId);
      if (!field) return null;

      const isRequiredMsg = answerIsRequired(
        isFieldRequired(questionId),
        field,
        value,
      );
      const wrongLengthMsg = answerExceedsLengthRestrictions(field, value);

      return isRequiredMsg ?? wrongLengthMsg ?? null;
    },
    [findField, isFieldRequired],
  );

  const validateField = useCallback(
    (questionId: string, value: AnswerValue): boolean => {
      const err = getFieldError(questionId, value);
      if (err) mergeErrors({ [questionId]: err });
      else clearError(questionId);
      return err === null;
    },
    [getFieldError, mergeErrors, clearError],
  );

  const validateAllFields = useCallback((): boolean => {
    const answers = answersRef.current;
    const variables = variablesRef.current;
    const fieldErrors: ValidationErrors = {};

    for (const section of definition.sections) {
      const sectionShowable = evaluateLogicRule(
        section.show_if,
        answers,
        variables,
      );
      if (!sectionShowable) continue;

      if (section.repeating) {
        const maxInstance = getMaxRepeatingInstanceIndex(section, answers);
        if (maxInstance < 0) continue;

        for (let i = 0; i <= maxInstance; i++) {
          for (const field of section.fields) {
            const baseCandidates = getRepeatingBaseIdCandidates(
              section.section_id,
              field.question_id,
            );
            const candidateKeys = baseCandidates.map((baseId) =>
              addInstanceSuffix(baseId, i),
            );
            const answerKey =
              candidateKeys.find((key) => answers[key]) ?? candidateKeys[0];

            const entry = answers[answerKey];
            const value = entry?.value_current ?? null;
            const error = getFieldError(answerKey, value);

            const shown = evaluateLogicRuleWithRepeatingContext(
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

            if (error && shown) fieldErrors[answerKey] = error;
          }
        }
      } else {
        for (const field of section.fields) {
          const entry = answers[field.question_id];
          const value = entry?.value_current ?? null;
          const error = getFieldError(field.question_id, value);
          const shown = evaluateLogicRule(
            replaceThisInRule(
              field.show_if,
              field.question_id,
              ruleCacheRef.current,
            ),
            answers,
            variables,
          );
          if (error && shown) fieldErrors[field.question_id] = error;
        }
      }
    }

    mergeErrors(fieldErrors);
    return Object.keys(fieldErrors).length === 0;
  }, [definition, getFieldError, mergeErrors, fieldMap]);

  const evaluateValidations = useCallback((): boolean => {
    const answers = answersRef.current;
    const variables = variablesRef.current;

    const expandedValidations = expandValidationsForRepeating(
      definition,
      answers,
      compiledValidations,
    );

    const validationErrors: ValidationErrors = {};
    const visibilityCache = new Map<string, boolean>();

    const isVisibleCached = (questionId: string): boolean => {
      const cached = visibilityCache.get(questionId);
      if (cached !== undefined) return cached;
      const next = isFieldVisible(questionId);
      visibilityCache.set(questionId, next);
      return next;
    };

    for (const rule of expandedValidations) {
      const logicRule = rule as LogicRule;

      const referencedIds = extractQuestionIdsFromRule(logicRule);
      const allShown = referencedIds.every((qId) => isVisibleCached(qId));
      if (!allShown) continue;

      const pass = evaluateLogicRule(logicRule, answers, variables);
      if (!pass) {
        rule.shown_on.forEach((qId) => {
          validationErrors[qId] = {
            code: "VALIDATION_RULE",
            message: rule.message,
          };
        });
      }
    }

    mergeErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  }, [definition, mergeErrors, isFieldVisible, compiledValidations]);

  const validateAll = useCallback((): boolean => {
    clearAllErrors();
    // Validation rules run after field checks, so they take error precedence -
    // generally the more useful message to surface to the user.
    const fieldsOk = validateAllFields();
    const rulesOk = evaluateValidations();
    return fieldsOk && rulesOk;
  }, [clearAllErrors, validateAllFields, evaluateValidations]);

  const addRepeatingInstance = useCallback(
    (sectionId: string) => {
      const section = definition.sections.find(
        (s) => s.section_id === sectionId,
      );
      if (!section?.repeating) return;

      const baseId = section.fields[0]?.question_id;
      if (!baseId) return;

      const maxInstance = getMaxRepeatingInstanceIndex(
        section,
        answersRef.current,
      );
      const newInstanceIndex = maxInstance + 1;
      const newAnswers = buildRepeatingInstanceAnswers(
        section,
        newInstanceIndex,
      );

      dispatch({ type: "mergeAnswers", answers: newAnswers });
    },
    [definition],
  );

  const deleteRepeatingInstance = useCallback(
    (sectionId: string, instanceIndex: number) => {
      const section = definition.sections.find(
        (s) => s.section_id === sectionId,
      );
      if (!section?.repeating) return;
      const newAnswers = removeRepeatingInstanceAnswers(
        answersRef.current,
        section,
        instanceIndex,
      );
      dispatch({ type: "setAnswers", answers: newAnswers });
    },
    [definition],
  );

  const getSubmissionAnswers = useCallback((): AnswerMap => {
    const answers = answersRef.current;
    const variables = variablesRef.current;
    const output: AnswerMap = {};

    const getHiddenPrefillValue = (
      field: Field,
      questionId: string,
      sectionId?: string,
      instanceIndex?: number,
    ): string[] | string | undefined => {
      if (
        (field.question_type !== "SELECT" &&
          field.question_type !== "MULTISELECT" &&
          field.question_type !== "SWITCH") ||
        !field.prefill
      )
        return undefined;

      const currentValue = answers[questionId]?.value_current ?? null;
      if (normaliseToKeys(currentValue).length > 0) return undefined;

      const showableKeys = field.options
        .filter((opt) => {
          const rule = replaceThisInRule(
            opt.show_if,
            questionId,
            ruleCacheRef.current,
          );
          if (sectionId && instanceIndex !== undefined) {
            return evaluateLogicRuleWithRepeatingContext(
              rule,
              answers,
              variables,
              fieldMap,
              sectionId,
              instanceIndex,
              evaluateLogicRule,
            );
          }
          return evaluateLogicRule(rule, answers, variables);
        })
        .map((opt) => opt.key);

      if (showableKeys.length !== 1) return undefined;
      const onlyKey = showableKeys[0];
      return field.question_type === "MULTISELECT" ? [onlyKey] : onlyKey;
    };

    for (const section of definition.sections) {
      const sectionVisible = evaluateLogicRule(
        section.show_if,
        answers,
        variables,
      );

      if (section.repeating) {
        const baseIds = new Set(section.fields.map((f) => f.question_id));
        for (const [key, entry] of Object.entries(answers)) {
          let belongsToSection = false;
          for (const baseId of baseIds) {
            const candidates = getRepeatingBaseIdCandidates(
              section.section_id,
              baseId,
            );
            if (
              candidates.some(
                (candidate) =>
                  key === candidate || key.startsWith(`${candidate}__`),
              )
            ) {
              belongsToSection = true;
              break;
            }
          }

          if (belongsToSection) {
            let fieldVisible = sectionVisible;
            if (sectionVisible) {
              const suffixInfo = parseInstanceSuffix(key);
              const baseId = suffixInfo?.baseId ?? key;
              const instanceIndex = suffixInfo?.instanceIndex ?? 0;
              const matchedField = section.fields.find((f) =>
                getRepeatingBaseIdCandidates(
                  section.section_id,
                  f.question_id,
                ).some((c) => c === baseId),
              );
              if (matchedField) {
                const rule = replaceThisInRule(
                  matchedField.show_if,
                  matchedField.question_id,
                  ruleCacheRef.current,
                );
                fieldVisible = evaluateLogicRuleWithRepeatingContext(
                  rule,
                  answers,
                  variables,
                  fieldMap,
                  section.section_id,
                  instanceIndex,
                  evaluateLogicRule,
                );
              }
            }
            output[key] = { ...entry, was_shown_on_submit: fieldVisible };
          }
        }
      } else {
        for (const field of section.fields) {
          const entry = answers[field.question_id];
          const fieldVisible = evaluateLogicRule(
            replaceThisInRule(
              field.show_if,
              field.question_id,
              ruleCacheRef.current,
            ),
            answers,
            variables,
          );
          if (!entry) {
            output[field.question_id] = createInitialAnswerEntry(
              field.question_type,
              initialAnswerValue(field),
            );
          } else {
            const hiddenPrefillValue = !fieldVisible
              ? getHiddenPrefillValue(field, field.question_id)
              : undefined;

            let finalValue =
              hiddenPrefillValue !== undefined
                ? hiddenPrefillValue
                : entry.value_current;
            if (
              field.question_type === "MATERIALS" &&
              Array.isArray(finalValue)
            ) {
              finalValue = (finalValue as MaterialsValue).filter(
                (mat: MaterialEntry) =>
                  mat.selected_material &&
                  mat.selected_material !== "_unselected",
              );
            }

            output[field.question_id] = {
              ...entry,
              was_shown_on_submit: sectionVisible && fieldVisible,
              value_current: finalValue,
            } as AnswerEntry;
          }
        }
      }
    }

    return output;
  }, [definition, fieldMap]);

  const isFieldEditable = useCallback(
    (questionId: string) => {
      if (readOnly) return false;
      const mapped = editableMapRef.current[questionId];
      if (mapped !== undefined) return mapped;
      const field = findField(questionId);
      return field?.editable ?? true;
    },
    [readOnly, findField, editableMapRef],
  );

  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  const engineState = useMemo(
    () => ({
      answers: state.answers,
      errors: state.errors,
      variables: state.variables,
      isSaving: state.isSaving,
      isPending: isAnswerPending,
      visibilityMap,
      requiredMap,
      editableMap,
    }),
    [
      state.answers,
      state.errors,
      state.variables,
      state.isSaving,
      isAnswerPending,
      visibilityMap,
      requiredMap,
      editableMap,
    ],
  );

  const actions = useMemo<FormEngineActions>(
    () => ({
      findField,
      isFieldVisible,
      isFieldEditable,
      isFieldRequired,
      setAnswer,
      setAnswers,
      mergeAnswers,
      setVariable,
      mergeVariables,
      setSaving,
      validateField,
      validateAllFields,
      evaluateValidations,
      validateAll,
      clearError,
      clearAllErrors,
      addRepeatingInstance,
      deleteRepeatingInstance,
      reset,
      getSubmissionAnswers,
      markFieldUnavailable,
      markFieldAvailable,
    }),
    [
      findField,
      isFieldVisible,
      isFieldEditable,
      isFieldRequired,
      setAnswer,
      setAnswers,
      mergeAnswers,
      setVariable,
      mergeVariables,
      setSaving,
      validateField,
      validateAllFields,
      evaluateValidations,
      validateAll,
      clearError,
      clearAllErrors,
      addRepeatingInstance,
      deleteRepeatingInstance,
      reset,
      getSubmissionAnswers,
      markFieldUnavailable,
      markFieldAvailable,
    ],
  );

  const derived = useMemo(
    () => ({ fieldMap, fieldByQuestionId }),
    [fieldMap, fieldByQuestionId],
  );

  return { state: engineState, actions, derived };
}
