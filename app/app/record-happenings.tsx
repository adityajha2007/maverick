import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { openDb } from "../src/services/store/db";
import { saveNote } from "../src/services/store/repos";

const PATIENT_ID = 1;

const QUICK_TAGS = [
  { label: "Pain", icon: "🩹" },
  { label: "Dizziness", icon: "😵" },
  { label: "Fatigue", icon: "😴" },
  { label: "Nausea", icon: "🤢" },
  { label: "Headache", icon: "🤕" },
  { label: "Swelling", icon: "🦶" },
  { label: "Stiffness", icon: "🦴" },
  { label: "Mood", icon: "😟" },
];

const SEVERITY = ["Mild", "Moderate", "Severe"];

export default function RecordHappenings() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [severity, setSeverity] = useState("Moderate");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleTag(label: string) {
    setTags((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]
    );
  }

  async function save() {
    if (!text.trim() && tags.length === 0) {
      Alert.alert("Empty", "Add a note or select symptoms to log.");
      return;
    }

    setSaving(true);
    try {
      const db = await openDb();
      const parts: string[] = [];
      if (tags.length > 0) parts.push(`Symptoms: ${tags.join(", ")}`);
      parts.push(`Severity: ${severity}`);
      if (text.trim()) parts.push(text.trim());
      const fullNote = parts.join(" | ");

      await saveNote(db, PATIENT_ID, fullNote);

      db.executeSync(
        "INSERT INTO encounters (patient_id, date, kind, summary, created_at) VALUES (?, date('now'), 'Self-Report', ?, datetime('now'))",
        [PATIENT_ID, fullNote.slice(0, 200)]
      );

      setSaved(true);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not save.");
    }
    setSaving(false);
  }

  if (saved) {
    return (
      <View className="flex-1 items-center justify-center bg-clinical-surface px-6">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-clinical-secondary/10">
          <Text className="text-3xl">✓</Text>
        </View>
        <Text className="mt-4 text-lg font-bold text-clinical-fg">Saved to Memory</Text>
        <Text className="mt-2 text-center text-sm text-clinical-muted">
          Your observation has been added to your timeline.
        </Text>
        <View className="mt-6 w-full gap-2">
          <Pressable
            onPress={() => {
              setText("");
              setTags([]);
              setSeverity("Moderate");
              setSaved(false);
            }}
            className="items-center rounded-xl bg-clinical-primary py-3"
          >
            <Text className="font-bold text-white">Log Another</Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            className="items-center rounded-xl border border-clinical-outline-var py-3"
          >
            <Text className="font-semibold text-clinical-fg">Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-clinical-surface" showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-clinical-outline-var bg-clinical-card px-4 pb-3 pt-14">
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-clinical-surface-mid"
        >
          <Text className="text-base text-clinical-primary">←</Text>
        </Pressable>
        <Text className="text-lg font-bold text-clinical-fg">Record Happenings</Text>
      </View>

      {/* Quick Tags */}
      <View className="mx-4 mt-4">
        <Text className="mb-3 text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
          WHAT ARE YOU EXPERIENCING?
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {QUICK_TAGS.map((tag) => (
            <Pressable
              key={tag.label}
              onPress={() => toggleTag(tag.label)}
              className={`flex-row items-center gap-1.5 rounded-lg px-3.5 py-2.5 ${
                tags.includes(tag.label)
                  ? "bg-clinical-primary"
                  : "border border-clinical-outline-var bg-clinical-card"
              }`}
            >
              <Text className="text-sm">{tag.icon}</Text>
              <Text
                className={`text-sm font-semibold ${
                  tags.includes(tag.label) ? "text-white" : "text-clinical-fg"
                }`}
              >
                {tag.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Severity */}
      <View className="mx-4 mt-5">
        <Text className="mb-3 text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
          SEVERITY
        </Text>
        <View className="flex-row gap-2">
          {SEVERITY.map((s) => (
            <Pressable
              key={s}
              onPress={() => setSeverity(s)}
              className={`flex-1 items-center rounded-lg py-2.5 ${
                severity === s
                  ? s === "Severe"
                    ? "bg-clinical-error"
                    : s === "Moderate"
                      ? "bg-clinical-primary"
                      : "bg-clinical-secondary"
                  : "border border-clinical-outline-var bg-clinical-card"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  severity === s ? "text-white" : "text-clinical-fg"
                }`}
              >
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Notes */}
      <View className="mx-4 mt-5">
        <Text className="mb-3 text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
          ADDITIONAL NOTES
        </Text>
        <TextInput
          className="min-h-[120px] rounded-xl border border-clinical-outline-var bg-clinical-card px-4 py-3 text-sm text-clinical-fg"
          placeholder="Describe what you're experiencing..."
          placeholderTextColor="#94a3b8"
          multiline
          textAlignVertical="top"
          value={text}
          onChangeText={setText}
        />
      </View>

      {/* Save Button */}
      <View className="mx-4 mb-8 mt-6">
        <Pressable
          onPress={save}
          disabled={saving}
          className={`items-center rounded-xl py-4 ${
            saving ? "bg-clinical-surface-mid" : "bg-clinical-primary"
          }`}
        >
          <Text className={`text-base font-bold ${saving ? "text-clinical-muted" : "text-white"}`}>
            {saving ? "Saving..." : "Save to Memory"}
          </Text>
          <Text className="text-xs text-blue-200">Adds to your timeline</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
