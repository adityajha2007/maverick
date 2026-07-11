import Database from "better-sqlite3";
import { getActiveMedications, getRecentLabs, insertLabResult, insertEncounter } from "../src/services/store/repos";

// Adapter that mirrors our DB interface but uses better-sqlite3 synchronously.
function makeDb() {
  const raw = new Database(":memory:");
  return {
    execute: async (sql: string, params?: unknown[]) => {
      const stmt = raw.prepare(sql);
      if (/RETURNING/i.test(sql) || /SELECT/i.test(sql.trim().slice(0, 6))) {
        const rows = stmt.all(...(params ?? []));
        return { rows };
      }
      stmt.run(...(params ?? []));
      return { rows: [] };
    },
    close: async () => raw.close(),
  };
}

const SCHEMA = `
CREATE TABLE patient (id INTEGER PRIMARY KEY, name TEXT, dob TEXT, sex TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE encounter (id INTEGER PRIMARY KEY, patient_id INTEGER, date TEXT, provider TEXT, kind TEXT, summary TEXT);
CREATE TABLE medication (id INTEGER PRIMARY KEY, patient_id INTEGER, name TEXT, dose TEXT, start_date TEXT, end_date TEXT, prescribed_at_encounter_id INTEGER, frequency TEXT, timing TEXT, with_food INTEGER, duration_days INTEGER, patient_notes TEXT, source_type TEXT, source_ref TEXT);
CREATE TABLE lab_result (id INTEGER PRIMARY KEY, patient_id INTEGER, test_name TEXT, value REAL, unit TEXT, ref_low REAL, ref_high REAL, taken_at TEXT, source_type TEXT, source_ref TEXT);
CREATE TABLE condition (id INTEGER PRIMARY KEY, patient_id INTEGER, name TEXT, diagnosed_at TEXT, status TEXT);
CREATE TABLE wearable_daily (patient_id INTEGER, date TEXT, resting_hr INTEGER, sleep_hours REAL, steps INTEGER, hrv_ms INTEGER);
CREATE TABLE note_chunk (id INTEGER PRIMARY KEY, patient_id INTEGER, source_type TEXT, source_ref TEXT, text TEXT, taken_at TEXT);
`;

async function seed(db: any) {
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(stmt);
  }
  await db.execute("INSERT INTO patient (id, name, dob, sex) VALUES (1, 'Riya', '1984-01-01', 'F')");
  await db.execute("INSERT INTO medication (patient_id, name, dose, start_date, end_date, source_type, source_ref) VALUES (1, 'Metformin', '500mg', '2024-01-01', NULL, 'seed', 'seed')");
  await db.execute("INSERT INTO medication (patient_id, name, dose, start_date, end_date, source_type, source_ref) VALUES (1, 'OldMed', '10mg', '2020-01-01', '2020-06-01', 'seed', 'seed')");
}

test("getActiveMedications returns only currently active meds", async () => {
  const db = makeDb();
  await seed(db);
  const active = await getActiveMedications(db as any, 1);
  expect(active.map((m) => m.name)).toEqual(["Metformin"]);
});

test("insertLabResult + getRecentLabs roundtrip", async () => {
  const db = makeDb();
  await seed(db);
  await insertEncounter(db as any, { patientId: 1, date: "2026-06-01", kind: "lab" });
  const id = await insertLabResult(db as any, {
    patientId: 1, testName: "HbA1c", value: 7.4, unit: "%",
    takenAt: "2026-06-01", sourceType: "lab_pdf", sourceRef: "abc",
  });
  expect(typeof id).toBe("number");
  const labs = await getRecentLabs(db as any, 1, 3650);
  expect(labs).toHaveLength(1);
  expect(labs[0].testName).toBe("HbA1c");
});
