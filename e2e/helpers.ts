import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export type Guard = { readonly violations: string[] };

// Fails a test on any CSP violation or request that leaves this origin.
export const guardPage = (page: Page, origin: string): Guard => {
  const violations: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/content security policy|refused to/i.test(text)) violations.push(`CSP: ${text}`);
  });
  page.on('pageerror', (error) => violations.push(`Page error: ${error.message}`));
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('blob:') || url.startsWith('data:')) return;
    if (!url.startsWith(origin)) violations.push(`Third-party request: ${url}`);
  });
  return { violations };
};

export type SeedMap = {
  name: string;
  category?: string;
  tags?: string[];
  notes?: string;
  ratings: Record<string, number>;
  placeName?: string;
  location?: { lat: number; lon: number };
};

export const seedArchive = (seeds: readonly SeedMap[]): string => {
  const at = '2026-05-01T12:00:00.000Z';
  return JSON.stringify({
    format: 'stkr-archive',
    version: 1,
    exportedAt: at,
    photos: [],
    maps: seeds.map((seed) => ({
      schemaVersion: 1,
      id: randomUUID(),
      name: seed.name,
      category: seed.category ?? '',
      tags: seed.tags ?? [],
      scale: { min: 0, max: 10 },
      axes: Object.entries(seed.ratings).map(([name, value]) => ({
        id: randomUUID(),
        name,
        value,
        higherIsBetter: true,
      })),
      context: {
        capturedAt: at,
        source: seed.location ? 'device' : 'manual',
        ...(seed.location ? { location: seed.location } : {}),
        ...(seed.placeName ? { placeName: seed.placeName } : {}),
      },
      notes: seed.notes ?? '',
      people: [],
      details: [],
      photoIds: [],
      createdAt: at,
      updatedAt: at,
    })),
  });
};

export const importText = async (page: Page, text: string): Promise<void> => {
  await page.goto('/backup');
  await page.getByTestId('import-input').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.getByRole('status')).toContainText(/Added|Exported/);
};

// A real JPEG with an EXIF segment inserted, carrying a recognisable GPS marker.
export const EXIF_MARKER = 'SECRET-GPS-35.6762N-139.6503E';

export const jpegWithExif = async (page: Page): Promise<Buffer> => {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(64, 48);
    const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    context.fillStyle = '#c04040';
    context.fillRect(0, 0, 64, 48);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  const jpeg = Buffer.from(base64, 'base64');
  const payload = Buffer.from(`Exif\0\0${EXIF_MARKER}`, 'latin1');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), length, payload, jpeg.subarray(2)]);
};

// Reads every stored photo's bytes out of IndexedDB as latin-1 text.
export const storedPhotoText = (page: Page): Promise<string[]> =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('stkr');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction('photos').objectStore('photos').getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = async () => {
            const photos = request.result as { blob: Blob }[];
            const buffers = await Promise.all(photos.map((photo) => photo.blob.arrayBuffer()));
            open.result.close();
            resolve(buffers.map((buffer) => String.fromCharCode(...new Uint8Array(buffer))));
          };
        };
      }),
  );
