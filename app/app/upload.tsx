import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";

import { openDb } from "../src/services/store/db";
import { ingestLabPdf } from "../src/services/ingestion/ingestLabPdf";

const PATIENT_ID = 1;

export default function Upload() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function pick() {
    const res = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    setBusy(true);
    try {
      const db = await openDb();
      const { labsInserted } = await ingestLabPdf(db, PATIENT_ID, asset.uri, asset.name);
      Alert.alert("Ingested", `${labsInserted} lab values added to your memory.`);
      router.push("/(tabs)");
    } catch (e: any) {
      Alert.alert("Couldn't read this PDF", e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 items-center justify-center bg-clinical-surface p-6">
      <View className="h-20 w-20 items-center justify-center rounded-2xl bg-clinical-primary/10">
        <Text className="text-4xl">📄</Text>
      </View>
      <Text className="mt-6 text-center text-xl font-bold text-clinical-fg">
        Upload Lab Report
      </Text>
      <Text className="mt-2 text-center text-sm text-clinical-muted">
        Pick a PDF and the AI agents will extract lab values into your health memory.
      </Text>
      <Pressable
        onPress={pick}
        disabled={busy}
        className={`mt-6 w-full items-center rounded-xl py-4 ${
          busy ? "bg-clinical-surface-mid" : "bg-clinical-primary"
        }`}
      >
        <Text
          className={`text-base font-bold ${
            busy ? "text-clinical-muted" : "text-white"
          }`}
        >
          {busy ? "Reading..." : "Pick a Lab PDF"}
        </Text>
      </Pressable>
      <View className="mt-6 flex-row items-start gap-3 rounded-xl border border-clinical-outline-var bg-clinical-surface-low p-4">
        <Text className="text-base">🔒</Text>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-clinical-fg">On-Device Privacy</Text>
          <Text className="mt-0.5 text-xs text-clinical-muted">
            Processed locally. Your file never leaves the phone.
          </Text>
        </View>
      </View>
    </View>
  );
}
