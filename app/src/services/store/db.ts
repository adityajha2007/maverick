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
    provider TEXT
  )`);

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

  db.executeSync(
    "INSERT INTO conditions (patient_id, name, status, diagnosed_at) VALUES (1, 'Lumbar Compression', 'active', '2023-06-15')"
  );
  db.executeSync(
    "INSERT INTO conditions (patient_id, name, status, diagnosed_at) VALUES (1, 'Shoulder Inflammation', 'active', '2023-09-20')"
  );

  db.executeSync(
    "INSERT INTO encounters (patient_id, date, kind, summary, provider) VALUES (1, '2023-10-12', 'Follow-up', 'Orthopedic follow-up regarding lumbar compression. Prescribed physical therapy exercises and light anti-inflammatory regime.', 'Dr. Sarah Jenkins')"
  );
  db.executeSync(
    "INSERT INTO encounters (patient_id, date, kind, summary, provider) VALUES (1, '2023-07-22', 'Annual Physical', 'Routine physical exam. All vitals within normal range.', 'Dr. Marcus Thorne')"
  );

  db.executeSync(
    "INSERT INTO medications (patient_id, name, dose, frequency, timing, start_date, prescribed_at_encounter_id) VALUES (1, 'Ibuprofen', '400mg', 'Twice daily', 'morning and evening', '2023-10-12', 1)"
  );
  db.executeSync(
    "INSERT INTO medications (patient_id, name, dose, frequency, timing, start_date, prescribed_at_encounter_id) VALUES (1, 'Meloxicam', '15mg', 'Once daily', 'morning', '2023-10-12', 1)"
  );

  db.executeSync(
    "INSERT INTO lab_results (patient_id, test_name, value, unit, taken_at) VALUES (1, 'HbA1c', 5.6, '%', '2023-10-12T10:30:00')"
  );
  db.executeSync(
    "INSERT INTO lab_results (patient_id, test_name, value, unit, taken_at) VALUES (1, 'CRP', 2.1, 'mg/L', '2023-10-12T10:30:00')"
  );

  db.executeSync(
    "INSERT INTO wearable (patient_id, date, resting_hr, steps) VALUES (1, '2023-10-25', 72, 8432)"
  );

  db.executeSync(
    "INSERT INTO flags (patient_id, subject, reasoning, confidence, agent, status) VALUES (1, 'Dizziness Reported', 'Patient logged dizziness episodes post-medication. May indicate adverse reaction to Ibuprofen.', 'grounded', 'symptom-monitor', 'open')"
  );
  db.executeSync(
    "INSERT INTO flags (patient_id, subject, reasoning, confidence, agent, status) VALUES (1, 'Inflammation Resolving', 'CRP trending downward. Shoulder inflammation appears to be responding to treatment.', 'grounded', 'lab-trend', 'open')"
  );
}
