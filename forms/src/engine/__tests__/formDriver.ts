import { act, renderHook } from "@testing-library/react";
import {
  AnswerMap,
  AnswerValue,
  Form,
  FormVariables,
  FormVariableValue,
  QuestionType,
} from "../../types/form";
import { FormEngineOptions, useFormEngine } from "../useFormEngine";

export interface FormDriver {
  set(
    questionId: string,
    value: AnswerValue,
    type?: QuestionType,
  ): Promise<void>;
  setVariable(id: string, value: FormVariableValue): Promise<void>;
  addInstance(sectionId: string): Promise<void>;
  deleteInstance(sectionId: string, index: number): Promise<void>;
  markUnavailable(questionId: string): void;
  markAvailable(questionId: string): void;
  // live answer map
  answers(): AnswerMap;
  // what would actually be sent on submit
  variables(): FormVariables;
  submission(): AnswerMap;
  visible(id: string): boolean;
  required(id: string): boolean;
  editable(id: string): boolean;
  maps(): {
    visibility: Record<string, boolean>;
    required: Record<string, boolean>;
    editable: Record<string, boolean>;
  };
  errors(): Record<string, unknown>;
  validateAll(): Promise<boolean>;
  reset(): Promise<void>;
  unmount(): void;
}

/**
 * Mounts the form engine against `definition` and returns a driver for
 * scripting a user session against it.
 *
 * Every mutator awaits {@link settle} so assertions run against fully
 * propagated state - `setAnswer` and the `was_shown` booking both
 * dispatch inside `startTransition` and variable eval is async so we must
 * handle this.
 */
export async function createFormDriver(
  definition: Form,
  options: FormEngineOptions = {},
): Promise<FormDriver> {
  const view = renderHook(() => useFormEngine(definition, options));
  const current = () => view.result.current;

  // flush effects until state identity stops changing.
  // effectcs cascade (vars -> answers -> was_shown) so single flush not enough
  const settle = async (maxPasses = 25) => {
    for (let pass = 0; pass < maxPasses; pass++) {
      const { answers, variables } = current().state;
      await act(async () => {
        await Promise.resolve();
      });
      const next = current().state;
      if (next.answers === answers && next.variables === variables) return;
    }
    throw new Error("Form engine never settled, probably effect loop.");
  };

  await settle();

  const typeOf = (questionId: string, given?: QuestionType): QuestionType => {
    if (given) return given;
    const type = current().actions.findField(questionId)?.question_type;
    if (!type) throw new Error(`No field found for question_id ${questionId}`);
    return type;
  };

  return {
    async set(questionId, value, type) {
      const questionType = typeOf(questionId, type);
      await act(async () => {
        current().actions.setAnswer(questionId, value, questionType);
      });
      await settle();
    },
    async setVariable(id, value) {
      await act(async () => {
        current().actions.setVariable(id, value);
      });
      await settle();
    },
    async addInstance(sectionId) {
      await act(async () => {
        current().actions.addRepeatingInstance(sectionId);
      });
      await settle();
    },
    async deleteInstance(sectionId, index) {
      await act(async () => {
        current().actions.deleteRepeatingInstance(sectionId, index);
      });
      await settle();
    },
    markUnavailable: (questionId) =>
      current().actions.markFieldUnavailable(questionId),
    markAvailable: (questionId) =>
      current().actions.markFieldAvailable(questionId),
    answers: () => current().state.answers,
    variables: () => current().state.variables,
    submission: () => current().actions.getSubmissionAnswers(),
    visible: (id) => current().actions.isFieldVisible(id),
    required: (id) => current().actions.isFieldRequired(id),
    editable: (id) => current().actions.isFieldEditable(id),
    maps: () => ({
      visibility: current().state.visibilityMap,
      required: current().state.requiredMap,
      editable: current().state.editableMap,
    }),
    errors: () => current().state.errors,
    async validateAll() {
      let result = false;
      await act(async () => {
        result = current().actions.validateAll();
      });
      await settle();
      return result;
    },
    async reset() {
      await act(async () => {
        current().actions.reset();
      });
      await settle();
    },
    unmount: () => view.unmount(),
  };
}
