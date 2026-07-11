import { useState } from "react";
import "./App.css";
import { LANGUAGES } from "./languages";
import { useTranslator } from "./useTranslator";

function App() {
  const [source, setSource] = useState("hi-IN");
  const [target, setTarget] = useState("en-US");
  const {
    start,
    stop,
    isRecording,
    sourceText,
    targetText,
    error,
    clear,
    downloadTranscript,
  } = useTranslator(source, target);

  const swap = () => {
    setSource(target);
    setTarget(source);
  };

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <div className="title">healthOS Consult Translator</div>
          <div className="subtitle">
            Real-time bidirectional interpretation · Live API
          </div>
        </div>
        <div className="picker">
          <span>Patient</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={isRecording}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <button
            className="swap"
            onClick={swap}
            disabled={isRecording}
            aria-label="Swap languages"
          >
            ⇄
          </button>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={isRecording}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <span>Doctor</span>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="columns">
        <div className="col left">
          <h2>
            Patient · {LANGUAGES.find((l) => l.code === source)?.label ?? source}
          </h2>
          <div className="stream">
            {sourceText || (
              <span className="placeholder">
                Tap the mic to start. The patient's speech will transcribe here.
              </span>
            )}
          </div>
        </div>
        <div className="col right">
          <h2>
            Doctor · {LANGUAGES.find((l) => l.code === target)?.label ?? target}
          </h2>
          <div className="stream">
            {targetText || (
              <span className="placeholder">
                Translated interpretation will stream here in real time.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="footer">
        <div className="actions">
          <button onClick={clear} disabled={isRecording}>
            Clear
          </button>
          <button
            onClick={downloadTranscript}
            disabled={isRecording || (!sourceText && !targetText)}
          >
            Download transcript
          </button>
        </div>
        <button
          className={`mic ${isRecording ? "recording" : ""}`}
          onClick={isRecording ? stop : start}
          aria-label={isRecording ? "Stop" : "Start"}
        >
          {isRecording ? "■" : "🎤"}
        </button>
      </div>

      <div className="disclaimer">
        Real-time translation only. Not medical advice. Does not diagnose, recommend, or replace an interpreter for critical care.
      </div>
    </div>
  );
}

export default App;
