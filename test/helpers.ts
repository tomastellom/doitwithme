import { defaultPreferences } from '../src/defaults.ts';
import type { Commitment, Deadline, PlanInput, Task } from '../src/types.ts';

export function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Study',
    category: 'study',
    weeklyMinutes: null,
    maxBlock: 120,
    onePerDay: false,
    priority: 3,
    ...over,
  };
}

export function deadline(over: Partial<Deadline> = {}): Deadline {
  return { id: 'd1', taskId: 't1', kind: 'exam', dueDate: '2026-10-12', effortMinutes: 60, ...over };
}

export function commitment(over: Partial<Commitment> = {}): Commitment {
  return {
    id: 'c1',
    title: 'Class',
    category: 'class',
    start: 600,
    end: 660,
    pattern: { kind: 'once', date: '2026-10-08' },
    exceptions: [],
    bufferBefore: 0,
    ...over,
  };
}

// 2026-10-05 is a Monday.
export function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    today: '2026-10-05',
    horizonDays: 7,
    commitments: [],
    tasks: [],
    deadlines: [],
    preferences: structuredClone(defaultPreferences),
    pastBlocks: [],
    ...over,
  };
}
