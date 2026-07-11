// The synthetic patient this Companion agent speaks to.
// Mirror of `app/assets/seed/synthetic_patient.sql` in the parent healthOS
// repo — same person as the on-device memory app.
//
// Kept small and hand-authored for the MVP. If we ever want to sync live,
// a tiny script could regenerate this file from the .sql source of truth.

export interface Medication {
  name: string;
  dose: string;
  timing: string;
}

export interface Lab {
  name: string;
  value: string;
  date: string;
  trend: "up" | "down" | "flat";
}

export interface PatientFacts {
  name: string;
  age: number;
  sex: string;
  conditions: string[];
  medications: Medication[];
  recentLabs: Lab[];
  recentNotes: string[];
}

export const PATIENT: PatientFacts = {
  name: "Riya M.",
  age: 42,
  sex: "F",
  conditions: [
    "Type 2 Diabetes (2022)",
    "Hypertension (2020)",
    "Hyperlipidemia (2023)",
  ],
  medications: [
    { name: "Metformin", dose: "500mg", timing: "twice daily with food" },
    { name: "Losartan", dose: "50mg", timing: "morning" },
    { name: "Atorvastatin", dose: "20mg", timing: "bedtime" },
  ],
  recentLabs: [
    { name: "HbA1c", value: "7.4%", date: "2026-05-01", trend: "up" },
    { name: "LDL", value: "122 mg/dL", date: "2026-05-01", trend: "flat" },
    {
      name: "Fasting glucose",
      value: "148 mg/dL",
      date: "2026-05-01",
      trend: "up",
    },
  ],
  recentNotes: [
    "HbA1c has risen 0.4 points over the past 12 months.",
    "Discussed medication adherence at last visit; patient occasionally skips weekend Atorvastatin.",
    "Reports mild evening lightheadedness — hypoglycemia workup discussed.",
  ],
};
