import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { AllFacts } from "../../src/types";
import { openDb } from "../../src/services/store/db";
import { getAllFacts } from "../../src/services/store/repos";

const PATIENT_ID = 1;

type RecordMode = "conversation" | "happenings" | "camera";

function RecordOptionCard({
  icon,
  title,
  description,
  selected,
  onPress,
  badge,
}: {
  icon: string;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`relative overflow-hidden rounded-xl border p-5 ${
        selected
          ? "border-clinical-primary bg-clinical-primary/5"
          : "border-clinical-outline-var bg-clinical-card"
      }`}
    >
      {badge && (
        <View className="absolute right-3 top-3 flex-row items-center gap-1 rounded-full bg-clinical-primary px-2 py-0.5">
          <View className="h-1.5 w-1.5 rounded-full bg-white" />
          <Text className="text-[10px] font-bold uppercase tracking-widest text-white">
            {badge}
          </Text>
        </View>
      )}
      <View
        className={`mb-3 h-12 w-12 items-center justify-center rounded-full ${
          selected ? "bg-clinical-primary" : "bg-clinical-surface-mid"
        }`}
      >
        <Text className={`text-xl ${selected ? "" : ""}`}>{icon}</Text>
      </View>
      <Text className="text-lg font-semibold text-clinical-fg">{title}</Text>
      <Text className="mt-1 text-sm text-clinical-muted">{description}</Text>
    </Pressable>
  );
}

export default function Records() {
  const [facts, setFacts] = useState<AllFacts | null>(null);
  const [mode, setMode] = useState<RecordMode | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const db = await openDb();
      const f = await getAllFacts(db, PATIENT_ID);
      setFacts(f);
    })();
  }, []);

  if (!facts) {
    return (
      <View className="flex-1 items-center justify-center bg-clinical-surface">
        <Text className="text-sm text-clinical-muted">Loading...</Text>
      </View>
    );
  }

  const totalRecords =
    facts.encounters.length +
    facts.labResults.length +
    facts.medications.length +
    facts.notes.length;

  return (
    <ScrollView className="flex-1 bg-clinical-surface" showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View className="px-5 pb-3 pt-14">
        <Text className="text-2xl font-bold text-clinical-fg">Record Memory</Text>
        <Text className="mt-1 text-sm text-clinical-muted">
          Add new medical memories to your timeline
        </Text>
      </View>

      {/* Stats Row */}
      <View className="mx-4 flex-row gap-3">
        <View className="flex-1 rounded-xl border border-clinical-outline-var bg-clinical-card p-3">
          <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
            TOTAL RECORDS
          </Text>
          <Text className="mt-1 text-2xl font-bold text-clinical-fg">{totalRecords}</Text>
        </View>
        <View className="flex-1 rounded-xl border border-clinical-outline-var bg-clinical-card p-3">
          <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
            LAST UPDATED
          </Text>
          <Text className="mt-1 text-2xl font-bold text-clinical-fg">
            {facts.encounters[0]?.date?.slice(5) ?? "—"}
          </Text>
        </View>
      </View>

      {/* Record Mode Selection */}
      <View className="mx-4 mt-6">
        <Text className="mb-3 text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
          CHOOSE RECORDING METHOD
        </Text>

        <View className="gap-3">
          <RecordOptionCard
            icon="🩺"
            title="Conversation with Doctor"
            description="Record clinical interactions. MedOS will transcribe, extract medical entities, and link to your timeline."
            selected={mode === "conversation"}
            onPress={() => setMode("conversation")}
          />

          <RecordOptionCard
            icon="📝"
            title="Record Happenings"
            description="Log symptoms, observations, or daily notes. Track progress between clinical visits."
            selected={mode === "happenings"}
            onPress={() => setMode("happenings")}
            badge="Selected"
          />

          <RecordOptionCard
            icon="📷"
            title="Capture with Gemma"
            description="Use your camera to capture pain points. Gemma analyzes on-device for privacy."
            selected={mode === "camera"}
            onPress={() => setMode("camera")}
          />
        </View>
      </View>

      {/* Privacy Notice */}
      <View className="mx-4 mt-6 flex-row items-start gap-3 rounded-xl border border-clinical-outline-var bg-clinical-surface-low p-4">
        <Text className="text-base">🔒</Text>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-clinical-fg">On-Device Privacy</Text>
          <Text className="mt-0.5 text-xs text-clinical-muted">
            Gemma processes data locally on your device. No medical data leaves your phone
            unless you explicitly share it.
          </Text>
        </View>
      </View>

      {/* Action Button */}
      <View className="mx-4 mb-8 mt-6">
        <Pressable
          onPress={() => {
            if (mode === "conversation") {
              router.push("/live-visit");
            }
          }}
          className={`items-center rounded-xl py-4 ${
            mode ? "bg-clinical-primary" : "bg-clinical-surface-mid"
          }`}
          disabled={!mode}
        >
          <Text
            className={`text-base font-bold ${
              mode ? "text-white" : "text-clinical-muted"
            }`}
          >
            {mode === "conversation"
              ? "Start Recording"
              : mode === "happenings"
                ? "Begin Logging"
                : mode === "camera"
                  ? "Open Camera"
                  : "Select a Method"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
