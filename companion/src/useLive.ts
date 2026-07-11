// useLive — the whole Gemini Live contract in one hook.
//
// Design choices for this MVP:
// - Response modality = TEXT only. We render the reply in the transcript AND
//   speak it via the browser's SpeechSynthesis API. Live-audio playback
//   requires a lot of audio-plumbing (buffered PCM decode + AudioContext
//   queue) that isn't worth the complexity for a 2-hour MVP.
// - User audio → Gemini as 16 kHz PCM. Gemini transcribes it server-side
//   and we surface the transcription via serverContent.inputTranscription.
// - Camera → Gemini as JPEG frames every 750 ms via canvas.toBlob.
// - VAD (voice activity detection) is handled by Gemini automatically when
//   sendRealtimeInput is used.

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import type { Session } from "@google/genai";
import { PATIENT } from "./patient";
import { buildSystemPrompt } from "./prompts";

const MODEL = "gemini-2.0-flash-exp";
// Gemini 3.1 Flash Live preview model id per hackathon docs; if that isn't
// available in your account/region, fall back to 2.0 Flash exp which is the
// most broadly-available Live model. Adjust here if you hit a 404:
//   "gemini-3.1-flash-live-preview" | "gemini-2.0-flash-exp"

export type Turn = { role: "user" | "agent"; text: string };

export interface UseLive {
  start: () => Promise<void>;
  stop: () => void;
  isRecording: boolean;
  transcript: Turn[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
  error: string | null;
}

export function useLive(): UseLive {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const currentAgentTurnRef = useRef<string>("");

  const appendUser = useCallback((text: string) => {
    if (!text.trim()) return;
    setTranscript((t) => {
      // Merge consecutive user chunks — Live sends transcription incrementally.
      const last = t[t.length - 1];
      if (last && last.role === "user") {
        return [...t.slice(0, -1), { role: "user", text: last.text + " " + text }];
      }
      return [...t, { role: "user", text }];
    });
  }, []);

  const appendAgent = useCallback((text: string) => {
    if (!text) return;
    currentAgentTurnRef.current += text;
    const merged = currentAgentTurnRef.current;
    setTranscript((t) => {
      const last = t[t.length - 1];
      if (last && last.role === "agent") {
        return [...t.slice(0, -1), { role: "agent", text: merged }];
      }
      return [...t, { role: "agent", text: merged }];
    });
  }, []);

  const flushAgentTurn = useCallback(() => {
    const text = currentAgentTurnRef.current.trim();
    if (text) {
      // Speak the response through the browser TTS.
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05;
        window.speechSynthesis.speak(u);
      } catch {
        /* SpeechSynthesis may be unavailable; ignore. */
      }
    }
    currentAgentTurnRef.current = "";
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

    if (videoIntervalRef.current !== null) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }

    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }

    flushAgentTurn();
    setIsRecording(false);
  }, [flushAgentTurn]);

  const start = useCallback(async () => {
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
    if (!apiKey || apiKey === "paste-your-key-here") {
      setError(
        "Missing VITE_GOOGLE_API_KEY. Copy .env.example → .env.local and paste your Google AI Studio key.",
      );
      return;
    }
    setError(null);
    setTranscript([]);

    // 1. Request mic + camera.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Camera/mic permission denied: ${msg}`);
      return;
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    // 2. Open Live session.
    const client = new GoogleGenAI({ apiKey });
    const systemInstruction = buildSystemPrompt(PATIENT);

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

            const userText = sc?.inputTranscription?.text;
            if (userText) appendUser(userText);

            const parts = sc?.modelTurn?.parts;
            if (parts) {
              for (const p of parts) {
                if (p.text) appendAgent(p.text);
              }
            } else if (anyMsg.text) {
              appendAgent(anyMsg.text);
            }

            if (sc?.turnComplete) {
              flushAgentTurn();
            }
          },
          onerror: (e) => {
            const em = e instanceof Error ? e.message : String(e);
            setError(`Live API error: ${em}`);
          },
          onclose: () => {
            /* cleanup happens in stop() */
          },
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to connect to Live API: ${msg}`);
      stream.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      return;
    }
    sessionRef.current = session;

    // 3. Audio pump — mic PCM 16 kHz → base64 → sendRealtimeInput.
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    audioSourceRef.current = source;

    // ScriptProcessorNode is deprecated but universally supported and simple.
    // Buffer size 4096 → ~256 ms chunks at 16 kHz.
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    audioProcessorRef.current = processor;
    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // Float32 [-1, 1] → Int16 PCM
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

    // 4. Video pump — a JPEG frame every 750 ms.
    videoIntervalRef.current = window.setInterval(async () => {
      const v = videoRef.current;
      if (!v || v.videoWidth === 0) return;
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(v, 0, 0);
      canvas.toBlob(
        async (blob) => {
          if (!blob) return;
          const arr = await blob.arrayBuffer();
          const base64 = bytesToBase64(new Uint8Array(arr));
          try {
            session.sendRealtimeInput({
              video: { data: base64, mimeType: "image/jpeg" },
            });
          } catch {
            /* session may be closing */
          }
        },
        "image/jpeg",
        0.7,
      );
    }, 750);

    setIsRecording(true);
  }, [appendAgent, appendUser, flushAgentTurn]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount.
      try {
        sessionRef.current?.close();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      audioCtxRef.current?.close().catch(() => {});
      if (videoIntervalRef.current !== null) {
        clearInterval(videoIntervalRef.current);
      }
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return { start, stop, isRecording, transcript, videoRef, error };
}

// --- helpers ---

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer);
  return bytesToBase64(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
