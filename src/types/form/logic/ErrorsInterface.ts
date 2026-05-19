export type ErrorCode =
  | "REQUIRED"
  | "VALIDATION_MIN_LENGTH"
  | "VALIDATION_MAX_LENGTH"
  | "VALIDATION_MIN_VALUE"
  | "VALIDATION_MAX_VALUE"
  | "VALIDATION_MIN_ITEMS"
  | "VALIDATION_MAX_ITEMS"
  | "VALIDATION_PATTERN"
  | "VALIDATION_RULE"
  | "TYPE_INVALID"
  | "FORMAT_INVALID"
  | "LOAD_ERROR"
  | "NONE"
  | "UNKNOWN";

export interface ErrorMessage {
  code: ErrorCode;
  message: string;
}

export interface ValidationErrors {
  [questionId: string]: ErrorMessage;
}
