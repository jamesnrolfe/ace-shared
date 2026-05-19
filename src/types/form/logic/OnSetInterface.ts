import type { FormVariableValue } from "../form";

export interface OnSet {
  variable_id: string;
  value: FormVariableValue;
}
