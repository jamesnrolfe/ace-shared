export interface ImageAttachment {
  id: string;
  uri: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  photo_taken_ts: string;
  photo_src: "CAMERA" | "GALLERY" | "WEB" | "OTHER";
}

export interface QRImageAttachment extends ImageAttachment {
  data: string;
  type: string;
  decoded?: string;
  origin?: string;
}
