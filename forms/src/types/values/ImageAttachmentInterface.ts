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
