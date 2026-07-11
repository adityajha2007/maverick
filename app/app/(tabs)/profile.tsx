import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { AllFacts } from "../../src/types";
import { openDb } from "../../src/services/store/db";
import { getAllFacts } from "../../src/services/store/repos";

const PATIENT_ID = 1;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-clinical-outline-var py-3">
      <Text className="text-sm text-clinical-muted">{label}</Text>
      <Text className="text-sm font-medium text-clinical-fg">{value}</Text>
    </View>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Pressable className="flex-row items-center gap-3 border-b border-clinical-outline-var py-3.5">
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-clinical-surface-mid">
        <Text className="text-base">{icon}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-medium text-clinical-fg">{title}</Text>
        <Text className="text-xs text-clinical-muted">{subtitle}</Text>
      </View>
      <Text className="text-sm text-clinical-muted">›</Text>
    </Pressable>
  );
}

export default function Profile() {
  const [facts, setFacts] = useState<AllFacts | null>(null);

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

  const p = facts.patient;
  const age = new Date().getFullYear() - parseInt(p.dob.slice(0, 4));
  const activeMeds = facts.medications.filter((m) => !m.endDate).length;
  const activeConditions = facts.conditions.filter((c) => c.status === "active").length;

  return (
    <ScrollView className="flex-1 bg-clinical-surface" showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View className="items-center px-5 pb-4 pt-16">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-clinical-primary">
          <Text className="text-3xl font-bold text-white">
            {p.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </Text>
        </View>
        <Text className="mt-3 text-2xl font-bold text-clinical-fg">{p.name}</Text>
        <Text className="mt-0.5 text-sm text-clinical-muted">
          {age} years · {p.sex}
        </Text>
      </View>

      {/* Quick Stats */}
      <View className="mx-4 flex-row gap-3">
        <View className="flex-1 items-center rounded-xl border border-clinical-outline-var bg-clinical-card py-3">
          <Text className="text-2xl font-bold text-clinical-primary">{activeConditions}</Text>
          <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
            Conditions
          </Text>
        </View>
        <View className="flex-1 items-center rounded-xl border border-clinical-outline-var bg-clinical-card py-3">
          <Text className="text-2xl font-bold text-clinical-primary">{activeMeds}</Text>
          <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
            Medications
          </Text>
        </View>
        <View className="flex-1 items-center rounded-xl border border-clinical-outline-var bg-clinical-card py-3">
          <Text className="text-2xl font-bold text-clinical-primary">
            {facts.encounters.length}
          </Text>
          <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
            Visits
          </Text>
        </View>
      </View>

      {/* Patient Info */}
      <View className="mx-4 mt-5 rounded-xl border border-clinical-outline-var bg-clinical-card p-4">
        <Text className="mb-1 text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
          PATIENT INFORMATION
        </Text>
        <InfoRow label="Full Name" value={p.name} />
        <InfoRow label="Date of Birth" value={p.dob} />
        <InfoRow label="Sex" value={p.sex} />
        <InfoRow label="Patient ID" value={`#${p.id}`} />
      </View>

      {/* Active Conditions */}
      <View className="mx-4 mt-4 rounded-xl border border-clinical-outline-var bg-clinical-card p-4">
        <Text className="mb-2 text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
          ACTIVE CONDITIONS
        </Text>
        {facts.conditions
          .filter((c) => c.status === "active")
          .map((c) => (
            <View key={c.id} className="flex-row items-center justify-between border-b border-clinical-outline-var py-2.5 last:border-b-0">
              <View className="flex-row items-center gap-2">
                <View className="h-2 w-2 rounded-full bg-clinical-error" />
                <Text className="text-sm font-medium text-clinical-fg">{c.name}</Text>
              </View>
              <Text className="text-xs text-clinical-muted">Since {c.diagnosedAt}</Text>
            </View>
          ))}
      </View>

      {/* Settings */}
      <View className="mx-4 mt-5 rounded-xl border border-clinical-outline-var bg-clinical-card p-4">
        <Text className="mb-1 text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
          SETTINGS
        </Text>
        <SettingRow icon="🔔" title="Notifications" subtitle="Medication reminders, agent alerts" />
        <SettingRow icon="🔒" title="Privacy" subtitle="Data sharing, on-device processing" />
        <SettingRow icon="📤" title="Export Data" subtitle="Download medical records" />
        <SettingRow icon="🤖" title="AI Preferences" subtitle="Gemma model, processing settings" />
      </View>

      {/* Version */}
      <View className="items-center py-8">
        <Text className="text-xs text-clinical-muted">MedOS v0.2 · Hackathon Build</Text>
      </View>
    </ScrollView>
  );
}
