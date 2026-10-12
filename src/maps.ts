import type { TravelMode } from './types.ts';

export interface TravelTimeProvider {
  status: 'unavailable' | 'ready';
  lookup(query: { fromAddress: string; toAddress: string; mode: TravelMode }): Promise<{ minutes: number }>;
}

// Used until a Google Maps key exists. The real provider arrives in the next plan and reads its key from the server environment only.
export const unavailableProvider: TravelTimeProvider = {
  status: 'unavailable',
  async lookup() {
    throw new Error('Google Maps is not connected yet');
  },
};

export function fakeProvider(minutes: number): TravelTimeProvider {
  return { status: 'ready', async lookup() { return { minutes }; } };
}

export type MapsErrorCode = 'key' | 'quota' | 'address' | 'no-route' | 'offline' | 'bad-response';

// The message is always one of our own sentences, never Google's text, so it can never carry the key.
export class MapsError extends Error {
  code: MapsErrorCode;
  constructor(code: MapsErrorCode, message: string) {
    super(message);
    this.name = 'MapsError';
    this.code = code;
  }
}

const GOOGLE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const GOOGLE_MODE: Record<TravelMode, string> = { car: 'DRIVE', bike: 'BICYCLE', transit: 'TRANSIT', walk: 'WALK' };
const MESSAGES: Record<MapsErrorCode, string> = {
  key: 'Google rejected the key. Check that the Routes API is enabled for it and that billing is on.',
  quota: 'Google says the quota is used up for now.',
  address: 'Google could not find one of the addresses.',
  'no-route': 'Google found no route for that mode.',
  offline: 'I could not reach Google.',
  'bad-response': 'Google answered in a way I could not read.',
};
const fail = (code: MapsErrorCode): never => {
  throw new MapsError(code, MESSAGES[code]);
};

export function googleProvider(opts: { key: string; fetchFn?: typeof fetch; regionCode?: string; timeoutMs?: number }): TravelTimeProvider {
  const { key, regionCode, timeoutMs = 10000 } = opts;
  const fetchFn = opts.fetchFn ?? fetch;
  return {
    status: 'ready',
    async lookup({ fromAddress, toAddress, mode }) {
      const body = {
        origin: { address: fromAddress },
        destination: { address: toAddress },
        travelMode: GOOGLE_MODE[mode],
        ...(regionCode ? { regionCode } : {}),
      };
      let res: Response;
      try {
        res = await fetchFn(GOOGLE_URL, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'x-goog-fieldmask': 'routes.duration' },
          body: JSON.stringify(body),
        });
      } catch {
        return fail('offline');
      }
      if (res.status === 401 || res.status === 403) return fail('key');
      if (res.status === 429) return fail('quota');
      if (res.status === 400 || res.status === 404) return fail('address');
      if (!res.ok) return fail('bad-response');
      let data: any;
      try {
        data = await res.json();
      } catch {
        return fail('bad-response');
      }
      const routes = data && typeof data === 'object' ? data.routes : undefined;
      if (routes === undefined || (Array.isArray(routes) && routes.length === 0)) return fail('no-route');
      const duration = Array.isArray(routes) ? routes[0]?.duration : undefined;
      if (typeof duration !== 'string' || !/^\d+(\.\d+)?s$/.test(duration)) return fail('bad-response');
      return { minutes: Math.min(600, Math.ceil(Number.parseFloat(duration) / 60)) };
    },
  };
}
