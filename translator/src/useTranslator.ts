// useTranslator — the whole Gemini Live translator contract in one hook.
//
// - Mic PCM (16 kHz) is streamed to Gemini Live.
// - Server-side input transcription is enabled: the raw source-language
//   speech gets transcribed and lands in the LEFT column.
// - Gemini's translated text response lands in the RIGHT column.
// - No camera. No patient history. No medical reasoning.

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import type { Session } from "@google/genai";
import { buildTranslatorPrompt } from "./prompts";

// gemini-2.0-flash-exp is the most broadly-available Live model. The
// hackathon-named model is gemini-3.1-flash-live-preview — swap here if
// your account has preview access. Both accept the same API surface.
const MODEL = "gemini-2.0-flash-exp";

export interface UseTranslator {
  start: () => Promise<void>;
  stop: () => void;
  isRecording: boolean;
  sourceText: string;
  targetText: string;
  error: string | null;
  clear: () => void;
  downloadTranscript: () => void;
}

export function useTranslator(
  sourceCode: string,
  targetCode: string,
): UseTranslator {
  const [isRecording, setIsRecording] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceCodeRef = useRef(sourceCode);
  const targetCodeRef = useRef(targetCode);

  useEffect(() => {
    sourceCodeRef.current = sourceCode;
    targetCodeRef.current = targetCode;
  }, [sourceCode, targetCode]);

  const clear = useCallback(() => {
    setSourceText("");
    setTargetText("");
    setError(null);
  }, []);

  const stop = useCallback(() => {
    try {
      sessionRef.current?.close();
    } catch {
      /* ignore */
    }
    sessionRef.current = null;

    audioProcessorRef.current?.disconnect();
    audioSourceRef.current?.disconnect();
    audioProcessorRef.current = null;
    audioSourceRef.current = null;

    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
    if (!apiKey || apiKey === "paste-your-key-here") {
      setError(
        "Missing VITE_GOOGLE_API_KEY. Copy .env.example → .env.local and paste your Google AI Studio key.",
      );
      return;
    }
    setError(null);
    setSourceText("");
    setTargetText("");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Mic permission denied: ${msg}`);
      return;
    }
    streamRef.current = stream;

    const client = new GoogleGenAI({ apiKey });
    const systemInstruction = buildTranslatorPrompt(
      sourceCodeRef.current,
      targetCodeRef.current,
    );

    let session: Session;
    try {
      session = await client.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.TEXT],
          systemInstruction,
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            /* pumps start below */
          },
          onmessage: (msg) => {
            const anyMsg = msg as unknown as {
              serverContent?: {
                inputTranscription?: { text?: string };
                modelTurn?: { parts?: Array<{ text?: string }> };
                turnComplete?: boolean;
              };
              text?: string;
            };
            const sc = anyMsg.serverContent;
            const rawUser = sc?.inputTranscription?.text;
            if (rawUser) {
              setSourceText((cur) => (cur ? cur + " " + rawUser : rawUser));
            }
            const parts = sc?.modelTurn?.parts;
            if (parts) {
              for (const p of parts) {
                if (p.text) {
                  setTargetText((cur) => cur + p.text);
                }
              }
            } else if (anyMsg.text) {
              setTargetText((cur) => cur + anyMsg.text);
            }
            if (sc?.turnComplete) {
              setTargetText((cur) => (cur.endsWith(" ") ? cur : cur + " "));
            }
          },
          onerror: (e) => {
            const em = e instanceof Error ? e.message : String(e);
            setError(`Live API error: ${em}`);
          },
          onclose: () => {
            /* handled in stop() */
          },
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to connect to Live API: ${msg}`);
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    sessionRef.current = session;

    // Audio pump — 16 kHz PCM → base64 → sendRealtimeInput.
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    audioSourceRef.current = source;
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    audioProcessorRef.current = processor;
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const base64 = int16ToBase64(pcm);
      try {
        session.sendRealtimeInput({
          audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
        });
      } catch {
        /* session may be closing */
      }
    };
    source.connect(processor);
    processor.connect(audioCtx.destination);

    setIsRecording(true);
  }, []);

  const downloadTranscript = useCallback(() => {
    const now = new Date().toISOString().replace(/[:.]/g, "-");
    const content =
      `healthOS Consult Translator — ${now}\n` +
      `Source (${sourceCodeRef.current}):\n${sourceText}\n\n` +
      `Target (${targetCodeRef.current}):\n${targetText}\n`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consult-transcript-${now}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [sourceText, targetText]);

  useEffect(() => {
    return () => {
      try {
        sessionRef.current?.close();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return {
    start,
    stop,
    isRecording,
    sourceText,
    targetText,
    error,
    clear,
    downloadTranscript,
  };
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
