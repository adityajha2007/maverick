import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import type {
  AllFacts,
  Encounter,
  Flag,
  LabResult,
  Medication,
} from "../../src/types";
import { openDb } from "../../src/services/store/db";
import { getAllFacts, getOpenFlags, getEncounterActionItems } from "../../src/services/store/repos";
import type { Reminder } from "../../src/services/store/repos";

const PATIENT_ID = 1;

type TimelineEntry =
  | { type: "encounter"; data: Encounter; date: string; sortTs: string }
  | { type: "flag"; data: Flag; date: string; sortTs: string }
  | { type: "lab"; data: LabResult; date: string; sortTs: string }
  | { type: "med_start"; data: Medication; date: string; sortTs: string };

function buildTimeline(facts: AllFacts, flags: Flag[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const e of facts.encounters) {
    entries.push({ type: "encounter", data: e, date: e.date, sortTs: e.createdAt ?? e.date });
  }
  for (const f of flags) {
    entries.push({ type: "flag", data: f, date: f.createdAt.slice(0, 10), sortTs: f.createdAt });
  }
  for (const l of facts.labResults) {
    entries.push({ type: "lab", data: l, date: l.takenAt.slice(0, 10), sortTs: l.takenAt });
  }
  for (const m of facts.medications) {
    entries.push({ type: "med_start", data: m, date: m.startDate, sortTs: m.startDate });
  }

  entries.sort((a, b) => (a.sortTs > b.sortTs ? -1 : a.sortTs < b.sortTs ? 1 : 0));
  return entries;
}

function kindColor(type: TimelineEntry["type"]) {
  switch (type) {
    case "encounter":
      return { dot: "bg-clinical-primary", ring: "border-blue-200" };
    case "flag":
      return { dot: "bg-clinical-error", ring: "border-red-200" };
    case "lab":
      return { dot: "bg-clinical-secondary", ring: "border-cyan-200" };
    case "med_start":
      return { dot: "bg-clinical-processing", ring: "border-purple-200" };
  }
}

function kindIcon(type: TimelineEntry["type"]) {
  switch (type) {
    case "encounter":
      return "\u{1fa7a}";
    case "flag":
      return "⚠";
    case "lab":
      return "\u{1f9ea}";
    case "med_start":
      return "\u{1f48a}";
  }
}

function kindLabel(type: TimelineEntry["type"]) {
  switch (type) {
    case "encounter":
      return "Visit";
    case "flag":
      return "Alert";
    case "lab":
      return "Lab Result";
    case "med_start":
      return "Medication";
  }
}

function actionKindIcon(kind: string) {
  switch (kind) {
    case "xray": return "\u{1fa7b}";
    case "lab_test": return "\u{1f9ea}";
    case "medication": return "\u{1f48a}";
    case "follow_up": return "\u{1f4c5}";
    case "referral": return "\u{1f3e5}";
    case "lifestyle": return "\u{1f3c3}";
    default: return "\u{1f4cb}";
  }
}

function EncounterCard({
  enc,
  facts,
  actionItems,
}: {
  enc: Encounter;
  facts: AllFacts;
  actionItems: (Reminder & { encounterId: number })[];
}) {
  const [expanded, setExpanded] = useState(false);

  const relatedMeds = facts.medications.filter(
    (m) => m.prescribedAtEncounterId === enc.id
  );
  const relatedLabs = facts.labResults.filter(
    (l) => l.takenAt.slice(0, 10) === enc.date
  );
  const relatedActions = actionItems.filter((a) => a.encounterId === enc.id);

  return (
    <Pressable onPress={() => setExpanded(!expanded)}>
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-base font-semibold text-clinical-fg">
            {enc.provider ?? enc.kind}
          </Text>
          <Text className="mt-0.5 text-sm text-clinical-muted" numberOfLines={expanded ? undefined : 2}>
            {enc.summary ?? enc.kind}
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            <View className="rounded bg-clinical-primary/10 px-2 py-0.5">
              <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-primary">
                {enc.kind}
              </Text>
            </View>
            {relatedActions.length > 0 && (
              <View className="rounded bg-clinical-secondary/10 px-2 py-0.5">
                <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-secondary">
                  {relatedActions.filter((a) => a.status === "pending" || a.status === "done").length}/{relatedActions.length} ACCEPTED
                </Text>
              </View>
            )}
          </View>
        </View>
        <Text className="text-sm text-clinical-muted">{expanded ? "▲" : "▼"}</Text>
      </View>

      {/* Action Items with tick/cross */}
      {relatedActions.length > 0 && (
        <View className="mt-3 rounded-lg border border-clinical-outline-var bg-clinical-surface-low p-2.5">
          <Text className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-clinical-muted">
            ACTION ITEMS
          </Text>
          {relatedActions.map((action) => {
            const accepted = action.status !== "declined";
            return (
              <View key={action.id} className="mb-1 flex-row items-center gap-2">
                <Text className={`text-sm font-bold ${accepted ? "text-clinical-secondary" : "text-clinical-error"}`}>
                  {accepted ? "✓" : "✗"}
                </Text>
                <Text className="text-xs">{actionKindIcon(action.kind)}</Text>
                <Text
                  className={`flex-1 text-xs ${accepted ? "text-clinical-fg" : "text-clinical-muted line-through"}`}
                >
                  {action.title}
                </Text>
                {action.priority === "high" && (
                  <View className="rounded bg-clinical-error/10 px-1 py-0.5">
                    <Text className="text-[9px] font-bold text-clinical-error">HIGH</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {expanded && (
        <View className="mt-3 border-t border-clinical-outline-var pt-3">
          {relatedMeds.length > 0 && (
            <View className="mb-3">
              <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
                PRESCRIBED
              </Text>
              {relatedMeds.map((m) => (
                <View key={m.id} className="mt-1.5 flex-row items-center justify-between rounded-lg border border-clinical-outline-var bg-clinical-surface-low p-2.5">
                  <View>
                    <Text className="text-sm font-semibold text-clinical-fg">{m.name}</Text>
                    <Text className="text-xs text-clinical-muted">{m.dose} {"·"} {m.frequency ?? ""}</Text>
                  </View>
                  <Text className="text-sm">{"\u{1f48a}"}</Text>
                </View>
              ))}
            </View>
          )}
          {relatedLabs.length > 0 && (
            <View>
              <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
                LAB RESULTS
              </Text>
              {relatedLabs.map((l) => (
                <View key={l.id} className="mt-1.5 flex-row items-center justify-between rounded-lg border border-clinical-outline-var bg-clinical-surface-low p-2.5">
                  <Text className="text-sm text-clinical-fg">{l.testName}</Text>
                  <Text className="text-sm font-semibold text-clinical-fg">
                    {l.value} {l.unit}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

export default function Timeline() {
  const [facts, setFacts] = useState<AllFacts | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [actionItems, setActionItems] = useState<(Reminder & { encounterId: number })[]>([]);
  const [filter, setFilter] = useState<TimelineEntry["type"] | "all">("all");

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const db = await openDb();
          const [f, fl] = await Promise.all([
            getAllFacts(db, PATIENT_ID),
            getOpenFlags(db, PATIENT_ID),
          ]);
          setFacts(f);
          setFlags(fl);
          try {
            const ai = await getEncounterActionItems(db, PATIENT_ID);
            setActionItems(ai);
          } catch {}
        } catch {}
      })();
    }, [])
  );

  if (!facts) {
    return (
      <View className="flex-1 items-center justify-center bg-clinical-surface">
        <Text className="text-sm text-clinical-muted">Loading...</Text>
      </View>
    );
  }

  const timeline = buildTimeline(facts, flags);
  const filtered =
    filter === "all" ? timeline : timeline.filter((e) => e.type === filter);

  const filters: { label: string; value: TimelineEntry["type"] | "all" }[] = [
    { label: "All", value: "all" },
    { label: "Visits", value: "encounter" },
    { label: "Labs", value: "lab" },
    { label: "Meds", value: "med_start" },
    { label: "Alerts", value: "flag" },
  ];

  return (
    <View className="flex-1 bg-clinical-surface">
      {/* Header */}
      <View className="px-5 pb-3 pt-14">
        <Text className="text-2xl font-bold text-clinical-fg">Clinical Timeline</Text>
        <Text className="mt-1 text-sm text-clinical-muted">
          Chronological history of encounters and events
        </Text>
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-10 px-4"
        contentContainerStyle={{ gap: 8 }}
      >
        {filters.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => setFilter(f.value)}
            className={`rounded-full px-4 py-1.5 ${
              filter === f.value
                ? "bg-clinical-primary"
                : "border border-clinical-outline-var bg-clinical-card"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                filter === f.value ? "text-white" : "text-clinical-muted"
              }`}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Timeline */}
      <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
        <View className="relative ml-4 border-l-2 border-clinical-outline-var pl-6 pb-8">
          {filtered.map((entry, i) => {
            const colors = kindColor(entry.type);
            return (
              <View key={`${entry.type}-${i}`} className="relative mb-5">
                {/* Timeline dot */}
                <View
                  className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full ${colors.dot} border-4 ${colors.ring}`}
                />

                {/* Date label */}
                <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
                  {entry.date}
                </Text>

                {/* Card */}
                <View className="mt-1.5 rounded-xl border border-clinical-outline-var bg-clinical-card p-4">
                  <View className="mb-2 flex-row items-center gap-2">
                    <Text className="text-base">{kindIcon(entry.type)}</Text>
                    <View className="rounded bg-clinical-surface-mid px-2 py-0.5">
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-clinical-muted-variant">
                        {kindLabel(entry.type)}
                      </Text>
                    </View>
                  </View>

                  {entry.type === "encounter" && (
                    <EncounterCard enc={entry.data} facts={facts} actionItems={actionItems} />
                  )}

                  {entry.type === "flag" && (
                    <View>
                      <Text className="text-base font-semibold text-clinical-error">
                        {entry.data.subject}
                      </Text>
                      <Text className="mt-1 text-sm text-clinical-muted">
                        {entry.data.reasoning}
                      </Text>
                      <View className="mt-2 flex-row items-center gap-2">
                        <View className="rounded bg-clinical-error/10 px-2 py-0.5">
                          <Text className="text-[11px] font-bold uppercase text-clinical-error">
                            {entry.data.confidence}
                          </Text>
                        </View>
                        <Text className="text-xs text-clinical-muted">
                          via {entry.data.agent}
                        </Text>
                      </View>
                    </View>
                  )}

                  {entry.type === "lab" && (
                    <View className="flex-row items-center justify-between">
                      <Text className="text-base font-semibold text-clinical-fg">
                        {entry.data.testName}
                      </Text>
                      <View className="flex-row items-end gap-1">
                        <Text className="text-2xl font-bold text-clinical-fg">
                          {entry.data.value}
                        </Text>
                        <Text className="mb-0.5 text-sm text-clinical-muted">
                          {entry.data.unit}
                        </Text>
                      </View>
                    </View>
                  )}

                  {entry.type === "med_start" && (
                    <View>
                      <Text className="text-base font-semibold text-clinical-fg">
                        {entry.data.name}
                      </Text>
                      <Text className="mt-0.5 text-sm text-clinical-muted">
                        {entry.data.dose}
                        {entry.data.frequency ? ` · ${entry.data.frequency}` : ""}
                        {entry.data.timing ? ` · ${entry.data.timing}` : ""}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
