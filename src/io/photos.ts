// Turns an untrusted image into a clean JPEG. Decoding and re-encoding through a canvas
// keeps only the pixels, which drops EXIF data (including GPS) and any hidden payload.

import { MAX_PHOTO_BYTES } from '../core/archive';
import { fail, ok, sniffImageType, type Result } from '../core/validate';

const MAX_SOURCE_PIXELS = 100_000_000;
const MAX_OUTPUT_EDGE = 2048;
const JPEG_QUALITY = 0.85;

export const outputSize = (
  width: number,
  height: number,
  maxEdge = MAX_OUTPUT_EDGE,
): { readonly width: number; readonly height: number } => {
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
};

const encodeJpeg = async (bitmap: ImageBitmap): Promise<Result<Blob>> => {
  const { width, height } = outputSize(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (context === null) return fail('This browser could not process the photo.');
  // JPEG has no transparency, so flatten onto white instead of black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  return ok(await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY }));
};

export const cleanPhoto = async (source: Blob): Promise<Result<Blob>> => {
  if (source.size > MAX_PHOTO_BYTES) return fail('Choose a photo smaller than 20 MB.');
  const header = new Uint8Array(await source.slice(0, 16).arrayBuffer());
  if (sniffImageType(header) === null) return fail('Choose a JPEG, PNG, WebP or GIF image.');
  const bitmap = await createImageBitmap(source).catch(() => null);
  if (bitmap === null) return fail('This image could not be read.');
  try {
    if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) return fail('This image has too many pixels.');
    return await encodeJpeg(bitmap);
  } finally {
    bitmap.close();
  }
};
