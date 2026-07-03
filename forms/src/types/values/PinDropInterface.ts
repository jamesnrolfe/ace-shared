export interface PinDrop {
  x: number;
  y: number;
}

export type PinColor = "red" | "green" | "yellow" | "orange" | "gray" | "blue";

export interface PinMarker {
  key: string | number;
  x: number;
  y: number;
  color: PinColor;
  movable: boolean;
  onPinPress?: () => void;
  size?: number;
}
