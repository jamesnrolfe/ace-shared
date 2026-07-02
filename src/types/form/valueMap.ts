import type {
  GapMeasurements,
  ImageAttachment,
  PinDrop,
  QRImageAttachment,
} from "../values";
import type { MaterialsValue } from "./MaterialsInterface";

export type FieldValueMap = {
  TEXT: string;
  HTML: string;
  MONEY: number;
  INTEGER: number;
  FLOAT: number;
  SELECT: string;
  MULTISELECT: string[];
  SWITCH: string;
  IMAGE: ImageAttachment[];
  QR: QRImageAttachment[];
  PINDROP: PinDrop | null;
  DATETIME: string;
  DATE: string;
  TIME: string;
  GAPS: GapMeasurements;
  MATERIALS: MaterialsValue;
  AGREEMENT: boolean;
  UNKNOWN: string | number | boolean | string[] | number[] | boolean[];
};
