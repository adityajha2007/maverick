import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { openDb } from "../src/services/store/db";
import { getAllFacts } from "../src/services/store/repos";
import { factsToCompactJson } from "../src/services/chat/buildContext";
import { BACKEND_URL } from "../src/config";

type SessionState = "idle" | "connecting" | "live" | "ended";
type TranscriptEntry = {
  id: number;
  kind: "raw" | "translated" | "alert";
  text: string;
  ts: number;
};

const LANGUAGES = [
  { code: "hi-IN", label: "Hindi" },
  { code: "te-IN", label: "Telugu" },
  { code: "ta-IN", label: "Tamil" },
  { code: "kn-IN", label: "Kannada" },
  { code: "en-US", label: "English" },
];

export default function RecordVisit() {
  const router = useRouter();
  const [state, setState] = useState<SessionState>("idle");
  const [sourceLang, setSourceLang] = useState("hi-IN");
  const [targetLang] = useState("en-US");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [patientContext, setPatientContext] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const entryId = useRef(0);

  useEffect(() => {
    (async () => {
      const db = await openDb();
      const facts = await getAllFacts(db, 1);
      setPatientContext(factsToCompactJson(facts));
    })();
  }, []);

  function addEntry(kind: TranscriptEntry["kind"], text: string) {
    const entry: TranscriptEntry = { id: entryId.current++, kind, text, ts: Date.now() };
    setTranscript((t) => [...t, entry]);
    if (kind === "alert") {
      setAlerts((a) => [...a, text]);
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }

  async function startSession() {
    setState("connecting");

    const wsUrl = BACKEND_URL.replace(/^http/, "ws") + "/live-ws";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          sourceLang,
          targetLang,
          patientContext,
        }),
      );
      setState("live");
      addEntry("raw", "Session started — listening...");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.kind === "translated") {
          addEntry("translated", msg.text);
        } else if (msg.kind === "raw") {
          addEntry("raw", msg.text);
        } else if (msg.kind === "alert") {
          addEntry("alert", msg.text);
        } else if (msg.kind === "error") {
          addEntry("alert", `Error: ${msg.text}`);
        }
      } catch {}
    };

    ws.onerror = () => {
      setState("idle");
      Alert.alert(
        "Connection failed",
        "Could not connect to the backend. Make sure the server is running.",
      );
    };

    ws.onclose = () => {
      if (state === "live") {
        setState("ended");
        addEntry("raw", "Session ended.");
      }
    };
  }

  function stopSession() {
    wsRef.current?.close();
    wsRef.current = null;
    setState("ended");
    addEntry("raw", "Session ended by user.");
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
        <Text className="flex-1 text-lg font-bold text-clinical-fg">Live Visit</Text>
        {state === "live" && (
          <View className="flex-row items-center gap-1.5 rounded-full bg-clinical-error/10 px-3 py-1">
            <View className="h-2 w-2 rounded-full bg-clinical-error" />
            <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-error">
              LIVE
            </Text>
          </View>
        )}
      </View>

      {/* Language Selector */}
      {state === "idle" && (
        <View className="mx-4 mt-4 rounded-xl border border-clinical-outline-var bg-clinical-card p-4">
          <Text className="mb-3 text-[11px] font-bold uppercase tracking-widest text-clinical-muted">
            PATIENT SPEAKS
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {LANGUAGES.filter((l) => l.code !== targetLang).map((lang) => (
              <Pressable
                key={lang.code}
                onPress={() => setSourceLang(lang.code)}
                className={`rounded-lg px-4 py-2.5 ${
                  sourceLang === lang.code
                    ? "bg-clinical-primary"
                    : "border border-clinical-outline-var bg-clinical-surface-low"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    sourceLang === lang.code ? "text-white" : "text-clinical-fg"
                  }`}
                >
                  {lang.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="mt-3 text-xs text-clinical-muted">
            Translating to English for the doctor in real-time using Gemini Live API.
          </Text>
        </View>
      )}

      {/* Alerts Banner */}
      {alerts.length > 0 && (
        <View className="mx-4 mt-3 rounded-xl border border-clinical-error/20 bg-clinical-error-bg p-3">
          <Text className="mb-1 text-[11px] font-bold uppercase tracking-widest text-clinical-error">
            REAL-TIME ALERTS
          </Text>
          {alerts.slice(-3).map((a, i) => (
            <Text key={i} className="text-sm text-clinical-fg" numberOfLines={2}>
              {a}
            </Text>
          ))}
        </View>
      )}

      {/* Transcript */}
      <ScrollView
        ref={scrollRef}
        className="mx-4 mt-3 flex-1 rounded-xl border border-clinical-outline-var bg-clinical-card"
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {transcript.length === 0 && state === "idle" && (
          <View className="items-center py-12">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-clinical-primary/10">
              <Text className="text-3xl">🎙</Text>
            </View>
            <Text className="mt-4 text-center text-sm text-clinical-muted">
              Start a live session to record and translate a doctor visit in real-time.
            </Text>
            {patientContext && (
              <View className="mt-3 rounded-lg bg-clinical-surface-low px-3 py-2">
                <Text className="text-xs text-clinical-secondary">
                  ✓ Patient context loaded — AI will flag drug interactions and relevant history
                </Text>
              </View>
            )}
          </View>
        )}

        {transcript.map((entry) => (
          <View
            key={entry.id}
            className={`mb-2 rounded-lg px-3 py-2 ${
              entry.kind === "translated"
                ? "ml-8 border border-clinical-primary/20 bg-clinical-primary/5"
                : entry.kind === "alert"
                  ? "border border-clinical-error/20 bg-clinical-error-bg"
                  : "mr-8 bg-clinical-surface-low"
            }`}
          >
            <Text className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-clinical-muted">
              {entry.kind === "translated"
                ? "Translated"
                : entry.kind === "alert"
                  ? "⚠ Alert"
                  : "Heard"}
            </Text>
            <Text
              className={`text-sm ${
                entry.kind === "alert" ? "font-semibold text-clinical-error" : "text-clinical-fg"
              }`}
            >
              {entry.text}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Control Button */}
      <View className="px-4 pb-8 pt-3">
        {state === "idle" && (
          <Pressable
            onPress={startSession}
            className="items-center rounded-xl bg-clinical-primary py-4"
          >
            <Text className="text-base font-bold text-white">Start Live Session</Text>
            <Text className="text-xs text-blue-200">
              Gemini Live Translate · {LANGUAGES.find((l) => l.code === sourceLang)?.label} → English
            </Text>
          </Pressable>
        )}

        {state === "connecting" && (
          <View className="items-center rounded-xl bg-clinical-surface-mid py-4">
            <Text className="text-base font-bold text-clinical-muted">Connecting...</Text>
          </View>
        )}

        {state === "live" && (
          <Pressable
            onPress={stopSession}
            className="items-center rounded-xl bg-clinical-error py-4"
          >
            <View className="flex-row items-center gap-2">
              <View className="h-3 w-3 rounded-full bg-white" />
              <Text className="text-base font-bold text-white">Stop Recording</Text>
            </View>
            <Text className="text-xs text-red-200">Session active — translating live</Text>
          </Pressable>
        )}

        {state === "ended" && (
          <View className="gap-2">
            <Pressable
              onPress={() => router.push("/gemma-processing")}
              className="items-center rounded-xl bg-clinical-processing py-4"
            >
              <Text className="text-base font-bold text-white">Process with Gemma</Text>
              <Text className="text-xs text-purple-200">Extract & update medical memory</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setTranscript([]);
                setAlerts([]);
                setState("idle");
              }}
              className="items-center rounded-xl border border-clinical-outline-var py-3"
            >
              <Text className="text-sm font-semibold text-clinical-fg">New Session</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
