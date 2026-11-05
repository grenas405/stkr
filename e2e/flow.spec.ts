import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  EXIF_MARKER,
  guardPage,
  importText,
  jpegWithExif,
  seedArchive,
  storedPhotoText,
  type Guard,
  type SeedMap,
} from './helpers';

const ORIGIN = 'http://localhost:8799';

let guard: Guard;

test.beforeEach(({ page }) => {
  guard = guardPage(page, ORIGIN);
});

test.afterEach(() => {
  expect(guard.violations).toEqual([]);
});

const fillAxes = async (page: Page, names: readonly string[]): Promise<void> => {
  await page.getByLabel(/Number of axes/).fill(String(names.length));
  for (const [index, name] of names.entries()) {
    await page.getByLabel(`Axis ${index + 1}`, { exact: true }).fill(name);
  }
};

const ratingOf = (page: Page, name: string) =>
  page.getByRole('row', { name: new RegExp(`^${name}`) }).locator('.values-number');

test('creates a map by dragging and by keyboard, and it persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Plot the first thing/ })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'New map' }).click();

  await page.getByRole('button', { name: 'Continue to ratings' }).click();
  await expect(page.getByRole('alert')).toContainText('Name every axis');

  await fillAxes(page, ['Taste', 'Value', 'Service', 'Atmosphere']);
  await page.getByRole('button', { name: 'Continue to ratings' }).click();

  const sliders = page.getByRole('slider');
  await expect(sliders).toHaveCount(4);
  await expect(ratingOf(page, 'Taste')).toHaveText('5');

  // Drag the top axis all the way to the rim.
  const box = await sliders.nth(0).boundingBox();
  if (!box) throw new Error('No handle to drag');
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 400, { steps: 6 });
  await page.mouse.up();
  await expect(ratingOf(page, 'Taste')).toHaveText('10');

  // A press anywhere on the chart grabs the nearest axis: drag Service inward.
  const chart = await page.locator('.radar-editable').boundingBox();
  if (!chart) throw new Error('No chart');
  const [centerX, centerY] = [chart.x + chart.width / 2, chart.y + chart.height / 2];
  await page.mouse.move(centerX, centerY + 40);
  await page.mouse.down();
  await page.mouse.move(centerX, centerY + 4, { steps: 3 });
  await page.mouse.up();
  await expect(ratingOf(page, 'Service')).not.toHaveText('5');

  // Keyboard alternative on the second axis.
  await sliders.nth(1).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(ratingOf(page, 'Value')).toHaveText('6');
  await expect(sliders.nth(1)).toHaveAttribute('aria-valuenow', '6');
  await page.keyboard.press('Home');
  await expect(ratingOf(page, 'Value')).toHaveText('0');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  await expect(ratingOf(page, 'Value')).toHaveText('9.5');

  await page.getByRole('row', { name: /^Value/ }).getByRole('combobox').selectOption('lower');
  await page.getByRole('button', { name: 'Continue to details' }).click();

  await page.getByRole('button', { name: 'Save map' }).click();
  await expect(page).toHaveURL(/\/new$/);

  await page.getByLabel('Name', { exact: true }).fill('Ramen at Ichi');
  await page.getByLabel('Category').fill('Food');
  await page.getByLabel(/^Tags/).fill('noodles, spicy, noodles');
  await page.getByLabel(/^People/).fill('Sam');
  await page.getByLabel('Place name').fill('Shinjuku');
  await page.getByLabel('Notes').fill('Broth was outstanding.\nGo early.');
  await page.getByRole('button', { name: 'Use my current location' }).click();
  await expect(page.locator('.location-value')).toHaveText('35.6762, 139.6503');
  await page.getByRole('button', { name: 'Add a detail' }).click();
  await page.getByLabel('Label').fill('Dish');
  await page.getByLabel('Value', { exact: true }).fill('Tonkotsu');
  await page.getByRole('button', { name: 'Save map' }).click();

  await expect(page).toHaveURL(/\/maps\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Ramen at Ichi' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ramen at Ichi' })).toBeVisible();
  await expect(page.getByText('Tonkotsu')).toBeVisible();
  await expect(page.getByText('35.6762, 139.6503')).toBeVisible();
  await expect(page.getByText('lower is better')).toBeVisible();
  await expect(page.getByText('noodles, spicy', { exact: true })).toBeVisible();

  // Editing keeps the identity and the saved ratings.
  await page.getByRole('link', { name: 'Edit map' }).click();
  await page.getByRole('button', { name: 'Continue to ratings' }).click();
  await expect(ratingOf(page, 'Taste')).toHaveText('10');
  await page.getByRole('button', { name: 'Continue to details' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Ramen at Ichi, revisited');
  await page.getByRole('button', { name: 'Save map' }).click();
  await expect(page.getByRole('heading', { name: 'Ramen at Ichi, revisited' })).toBeVisible();

  await page.goto('/');
  await expect(page.locator('.map-card')).toHaveCount(1);
});

test('strips EXIF from photos, and backs up, wipes and restores', async ({ page }) => {
  await page.goto('/new');
  const jpeg = await jpegWithExif(page);
  expect(jpeg.toString('latin1')).toContain(EXIF_MARKER);

  await fillAxes(page, ['A', 'B', 'C']);
  await page.getByRole('button', { name: 'Continue to ratings' }).click();
  await page.getByRole('button', { name: 'Continue to details' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Photographed');

  // An SVG named .jpg is refused, whatever it claims to be.
  await page.getByTestId('photo-input').setInputFiles({
    name: 'evil.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
  });
  await expect(page.getByRole('alert')).toContainText('JPEG, PNG, WebP or GIF');

  await page.getByTestId('photo-input').setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: jpeg,
  });
  await expect(page.locator('.photo-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save map' }).click();
  await expect(page.getByRole('img', { name: /Photo from Photographed/ })).toBeVisible();

  const stored = await storedPhotoText(page);
  expect(stored).toHaveLength(1);
  expect(stored[0]?.startsWith('\xff\xd8')).toBe(true);
  expect(stored[0]).not.toContain(EXIF_MARKER);
  expect(stored[0]).not.toContain('Exif');

  await page.goto('/backup');
  await expect(page.getByText('You haven’t exported a backup yet.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const file = await (await download).path();
  await expect(page.getByText(/Last exported/)).toBeVisible();
  const backup = await readFile(file, 'utf8');
  expect(JSON.parse(backup).maps).toHaveLength(1);

  await expect(page.getByRole('button', { name: 'Delete everything' })).toBeDisabled();
  await page.getByTestId('wipe-input').fill('delete');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByRole('status')).toContainText('Deleted everything');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Plot the first thing/ })).toBeVisible();
  expect(await storedPhotoText(page)).toEqual([]);

  await importText(page, backup);
  await expect(page.getByRole('status')).toContainText('Added 1 map');
  await page.goto('/');
  await page.getByRole('link', { name: /Photographed/ }).click();
  await expect(page.getByRole('img', { name: /Photo from Photographed/ })).toBeVisible();
  expect(await storedPhotoText(page)).toHaveLength(1);

  // Importing the same file twice changes nothing.
  await importText(page, backup);
  await expect(page.getByRole('status')).toContainText('Added 0 maps, updated 0, skipped 1');
});

test('renders hostile import content as inert text, and rejects bad files', async ({ page }) => {
  const payload = '<img src=x onerror="window.__pwned=1">';
  await importText(page, seedArchive([{ name: payload, category: payload, notes: payload, ratings: { A: 1, B: 2, C: 3 } }]));

  await page.goto('/');
  await expect(page.locator('.map-card-name')).toHaveText(payload);
  await page.locator('.map-card').click();
  await expect(page.locator('.map-head h1')).toHaveText(payload);
  await page.goto('/graph');
  await expect(page.locator('.graph-node')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(await page.locator('main img[src="x"]').count()).toBe(0);

  await page.goto('/backup');
  const send = (text: string) =>
    page.getByTestId('import-input').setInputFiles({
      name: 'x.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
  await send('not json');
  await expect(page.getByRole('alert')).toContainText('not valid JSON');
  await send('{"format":"something-else"}');
  await expect(page.getByRole('alert')).toContainText('not a STKR backup');
  await send(
    JSON.stringify({
      format: 'stkr-archive',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      photos: [{ id: '00000000-0000-4000-8000-000000000001', data: btoa('<svg onload=alert(1)>') }],
      maps: [{ id: 'bad' }],
    }),
  );
  await expect(page.getByText('2 entries couldn’t be imported')).toBeVisible();
});

const SAMPLE_MAPS: readonly SeedMap[] = [
  { name: 'Tonkotsu ramen at Ichi', category: 'Food', tags: ['noodles', 'japanese', 'soup'], notes: 'Rich pork broth with thin noodles.', ratings: { Taste: 9.5, Value: 8, Service: 8 }, location: { lat: 35.68, lon: 139.65 } },
  { name: 'Shoyu ramen bar', category: 'Food', tags: ['noodles', 'japanese'], notes: 'Soy based soup, springy noodles.', ratings: { Taste: 9, Value: 8.5, Service: 7 }, location: { lat: 35.681, lon: 139.651 } },
  { name: 'Pho on Main Street', category: 'Food', tags: ['noodles', 'vietnamese', 'soup'], notes: 'Fragrant beef noodle soup.', ratings: { Taste: 8.5, Value: 9, Service: 7.5 } },
  { name: 'Corner steakhouse', category: 'Food', tags: ['beef', 'grill'], notes: 'Overcooked and overpriced.', ratings: { Taste: 3, Value: 2, Service: 4 } },
  { name: 'Mountain ridge hike', category: 'Outdoors', tags: ['hiking', 'views'], notes: 'Steep climb with huge views at the summit.', ratings: { Scenery: 10, Effort: 7, Crowds: 8 } },
  { name: 'Coastal cliff trail', category: 'Outdoors', tags: ['hiking', 'ocean'], notes: 'Windy walk along the sea cliffs.', ratings: { Scenery: 9, Effort: 8, Crowds: 7 } },
  { name: 'Grand opera night', category: 'Culture', tags: ['opera', 'music'], notes: 'Long, and I struggled to stay awake.', ratings: { Performance: 3, Comfort: 2, Value: 1 } },
  { name: 'Modern dance recital', category: 'Culture', tags: ['dance', 'theatre'], notes: 'Could not follow it at all.', ratings: { Performance: 3.5, Comfort: 3, Value: 2 } },
];

test('predicts from real on-device embeddings, with no external requests', async ({ page }) => {
  await importText(page, seedArchive(SAMPLE_MAPS));
  await page.goto('/ask');

  const ask = async (text: string): Promise<void> => {
    await page.getByLabel('What are you curious about?').fill(text);
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.locator('.verdict')).toBeVisible({ timeout: 90_000 });
  };

  // "udon" appears nowhere in the data, so a match here can only be semantic.
  await ask('a bowl of udon in hot broth');
  await expect(page.locator('.verdict-title')).toHaveText('Likely to suit you');
  await expect(page.locator('.verdict .map-card-name').first()).toContainText(/ramen|Pho/i);
  await expect(page.locator('.verdict .map-card-name', { hasText: /opera/i })).toHaveCount(0);

  await ask('an evening at the symphony orchestra concert');
  await expect(page.locator('.verdict-title')).toHaveText('Unlikely to suit you');

  await ask('quarterly corporate tax filing software');
  await expect(page.locator('.verdict-title')).toHaveText('Not enough to go on');

  // The second run reuses stored embeddings.
  const count = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('stkr');
        open.onsuccess = () => {
          const request = open.result.transaction('embeddings').objectStore('embeddings').count();
          request.onsuccess = () => {
            open.result.close();
            resolve(request.result);
          };
        };
      }),
  );
  expect(count).toBe(SAMPLE_MAPS.length);
});

test('falls back to word matching, and says so, when the model is unavailable', async ({ page }) => {
  await importText(page, seedArchive(SAMPLE_MAPS));
  await page.route('**/models/**', (route) => route.abort());
  await page.route('**/ort/**', (route) => route.abort());
  await page.goto('/ask');
  await page.getByLabel('What are you curious about?').fill('ramen');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('matching words only', { timeout: 60_000 });
  await expect(page.locator('.ask-hits .map-card')).toHaveCount(2);
  await expect(page.locator('.verdict')).toHaveCount(0);
  guard.violations.length = 0;
});

test('shows the collection as a graph, with stacks and a list view', async ({ page }) => {
  await importText(page, seedArchive(SAMPLE_MAPS));
  await page.goto('/graph');
  await expect(page.locator('.graph-node')).toHaveCount(SAMPLE_MAPS.length);
  expect(await page.locator('.graph-edge').count()).toBeGreaterThan(0);

  await page.locator('.graph-node', { hasText: 'Tonkotsu' }).focus();
  await page.keyboard.press('Enter');
  const panel = page.locator('.graph-panel');
  await expect(panel.getByRole('heading', { level: 2 })).toContainText('Tonkotsu');
  await expect(panel).toContainText('same category');
  await expect(panel).toContainText('nearby');
  await panel.getByRole('link', { name: 'Open map' }).click();
  await expect(page).toHaveURL(/\/maps\//);

  await page.goto('/graph');
  await page.getByRole('radio', { name: 'Stacks by category' }).check();
  await expect(page.locator('.graph-node')).toHaveCount(3);
  await page.locator('.graph-node', { hasText: 'Food' }).click();
  await expect(page.locator('.graph-panel')).toContainText('Corner steakhouse');

  await page.getByRole('button', { name: 'Show as list' }).click();
  await expect(page.locator('.graph-list')).toContainText('Food (4)');
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  test('keeps working without a connection', async ({ page, context }) => {
    await importText(page, seedArchive(SAMPLE_MAPS.slice(0, 2)));
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 30_000 })
      .toBe(true);
    // A first search online caches the model for later.
    await page.goto('/ask');
    await page.getByLabel('What are you curious about?').fill('a bowl of udon in hot broth');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.locator('.verdict-title')).toHaveText('Likely to suit you', { timeout: 90_000 });

    await context.setOffline(true);
    await page.goto('/');
    await expect(page.locator('.map-card')).toHaveCount(2);
    // Offline responses keep the policy, including the isolation that threaded WebAssembly needs.
    expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
    await page.goto('/graph');
    await expect(page.locator('.graph-node')).toHaveCount(2);
    await page.goto('/ask');
    await page.getByLabel('What are you curious about?').fill('shoyu ramen');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.locator('.verdict-title')).toHaveText('Likely to suit you', { timeout: 90_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
    await context.setOffline(false);
  });
});
