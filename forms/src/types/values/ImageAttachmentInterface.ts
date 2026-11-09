// use BaseImageAttachment for properties shared between images and QR codes.

// NOTE: also used by the Gap measurements, since they get labelled in a different way
export interface BaseImageAttachment {
  /** Unique ID for this image. */
  id: string;
  /** The local uri of this image. Do not trust that this is on device, this is the uri saved locally to the device. */
  uri: string;
  /** b64 thumbnail for this image. */
  thumbnail?: string;
  /** Width of the image in px. */
  width?: number;
  /** Height of the image in px. */
  height?: number;
  /** Timestamp of when the photo was taken. */
  photo_taken_ts: string;
  /** Source Enum of where the photo came from. */
  photo_src: "CAMERA" | "GALLERY" | "WEB" | "OTHER";
  /** Was this image attatchment brought in from elsewhere? */
  external?: boolean;
  /** How the photo was taken. Only set for photos taken in the app's own cameras. */
  capture?: CaptureMetadata;
}

/**
 * Which way the phone was held, by which edge of the screen pointed up, or
 * which way the screen faced when held roughly flat.
 */
export type CaptureOrientation =
  | "portrait"
  | "portrait-upside-down"
  | "landscape-top-left"
  | "landscape-top-right"
  | "flat-screen-up"
  | "flat-screen-down";

/** Details of how and on what a photo was taken. */
export interface CaptureMetadata {
  /** Bumped if a field changes meaning, so readers can handle older shapes. */
  version: 1;
  /** Absent where the motion sensors weren't available. */
  orientation?: CaptureOrientation;
  /** Absent where the motion sensors weren't available. */
  tilt?: {
    /**
     * Degrees the camera pointed above (positive) or below (negative) level.
     * 0 is straight ahead, -90 straight down at the floor.
     */
    pitch: number;
    /**
     * Degrees the phone was turned clockwise from upright portrait, as seen
     * from the screen. 90 is landscape with the top of the phone to the right.
     */
    roll: number;
  };
  camera?: {
    position: "back" | "front" | "external";
    /** Zoom as a display ratio: 1 is the main lens, 0.5 the ultrawide. */
    zoom: number;
    torch: boolean;
  };
  /** Each part is absent where the platform doesn't report it. */
  device?: {
    /** e.g. `"iPhone 16e"`. */
    model?: string;
    manufacturer?: string;
    /** e.g. `"iOS"`. */
    os?: string;
    os_version?: string;
    app_version?: string;
    build?: string;
  };
}

export interface ImageAttachment extends BaseImageAttachment {
  /** Optional label to give to the image, where `labelling` is defined in the underlying {@link ImageField}. */
  label?: string;
}

export interface QRImageAttachment extends BaseImageAttachment {
  /** Decoded data that was scanned. */
  data: string;
  /** The type of the decoded data (e.g. `qr`). */
  type: string;
  /** @deprecated do not use */
  decoded?: string;
  /** @deprecated do not use */
  origin?: string;
}
