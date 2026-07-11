import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { AllFacts, Flag } from "../../src/types";
import { openDb } from "../../src/services/store/db";
import { getAllFacts, getOpenFlags } from "../../src/services/store/repos";

const PATIENT_ID = 1;

export default function Home() {
  const [facts, setFacts] = useState<AllFacts | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const db = await openDb();
      const [f, fl] = await Promise.all([
        getAllFacts(db, PATIENT_ID),
        getOpenFlags(db, PATIENT_ID),
      ]);
      setFacts(f);
      setFlags(fl);
    })();
  }, []);

  if (!facts) {
    return (
      <View className="flex-1 items-center justify-center bg-clinical-surface">
        <Text className="text-sm text-clinical-muted">Loading...</Text>
      </View>
    );
  }

  const activeMeds = facts.medications.filter((m) => !m.endDate);
  const nextMed = activeMeds[0];
  const lastVisit = facts.encounters[0];
  const age = new Date().getFullYear() - parseInt(facts.patient.dob.slice(0, 4));

  const latestLabs: Record<string, { v: number; at: string }> = {};
  for (const l of facts.labResults) {
    if (!latestLabs[l.testName] || l.takenAt > latestLabs[l.testName].at) {
      latestLabs[l.testName] = { v: l.value, at: l.takenAt };
    }
  }

  return (
    <ScrollView className="flex-1 bg-clinical-surface" showsVerticalScrollIndicator={false}>
      {/* Header Bar */}
      <View className="flex-row items-center justify-between px-5 pb-2 pt-14">
        <View className="flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center rounded-lg bg-clinical-primary">
            <Text className="text-xs font-bold text-white">M</Text>
          </View>
          <Text className="text-lg font-bold text-clinical-fg">MedOS</Text>
        </View>
        <View className="relative">
          <Text className="text-xl text-clinical-muted">🔔</Text>
          {flags.length > 0 && (
            <View className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-clinical-error" />
          )}
        </View>
      </View>

      {/* Status Card — Patient Overview */}
      <View className="mx-4 mt-3 overflow-hidden rounded-2xl border border-clinical-outline-var bg-clinical-primary">
        <View className="p-5">
          <Text className="text-xs font-bold uppercase tracking-widest text-blue-200">
            STATUS
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            <View className="h-2 w-2 rounded-full bg-emerald-400" />
            <Text className="text-sm font-medium text-blue-100">Monitoring Active</Text>
          </View>
        </View>
        <View className="bg-clinical-primary-dim px-5 pb-5 pt-3">
          <Text className="text-2xl font-bold text-white">{facts.patient.name}</Text>
          <Text className="mt-0.5 text-sm text-blue-200">
            {age}y · {facts.patient.sex} · DOB {facts.patient.dob}
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {facts.conditions.map((c) => (
              <View key={c.id} className="rounded-full bg-white/15 px-3 py-1">
                <Text className="text-xs font-medium text-white">{c.name}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Medication Reminder */}
      {nextMed && (
        <View className="mx-4 mt-3 rounded-2xl border border-clinical-outline-var bg-clinical-card p-4">
          <View className="flex-row items-start gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-clinical-primary">
              <Text className="text-base text-white">+</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-clinical-fg">
                Take Medication
              </Text>
              <Text className="mt-0.5 text-sm text-clinical-muted">
                {nextMed.name} {nextMed.dose} for{" "}
                {facts.conditions[0]?.name ?? "treatment"}.{" "}
                {nextMed.timing ? `Scheduled ${nextMed.timing}.` : ""}
              </Text>
            </View>
          </View>
          <Pressable className="mt-3 items-center rounded-lg bg-clinical-error py-2.5">
            <Text className="text-sm font-bold text-white">Log Taken</Text>
          </Pressable>
        </View>
      )}

      {/* Vitals Row */}
      <View className="mx-4 mt-3 flex-row gap-3">
        <View className="flex-1 rounded-2xl border border-clinical-outline-var bg-clinical-card p-4">
          <Text className="text-xs font-bold uppercase tracking-widest text-clinical-muted">
            HEART RATE
          </Text>
          <View className="mt-2 flex-row items-end gap-1">
            <Text className="text-3xl font-bold text-clinical-fg">
              {facts.wearable?.[0]?.restingHr ?? 72}
            </Text>
            <Text className="mb-1 text-sm text-clinical-muted">BPM</Text>
          </View>
        </View>
        <View className="flex-1 rounded-2xl border border-clinical-outline-var bg-clinical-card p-4">
          <Text className="text-xs font-bold uppercase tracking-widest text-clinical-muted">
            DAILY STEPS
          </Text>
          <View className="mt-2 flex-row items-end gap-1">
            <Text className="text-3xl font-bold text-clinical-fg">
              {facts.wearable?.[0]?.steps?.toLocaleString() ?? "8,432"}
            </Text>
            <Text className="mb-1 text-sm text-clinical-muted">/ 10k</Text>
          </View>
          <View className="mt-2 h-1.5 rounded-full bg-clinical-surface-mid">
            <View
              className="h-1.5 rounded-full bg-clinical-primary"
              style={{ width: `${Math.min(((facts.wearable?.[0]?.steps ?? 8432) / 10000) * 100, 100)}%` }}
            />
          </View>
        </View>
      </View>

      {/* Last Visit */}
      {lastVisit && (
        <View className="mx-4 mt-3 rounded-2xl border border-clinical-outline-var bg-clinical-card p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-widest text-clinical-muted">
              LAST VISIT
            </Text>
            <Text className="text-xs text-clinical-muted">{lastVisit.date}</Text>
          </View>
          <View className="mt-3 flex-row items-start gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-clinical-surface-mid">
              <Text className="text-base">🩺</Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-clinical-fg">
                {lastVisit.provider ?? "Doctor Visit"}
              </Text>
              <Text className="mt-0.5 text-sm text-clinical-muted" numberOfLines={2}>
                {lastVisit.summary ?? lastVisit.kind}
              </Text>
              <View className="mt-2 flex-row gap-2">
                <View className="rounded border border-clinical-outline-var px-2 py-1">
                  <Text className="text-xs text-clinical-muted-variant">Notes</Text>
                </View>
                <View className="rounded border border-clinical-outline-var px-2 py-1">
                  <Text className="text-xs text-clinical-muted-variant">Labs</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Agents Noticed */}
      {flags.length > 0 && (
        <Pressable
          onPress={() => router.push("/(tabs)/timeline")}
          className="mx-4 mt-3 rounded-2xl border border-clinical-error/30 bg-clinical-error-bg p-4"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-widest text-clinical-error">
              AGENTS NOTICED
            </Text>
            <Text className="text-xs font-semibold text-clinical-error">
              {flags.length} items →
            </Text>
          </View>
          {flags.slice(0, 2).map((f) => (
            <Text key={f.id} numberOfLines={1} className="mt-1.5 text-sm text-clinical-fg">
              {f.subject}
            </Text>
          ))}
        </Pressable>
      )}

      {/* Quick Actions */}
      <View className="mx-4 mb-4 mt-3 rounded-2xl border border-clinical-primary bg-clinical-primary p-4">
        <Text className="text-xs font-bold uppercase tracking-widest text-blue-200">
          NEXT APPOINTMENT
        </Text>
        <Text className="mt-2 text-3xl font-bold text-white">14 Days</Text>
        <Text className="mt-1 text-sm text-blue-200">
          {lastVisit?.provider ?? "Dr."} · Follow-up
        </Text>
        <Pressable
          onPress={() => router.push("/live-visit")}
          className="mt-4 items-center rounded-xl border border-white/30 bg-white py-3"
        >
          <Text className="text-sm font-bold text-clinical-primary">Prepare for Visit</Text>
        </Pressable>
      </View>

      {/* FAB spacer */}
      <View className="h-4" />
    </ScrollView>
  );
}
