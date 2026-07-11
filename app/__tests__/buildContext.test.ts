import { buildChatContext, factsToCompactJson } from "../src/services/chat/buildContext";
import type { AllFacts } from "../src/types";

const facts: AllFacts = {
  patient: { id: 1, name: "Riya", dob: "1984-03-14", sex: "F" },
  encounters: [{ id: 1, patientId: 1, date: "2026-05-01", kind: "lab" }],
  medications: [{
    id: 1, patientId: 1, name: "Metformin", dose: "500mg",
    startDate: "2022-06-15", sourceType: "seed", sourceRef: "seed",
  }],
  labResults: [{
    id: 1, patientId: 1, testName: "HbA1c", value: 7.4, unit: "%",
    takenAt: "2026-05-01", sourceType: "seed", sourceRef: "seed",
  }],
  conditions: [{ id: 1, patientId: 1, name: "T2DM", diagnosedAt: "2022-06-15", status: "active" }],
  wearable: [],
  notes: [],
};

test("factsToCompactJson stays under 8KB for the seeded patient shape", () => {
  const json = factsToCompactJson(facts);
  expect(Buffer.byteLength(json, "utf8")).toBeLessThan(8192);
});

test("buildChatContext includes system + facts + question", () => {
  const prompt = buildChatContext(facts, "why am I on metformin?");
  expect(prompt).toMatch(/Health Memory/);
  expect(prompt).toMatch(/Metformin/);
  expect(prompt).toMatch(/why am I on metformin\?/);
});
