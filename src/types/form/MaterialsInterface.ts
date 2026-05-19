import type { AnswerValue } from "./answerTypes";
import type { FieldValueMap } from "./valueMap";

export interface MaterialAttribute {
  key: string;
  display: string;
  question_type: keyof Omit<FieldValueMap, "MATERIALS">;
  [key: string]: any;
}

export interface MaterialOption {
  key: string;
  display: string;
  attributes: MaterialAttribute[];
}

export interface MaterialEntry {
  id?: string;
  selected_material: string;
  attributes: Record<string, AnswerValue>;
}

export type MaterialsValue = MaterialEntry[];
