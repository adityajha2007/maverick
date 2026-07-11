import Database from "better-sqlite3";

// GemmaClient itself is safe to import under Jest (no native modules), but
// we mock it anyway so specialists get canned JSON deterministically instead
// of hitting a real backend.
const mockGenerate = jest.fn();
jest.mock("../src/services/gemma/GemmaClient", () => ({
  getGemmaClient: async () => ({ generate: mockGenerate }),
}));

// ingestLabPdf statically imports expo-file-system/legacy + expo-crypto,
// which are shipped as unparsed ESM and blow up under Jest's default
// transform. Mocking the module out means we never load those native-only
// deps in the test environment, while production code (React Native) still
// uses the real implementation untouched.
const mockIngestLabPdf = jest.fn(async () => ({ encounterId: 99, labsInserted: 2 }));
jest.mock("../src/services/ingestion/ingestLabPdf", () => ({
  ingestLabPdf: (...args: unknown[]) => mockIngestLabPdf(...(args as [])),
}));

import { Orchestrator } from "../src/services/agents/Orchestrator";
import { ExtractorAgent } from "../src/services/agents/ExtractorAgent";
import { InteractionAgent } from "../src/services/agents/InteractionAgent";
import { TrendAgent } from "../src/services/agents/TrendAgent";
import { getOpenFlags, getAgentActionsForTask, insertAgentAction } from "../src/services/store/repos";
import type { DB } from "../src/services/store/db";
import type { AgentTask } from "../src/types";

// Same better-sqlite3 adapter pattern as __tests__/repos.test.ts (Task 8),
// extended with the v0.2 Phase 3.1 tables this dispatch adds.
function makeDb(): DB {
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
    close: async () => {
      raw.close();
    },
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
CREATE TABLE flag (id INTEGER PRIMARY KEY, patient_id INTEGER, kind TEXT, subject TEXT, reasoning TEXT, confidence TEXT, agent TEXT, status TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE deferral (id INTEGER PRIMARY KEY, patient_id INTEGER, kind TEXT, question TEXT, context TEXT, resolved_answer TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE agent_action (id INTEGER PRIMARY KEY, task_id TEXT, agent TEXT, action TEXT, output_json TEXT, confidence TEXT, took_ms INTEGER, created_at TEXT DEFAULT (datetime('now')));
`;

async function seed(db: any) {
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(stmt);
  }
  await db.execute("INSERT INTO patient (id, name, dob, sex) VALUES (1, 'Riya', '1984-01-01', 'F')");
  await db.execute(
    "INSERT INTO medication (patient_id, name, dose, start_date, end_date, source_type, source_ref) VALUES (1, 'Losartan', '50mg', '2024-06-18', NULL, 'seed', 'seed')",
  );
  // 3+ datapoints so TrendAgent has a series to analyze.
  await db.execute(
    "INSERT INTO lab_result (patient_id, test_name, value, unit, taken_at, source_type, source_ref) VALUES (1, 'HbA1c', 7.0, '%', '2024-10-04', 'seed', 'seed')",
  );
  await db.execute(
    "INSERT INTO lab_result (patient_id, test_name, value, unit, taken_at, source_type, source_ref) VALUES (1, 'HbA1c', 7.2, '%', '2025-05-14', 'seed', 'seed')",
  );
  await db.execute(
    "INSERT INTO lab_result (patient_id, test_name, value, unit, taken_at, source_type, source_ref) VALUES (1, 'HbA1c', 7.4, '%', '2026-05-01', 'seed', 'seed')",
  );
}

function makeOrchestrator(db: any) {
  const orchestrator = new Orchestrator(db);
  orchestrator.register(new ExtractorAgent(db));
  orchestrator.register(new InteractionAgent(db));
  orchestrator.register(new TrendAgent(db));
  return orchestrator;
}

beforeEach(() => {
  mockGenerate.mockReset();
  mockIngestLabPdf.mockClear();
});

test("Extractor -> Interaction -> Trend handoff chain runs, logging every step to agent_action", async () => {
  const db = makeDb();
  await seed(db);

  mockGenerate
    .mockResolvedValueOnce({
      text: JSON.stringify({
        interactions: [
          {
            med1: "Losartan",
            med2: "Ibuprofen",
            severity: "moderate",
            reason: "NSAIDs may reduce the antihypertensive effect of Losartan; monitor BP.",
          },
        ],
      }),
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        trends: [
          {
            test_name: "HbA1c",
            direction: "rising",
            significance: "HbA1c has risen for three consecutive readings, nearing the re-treatment threshold.",
          },
        ],
      }),
    });

  const orchestrator = makeOrchestrator(db);
  const task: AgentTask = {
    kind: "extract",
    input: { fileUri: "file://fake.pdf", fileName: "fake.pdf", newMeds: [{ name: "Ibuprofen", dose: "200mg" }] },
    patientId: 1,
  };

  const results = await orchestrator.execute(task);

  // The full chain ran: Extractor -> Interaction -> Trend, and terminated
  // because TrendAgent returns no handoff.
  expect(results.map((r) => r.agent)).toEqual(["ExtractorAgent", "InteractionAgent", "TrendAgent"]);
  expect(results[0].handoff?.toKind).toBe("interaction_check");
  expect(results[1].handoff?.toKind).toBe("trend_analysis");
  expect(results[2].handoff).toBeUndefined();
  expect(mockIngestLabPdf).toHaveBeenCalledTimes(1);
  expect(mockGenerate).toHaveBeenCalledTimes(2);

  // Every step wrote an agent_action row.
  const actionRows = (await db.execute("SELECT * FROM agent_action ORDER BY id ASC")).rows;
  expect(actionRows).toHaveLength(3);
  expect(actionRows.map((r: any) => r.agent)).toEqual([
    "ExtractorAgent",
    "InteractionAgent",
    "TrendAgent",
  ]);
  expect(actionRows.map((r: any) => r.action)).toEqual([
    "extract",
    "interaction_check",
    "trend_analysis",
  ]);
  for (const row of actionRows as any[]) {
    expect(row.task_id).toEqual(expect.any(String));
    expect(row.task_id.length).toBeGreaterThan(0);
    expect(row.output_json).toEqual(expect.any(String));
    expect(row.confidence).toEqual(expect.any(String));
    expect(typeof row.took_ms).toBe("number");
  }
  // All three rows share the same task_id (one Orchestrator.execute() run).
  expect(new Set(actionRows.map((r: any) => r.task_id)).size).toBe(1);

  // Flags were raised by both InteractionAgent (moderate severity) and
  // TrendAgent (rising, non-stable direction).
  const flags = await getOpenFlags(db as any, 1);
  expect(flags.map((f) => f.kind).sort()).toEqual(["interaction", "trend"]);
  expect(flags.every((f) => f.reasoning.length > 0)).toBe(true);
});

test("extraction with no new meds hands off directly to trend_analysis", async () => {
  const db = makeDb();
  await seed(db);

  mockGenerate.mockResolvedValueOnce({
    text: JSON.stringify({ trends: [{ test_name: "HbA1c", direction: "stable", significance: "Stable." }] }),
  });

  const orchestrator = new Orchestrator(db);
  orchestrator.register(new ExtractorAgent(db));
  orchestrator.register(new TrendAgent(db));
  // No InteractionAgent registered — if ExtractorAgent tried to hand off to
  // interaction_check here, execute() would throw "no agent registered".

  const task: AgentTask = {
    kind: "extract",
    input: { fileUri: "file://fake.pdf", fileName: "fake.pdf" },
    patientId: 1,
  };

  const results = await orchestrator.execute(task);
  expect(results.map((r) => r.agent)).toEqual(["ExtractorAgent", "TrendAgent"]);
  expect(results[0].handoff?.toKind).toBe("trend_analysis");
});

test("getAgentActionsForTask filters to a single task_id", async () => {
  const db = makeDb();
  await seed(db);

  await insertAgentAction(db as any, { taskId: "task-a", agent: "ExtractorAgent", action: "extract", confidence: "grounded" });
  await insertAgentAction(db as any, { taskId: "task-b", agent: "TrendAgent", action: "trend_analysis", confidence: "uncertain" });
  await insertAgentAction(db as any, { taskId: "task-a", agent: "InteractionAgent", action: "interaction_check", confidence: "defer" });

  const rowsForA = await getAgentActionsForTask(db as any, "task-a");
  expect(rowsForA).toHaveLength(2);
  expect(rowsForA.map((r) => r.agent)).toEqual(["ExtractorAgent", "InteractionAgent"]);
});
