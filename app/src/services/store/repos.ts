import type { DB } from "@op-engineering/op-sqlite";
import type {
  AllFacts,
  Condition,
  Deferral,
  Encounter,
  Flag,
  LabResult,
  Medication,
  Note,
  Patient,
  WearableDay,
} from "../../types";

export async function getAllFacts(db: DB, patientId: number): Promise<AllFacts> {
  const pRows = db.executeSync("SELECT * FROM patients WHERE id = ?", [patientId]).rows ?? [];
  const p = pRows[0] as any;
  if (!p) throw new Error(`Patient ${patientId} not found`);
  const patient: Patient = { id: p.id, name: p.name, dob: p.dob, sex: p.sex };

  const conditions: Condition[] = (
    db.executeSync("SELECT * FROM conditions WHERE patient_id = ? ORDER BY diagnosed_at DESC", [patientId]).rows ?? []
  ).map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    diagnosedAt: r.diagnosed_at,
  }));

  const encounters: Encounter[] = (
    db.executeSync("SELECT * FROM encounters WHERE patient_id = ? ORDER BY date DESC", [patientId]).rows ?? []
  ).map((r: any) => ({
    id: r.id,
    date: r.date,
    kind: r.kind,
    summary: r.summary,
    provider: r.provider,
  }));

  const medications: Medication[] = (
    db.executeSync("SELECT * FROM medications WHERE patient_id = ? ORDER BY start_date DESC", [patientId]).rows ?? []
  ).map((r: any) => ({
    id: r.id,
    name: r.name,
    dose: r.dose,
    frequency: r.frequency,
    timing: r.timing,
    startDate: r.start_date,
    endDate: r.end_date,
    prescribedAtEncounterId: r.prescribed_at_encounter_id,
  }));

  const labResults: LabResult[] = (
    db.executeSync("SELECT * FROM lab_results WHERE patient_id = ? ORDER BY taken_at DESC", [patientId]).rows ?? []
  ).map((r: any) => ({
    id: r.id,
    testName: r.test_name,
    value: r.value,
    unit: r.unit,
    takenAt: r.taken_at,
  }));

  const notes: Note[] = (
    db.executeSync("SELECT * FROM notes WHERE patient_id = ? ORDER BY created_at DESC", [patientId]).rows ?? []
  ).map((r: any) => ({
    id: r.id,
    text: r.text,
    createdAt: r.created_at,
  }));

  const wearable: WearableDay[] = (
    db.executeSync("SELECT * FROM wearable WHERE patient_id = ? ORDER BY date DESC", [patientId]).rows ?? []
  ).map((r: any) => ({
    date: r.date,
    restingHr: r.resting_hr,
    steps: r.steps,
  }));

  return { patient, conditions, encounters, medications, labResults, notes, wearable };
}

export async function getOpenFlags(db: DB, patientId: number): Promise<Flag[]> {
  const rows =
    db.executeSync("SELECT * FROM flags WHERE patient_id = ? AND status = 'open' ORDER BY created_at DESC", [patientId])
      .rows ?? [];
  return rows.map((r: any) => ({
    id: r.id,
    subject: r.subject,
    reasoning: r.reasoning,
    confidence: r.confidence,
    agent: r.agent,
    createdAt: r.created_at,
    status: r.status,
  }));
}

export async function updateFlagStatus(db: DB, flagId: number, status: string): Promise<void> {
  db.executeSync("UPDATE flags SET status = ? WHERE id = ?", [status, flagId]);
}

export async function saveVisitTranscript(
  db: DB,
  data: {
    patientId: number;
    transcript: { raw: string; translated: string };
    sourceLang: string;
    targetLang: string;
  }
): Promise<void> {
  db.executeSync(
    "INSERT INTO visit_transcripts (patient_id, raw_text, translated_text, source_lang, target_lang) VALUES (?, ?, ?, ?, ?)",
    [data.patientId, data.transcript.raw, data.transcript.translated, data.sourceLang, data.targetLang]
  );
}

export async function getOpenDeferrals(db: DB, patientId: number): Promise<Deferral[]> {
  const rows =
    db.executeSync("SELECT * FROM deferrals WHERE patient_id = ? AND resolved_at IS NULL ORDER BY id DESC", [patientId])
      .rows ?? [];
  return rows.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    question: r.question,
    context: r.context,
  }));
}

export async function resolveDeferral(db: DB, deferralId: number, answer: string): Promise<void> {
  db.executeSync("UPDATE deferrals SET answer = ?, resolved_at = datetime('now') WHERE id = ?", [answer, deferralId]);
}
