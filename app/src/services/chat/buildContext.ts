import type { AllFacts } from "../../types";

export function factsToCompactJson(facts: AllFacts): string {
  return JSON.stringify({
    patient: facts.patient,
    conditions: facts.conditions.map((c) => ({ name: c.name, status: c.status })),
    medications: facts.medications.map((m) => ({
      name: m.name,
      dose: m.dose,
      active: !m.endDate,
    })),
    labs: facts.labResults.map((l) => ({
      test: l.testName,
      value: l.value,
      unit: l.unit,
      date: l.takenAt,
    })),
    encounters: facts.encounters.map((e) => ({
      date: e.date,
      kind: e.kind,
      summary: e.summary,
    })),
  });
}
