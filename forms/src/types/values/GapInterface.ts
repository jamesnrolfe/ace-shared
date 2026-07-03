import type { ImageAttachment } from "./ImageAttachmentInterface";

export interface GapMeasurement {
  value: number | null;
  image?: ImageAttachment;
}

export type GapMeasurements = Partial<Record<GapType, GapMeasurement>>;

export type DoorType = "SINGLE" | "DOUBLE";
export type Handedness = "LEFT" | "RIGHT";

export type GapType =
  | "HINGE_BOTTOM"
  | "HINGE_MIDDLE"
  | "HINGE_TOP"
  | "CLOSING_BOTTOM"
  | "CLOSING_MIDDLE"
  | "CLOSING_TOP"
  | "HEAD_LEFT"
  | "HEAD_RIGHT"
  | "THRESHOLD_LEFT"
  | "THRESHOLD_RIGHT"
  | "LEFT_HINGE_BOTTOM"
  | "LEFT_HINGE_MIDDLE"
  | "LEFT_HINGE_TOP"
  | "LEFT_HEAD_LEFT"
  | "LEFT_HEAD_RIGHT"
  | "LEFT_THRESHOLD_LEFT"
  | "LEFT_THRESHOLD_RIGHT"
  | "MIDDLE_TOP"
  | "MIDDLE_MIDDLE"
  | "MIDDLE_BOTTOM"
  | "RIGHT_HINGE_TOP"
  | "RIGHT_HINGE_MIDDLE"
  | "RIGHT_HINGE_BOTTOM"
  | "RIGHT_HEAD_LEFT"
  | "RIGHT_HEAD_RIGHT"
  | "RIGHT_THRESHOLD_LEFT"
  | "RIGHT_THRESHOLD_RIGHT";

export const DEFAULT_SINGLE_GAPS: GapType[] = [
  "HINGE_BOTTOM",
  "HINGE_MIDDLE",
  "HINGE_TOP",
  "CLOSING_BOTTOM",
  "CLOSING_MIDDLE",
  "CLOSING_TOP",
  "HEAD_LEFT",
  "HEAD_RIGHT",
  "THRESHOLD_LEFT",
  "THRESHOLD_RIGHT",
];

export const DEFAULT_DOUBLE_GAPS: GapType[] = [
  "LEFT_HINGE_BOTTOM",
  "LEFT_HINGE_MIDDLE",
  "LEFT_HINGE_TOP",
  "RIGHT_HINGE_TOP",
  "RIGHT_HINGE_MIDDLE",
  "RIGHT_HINGE_BOTTOM",
  "MIDDLE_TOP",
  "MIDDLE_MIDDLE",
  "MIDDLE_BOTTOM",
  "LEFT_HEAD_LEFT",
  "LEFT_HEAD_RIGHT",
  "RIGHT_HEAD_LEFT",
  "RIGHT_HEAD_RIGHT",
  "LEFT_THRESHOLD_LEFT",
  "LEFT_THRESHOLD_RIGHT",
  "RIGHT_THRESHOLD_LEFT",
  "RIGHT_THRESHOLD_RIGHT",
];
