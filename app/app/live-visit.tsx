import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  useAudioStream,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";

import { openDb } from "../src/services/store/db";
import { getAllFacts, saveVisitTranscript, saveMedication, saveNote, saveReminder } from "../src/services/store/repos";
import { factsToCompactJson } from "../src/services/chat/buildContext";
import { BACKEND_URL } from "../src/config";
import { LiveSession } from "../src/services/live/LiveSession";
import type { TranscriptEntry } from "../src/services/live/LiveTranscript";
import { createEntry } from "../src/services/live/LiveTranscript";

let Speech: any = null;
try { Speech = require("expo-speech"); } catch {}

type SessionState = "idle" | "connecting" | "live" | "analyzing" | "review" | "saved";

const LANGUAGES = [
  { code: "hi-IN", label: "Hindi", flag: "\u{1f1ee}\u{1f1f3}" },
  { code: "te-IN", label: "Telugu", flag: "\u{1f1ee}\u{1f1f3}" },
  { code: "ta-IN", label: "Tamil", flag: "\u{1f1ee}\u{1f1f3}" },
  { code: "kn-IN", label: "Kannada", flag: "\u{1f1ee}\u{1f1f3}" },
  { code: "en-US", label: "English", flag: "\u{1f1fa}\u{1f1f8}" },
];

const PATIENT_ID = 1;

interface ActionItem {
  title: string;
  description: string;
  kind: string;
  priority: string;
  due_date?: string;
}

interface MedMention {
  drug: string;
  dose?: string;
  frequency?: string;
  timing?: string;
}

export default function LiveVisit() {
  const router = useRouter();
  const [state, setState] = useState<SessionState>("idle");
  const [sourceLang, setSourceLang] = useState("hi-IN");
  const [targetLang] = useState("en-US");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [patientContext, setPatientContext] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState("");
  const [alerts, setAlerts] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [visitSummary, setVisitSummary] = useState<string | null>(null);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [medicationData, setMedicationData] = useState<MedMention[]>([]);
  const [savedMeds, setSavedMeds] = useState<string[]>([]);
  const [encounterId, setEncounterId] = useState<number | null>(null);
  const [agentVoice, setAgentVoice] = useState(true);
  const [agentStatus, setAgentStatus] = useState<"idle" | "listening" | "thinking" | "responded">("idle");
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState<"prescription" | "xray" | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [capturedRxMeds, setCapturedRxMeds] = useState<MedMention[]>([]);
  const [capturedXrayAnalysis, setCapturedXrayAnalysis] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const sessionRef = useRef<LiveSession | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const cameraRef = useRef<CameraView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rawAccum = useRef("");
  const transAccum = useRef("");
  const agentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAgentTranscript = useRef("");

  const { stream, isStreaming } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: "int16",
    onBuffer: (buffer) => {
      sessionRef.current?.sendAudio(buffer.data);
    },
  });

  useEffect(() => {
    (async () => {
      const db = await openDb();
      const facts = await getAllFacts(db, PATIENT_ID);
      setPatientContext(factsToCompactJson(facts));
    })();
    return () => {
      sessionRef.current?.close();
      if (isStreaming) stream.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (agentDebounceRef.current) clearTimeout(agentDebounceRef.current);
      if (agentIntervalRef.current) clearInterval(agentIntervalRef.current);
    };
  }, []);

  const addEntry = useCallback(
    (kind: TranscriptEntry["kind"], text: string) => {
      const entry = createEntry(kind, text);
      setTranscript((t) => [...t, entry]);
      if (kind === "alert") setAlerts((a) => [...a, text]);
      if (kind === "raw")
        rawAccum.current += (rawAccum.current ? " " : "") + text;
      if (kind === "translated")
        transAccum.current += (transAccum.current ? " " : "") + text;
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    },
    []
  );

  async function checkAgentAssist() {
    const transcript = transAccum.current || rawAccum.current;
    if (!patientContext || !transcript) return;
    if (transcript === lastAgentTranscript.current) return;
    lastAgentTranscript.current = transcript;

    setAgentStatus("thinking");
    const recentText = transcript.split(" ").slice(-80).join(" ");

    try {
      const resp = await fetch(`${BACKEND_URL}/agent-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recent_transcript: recentText,
          patient_context: patientContext,
          response_language: sourceLang,
        }),
      });
      if (!resp.ok) { setAgentStatus("listening"); return; }
      const data = await resp.json();
      if (data.should_respond && data.response) {
        addEntry("agent", data.response);
        setAgentStatus("responded");
        if (agentVoice && Speech?.speak) {
          Speech.speak(data.response, { language: sourceLang.split("-")[0], rate: 0.9 });
        }
        setTimeout(() => setAgentStatus("listening"), 3000);
      } else {
        setAgentStatus("listening");
      }
    } catch {
      setAgentStatus("listening");
    }
  }

  function scheduleAgentCheck() {
    if (agentDebounceRef.current) clearTimeout(agentDebounceRef.current);
    agentDebounceRef.current = setTimeout(() => {
      checkAgentAssist();
    }, 3000);
  }

  async function startSession() {
    setState("connecting");
    rawAccum.current = "";
    transAccum.current = "";
    lastAgentTranscript.current = "";

    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone Permission", "Microphone access is required for live transcription.");
        setState("idle");
        return;
      }

      const session = await LiveSession.connect({
        sourceLang,
        targetLang,
        patientContext,
      });
      sessionRef.current = session;

      session.onChunk((chunk) => {
        addEntry(chunk.kind as TranscriptEntry["kind"], chunk.text);
        if (chunk.kind === "translated" || chunk.kind === "raw") {
          scheduleAgentCheck();
        }
      });

      await stream.start();

      setState("live");
      setAgentStatus("listening");
      addEntry("raw", "Session started — listening...");

      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);

      agentIntervalRef.current = setInterval(() => {
        scheduleAgentCheck();
      }, 8000);
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
    if (agentDebounceRef.current) {
      clearTimeout(agentDebounceRef.current);
      agentDebounceRef.current = null;
    }
    if (agentIntervalRef.current) {
      clearInterval(agentIntervalRef.current);
      agentIntervalRef.current = null;
    }
    setAgentStatus("idle");

    stream.stop();
    sessionRef.current?.close();
    sessionRef.current = null;

    setState("analyzing");
    addEntry("raw", "Session ended. Analyzing visit...");

    const db = await openDb();
    let newEncounterId: number | null = null;

    if (transAccum.current || rawAccum.current) {
      try {
        await saveVisitTranscript(db, {
          patientId: PATIENT_ID,
          transcript: { raw: rawAccum.current, translated: transAccum.current },
          sourceLang,
          targetLang,
        });

        db.executeSync(
          "INSERT INTO encounters (patient_id, date, kind, summary, provider, created_at) VALUES (?, date('now'), 'Doctor Visit', ?, ?, datetime('now'))",
          [PATIENT_ID, (transAccum.current || rawAccum.current).slice(0, 200), doctorName.trim() || null]
        );
        const encRow = db.executeSync("SELECT last_insert_rowid() as id").rows?.[0] as any;
        newEncounterId = encRow?.id ?? null;
        setEncounterId(newEncounterId);
      } catch {}
    }

    try {
      const resp = await fetch(`${BACKEND_URL}/analyze-visit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_transcript: rawAccum.current,
          translated_transcript: transAccum.current,
          patient_context: patientContext,
        }),
      });

      if (resp.ok) {
        const analysis = await resp.json();
        setVisitSummary(analysis.summary);

        if (newEncounterId) {
          db.executeSync("UPDATE encounters SET summary = ? WHERE id = ?", [analysis.summary, newEncounterId]);
        }

        const items: ActionItem[] = analysis.action_items ?? [];
        setActionItems(items);
        const checked: Record<number, boolean> = {};
        items.forEach((_: ActionItem, i: number) => { checked[i] = true; });
        setCheckedItems(checked);

        if (analysis.medications_mentioned?.length > 0) {
          setMedicationData(analysis.medications_mentioned);
          const names: string[] = [];
          for (const med of analysis.medications_mentioned) {
            if (med.drug) names.push(`${med.drug} ${med.dose || ""}`);
          }
          setSavedMeds(names);
        }

        setState("review");
      } else {
        addEntry("alert", "Could not analyze visit. You can still review and save.");
        setState("review");
      }
    } catch (e: any) {
      console.warn("analyze-visit error:", e);
      addEntry("alert", `Analysis issue: ${e.message ?? "unknown"}. You can still save.`);
      setState("review");
    }
  }

  async function saveVisit() {
    setSaving(true);
    const db = await openDb();

    try {
      for (let i = 0; i < actionItems.length; i++) {
        const item = actionItems[i];
        const accepted = checkedItems[i] ?? false;
        await saveReminder(db, {
          patientId: PATIENT_ID,
          title: item.title,
          description: item.description,
          kind: item.kind,
          priority: item.priority,
          dueDate: item.due_date,
          encounterId: encounterId ?? undefined,
          status: accepted ? "pending" : "declined",
        });
      }

      for (const med of medicationData) {
        if (med.drug) {
          await saveMedication(db, {
            patientId: PATIENT_ID,
            name: med.drug,
            dose: med.dose || "as prescribed",
            frequency: med.frequency || "",
            timing: med.timing,
          });
        }
      }

      if (capturedXrayAnalysis && encounterId) {
        await saveNote(db, PATIENT_ID, `X-ray/MRI analysis (visit #${encounterId}): ${capturedXrayAnalysis}`);
        db.executeSync(
          "UPDATE encounters SET summary = summary || ? WHERE id = ?",
          [` | Scan: ${capturedXrayAnalysis.slice(0, 100)}`, encounterId]
        );
      }
    } catch (e: any) {
      console.warn("saveVisit error:", e);
    }

    setSaving(false);
    setState("saved");
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function toggleItem(index: number) {
    setCheckedItems((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  async function captureDocument() {
    if (!cameraRef.current || capturing) return;
    if (!permission?.granted) {
      await requestPermission();
      if (!permission?.granted) return;
    }
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true });
      if (!photo?.base64) { setCapturing(false); return; }

      if (cameraOpen === "prescription") {
        const resp = await fetch(`${BACKEND_URL}/parse-prescription`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: photo.base64 }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.medications?.length > 0) {
            setCapturedRxMeds((prev) => [...prev, ...data.medications]);
            const names = data.medications.map((m: any) => `${m.drug} ${m.dose || ""}`);
            setSavedMeds((prev) => [...prev, ...names]);
            setMedicationData((prev) => [...prev, ...data.medications]);
          }
        }
      } else {
        const resp = await fetch(`${BACKEND_URL}/analyze-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: photo.base64, prompt: "Analyze this X-ray or MRI scan. Describe findings relevant to the patient." }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setCapturedXrayAnalysis(data.analysis || "Scan captured");
        }
      }
    } catch {}
    setCapturing(false);
    setCameraOpen(null);
  }

  function kindIcon(kind: string) {
    switch (kind) {
      case "xray": return "\u{1fa7b}";
      case "lab_test": return "\u{1f9ea}";
      case "medication": return "\u{1f48a}";
      case "follow_up": return "\u{1f4c5}";
      case "referral": return "\u{1f3e5}";
      case "lifestyle": return "\u{1f3c3}";
      default: return "\u{1f4cb}";
    }
  }

  return (
    <View className="flex-1 bg-clinical-surface">
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-clinical-outline-var bg-clinical-card px-4 pb-3 pt-14">
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-clinical-surface-mid"
        >
          <Text className="text-base text-clinical-primary">{"←"}</Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-lg font-bold text-clinical-fg">Live Visit</Text>
          {state === "live" && (
            <View className="mt-0.5 flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full bg-clinical-error" />
              <Text className="text-xs font-semibold text-clinical-error">REC {formatTime(elapsed)}</Text>
            </View>
          )}
        </View>
        {state === "live" && (
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => setAgentVoice((v) => !v)}
              className={`rounded-full px-2 py-1 ${agentVoice ? "bg-clinical-primary/10" : "bg-clinical-surface-mid"}`}
            >
              <Text className="text-xs">{agentVoice ? "\u{1f50a}" : "\u{1f507}"}</Text>
            </Pressable>
            <View className="flex-row items-center gap-1.5 rounded-full bg-clinical-error/10 px-3 py-1">
              <View className="h-2 w-2 rounded-full bg-clinical-error" />
              <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-error">LIVE</Text>
            </View>
          </View>
        )}
      </View>

      {/* IDLE: Language + Doctor Name */}
      {state === "idle" && (
        <>
          <View className="mx-4 mt-4 rounded-xl border border-clinical-outline-var bg-clinical-card p-4">
            <Text className="mb-3 text-[11px] font-bold uppercase tracking-widest text-clinical-muted">PATIENT SPEAKS</Text>
            <View className="flex-row flex-wrap gap-2">
              {LANGUAGES.filter((l) => l.code !== targetLang).map((lang) => (
                <Pressable
                  key={lang.code}
                  onPress={() => setSourceLang(lang.code)}
                  className={`rounded-lg px-4 py-2.5 ${
                    sourceLang === lang.code ? "bg-clinical-primary" : "border border-clinical-outline-var bg-clinical-surface-low"
                  }`}
                >
                  <Text className={`text-sm font-semibold ${sourceLang === lang.code ? "text-white" : "text-clinical-fg"}`}>
                    {lang.flag} {lang.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="mt-4 flex-row items-center gap-2 rounded-lg bg-clinical-primary/5 px-3 py-2">
              <Text className="text-xs text-clinical-primary">Powered by Gemini Live + Memory Agent</Text>
            </View>
          </View>

          <View className="mx-4 mt-3 rounded-xl border border-clinical-outline-var bg-clinical-card p-4">
            <Text className="mb-2 text-[11px] font-bold uppercase tracking-widest text-clinical-muted">DOCTOR NAME</Text>
            <TextInput
              className="rounded-lg border border-clinical-outline-var bg-clinical-surface-low px-4 py-3 text-sm text-clinical-fg"
              placeholder="Dr. "
              placeholderTextColor="#94a3b8"
              value={doctorName}
              onChangeText={setDoctorName}
            />
          </View>
        </>
      )}

      {/* LIVE: Audio indicator */}
      {state === "live" && (
        <View className="mx-4 mt-3 flex-row items-center gap-2 rounded-xl border border-clinical-outline-var bg-clinical-card px-4 py-3">
          <View className="h-3 w-3 rounded-full bg-clinical-error" />
          <Text className="flex-1 text-sm font-semibold text-clinical-fg">Recording & streaming audio...</Text>
          <Text className="text-xs text-clinical-muted">16kHz PCM</Text>
        </View>
      )}

      {/* Agent Status Banner */}
      {state === "live" && (
        <View className={`mx-4 mt-2 flex-row items-center gap-2 rounded-xl border-2 px-4 py-2.5 ${
          agentStatus === "thinking"
            ? "border-green-400 bg-green-100"
            : agentStatus === "responded"
              ? "border-green-500 bg-green-50"
              : "border-green-300 bg-green-50"
        }`}>
          <Text className="text-base">{agentStatus === "thinking" ? "\u{1f4ad}" : "\u{1f9e0}"}</Text>
          <View className="flex-1">
            <Text className="text-xs font-bold text-green-700">
              {agentStatus === "thinking"
                ? "Memory Agent analyzing conversation..."
                : agentStatus === "responded"
                  ? "Memory Agent responded"
                  : "Memory Agent active"}
            </Text>
            <Text className="text-[10px] text-green-600">
              {agentStatus === "thinking"
                ? "Checking patient records for relevant info"
                : "Monitoring conversation \u{00b7} Will surface info from patient memory"}
            </Text>
          </View>
          {agentStatus === "thinking" && (
            <View className="flex-row gap-1">
              <View className="h-2 w-2 rounded-full bg-green-400" />
              <View className="h-2 w-2 rounded-full bg-green-300" />
              <View className="h-2 w-2 rounded-full bg-green-200" />
            </View>
          )}
        </View>
      )}

      {/* Alerts Banner */}
      {alerts.length > 0 && (state === "live" || state === "analyzing") && (
        <View className="mx-4 mt-3 rounded-xl border border-clinical-error/20 bg-clinical-error-bg p-3">
          <Text className="mb-1 text-[11px] font-bold uppercase tracking-widest text-clinical-error">REAL-TIME ALERTS</Text>
          {alerts.slice(-3).map((a, i) => (
            <Text key={i} className="text-sm text-clinical-fg" numberOfLines={2}>{a}</Text>
          ))}
        </View>
      )}

      {/* LIVE + ANALYZING: Transcript */}
      {(state === "idle" || state === "live" || state === "analyzing") && (
        <ScrollView
          ref={scrollRef}
          className="mx-4 mt-3 flex-1 rounded-xl border border-clinical-outline-var bg-clinical-card"
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {transcript.length === 0 && state === "idle" && (
            <View className="items-center py-12">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-clinical-primary/10">
                <Text className="text-3xl">{"\u{1f399}"}</Text>
              </View>
              <Text className="mt-4 text-center text-base font-semibold text-clinical-fg">Record a doctor visit</Text>
              <Text className="mt-2 text-center text-sm text-clinical-muted">
                Real-time speech-to-text, translation, drug interaction alerts, and AI memory agent during doctor conversations.
              </Text>
              {patientContext && (
                <View className="mt-4 rounded-lg bg-clinical-surface-low px-3 py-2">
                  <Text className="text-xs text-clinical-secondary">Patient context loaded — AI agent will assist</Text>
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
                    : entry.kind === "agent"
                      ? "border-2 border-green-400 bg-green-50"
                      : "mr-8 bg-clinical-surface-low"
              }`}
            >
              <Text className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-clinical-muted">
                {entry.kind === "translated"
                  ? "English (Translated)"
                  : entry.kind === "alert"
                    ? "Alert"
                    : entry.kind === "agent"
                      ? "\u{1f9e0} Memory Agent"
                      : "Heard (Original)"}
              </Text>
              <Text
                className={`text-sm ${
                  entry.kind === "alert"
                    ? "font-semibold text-clinical-error"
                    : entry.kind === "agent"
                      ? "font-semibold text-green-700"
                      : "text-clinical-fg"
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

          {state === "analyzing" && (
            <View className="mt-2 items-center py-4">
              <Text className="text-sm font-semibold text-clinical-primary">Analyzing visit with Gemini...</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* REVIEW: Action items, meds, prescription capture */}
      {state === "review" && (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          {/* Doctor & Summary Card */}
          <View className="rounded-xl border border-clinical-outline-var bg-clinical-card px-4 py-3">
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-clinical-primary/10">
                <Text className="text-xl">{"\u{1fa7a}"}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-clinical-fg">
                  {doctorName.trim() || "Doctor Visit"}
                </Text>
                <Text className="text-xs text-clinical-muted">
                  {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} {"·"} Duration: {formatTime(elapsed)}
                </Text>
              </View>
            </View>
            {visitSummary && (
              <View className="mt-3 rounded-lg bg-clinical-primary/5 px-3 py-2">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-clinical-primary">VISIT SUMMARY</Text>
                <Text className="mt-1 text-sm text-clinical-fg">{visitSummary}</Text>
              </View>
            )}
          </View>

          {/* Action Items Checkboxes */}
          {actionItems.length > 0 && (
            <View className="mt-4 rounded-xl border border-clinical-primary/20 bg-clinical-card px-4 py-3">
              <Text className="mb-1 text-[10px] font-bold uppercase tracking-widest text-clinical-primary">
                RECOMMENDED ACTIONS
              </Text>
              <Text className="mb-3 text-xs text-clinical-muted">
                Select what you agree to follow through on
              </Text>
              {actionItems.map((item, i) => (
                <Pressable
                  key={i}
                  onPress={() => toggleItem(i)}
                  className={`mb-2 flex-row items-start gap-3 rounded-xl border p-3 ${
                    checkedItems[i] ? "border-clinical-primary/30 bg-clinical-primary/5" : "border-clinical-outline-var bg-clinical-surface-low"
                  }`}
                >
                  <View
                    className={`mt-0.5 h-6 w-6 items-center justify-center rounded-md ${
                      checkedItems[i] ? "bg-clinical-primary" : "border-2 border-clinical-outline-var bg-white"
                    }`}
                  >
                    {checkedItems[i] && <Text className="text-xs font-bold text-white">{"✓"}</Text>}
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm">{kindIcon(item.kind)}</Text>
                      <Text className="flex-1 text-sm font-semibold text-clinical-fg">{item.title}</Text>
                    </View>
                    <Text className="mt-0.5 text-xs text-clinical-muted">{item.description}</Text>
                    <View className="mt-1.5 flex-row gap-2">
                      {item.priority === "high" && (
                        <View className="rounded bg-clinical-error/10 px-1.5 py-0.5">
                          <Text className="text-[10px] font-bold text-clinical-error">HIGH PRIORITY</Text>
                        </View>
                      )}
                      {item.due_date && (
                        <View className="rounded bg-clinical-primary/10 px-1.5 py-0.5">
                          <Text className="text-[10px] font-bold text-clinical-primary">Due: {item.due_date}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* Medications */}
          {savedMeds.length > 0 && (
            <View className="mt-4 rounded-xl border border-clinical-secondary/20 bg-clinical-secondary/5 px-4 py-3">
              <Text className="mb-2 text-[10px] font-bold uppercase tracking-widest text-clinical-secondary">
                PRESCRIBED MEDICATIONS
              </Text>
              {savedMeds.map((med, i) => (
                <View key={i} className="mb-1 flex-row items-center gap-2">
                  <Text className="text-sm">{"\u{1f48a}"}</Text>
                  <Text className="text-sm font-semibold text-clinical-fg">{med}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Captured X-ray/MRI Result */}
          {capturedXrayAnalysis && (
            <View className="mt-4 rounded-xl border border-clinical-secondary/20 bg-clinical-secondary/5 px-4 py-3">
              <Text className="mb-1 text-[10px] font-bold uppercase tracking-widest text-clinical-secondary">
                X-RAY / MRI ANALYSIS
              </Text>
              <Text className="text-sm text-clinical-fg">{capturedXrayAnalysis}</Text>
            </View>
          )}

          {/* Inline Camera */}
          {cameraOpen && (
            <View className="mt-4 rounded-xl border-2 border-clinical-primary/30 bg-clinical-card overflow-hidden">
              <View className="flex-row items-center justify-between bg-clinical-primary/5 px-4 py-2">
                <Text className="text-xs font-bold text-clinical-primary">
                  {cameraOpen === "prescription" ? "Capture Prescription" : "Capture X-ray / MRI"}
                </Text>
                <Pressable onPress={() => setCameraOpen(null)}>
                  <Text className="text-sm font-bold text-clinical-muted">{"✕"}</Text>
                </Pressable>
              </View>
              <View style={{ height: 250 }}>
                <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
              </View>
              <Pressable
                onPress={captureDocument}
                disabled={capturing}
                className={`items-center py-3 ${capturing ? "bg-clinical-surface-mid" : "bg-clinical-primary"}`}
              >
                <Text className={`text-sm font-bold ${capturing ? "text-clinical-muted" : "text-white"}`}>
                  {capturing ? "Analyzing..." : "Capture & Analyze"}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Capture Buttons */}
          {!cameraOpen && (
            <View className="mt-4 rounded-xl border border-clinical-outline-var bg-clinical-card px-4 py-3">
              <Text className="mb-3 text-[10px] font-bold uppercase tracking-widest text-clinical-muted">
                CAPTURE DOCUMENTS
              </Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => { if (!permission?.granted) requestPermission(); setCameraOpen("prescription"); }}
                  className="flex-1 items-center gap-1 rounded-lg border border-clinical-primary/20 bg-clinical-primary/5 p-3"
                >
                  <Text className="text-lg">{"\u{1f4cb}"}</Text>
                  <Text className="text-xs font-bold text-clinical-primary">Prescription</Text>
                  {capturedRxMeds.length > 0 && (
                    <Text className="text-[10px] text-clinical-secondary">{capturedRxMeds.length} captured</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => { if (!permission?.granted) requestPermission(); setCameraOpen("xray"); }}
                  className="flex-1 items-center gap-1 rounded-lg border border-clinical-secondary/20 bg-clinical-secondary/5 p-3"
                >
                  <Text className="text-lg">{"\u{1fa7b}"}</Text>
                  <Text className="text-xs font-bold text-clinical-secondary">X-ray / MRI</Text>
                  {capturedXrayAnalysis && (
                    <Text className="text-[10px] text-clinical-secondary">Captured</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {/* Save & Finish */}
          <Pressable
            onPress={saveVisit}
            disabled={saving}
            className={`mt-5 items-center rounded-xl py-4 ${saving ? "bg-clinical-surface-mid" : "bg-clinical-primary"}`}
          >
            <Text className={`text-base font-bold ${saving ? "text-clinical-muted" : "text-white"}`}>
              {saving ? "Saving..." : "Save & Finish"}
            </Text>
            <Text className="text-xs text-blue-200">Updates timeline, creates reminders</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* SAVED: Success */}
      {state === "saved" && (
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-clinical-secondary/10">
            <Text className="text-4xl">{"✓"}</Text>
          </View>
          <Text className="mt-4 text-xl font-bold text-clinical-fg">Visit Saved</Text>
          <Text className="mt-2 text-center text-sm text-clinical-muted">
            {doctorName.trim() ? `Visit with ${doctorName.trim()}` : "Doctor visit"} has been saved to your timeline.
          </Text>

          {actionItems.length > 0 && (
            <View className="mt-4 w-full rounded-xl border border-clinical-outline-var bg-clinical-card px-4 py-3">
              {actionItems.map((item, i) => (
                <View key={i} className="mb-1.5 flex-row items-center gap-2">
                  <Text className={`text-base font-bold ${checkedItems[i] ? "text-clinical-secondary" : "text-clinical-error"}`}>
                    {checkedItems[i] ? "✓" : "✗"}
                  </Text>
                  <Text className={`flex-1 text-sm ${checkedItems[i] ? "text-clinical-fg" : "text-clinical-muted line-through"}`}>
                    {item.title}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View className="mt-6 w-full gap-2">
            <Pressable
              onPress={() => router.replace("/(tabs)/timeline")}
              className="items-center rounded-xl bg-clinical-primary py-3"
            >
              <Text className="font-bold text-white">View Timeline</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setTranscript([]);
                setAlerts([]);
                setActionItems([]);
                setCheckedItems({});
                setVisitSummary(null);
                setSavedMeds([]);
                setMedicationData([]);
                setDoctorName("");
                setEncounterId(null);
                setCameraOpen(null);
                setCapturedRxMeds([]);
                setCapturedXrayAnalysis(null);
                setState("idle");
                setElapsed(0);
              }}
              className="items-center rounded-xl border border-clinical-outline-var py-3"
            >
              <Text className="text-sm font-semibold text-clinical-fg">New Session</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Control Buttons */}
      {(state === "idle" || state === "connecting" || state === "live") && (
        <View className="px-4 pb-8 pt-3">
          {state === "idle" && (
            <Pressable onPress={startSession} className="items-center rounded-xl bg-clinical-primary py-4">
              <Text className="text-base font-bold text-white">Start Live Session</Text>
              <Text className="text-xs text-blue-200">
                {LANGUAGES.find((l) => l.code === sourceLang)?.label} {"→"} English
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
            <Pressable onPress={stopSession} className="items-center rounded-xl bg-clinical-error py-4">
              <View className="flex-row items-center gap-2">
                <View className="h-3 w-3 rounded-full bg-white" />
                <Text className="text-base font-bold text-white">Stop Recording</Text>
              </View>
              <Text className="text-xs text-red-200">
                Next: Review & confirm actions {"·"} {formatTime(elapsed)}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
