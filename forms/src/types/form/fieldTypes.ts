import type {
  DoorType,
  GapMeasurements,
  GapType,
  Handedness,
  PinDrop,
} from "../values";
import type { AnswerValue } from "./answerTypes";
import type {
  LogicRule,
  OnSet,
  QuestionLevelValidation,
  SelectOption,
} from "./logic";
import type { MaterialOption } from "./MaterialsInterface";
import type { FieldValueMap } from "./valueMap";

export type VisibilityCondition = "PREPOPULATED";
export type FieldPriority = "BLANK" | "PASSIN" | "DEFAULT" | "EVAL" | "LOOKUP";
export type IMAGE_ALLOWED_SOURCES = "CAMERA" | "GALLERY";

export type FieldStartType = "BLANK" | "PREVIOUS" | "EVAL";
export type VisibilityAction = "HIDE" | "DISABLE";

interface FieldBase<T extends keyof FieldValueMap = keyof FieldValueMap> {
  question_type: T;
  question_title: string;
  question_id: string;
  question_subtext?: string;
  question_help?: string;
  required?: boolean | LogicRule;
  required_reason?: string;
  editable?: boolean;
  show_if?: LogicRule;
  /** @deprecated Use `if_prepopulated` instead. */
  hide_if?: VisibilityCondition;
  /** @deprecated Use `if_prepopulated` instead. */
  disable_if?: VisibilityCondition;
  on_set?: OnSet[];
  /** @deprecated Use `start` instead */
  priority?: FieldPriority;
  /** How the value should initially be prefilled into the form. Defaults to PREVIOUS. **/
  start?: FieldStartType;
  /** Action to take if the field is prepopulated. */
  if_prepopulated?: VisibilityAction;
  validations?: QuestionLevelValidation;
  eval?: string;
  /** The id of the question whose value is translated via {@link lookup}. */
  lookup_key?: string;
  /** Translation table for LOOKUP priority. Keys are string representations
   * of the source value; must include a `_default` fallback. */
  lookup?: Record<string, AnswerValue> & { _default: AnswerValue };
}

export interface InputField
  extends FieldBase<"TEXT" | "MONEY" | "INTEGER" | "FLOAT"> {
  default?: FieldValueMap["TEXT" | "MONEY" | "INTEGER" | "FLOAT"];
  unit?: string;
}

export interface HtmlField extends FieldBase<"HTML"> {
  default?: FieldValueMap["HTML"];
}

export interface SwitchField extends FieldBase<"SWITCH"> {
  options: SelectOption[];
  default?: FieldValueMap["SWITCH"];
  prefill?: boolean;
}

export interface ImageField extends FieldBase<"IMAGE"> {
  answer_maximum?: number;
  answer_minimum?: number;
  allowed_sources?: IMAGE_ALLOWED_SOURCES[];
  /** If true, should keep camera open after each image taken. */
  expect_multiple_photos?: boolean;
}

export interface QRField extends FieldBase<"QR"> {
  filter_regex?: string;
  /** If true, should keep camera open after each image taken. */
  expect_multiple_photos?: boolean;
}

export interface SelectField extends FieldBase<"SELECT" | "MULTISELECT"> {
  options: SelectOption[];
  default?: string | string[];
  answer_maximum?: number;
  answer_minimum?: number;
  prefill?: boolean;
}

export interface TimeField extends FieldBase<"TIME"> {
  default?: string | number;
}

export interface DateField extends FieldBase<"DATE"> {
  default?: string | number;
}

export interface DateTimeField extends FieldBase<"DATETIME"> {
  default?: string | number;
}

export interface PinDropField extends FieldBase<"PINDROP"> {
  default?: PinDrop;
}

export interface GapsField extends FieldBase<"GAPS"> {
  default?: GapMeasurements;
  door_type: DoorType;
  handedness: Handedness;
  measurements: GapType[];
}

export interface MaterialsField extends FieldBase<"MATERIALS"> {
  options: MaterialOption[];
  answer_maximum?: number;
  answer_minimum?: number;
  material_name?: string;
}

/** A single checkbox, e.g. a liability waiver. `agreement_text` is the text
 * shown next to the checkbox itself (distinct from `question_title`, which
 * is rendered separately above the field). Always initialises unchecked;
 * there is no `default` override. */
export interface AgreementField extends FieldBase<"AGREEMENT"> {
  agreement_text: string;
}

export interface UnknownField extends FieldBase<"UNKNOWN"> {}

type fieldMap = {
  TEXT: InputField;
  HTML: HtmlField;
  MONEY: InputField;
  INTEGER: InputField;
  FLOAT: InputField;
  SWITCH: SwitchField;
  IMAGE: ImageField;
  QR: QRField;
  SELECT: SelectField;
  MULTISELECT: SelectField;
  TIME: TimeField;
  DATE: DateField;
  DATETIME: DateTimeField;
  PINDROP: PinDropField;
  GAPS: GapsField;
  MATERIALS: MaterialsField;
  AGREEMENT: AgreementField;
  UNKNOWN: UnknownField;
};

export type Field = fieldMap[keyof fieldMap];

export function isFieldWithOptions(
  field: Field,
): field is SelectField | SwitchField {
  return (
    field.question_type === "SELECT" ||
    field.question_type === "MULTISELECT" ||
    field.question_type === "SWITCH"
  );
}

/**
 * question_type = IMAGE or QR (exlucdes GAPS).
 */
export function isImageField(field: Field): field is QRField | ImageField {
  return field.question_type === "IMAGE" || field.question_type === "QR";
}

export function isFieldWithMinMax(
  field: unknown,
): field is { answer_minimum?: number; answer_maximum?: number } {
  return (
    (!!field && typeof (field as any).answer_minimum === "number") ||
    typeof (field as any).answer_maximum === "number"
  );
}
