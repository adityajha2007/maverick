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
    db.executeSync("SELECT * FROM encounters WHERE patient_id = ? ORDER BY COALESCE(created_at, date) DESC, id DESC", [patientId]).rows ?? []
  ).map((r: any) => ({
    id: r.id,
    date: r.date,
    kind: r.kind,
    summary: r.summary,
    provider: r.provider,
    createdAt: r.created_at ?? r.date,
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

export async function saveMedication(
  db: DB,
  data: {
    patientId: number;
    name: string;
    dose: string;
    frequency: string;
    timing?: string;
    duration?: string;
    encounterId?: number;
  }
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  db.executeSync(
    "INSERT INTO medications (patient_id, name, dose, frequency, timing, start_date, end_date, prescribed_at_encounter_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [data.patientId, data.name, data.dose, data.frequency, data.timing ?? null, today, data.duration ?? null, data.encounterId ?? null]
  );
  const row = db.executeSync("SELECT last_insert_rowid() as id").rows?.[0] as any;
  return row?.id ?? 0;
}

export async function saveNote(db: DB, patientId: number, text: string): Promise<void> {
  db.executeSync("INSERT INTO notes (patient_id, text) VALUES (?, ?)", [patientId, text]);
}

export interface Reminder {
  id: number;
  title: string;
  description: string | null;
  kind: string;
  priority: string;
  dueDate: string | null;
  status: string;
  createdAt: string;
}

export async function saveReminder(
  db: DB,
  data: {
    patientId: number;
    title: string;
    description?: string;
    kind?: string;
    priority?: string;
    dueDate?: string;
    encounterId?: number;
    status?: string;
  }
): Promise<number> {
  db.executeSync(
    "INSERT INTO reminders (patient_id, title, description, kind, priority, due_date, encounter_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [data.patientId, data.title, data.description ?? null, data.kind ?? "action", data.priority ?? "normal", data.dueDate ?? null, data.encounterId ?? null, data.status ?? "pending"]
  );
  const row = db.executeSync("SELECT last_insert_rowid() as id").rows?.[0] as any;
  return row?.id ?? 0;
}

export async function getReminders(db: DB, patientId: number): Promise<Reminder[]> {
  const rows = db.executeSync(
    "SELECT * FROM reminders WHERE patient_id = ? AND status = 'pending' ORDER BY priority DESC, created_at DESC",
    [patientId]
  ).rows ?? [];
  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    kind: r.kind,
    priority: r.priority,
    dueDate: r.due_date,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function completeReminder(db: DB, reminderId: number): Promise<void> {
  db.executeSync("UPDATE reminders SET status = 'done' WHERE id = ?", [reminderId]);
}

export async function getEncounterActionItems(db: DB, patientId: number): Promise<(Reminder & { encounterId: number })[]> {
  try {
    const rows = db.executeSync(
      "SELECT * FROM reminders WHERE patient_id = ? AND encounter_id IS NOT NULL ORDER BY created_at DESC",
      [patientId]
    ).rows ?? [];
    return rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      kind: r.kind,
      priority: r.priority,
      dueDate: r.due_date,
      status: r.status,
      createdAt: r.created_at,
      encounterId: r.encounter_id,
    }));
  } catch {
    return [];
  }
}
