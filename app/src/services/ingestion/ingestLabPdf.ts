import type { DB } from "@op-engineering/op-sqlite";
import * as FileSystem from "expo-file-system";
import { BACKEND_URL } from "../../config";

export async function ingestLabPdf(
  db: DB,
  patientId: number,
  fileUri: string,
  fileName: string
): Promise<{ labsInserted: number }> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const res = await fetch(`${BACKEND_URL}/ingest-lab`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdf_base64: base64, file_name: fileName }),
  });

  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  const { labs } = (await res.json()) as { labs: { test: string; value: number; unit: string; date: string }[] };

  for (const l of labs) {
    db.execute(
      "INSERT INTO lab_results (patient_id, test_name, value, unit, taken_at) VALUES (?, ?, ?, ?, ?)",
      [patientId, l.test, l.value, l.unit, l.date]
    );
  }

  return { labsInserted: labs.length };
}
