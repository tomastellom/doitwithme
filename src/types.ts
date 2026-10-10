import type { DateStr } from './dates.ts';
export type { DateStr };

export type Minutes = number;

export interface Window {
  start: Minutes;
  end: Minutes;
}

export type PlaceKind = 'home' | 'campus' | 'student' | 'other';

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  address: string;
}

export type TravelMode = 'car' | 'bike' | 'transit' | 'walk';

export type Repeats =
  | { kind: 'weekly'; weekdays: number[] }
  | { kind: 'monthly'; monthDays: number[] };

export type TravelSource =
  | { method: 'typed'; minutes: Minutes }
  | { method: 'maps'; mode: TravelMode; fallbackMinutes: Minutes };

export interface Commute {
  id: string;
  fromPlaceId: string;
  toPlaceId: string;
  repeats: Repeats | null;
  source: TravelSource;
  marginMinutes: Minutes;
}

export interface Leg {
  date: DateStr;
  start: Minutes;
  end: Minutes;
  fromName: string;
  toName: string;
  estimated: boolean;
  placeId: string;
  commuteId: string | null;
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
  placeId?: string;
}

export interface Course {
  credits: number;
  difficulty: number;
  examOnly: boolean;
  weeklyGraded: boolean;
  lab: boolean;
  syllabus: string;
}

export interface Task {
  id: string;
  title: string;
  category: string;
  weeklyMinutes: Minutes | null;
  maxBlock: Minutes;
  onePerDay: boolean;
  priority: number;
  course?: Course;
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
  softMode: 'ask' | 'auto';
  travelAllowanceMinutes: Minutes;
  hoursPerCredit: number | null;
  normalCredits: number;
  fullLoadHours: number;
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

export interface WarningDetail {
  taskId?: string;
  deadlineId?: string;
  placeId?: string;
  taskTitle?: string;
  category?: string;
  kind?: string;
  dueDate?: DateStr;
  weekStart?: DateStr;
  date?: DateStr;
  titles?: string[];
  minutes?: number;
  costMinutes?: number;
  placeName?: string;
}

export interface Warning {
  kind: 'deadline-short' | 'weekly-short' | 'soft-time-used' | 'soft-offer' | 'address-missing' | 'travel-tight';
  message: string;
  detail?: WarningDetail;
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
  approvedSoft?: DateStr[];
  places?: Place[];
  commutes?: Commute[];
}

export interface PlanResult {
  blocks: Block[];
  warnings: Warning[];
  travel: Leg[];
}

export interface Label {
  id: string;
  name: string;
  color: string;
  style: 'fill' | 'outline';
}

export interface State {
  commitments: Commitment[];
  tasks: Task[];
  deadlines: Deadline[];
  places: Place[];
  commutes: Commute[];
  labels?: Label[];
  preferences: Preferences;
  blocks: Block[];
  approvedSoft: DateStr[];
  dismissed: string[];
}
