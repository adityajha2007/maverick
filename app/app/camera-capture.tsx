import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";

import { BACKEND_URL } from "../src/config";
import { openDb } from "../src/services/store/db";
import { getAllFacts, saveMedication, saveNote } from "../src/services/store/repos";
import { factsToCompactJson } from "../src/services/chat/buildContext";

type CaptureMode = "prescription" | "pain";

interface ParsedMed {
  drug: string;
  dose: string;
  frequency: string;
  duration?: string;
  timing?: string;
}

interface Message {
  id: string;
  kind: "info" | "rx" | "saved" | "error" | "analysis";
  text: string;
  meds?: ParsedMed[];
}

const PATIENT_ID = 1;

export default function CameraCapture() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<CaptureMode>((params.mode as CaptureMode) || "prescription");
  const [messages, setMessages] = useState<Message[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const scrollRef = useRef<ScrollView>(null);
  const msgIdRef = useRef(0);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  const addMessage = useCallback((msg: Omit<Message, "id">) => {
    const entry: Message = { ...msg, id: String(++msgIdRef.current) };
    setMessages((prev) => [...prev, entry]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  async function captureAndAnalyze() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });

      if (!photo?.base64) {
        addMessage({ kind: "error", text: "Failed to capture photo" });
        setCapturing(false);
        return;
      }

      addMessage({ kind: "info", text: "Analyzing image with Gemini..." });

      const endpoint =
        mode === "prescription"
          ? `${BACKEND_URL}/parse-prescription`
          : `${BACKEND_URL}/analyze-image`;

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: photo.base64 }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        addMessage({ kind: "error", text: `Analysis failed: ${errText}` });
        setCapturing(false);
        return;
      }

      const data = await resp.json();

      if (mode === "prescription" && data.medications?.length > 0) {
        addMessage({
          kind: "rx",
          text: `Found ${data.medications.length} medication(s)`,
          meds: data.medications,
        });

        setSaving(true);
        const db = await openDb();
        const medNames: string[] = [];
        for (const med of data.medications) {
          await saveMedication(db, {
            patientId: PATIENT_ID,
            name: med.drug,
            dose: med.dose,
            frequency: med.frequency,
            timing: med.timing,
            duration: med.duration,
          });
          medNames.push(`${med.drug} ${med.dose}`);
        }

        const summary = `Prescription scanned: ${medNames.join(", ")}`;
        db.executeSync(
          "INSERT INTO encounters (patient_id, date, kind, summary, provider, created_at) VALUES (?, date('now'), 'Prescription Scan', ?, ?, datetime('now'))",
          [PATIENT_ID, summary, data.provider ?? null]
        );

        if (data.notes) {
          await saveNote(db, PATIENT_ID, `Prescription: ${data.notes}`);
        }
        setSaving(false);

        addMessage({
          kind: "saved",
          text: `${data.medications.length} medication(s) saved to memory & timeline`,
        });
      } else if (mode === "pain") {
        const analysis = data.analysis || "No analysis available";
        addMessage({ kind: "analysis", text: analysis });

        const db = await openDb();
        await saveNote(db, PATIENT_ID, `Pain point observation: ${analysis}`);
        db.executeSync(
          "INSERT INTO encounters (patient_id, date, kind, summary, created_at) VALUES (?, date('now'), 'Pain Observation', ?, datetime('now'))",
          [PATIENT_ID, analysis.slice(0, 200)]
        );
        addMessage({ kind: "saved", text: "Observation saved to memory & timeline" });
      } else {
        addMessage({
          kind: "info",
          text: data.notes || "No prescriptions detected in this image",
        });
      }
    } catch (e: any) {
      addMessage({ kind: "error", text: e.message ?? "Analysis failed" });
    }

    setCapturing(false);
  }

  if (!permission?.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-clinical-surface px-6">
        <Text className="text-3xl">📷</Text>
        <Text className="mt-4 text-center text-base font-semibold text-clinical-fg">
          Camera Permission Required
        </Text>
        <Text className="mt-2 text-center text-sm text-clinical-muted">
          healthOS needs camera access to capture prescriptions and pain points.
        </Text>
        <Pressable
          onPress={requestPermission}
          className="mt-6 rounded-xl bg-clinical-primary px-8 py-3"
        >
          <Text className="font-bold text-white">Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-clinical-surface">
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-clinical-outline-var bg-clinical-card px-4 pb-3 pt-14">
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-clinical-surface-mid"
        >
          <Text className="text-base text-clinical-primary">←</Text>
        </Pressable>
        <Text className="flex-1 text-lg font-bold text-clinical-fg">
          {mode === "prescription" ? "Scan Prescription" : "Capture Pain Point"}
        </Text>
      </View>

      {/* Mode Toggle */}
      <View className="mx-4 mt-3 flex-row gap-2">
        <Pressable
          onPress={() => setMode("prescription")}
          className={`flex-1 items-center rounded-lg py-2.5 ${
            mode === "prescription"
              ? "bg-clinical-primary"
              : "border border-clinical-outline-var bg-clinical-card"
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              mode === "prescription" ? "text-white" : "text-clinical-fg"
            }`}
          >
            Prescription
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("pain")}
          className={`flex-1 items-center rounded-lg py-2.5 ${
            mode === "pain"
              ? "bg-clinical-secondary"
              : "border border-clinical-outline-var bg-clinical-card"
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              mode === "pain" ? "text-white" : "text-clinical-fg"
            }`}
          >
            Pain Point
          </Text>
        </Pressable>
      </View>

      {/* Camera Preview */}
      <View className="mx-4 mt-3 overflow-hidden rounded-xl" style={{ height: 280 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View className="absolute bottom-2 left-2 right-2 rounded-lg bg-black/60 px-3 py-2">
          <Text className="text-center text-xs font-semibold text-white">
            {mode === "prescription"
              ? "Point at a prescription or medication label"
              : "Point at the area of pain or injury"}
          </Text>
        </View>
      </View>

      {/* Capture Button */}
      <View className="mx-4 mt-3">
        <Pressable
          onPress={captureAndAnalyze}
          disabled={capturing}
          className={`items-center rounded-xl py-4 ${
            capturing ? "bg-clinical-surface-mid" : "bg-clinical-primary"
          }`}
        >
          <Text
            className={`text-base font-bold ${
              capturing ? "text-clinical-muted" : "text-white"
            }`}
          >
            {capturing
              ? "Analyzing..."
              : mode === "prescription"
                ? "Capture & Parse Prescription"
                : "Capture & Analyze"}
          </Text>
          <Text className="text-xs text-blue-200">
            Gemini 3.5 Flash — saves to medical memory
          </Text>
        </Pressable>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        className="mx-4 mt-3 flex-1 rounded-xl border border-clinical-outline-var bg-clinical-card"
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && (
          <View className="items-center py-8">
            <Text className="text-2xl">{mode === "prescription" ? "💊" : "🩹"}</Text>
            <Text className="mt-3 text-center text-sm text-clinical-muted">
              {mode === "prescription"
                ? "Capture a prescription to parse medications and save to your memory"
                : "Capture a photo of your pain area for AI analysis"}
            </Text>
          </View>
        )}

        {messages.map((msg) => (
          <View
            key={msg.id}
            className={`mb-2 rounded-lg border px-3 py-2 ${
              msg.kind === "rx"
                ? "border-clinical-secondary/20 bg-clinical-secondary/5"
                : msg.kind === "saved"
                  ? "border-clinical-secondary/30 bg-clinical-secondary/10"
                  : msg.kind === "error"
                    ? "border-clinical-error/20 bg-clinical-error-bg"
                    : msg.kind === "analysis"
                      ? "border-clinical-primary/20 bg-clinical-primary/5"
                      : "border-clinical-outline-var bg-clinical-surface-low"
            }`}
          >
            {msg.kind === "rx" && msg.meds ? (
              <View>
                <Text className="mb-1 text-[10px] font-bold uppercase tracking-widest text-clinical-secondary">
                  PRESCRIPTIONS DETECTED
                </Text>
                {msg.meds.map((med, i) => (
                  <View key={i} className="mb-1 rounded bg-white/50 px-2 py-1.5">
                    <Text className="text-sm font-semibold text-clinical-fg">
                      {med.drug} — {med.dose}
                    </Text>
                    <Text className="text-xs text-clinical-muted">
                      {med.frequency}
                      {med.timing ? ` · ${med.timing}` : ""}
                      {med.duration ? ` · ${med.duration}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            ) : msg.kind === "saved" ? (
              <View className="flex-row items-center gap-2">
                <Text className="text-base">✓</Text>
                <Text className="text-sm font-semibold text-clinical-secondary">
                  {msg.text}
                </Text>
              </View>
            ) : msg.kind === "analysis" ? (
              <View>
                <Text className="mb-1 text-[10px] font-bold uppercase tracking-widest text-clinical-primary">
                  AI ANALYSIS
                </Text>
                <Text className="text-sm text-clinical-fg">{msg.text}</Text>
              </View>
            ) : (
              <Text
                className={`text-sm ${
                  msg.kind === "error"
                    ? "text-clinical-error"
                    : "text-clinical-fg"
                }`}
              >
                {msg.text}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
