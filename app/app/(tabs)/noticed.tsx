import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { Flag } from "../../src/types";
import { openDb } from "../../src/services/store/db";
import { getOpenFlags, updateFlagStatus } from "../../src/services/store/repos";
import { FlagCard } from "../../src/ui/FlagCard";

const PATIENT_ID = 1;

const CONFIDENCE_RANK: Record<Flag["confidence"], number> = {
  defer: 0,
  uncertain: 1,
  grounded: 2,
};

function sortFlags(flags: Flag[]): Flag[] {
  return [...flags].sort((a, b) => {
    const bucket = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
    if (bucket !== 0) return bucket;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export default function Noticed() {
  const [flags, setFlags] = useState<Flag[] | null>(null);

  const reload = useCallback(async () => {
    const db = await openDb();
    setFlags(sortFlags(await getOpenFlags(db, PATIENT_ID)));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleAck(id: number) {
    const db = await openDb();
    await updateFlagStatus(db, id, "ack");
    await reload();
  }

  async function handleDismiss(id: number) {
    const db = await openDb();
    await updateFlagStatus(db, id, "dismissed");
    await reload();
  }

  if (flags === null) {
    return (
      <View className="flex-1 items-center justify-center bg-clinical-surface">
        <Text className="text-sm text-clinical-muted">Loading observations...</Text>
      </View>
    );
  }

  if (flags.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-clinical-surface px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-clinical-secondary/10">
          <Text className="text-2xl">✓</Text>
        </View>
        <Text className="mt-4 text-center text-base font-semibold text-clinical-fg">
          All clear
        </Text>
        <Text className="mt-1 text-center text-sm text-clinical-muted">
          The agents are watching — nothing to flag right now.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-clinical-surface"
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="mx-4 mb-3 flex-row items-center justify-between">
        <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
          {flags.length} observation{flags.length !== 1 ? "s" : ""}
        </Text>
      </View>
      {flags.map((f) => (
        <FlagCard key={f.id} flag={f} onAck={handleAck} onDismiss={handleDismiss} />
      ))}
    </ScrollView>
  );
}
