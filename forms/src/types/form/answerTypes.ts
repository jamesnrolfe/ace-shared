import type { FieldValueMap } from "./valueMap";

interface AnswerBase<
  T extends keyof FieldValueMap = keyof FieldValueMap,
  V = FieldValueMap[T],
> {
  type: T;
  last_updated_ts: string | null;
  was_shown: boolean;
  was_shown_on_submit: boolean;
  value_initial: V | null;
  value_current: V | null;
}

type AnswerFor<T extends keyof FieldValueMap> = AnswerBase<T, FieldValueMap[T]>;

export type ImageAnswerEntry = AnswerFor<"IMAGE">;
export type QRAnswerEntry = AnswerFor<"QR">;
export type PinDropAnswerEntry = AnswerFor<"PINDROP">;
export type TextAnswerEntry = AnswerFor<"TEXT" | "MONEY" | "FLOAT" | "INTEGER">;
export type DateTimeAnswerEntry = AnswerFor<"DATETIME">;
export type TimeAnswerEntry = AnswerFor<"TIME">;
export type DateAnswerEntry = AnswerFor<"DATE">;
export type SwitchAnswerEntry = AnswerFor<"SWITCH">;
export type SelectAnswerEntry = AnswerFor<"SELECT">;
export type MultiSelectAnswerEntry = AnswerFor<"MULTISELECT">;
export type GapsAnswerEntry = AnswerFor<"GAPS">;
export type MaterialsAnswerEntry = AnswerFor<"MATERIALS">;
export type AgreementAnswerEntry = AnswerFor<"AGREEMENT">;
export type UnknownAnswerEntry = AnswerFor<"UNKNOWN">;

export type AnswerEntry = {
  [K in keyof FieldValueMap]: AnswerBase<K, FieldValueMap[K]>;
}[keyof FieldValueMap];

export type AnswerMap = Record<string, AnswerEntry>;

export type AnswerValue = AnswerEntry["value_current"];

export type QuestionType = AnswerEntry["type"];

export type AnswerValueOf<T extends keyof FieldValueMap> =
  | FieldValueMap[T]
  | null;
