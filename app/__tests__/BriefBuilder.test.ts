import { buildBriefFacts } from "../src/services/share/BriefBuilder";
import type { AllFacts } from "../src/types";

const facts: AllFacts = {
  patient: { id: 1, name: "Riya M.", dob: "1984-03-14", sex: "F" },
  encounters: [
    { id: 1, patientId: 1, date: "2026-05-01", provider: "Apollo", kind: "lab", summary: "labs" },
  ],
  medications: [
    { id: 1, patientId: 1, name: "Metformin", dose: "500mg", startDate: "2022-06-15",
      frequency: "twice daily", timing: "morning, evening", withFood: true,
      sourceType: "seed", sourceRef: "seed" },
    { id: 2, patientId: 1, name: "OldMed",    dose: "10mg", startDate: "2020-01-01",
      endDate: "2020-06-01", sourceType: "seed", sourceRef: "seed" },
  ],
  labResults: [
    { id: 1, patientId: 1, testName: "HbA1c", value: 7.0, unit: "%",
      takenAt: "2024-10-04", sourceType: "seed", sourceRef: "seed" },
    { id: 2, patientId: 1, testName: "HbA1c", value: 7.4, unit: "%",
      takenAt: "2026-05-01", sourceType: "seed", sourceRef: "seed" },
  ],
  conditions: [
    { id: 1, patientId: 1, name: "T2DM", diagnosedAt: "2022-06-15", status: "active" },
  ],
  wearable: [],
  notes: [],
};

test("buildBriefFacts collapses labs by name and computes trend", () => {
  const b = buildBriefFacts(facts);
  const hba1c = b.recent_labs.find((l) => l.test_name === "HbA1c");
  expect(hba1c?.value).toBe(7.4);
  expect(hba1c?.trend).toBe("up");
});

test("buildBriefFacts excludes ended meds from active list", () => {
  const b = buildBriefFacts(facts);
  expect(b.medications.map((m) => m.name)).toEqual(["Metformin"]);
  expect(b.medications[0].with_food).toBe(true);
});

test("buildBriefFacts computes age from dob", () => {
  const b = buildBriefFacts(facts);
  expect(b.patient.age).toBeGreaterThan(40);
  expect(b.patient.age).toBeLessThan(60);
});
