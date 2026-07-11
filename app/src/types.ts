export interface Patient {
  id: number;
  name: string;
  dob: string;
  sex: string;
}

export interface Condition {
  id: number;
  name: string;
  status: "active" | "resolved";
  diagnosedAt: string;
}

export interface Encounter {
  id: number;
  date: string;
  kind: string;
  summary?: string;
  provider?: string;
}

export interface Medication {
  id: number;
  name: string;
  dose: string;
  frequency?: string;
  timing?: string;
  startDate: string;
  endDate?: string;
  prescribedAtEncounterId?: number;
}

export interface LabResult {
  id: number;
  testName: string;
  value: number;
  unit: string;
  takenAt: string;
}

export interface Note {
  id: number;
  text: string;
  createdAt: string;
}

export interface WearableDay {
  date: string;
  restingHr: number;
  steps: number;
}

export type ConfidenceLevel = "grounded" | "uncertain" | "defer";

export interface Flag {
  id: number;
  subject: string;
  reasoning: string;
  confidence: ConfidenceLevel;
  agent: string;
  createdAt: string;
  status: "open" | "ack" | "dismissed";
}

export interface Deferral {
  id: number;
  kind: string;
  question: string;
  context?: string;
}

export interface AllFacts {
  patient: Patient;
  conditions: Condition[];
  encounters: Encounter[];
  medications: Medication[];
  labResults: LabResult[];
  notes: Note[];
  wearable?: WearableDay[];
}

export interface BriefFacts {
  patient: { name: string; sex: string };
  conditions: { name: string }[];
  medications: { name: string; dose: string; active: boolean }[];
  follow_ups: { test: string; reason: string }[];
  watch_list: string[];
}
