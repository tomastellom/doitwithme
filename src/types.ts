import type { DateStr } from './dates.ts';
export type { DateStr };

export type Minutes = number;

export interface Window {
  start: Minutes;
  end: Minutes;
}

export type Pattern =
  | { kind: 'once'; date: DateStr }
  | { kind: 'weekly'; weekdays: number[]; from: DateStr; to: DateStr };

export interface Commitment {
  id: string;
  title: string;
  category: string;
  start: Minutes;
  end: Minutes;
  pattern: Pattern;
  exceptions: DateStr[];
  bufferBefore: Minutes;
}

export interface Task {
  id: string;
  title: string;
  category: string;
  weeklyMinutes: Minutes | null;
  maxBlock: Minutes;
  onePerDay: boolean;
  priority: number;
}

export interface Deadline {
  id: string;
  taskId: string;
  kind: string;
  dueDate: DateStr;
  effortMinutes: Minutes;
}

export interface SoftWindow extends Window {
  weekday: number;
}

export interface Preferences {
  weekdayWindow: Window;
  dayOffWindow: Window;
  daysOff: number[];
  minBlock: Minutes;
  minBreak: Minutes;
  softWindows: SoftWindow[];
}

export interface Block {
  taskId: string;
  title: string;
  category: string;
  date: DateStr;
  start: Minutes;
  end: Minutes;
  deadlineId?: string;
}

export interface Warning {
  kind: 'deadline-short' | 'weekly-short' | 'soft-time-used';
  message: string;
}

export interface PlanInput {
  today: DateStr;
  nowMinutes?: Minutes;
  horizonDays: number;
  commitments: Commitment[];
  tasks: Task[];
  deadlines: Deadline[];
  preferences: Preferences;
  pastBlocks: Block[];
}

export interface PlanResult {
  blocks: Block[];
  warnings: Warning[];
}

export interface State {
  commitments: Commitment[];
  tasks: Task[];
  deadlines: Deadline[];
  preferences: Preferences;
  blocks: Block[];
}
