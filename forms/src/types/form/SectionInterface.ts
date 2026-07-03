import type { Field } from "./fieldTypes";
import type { LogicRule } from "./logic";

export interface Section {
  section_title: string;
  section_id: string;
  show_if?: LogicRule;
  repeating?: boolean;
  repeat_name?: string;
  fields: Field[];
}
