import type { OnSet } from "./OnSetInterface";
import type { LogicRule } from "./ShowIfInterface";

export interface SelectOption {
  key: string;
  display: string;
  show_if?: LogicRule;
  on_set?: OnSet[];
  exclusive?: boolean;
}
