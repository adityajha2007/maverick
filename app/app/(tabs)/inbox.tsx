import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import type { Deferral } from "../../src/types";
import { openDb } from "../../src/services/store/db";
import { getOpenDeferrals, resolveDeferral } from "../../src/services/store/repos";

const PATIENT_ID = 1;

export default function Inbox() {
  const [deferrals, setDeferrals] = useState<Deferral[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});

  useEffect(() => {
    (async () => {
      const db = await openDb();
      setDeferrals(await getOpenDeferrals(db, PATIENT_ID));
    })();
  }, []);

  function setDraft(id: number, value: string) {
    setDrafts((d) => ({ ...d, [id]: value }));
  }

  async function submit(id: number) {
    const answer = (drafts[id] ?? "").trim();
    if (!answer) return;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const db = await openDb();
      await resolveDeferral(db, id, answer);
      setDeferrals((cur) => (cur ?? []).filter((d) => d.id !== id));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  if (deferrals === null) {
    return (
      <View className="flex-1 items-center justify-center bg-clinical-surface">
        <Text className="text-sm text-clinical-muted">Loading inbox...</Text>
      </View>
    );
  }

  if (deferrals.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-clinical-surface px-8">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-clinical-primary/10">
          <Text className="text-2xl">✓</Text>
        </View>
        <Text className="mt-4 text-center text-base font-semibold text-clinical-fg">
          All caught up
        </Text>
        <Text className="mt-1 text-center text-sm text-clinical-muted">
          The agents don't need any clarification right now.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-clinical-surface"
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-4 mb-3">
          <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
            AGENTS NEED YOUR INPUT
          </Text>
        </View>
        {deferrals.map((d) => (
          <View key={d.id} className="mx-4 mb-3 rounded-xl border border-clinical-outline-var bg-clinical-card p-4">
            <View className="mb-1 flex-row items-center gap-2">
              <View className="h-6 w-6 items-center justify-center rounded-full bg-clinical-processing/10">
                <Text className="text-xs">?</Text>
              </View>
              <Text className="text-xs font-semibold uppercase tracking-wider text-clinical-processing">
                {d.kind.replace(/_/g, " ")}
              </Text>
            </View>
            <Text className="text-base font-semibold text-clinical-fg">{d.question}</Text>
            {d.context && (
              <Text className="mt-1 text-sm text-clinical-muted">{d.context}</Text>
            )}
            <TextInput
              value={drafts[d.id] ?? ""}
              onChangeText={(v) => setDraft(d.id, v)}
              placeholder="Type your answer..."
              placeholderTextColor="#737688"
              multiline
              className="mt-3 min-h-[60px] rounded-lg border border-clinical-outline-var bg-clinical-surface p-3 text-sm text-clinical-fg"
            />
            <View className="mt-3 flex-row justify-end">
              <Pressable
                onPress={() => submit(d.id)}
                disabled={busy[d.id]}
                className={`rounded-lg px-5 py-2.5 ${busy[d.id] ? "bg-clinical-surface-mid" : "bg-clinical-primary"}`}
              >
                <Text className="text-sm font-semibold text-white">
                  {busy[d.id] ? "Saving..." : "Submit"}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
