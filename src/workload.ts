import { ruleOfThumb } from './estimate.ts';
import type { Scale } from './estimate.ts';
import type { Course } from './types.ts';

export interface WorkloadInput {
  title: string;
  course: Course;
  ruleMinutes: number;
}

export interface WorkloadProvider {
  status: 'unavailable' | 'ready';
  estimate(input: WorkloadInput): Promise<{ minutes: number; reason: string }>;
}

export interface EstimateResult {
  rule: { minutes: number; reason: string };
  ai: { minutes: number; reason: string } | null;
  aiStatus: 'unavailable' | 'ready' | 'failed';
  aiMessage?: string;
}

// Used until an Anthropic key exists; the real provider arrives in the next plan.
export const unavailableProvider: WorkloadProvider = {
  status: 'unavailable',
  async estimate() {
    throw new Error('The AI is not connected yet');
  },
};

export function fakeWorkloadProvider(minutes: number, reason = 'A fake answer for tests.'): WorkloadProvider {
  return { status: 'ready', async estimate() { return { minutes, reason }; } };
}

// An AI answer must stay between half and double the rule, and under the global ceiling.
export function clampAi(answer: unknown, ruleMinutes: number): { minutes: number; reason: string } | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const a = answer as Record<string, unknown>;
  if (typeof a.minutes !== 'number' || !Number.isFinite(a.minutes) || typeof a.reason !== 'string') return null;
  const low = Math.round(ruleMinutes / 2);
  const high = Math.min(3000, ruleMinutes * 2);
  const clamped = Math.min(high, Math.max(low, a.minutes));
  return { minutes: Math.min(3000, Math.round(clamped / 15) * 15), reason: a.reason.slice(0, 400) };
}

export async function buildEstimate(
  request: { title: string; course: Course },
  scale: Scale,
  provider: WorkloadProvider,
  timeoutMs = 20000,
): Promise<EstimateResult> {
  const rule = ruleOfThumb(request.course, scale);
  if (provider.status !== 'ready') return { rule, ai: null, aiStatus: 'unavailable' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answer = await Promise.race([
      provider.estimate({ title: request.title, course: request.course, ruleMinutes: rule.minutes }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); }),
    ]);
    const ai = clampAi(answer, rule.minutes);
    if (!ai) return { rule, ai: null, aiStatus: 'failed', aiMessage: 'The AI could not answer this time. The rule of thumb is shown.' };
    return { rule, ai, aiStatus: 'ready' };
  } catch {
    return { rule, ai: null, aiStatus: 'failed', aiMessage: 'The AI could not answer this time. The rule of thumb is shown.' };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
