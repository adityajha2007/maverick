import { useLive } from "./useLive";
import { PATIENT } from "./patient";
import "./App.css";

function App() {
  const { start, stop, isRecording, transcript, videoRef, error } = useLive();

  return (
    <div className="phone">
      <div className="header">
        <div>
          <div className="patient-name">{PATIENT.name}</div>
          <div className="patient-meta">
            {PATIENT.age}, {PATIENT.sex} · Live health guide
          </div>
        </div>
        <div className={`status ${isRecording ? "recording" : ""}`}>
          {isRecording ? "● live" : "○ idle"}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="video">
        <video ref={videoRef} autoPlay muted playsInline />
        {!isRecording && (
          <div className="no-camera">Tap the mic to start. Camera + audio go live.</div>
        )}
      </div>

      <div className="transcript">
        {transcript.length === 0 ? (
          <div className="placeholder">
            Try: "I have a mild headache" · "coach me through a warrior pose" · "my blood sugar felt low this morning"
          </div>
        ) : (
          transcript.map((turn, i) => (
            <div key={i} className={`turn ${turn.role}`}>
              <span className="role">
                {turn.role === "user" ? "You:" : "Guide:"}
              </span>
              {turn.text}
            </div>
          ))
        )}
      </div>

      <div className="footer">
        <button
          className={`mic ${isRecording ? "recording" : ""}`}
          onClick={isRecording ? stop : start}
          aria-label={isRecording ? "Stop" : "Start"}
        >
          {isRecording ? "■" : "🎤"}
        </button>
      </div>

      <div className="disclaimer">
        Not medical advice. See a doctor if anything feels different from usual.
      </div>
    </div>
  );
}

export default App;
