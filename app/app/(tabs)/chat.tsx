import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import type { AllFacts, ConfidenceLevel } from "../../src/types";
import { openDb } from "../../src/services/store/db";
import { getAllFacts } from "../../src/services/store/repos";
import { factsToCompactJson } from "../../src/services/chat/buildContext";
import { getGemmaClient } from "../../src/services/gemma/GemmaClient";
import { ChatBubble } from "../../src/ui/ChatBubble";
import { ConfidenceBadge } from "../../src/ui/ConfidenceBadge";

const PATIENT_ID = 1;
const CHIPS = [
  "Why am I on metformin?",
  "Is my HbA1c trending well?",
  "What should I ask my doctor?",
];

interface Msg { who: "me" | "ai"; text: string; confidence?: ConfidenceLevel; }

function extractConfidence(raw: string): { text: string; confidence: ConfidenceLevel; reasoning: string } {
  const m = raw.match(/\{"confidence"\s*:\s*"(grounded|uncertain|defer)"\s*,\s*"reasoning"\s*:\s*"([^"]+)"\}\s*$/);
  if (!m) return { text: raw, confidence: "uncertain", reasoning: "" };
  return { text: raw.slice(0, m.index).trim(), confidence: m[1] as ConfidenceLevel, reasoning: m[2] };
}

export default function Chat() {
  const [facts, setFacts] = useState<AllFacts | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      const db = await openDb();
      setFacts(await getAllFacts(db, PATIENT_ID));
    })();
  }, []);

  async function ask(text: string) {
    if (!facts || busy || !text.trim()) return;
    const q = text.trim();
    setMessages((m) => [...m, { who: "me", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const client = await getGemmaClient();
      const res = await client.generate({ prompt: q, factsJson: factsToCompactJson(facts) });
      const { text, confidence } = extractConfidence(res.text);
      setMessages((m) => [...m, { who: "ai", text, confidence }]);
    } catch (e: any) {
      setMessages((m) => [...m, { who: "ai", text: `(error: ${e.message ?? e})` }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-clinical-surface"
    >
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && (
          <View className="mb-4 mt-8 items-center">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-clinical-primary/10">
              <Text className="text-2xl">🤖</Text>
            </View>
            <Text className="mt-3 text-base font-semibold text-clinical-fg">
              Ask your health memory
            </Text>
            <Text className="mt-1 text-center text-sm text-clinical-muted">
              Questions are answered using only your own medical records.
            </Text>
            <View className="mt-6 w-full gap-2">
              {CHIPS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => ask(c)}
                  className="rounded-xl border border-clinical-outline-var bg-clinical-card px-4 py-3"
                >
                  <Text className="text-sm text-clinical-fg">{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {messages.map((m, i) => (
          <View key={i}>
            <ChatBubble text={m.text} mine={m.who === "me"} />
            {m.who === "ai" && m.confidence ? (
              <View className="mb-2 mr-12 self-start">
                <ConfidenceBadge level={m.confidence} />
              </View>
            ) : null}
          </View>
        ))}
        {busy && (
          <View className="mr-12 my-1 self-start rounded-xl rounded-bl-md border border-clinical-outline-var bg-clinical-card px-4 py-3">
            <Text className="text-sm text-clinical-muted">Thinking...</Text>
          </View>
        )}
      </ScrollView>

      <View className="border-t border-clinical-outline-var bg-clinical-card px-3 py-2">
        <View className="flex-row items-center gap-2">
          <TextInput
            className="flex-1 rounded-xl border border-clinical-outline-var bg-clinical-surface px-4 py-2.5 text-sm text-clinical-fg"
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your health records..."
            placeholderTextColor="#737688"
            returnKeyType="send"
            onSubmitEditing={() => ask(input)}
          />
          <Pressable
            onPress={() => ask(input)}
            className={`rounded-xl px-4 py-2.5 ${busy ? "bg-clinical-surface-mid" : "bg-clinical-primary"}`}
            disabled={busy}
          >
            <Text className="text-sm font-semibold text-white">Send</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
