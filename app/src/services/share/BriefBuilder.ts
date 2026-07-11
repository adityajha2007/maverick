import type { AllFacts, BriefFacts } from "../../types";
import { BACKEND_URL } from "../../config";

export function buildBriefFacts(facts: AllFacts): BriefFacts {
  return {
    patient: { name: facts.patient.name, sex: facts.patient.sex },
    conditions: facts.conditions.map((c) => ({ name: c.name })),
    medications: facts.medications.map((m) => ({
      name: m.name,
      dose: m.dose,
      active: !m.endDate,
    })),
    follow_ups: facts.labResults.slice(0, 3).map((l) => ({
      test: l.testName,
      reason: `Last value: ${l.value} ${l.unit}`,
    })),
    watch_list: facts.conditions
      .filter((c) => c.status === "active")
      .map((c) => c.name),
  };
}

export async function postBrief(brief: BriefFacts): Promise<{ url: string }> {
  const res = await fetch(`${BACKEND_URL}/share-brief`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(brief),
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json();
}
