import type {
  DoorType,
  GapMeasurements,
  GapType,
  Handedness,
  PinDrop,
} from "../values";
import type {
  LogicRule,
  OnSet,
  QuestionLevelValidation,
  SelectOption,
} from "./logic";
import type { MaterialOption } from "./MaterialsInterface";
import type { FieldValueMap } from "./valueMap";

export type VisibilityCondition = "PREPOPULATED";
export type FieldPriority = "BLANK" | "PASSIN" | "DEFAULT" | "EVAL";
export type IMAGE_ALLOWED_SOURCES = "CAMERA" | "GALLERY";

interface FieldBase<T extends keyof FieldValueMap = keyof FieldValueMap> {
  question_type: T;
  question_title: string;
  question_id: string;
  question_subtext?: string;
  question_help?: string;
  required?: boolean | LogicRule;
  editable?: boolean;
  show_if?: LogicRule;
  hide_if?: VisibilityCondition;
  disable_if?: VisibilityCondition;
  on_set?: OnSet[];
  priority?: FieldPriority;
  validations?: QuestionLevelValidation;
  eval?: string;
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
}

export interface QRField extends FieldBase<"QR"> {
  filter_regex?: string;
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
  UNKNOWN: UnknownField;
};

export type Field = fieldMap[keyof fieldMap];

export function isFieldWithMinMax(
  field: unknown,
): field is { answer_minimum?: number; answer_maximum?: number } {
  return (
    (!!field && typeof (field as any).answer_minimum === "number") ||
    typeof (field as any).answer_maximum === "number"
  );
}
