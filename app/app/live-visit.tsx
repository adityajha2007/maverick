import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { openDb } from "../src/services/store/db";
import { getAllFacts, saveVisitTranscript } from "../src/services/store/repos";
import { factsToCompactJson } from "../src/services/chat/buildContext";
import { LiveSession } from "../src/services/live/LiveSession";
import { AudioCapture } from "../src/services/live/AudioCapture";
import type { TranscriptEntry } from "../src/services/live/LiveTranscript";
import { createEntry } from "../src/services/live/LiveTranscript";

type SessionState = "idle" | "connecting" | "live" | "ended";

const LANGUAGES = [
  { code: "hi-IN", label: "Hindi", flag: "🇮🇳" },
  { code: "te-IN", label: "Telugu", flag: "🇮🇳" },
  { code: "ta-IN", label: "Tamil", flag: "🇮🇳" },
  { code: "kn-IN", label: "Kannada", flag: "🇮🇳" },
  { code: "en-US", label: "English", flag: "🇺🇸" },
];

const PATIENT_ID = 1;

export default function LiveVisit() {
  const router = useRouter();
  const [state, setState] = useState<SessionState>("idle");
  const [sourceLang, setSourceLang] = useState("hi-IN");
  const [targetLang] = useState("en-US");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [patientContext, setPatientContext] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);

  const sessionRef = useRef<LiveSession | null>(null);
  const audioRef = useRef<AudioCapture | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rawAccum = useRef("");
  const transAccum = useRef("");

  useEffect(() => {
    (async () => {
      const db = await openDb();
      const facts = await getAllFacts(db, PATIENT_ID);
      setPatientContext(factsToCompactJson(facts));
    })();
    return () => {
      sessionRef.current?.close();
      audioRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const addEntry = useCallback((kind: TranscriptEntry["kind"], text: string) => {
    const entry = createEntry(kind, text);
    setTranscript((t) => [...t, entry]);
    if (kind === "alert") setAlerts((a) => [...a, text]);
    if (kind === "raw") rawAccum.current += (rawAccum.current ? " " : "") + text;
    if (kind === "translated") transAccum.current += (transAccum.current ? " " : "") + text;
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  async function startSession() {
    setState("connecting");
    rawAccum.current = "";
    transAccum.current = "";

    try {
      const session = await LiveSession.connect({
        sourceLang,
        targetLang,
        patientContext,
      });
      sessionRef.current = session;

      session.onChunk((chunk) => {
        addEntry(chunk.kind, chunk.text);
      });

      const audio = new AudioCapture();
      audioRef.current = audio;
      await audio.start((base64) => {
        session.sendAudioBase64(base64);
      });

      setState("live");
      if (!audio.available) {
        addEntry("alert", "Microphone not available (emulator). WebSocket connected — waiting for backend messages.");
      } else {
        addEntry("raw", "Session started — listening...");
      }

      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    } catch (e: any) {
      setState("idle");
      Alert.alert("Connection failed", e.message ?? "Could not connect to backend.");
    }
  }

  async function stopSession() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    await audioRef.current?.stop();
    audioRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;

    setState("ended");
    addEntry("raw", "Session ended by user.");

    if (transAccum.current || rawAccum.current) {
      try {
        const db = await openDb();
        await saveVisitTranscript(db, {
          patientId: PATIENT_ID,
          transcript: { raw: rawAccum.current, translated: transAccum.current },
          sourceLang,
          targetLang,
        });
      } catch {}
    }
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
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
        <View className="flex-1">
          <Text className="text-lg font-bold text-clinical-fg">Live Visit</Text>
          {state === "live" && (
            <View className="mt-0.5 flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full bg-clinical-error" />
              <Text className="text-xs font-semibold text-clinical-error">
                REC {formatTime(elapsed)}
              </Text>
            </View>
          )}
        </View>
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
                  {lang.flag} {lang.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mt-4 flex-row items-center gap-2 rounded-lg bg-clinical-primary/5 px-3 py-2">
            <Text className="text-xs text-clinical-primary">
              Powered by Gemini Live Translate API — real-time bidirectional translation
            </Text>
          </View>
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
            <Text className="mt-4 text-center text-base font-semibold text-clinical-fg">
              Record a doctor visit
            </Text>
            <Text className="mt-2 text-center text-sm text-clinical-muted">
              Real-time translation and drug interaction alerts during doctor-patient conversations.
            </Text>
            {patientContext && (
              <View className="mt-4 rounded-lg bg-clinical-surface-low px-3 py-2">
                <Text className="text-xs text-clinical-secondary">
                  ✓ Patient context loaded — AI will flag drug interactions
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
                ? "English (Translated)"
                : entry.kind === "alert"
                  ? "⚠ Alert"
                  : "Heard (Original)"}
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

        {state === "live" && (
          <View className="mt-2 items-center py-4">
            <View className="flex-row items-center gap-2">
              <View className="h-2 w-2 rounded-full bg-clinical-primary" />
              <Text className="text-xs text-clinical-muted">Listening...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Control Buttons */}
      <View className="px-4 pb-8 pt-3">
        {state === "idle" && (
          <Pressable
            onPress={startSession}
            className="items-center rounded-xl bg-clinical-primary py-4"
          >
            <Text className="text-base font-bold text-white">Start Live Session</Text>
            <Text className="text-xs text-blue-200">
              {LANGUAGES.find((l) => l.code === sourceLang)?.label} → English · Gemini Live
            </Text>
          </Pressable>
        )}

        {state === "connecting" && (
          <View className="items-center rounded-xl bg-clinical-surface-mid py-4">
            <Text className="text-base font-bold text-clinical-muted">Connecting...</Text>
            <Text className="text-xs text-clinical-muted">Setting up Gemini Live session</Text>
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
            <Text className="text-xs text-red-200">
              Session active — translating live · {formatTime(elapsed)}
            </Text>
          </Pressable>
        )}

        {state === "ended" && (
          <View className="gap-2">
            <View className="rounded-xl bg-clinical-secondary/10 px-4 py-3">
              <Text className="text-center text-sm font-semibold text-clinical-secondary">
                ✓ Visit saved to patient memory
              </Text>
            </View>
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
                setElapsed(0);
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
