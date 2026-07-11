import { open, type DB } from "@op-engineering/op-sqlite";

const DB_NAME = "healthos.db";

let _db: DB | null = null;

export async function openDb(): Promise<DB> {
  if (_db) return _db;

  _db = open({ name: DB_NAME });

  _db.executeSync(`CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dob TEXT NOT NULL,
    sex TEXT NOT NULL
  )`);

  _db.executeSync(`CREATE TABLE IF NOT EXISTS conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    diagnosed_at TEXT NOT NULL
  )`);

  _db.executeSync(`CREATE TABLE IF NOT EXISTS encounters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT,
    provider TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  try {
    _db.executeSync("ALTER TABLE encounters ADD COLUMN created_at TEXT");
    _db.executeSync("UPDATE encounters SET created_at = date || ' 00:00:00' WHERE created_at IS NULL");
  } catch {}

  _db.executeSync(`CREATE TABLE IF NOT EXISTS medications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    dose TEXT NOT NULL,
    frequency TEXT,
    timing TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    prescribed_at_encounter_id INTEGER
  )`);

  _db.executeSync(`CREATE TABLE IF NOT EXISTS lab_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    test_name TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    taken_at TEXT NOT NULL
  )`);

  _db.executeSync(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  _db.executeSync(`CREATE TABLE IF NOT EXISTS wearable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    resting_hr INTEGER,
    steps INTEGER
  )`);

  _db.executeSync(`CREATE TABLE IF NOT EXISTS flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    confidence TEXT NOT NULL DEFAULT 'uncertain',
    agent TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'open'
  )`);

  _db.executeSync(`CREATE TABLE IF NOT EXISTS deferrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    question TEXT NOT NULL,
    context TEXT,
    answer TEXT,
    resolved_at TEXT
  )`);

  _db.executeSync(`CREATE TABLE IF NOT EXISTS visit_transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    raw_text TEXT,
    translated_text TEXT,
    source_lang TEXT,
    target_lang TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  _db.executeSync(`CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    kind TEXT NOT NULL DEFAULT 'action',
    priority TEXT NOT NULL DEFAULT 'normal',
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    encounter_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  try {
    _db.executeSync("ALTER TABLE reminders ADD COLUMN encounter_id INTEGER");
  } catch {}

  seed(_db);

  return _db;
}

function seed(db: DB) {
  const result = db.executeSync("SELECT COUNT(*) as c FROM patients");
  const row = result.rows?.[0];
  const count = row ? (row as any).c ?? (row as any)["COUNT(*)"] ?? 0 : 0;
  if (Number(count) > 0) return;

  db.executeSync(
    "INSERT OR IGNORE INTO patients (id, name, dob, sex) VALUES (1, 'Arjun Mehta', '1988-03-14', 'Male')"
  );

  db.executeSync("INSERT INTO conditions (patient_id, name, status, diagnosed_at) VALUES (1, 'Lumbar Disc Herniation (L4-L5)', 'active', '2025-11-20')");
  db.executeSync("INSERT INTO conditions (patient_id, name, status, diagnosed_at) VALUES (1, 'Chronic Lower Back Pain', 'active', '2025-08-10')");
  db.executeSync("INSERT INTO conditions (patient_id, name, status, diagnosed_at) VALUES (1, 'Mild Hypertension', 'active', '2026-01-15')");

  db.executeSync("INSERT INTO encounters (patient_id, date, kind, summary, provider, created_at) VALUES (1, '2026-06-15', 'Follow-up', 'Follow-up for lumbar disc herniation. Doctor reviewed recent MRI showing mild improvement. Advised to continue physiotherapy 3x/week and avoid heavy lifting. Discussed switching from Ibuprofen to Naproxen due to gastric irritation.', 'Dr. Priya Sharma', '2026-06-15 10:30:00')");
  db.executeSync("INSERT INTO encounters (patient_id, date, kind, summary, provider, created_at) VALUES (1, '2026-05-01', 'Specialist Referral', 'Referred to orthopedic specialist for lumbar disc assessment. Initial MRI ordered. Patient reported radiating pain in left leg (sciatica).', 'Dr. Rajesh Kapoor', '2026-05-01 14:00:00')");
  db.executeSync("INSERT INTO encounters (patient_id, date, kind, summary, provider, created_at) VALUES (1, '2026-03-10', 'Annual Physical', 'Routine checkup. BP slightly elevated at 140/90. Started on Amlodipine 5mg. All blood work within normal limits except mildly elevated CRP.', 'Dr. Meena Gupta', '2026-03-10 09:00:00')");

  db.executeSync("INSERT INTO medications (patient_id, name, dose, frequency, timing, start_date, prescribed_at_encounter_id) VALUES (1, 'Naproxen', '500mg', 'Twice daily', 'morning and evening with food', '2026-06-15', 1)");
  db.executeSync("INSERT INTO medications (patient_id, name, dose, frequency, timing, start_date, end_date, prescribed_at_encounter_id) VALUES (1, 'Ibuprofen', '400mg', 'Twice daily', 'morning and evening', '2025-11-20', '2026-06-15', 1)");
  db.executeSync("INSERT INTO medications (patient_id, name, dose, frequency, timing, start_date, prescribed_at_encounter_id) VALUES (1, 'Amlodipine', '5mg', 'Once daily', 'morning', '2026-03-10', 3)");
  db.executeSync("INSERT INTO medications (patient_id, name, dose, frequency, timing, start_date, prescribed_at_encounter_id) VALUES (1, 'Pregabalin', '75mg', 'Twice daily', 'morning and night', '2026-05-01', 2)");

  db.executeSync("INSERT INTO lab_results (patient_id, test_name, value, unit, taken_at) VALUES (1, 'HbA1c', 5.4, '%', '2026-03-10T09:30:00')");
  db.executeSync("INSERT INTO lab_results (patient_id, test_name, value, unit, taken_at) VALUES (1, 'CRP', 3.8, 'mg/L', '2026-03-10T09:30:00')");
  db.executeSync("INSERT INTO lab_results (patient_id, test_name, value, unit, taken_at) VALUES (1, 'Vitamin D', 18, 'ng/mL', '2026-03-10T09:30:00')");
  db.executeSync("INSERT INTO lab_results (patient_id, test_name, value, unit, taken_at) VALUES (1, 'ESR', 22, 'mm/hr', '2026-06-15T10:00:00')");

  db.executeSync("INSERT INTO wearable (patient_id, date, resting_hr, steps) VALUES (1, '2026-07-11', 68, 6240)");

  db.executeSync("INSERT INTO notes (patient_id, text, created_at) VALUES (1, 'Symptoms: Pain, Stiffness | Severity: Moderate | Lower back pain worse after sitting for long periods. Left leg numbness comes and goes.', '2026-07-08 20:15:00')");
  db.executeSync("INSERT INTO notes (patient_id, text, created_at) VALUES (1, 'Symptoms: Dizziness | Severity: Mild | Felt lightheaded after morning medication. Resolved after 30 minutes.', '2026-07-05 08:45:00')");

  db.executeSync("INSERT INTO flags (patient_id, subject, reasoning, confidence, agent, status) VALUES (1, 'Low Vitamin D — Risk for Bone Health', 'Vitamin D at 18 ng/mL (deficient). Combined with lumbar disc herniation, low vitamin D may impair bone healing and increase fracture risk. Supplementation recommended.', 'grounded', 'lab-trend', 'open')");
  db.executeSync("INSERT INTO flags (patient_id, subject, reasoning, confidence, agent, status) VALUES (1, 'Elevated CRP — Ongoing Inflammation', 'CRP at 3.8 mg/L suggests persistent inflammation, consistent with active disc herniation. Monitor trend at next visit.', 'grounded', 'lab-trend', 'open')");
  db.executeSync("INSERT INTO flags (patient_id, subject, reasoning, confidence, agent, status) VALUES (1, 'Dizziness After Medication', 'Patient logged dizziness episodes post-medication. May indicate adverse reaction to Amlodipine or Pregabalin interaction. Discuss with prescribing physician.', 'uncertain', 'symptom-monitor', 'open')");
}
