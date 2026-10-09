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
