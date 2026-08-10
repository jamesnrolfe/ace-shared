import {
  ConditionNode,
  Field,
  Form,
  LogicRule,
  Section,
  SelectOption,
} from "../../types/form";

type QuestionTypeKey = Field["question_type"];

/**
 * Distributes over the {@link Field} union, keeping the member whose
 * `question_type` *includes* `T`.
 *
 * `Extract<Field, { question_type: T }>` cannot be used here: several members
 * cover more than one type (`SelectField` is `"SELECT" | "MULTISELECT"`,
 * `InputField` is `"TEXT" | "MONEY" | "INTEGER" | "FLOAT"`), and a union
 * discriminant is not assignable to a single literal, so `Extract` discards
 * them and collapses to `never`.
 */
type MatchQuestionType<M, T> = M extends { question_type: infer Q }
  ? T extends Q
    ? M
    : never
  : never;

/** Narrows the {@link Field} union to the member for one `question_type`. */
type FieldOf<T extends QuestionTypeKey> = MatchQuestionType<Field, T>;

/** Everything a field needs except its type, with `question_title` defaulted. */
type FieldSpec<T extends QuestionTypeKey> = Omit<
  FieldOf<T>,
  "question_type" | "question_title"
> & { question_title?: string };

/**
 * Builds a single field definition of the given question type.
 *
 * The spec is narrowed to the matching union member, so type specific
 * requirements are not enforced at compile time (e.g. a SELECT without
 * opts wouldn't build). `question_title` defaults to the question ID.
 */
export function field<T extends QuestionTypeKey>(
  question_type: T,
  spec: FieldSpec<T>,
): FieldOf<T> {
  // cast unavoidable - ts cannot prove a spread satisfies a union member
  return {
    question_type,
    question_title: spec.question_id,
    ...spec,
  } as FieldOf<T>;
}

/**
 * Build a section, defaulting `section_title` to `section_id`.
 */
export function section(
  section_id: string,
  fields: Field[],
  overrides: Partial<Omit<Section, "section_id" | "fields">> = {},
): Section {
  return { section_id, section_title: section_id, fields, ...overrides };
}

/**
 * Builds a minimal valid form around the given sections.
 */
export function form(
  sections: Section[],
  overrides: Partial<Omit<Form, "sections">> = {},
): Form {
  return {
    last_updated_at: "2026-01-01T00:00:00.000Z",
    form_title: "Testing Form",
    form_desc: "",
    variables: [],
    sections,
    ...overrides,
  };
}

/**
 * Build a logic rule, defaulting `require` to "all" (as evaluator does).
 */
export function showIf(
  conditions: ConditionNode[],
  require: LogicRule["require"] = "all",
): LogicRule {
  return { require, conditions };
}

export const yesNo: SelectOption[] = [
  { key: "yes", display: "Yes" },
  { key: "no", display: "No" },
];
