// Reads the device position. Only ever called from an explicit tap.

import type { GeoPoint } from '../core/radar-map';
import { fail, ok, type Result } from '../core/validate';

const messageFor = (error: GeolocationPositionError): string =>
  error.code === error.PERMISSION_DENIED
    ? 'Location access is blocked. Allow it in your browser, or type a place name.'
    : 'Your location could not be found. Try again, or type a place name.';

export const readPosition = (): Promise<Result<GeoPoint>> =>
  new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(fail('This browser can’t share a location. Type a place name instead.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve(ok({ lat: coords.latitude, lon: coords.longitude, accuracyM: coords.accuracy })),
      (error) => resolve(fail(messageFor(error))),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
