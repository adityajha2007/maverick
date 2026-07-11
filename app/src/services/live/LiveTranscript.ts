let _nextId = 1;

export interface TranscriptEntry {
  id: number;
  kind: "raw" | "translated" | "alert" | "agent";
  text: string;
  ts: number;
}

export function createEntry(kind: TranscriptEntry["kind"], text: string): TranscriptEntry {
  return { id: _nextId++, kind, text, ts: Date.now() };
}
