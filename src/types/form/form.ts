import type { Validation } from "./logic";
import type { Section } from "./SectionInterface";

export interface Form {
  last_updated_at: string;
  form_title: string;
  form_desc: string;
  variables: FormVariable[];
  validations?: Validation[];
  sections: Section[];
}

export interface FormVariable {
  id: string;
  default?: FormVariableValue;
  eval?: string;
}

export type FormVariableValue = string | boolean | number | null | undefined;

/** A map of variable_id -> variable value. */
export type FormVariables = Record<string, FormVariableValue>;
