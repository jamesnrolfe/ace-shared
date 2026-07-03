export type EqualityOperator = "=" | "==" | "===" | "eq" | "equals" | "is";
export type InEqualityOperator =
  | "!="
  | "!=="
  | "neq"
  | "does not equal"
  | "is not";
export type GreaterThanOperator = "gt" | ">" | "greater than";
export type GreaterThanOrEqualToOperator =
  | "gte"
  | ">="
  | "greater than or equal to";
export type LessThanOperator = "lt" | "<" | "less than";
export type LessThanOrEqualTo = "lte" | "<=" | "less than or equal to";
export type InOperator = "in";
export type NotInOperator = "nin";
export type ContainsOperator = "contains" | "includes" | "has";
export type DoesNotContainsOperator =
  | "ncontains"
  | "nincludes"
  | "nhas"
  | "does not contain"
  | "does not include"
  | "does not have";
export type RegexOperator = "matches" | "re" | "regex" | "test" | "~";
export type StartsWithOperator = "starts_with" | "starts" | "startswith";
export type DoesNotStartWithOperator =
  | "nstarts_with"
  | "nstarts"
  | "nstartswith";
export type EndsWithOperator = "ends_with" | "ends" | "endswith";
export type DoesNotEndWithOperator = "nends_with" | "nends" | "nendswith";

export type BaseOperator =
  | EqualityOperator
  | InEqualityOperator
  | GreaterThanOperator
  | GreaterThanOrEqualToOperator
  | LessThanOperator
  | LessThanOrEqualTo
  | InOperator
  | NotInOperator
  | ContainsOperator
  | DoesNotContainsOperator
  | StartsWithOperator
  | DoesNotStartWithOperator
  | EndsWithOperator
  | DoesNotEndWithOperator
  | RegexOperator;
export type LengthOperator = `length_${BaseOperator}`;
export type Operator = BaseOperator | LengthOperator;

export type Mode = "length" | "value";

export interface Validation extends LogicRule {
  message: string;
  shown_on: string[];
}

export interface QuestionLevelValidation extends LogicRule {
  message: string;
  shown_on?: string[];
}

export interface Condition {
  question_id: string;
  operator: Operator;
  value: string | number | boolean | string[] | number[] | boolean[] | null;
  field?: string;
  scope?: "any" | "all";
}

export interface VariableCondition {
  variable_id: string;
  operator: Operator;
  value: string | number | boolean | string[] | number[] | boolean[] | null;
}

export type ConditionNode = Condition | VariableCondition | LogicRule;

export interface LogicRule {
  require: "any" | "all";
  conditions: ConditionNode[];
}
