import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Dimensions, Image, Pressable, ScrollView, Text, View } from "react-native";

import type { AllFacts, Flag } from "../../src/types";
import { openDb } from "../../src/services/store/db";
import { getAllFacts, getOpenFlags } from "../../src/services/store/repos";

const PATIENT_ID = 1;
const bodyImage = require("../../src/assets/body-anatomy.jpg");
const SCREEN_WIDTH = Dimensions.get("window").width;

export default function Home() {
  const [facts, setFacts] = useState<AllFacts | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const db = await openDb();
        const [f, fl] = await Promise.all([
          getAllFacts(db, PATIENT_ID),
          getOpenFlags(db, PATIENT_ID),
        ]);
        setFacts(f);
        setFlags(fl);
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

  const activeMeds = facts.medications.filter((m) => !m.endDate);
  const nextMed = activeMeds[0];
  const lastVisit = facts.encounters[0];

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

      {/* 3D Body Hero Section */}
      <View className="mx-4 mt-3 overflow-hidden rounded-2xl border border-clinical-outline-var">
        <View className="relative" style={{ height: SCREEN_WIDTH * 1.1 }}>
          <Image
            source={bodyImage}
            className="absolute inset-0 h-full w-full"
            resizeMode="cover"
          />

          {/* Status Overlay — top-left */}
          <View className="absolute left-3 top-3 rounded-lg bg-white/80 px-3 py-2">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-clinical-primary">
              STATUS
            </Text>
            <View className="mt-0.5 flex-row items-center gap-1.5">
              <View className="h-2 w-2 rounded-full bg-cyan-400" />
              <Text className="text-xs font-semibold text-clinical-fg">Monitoring Active</Text>
            </View>
          </View>

          {/* Action Buttons — top-right */}
          <View className="absolute right-3 top-3 flex-row gap-2">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-white/80">
              <Text className="text-sm">🔍</Text>
            </View>
            <View className="h-9 w-9 items-center justify-center rounded-full bg-white/80">
              <Text className="text-sm">🔄</Text>
            </View>
          </View>

          {/* Shoulder Hotspot */}
          <View className="absolute" style={{ top: "30%", left: "30%" }}>
            <View className="h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-500/40">
              <View className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            </View>
            <View className="absolute -left-8 -top-10 rounded-md bg-white/90 px-2 py-1">
              <Text className="text-[9px] font-bold uppercase tracking-wider text-clinical-fg">
                SHOULDER
              </Text>
              <Text className="text-[9px] font-bold text-clinical-secondary">
                STABILITY 94%
              </Text>
            </View>
          </View>

          {/* Lower Back Hotspot */}
          <View className="absolute" style={{ top: "60%", left: "42%" }}>
            <View className="h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-500/40">
              <View className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            </View>
            <View className="absolute -right-24 top-0 rounded-md bg-white/90 px-2 py-1">
              <Text className="text-[9px] font-bold uppercase tracking-wider text-clinical-fg">
                LOWER BACK
              </Text>
              <Text className="text-[9px] font-bold text-clinical-error">
                STRAIN INDICATOR 12%
              </Text>
            </View>
          </View>

          {/* Processing Bar — bottom */}
          <View className="absolute bottom-4 left-1/2 h-1 w-64 -translate-x-1/2 overflow-hidden rounded-full bg-white/30">
            <View className="h-full w-1/2 rounded-full bg-clinical-primary" />
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
          <Text className="text-lg text-clinical-secondary">♥</Text>
          <Text className="mt-1 text-xs font-bold uppercase tracking-widest text-clinical-muted">
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
          <Text className="text-lg text-clinical-secondary">🚶</Text>
          <Text className="mt-1 text-xs font-bold uppercase tracking-widest text-clinical-muted">
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
                  <Text className="text-xs text-clinical-muted-variant">Images (2)</Text>
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

      {/* Next Appointment */}
      <View className="mx-4 mb-4 mt-3 rounded-2xl border border-clinical-primary bg-clinical-primary p-4">
        <Text className="text-xs font-bold uppercase tracking-widest text-blue-200">
          NEXT APPOINTMENT
        </Text>
        <Text className="mt-2 text-3xl font-bold text-white">
          14 <Text className="text-xl font-semibold opacity-80">Days</Text>
        </Text>
        <Text className="mt-1 text-sm text-blue-200">
          Nov 15 • 10:30 AM (Physiotherapy)
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
