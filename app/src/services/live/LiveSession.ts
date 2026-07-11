import { BACKEND_URL } from "../../config";

interface ConnectOpts {
  sourceLang: string;
  targetLang: string;
  patientContext: string | null;
}

interface Chunk {
  kind: "raw" | "translated" | "alert";
  text: string;
}

export class LiveSession {
  private ws: WebSocket;
  private _onChunk: ((c: Chunk) => void) | null = null;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (this._onChunk && (msg.kind === "raw" || msg.kind === "translated" || msg.kind === "alert")) {
          this._onChunk({ kind: msg.kind, text: msg.text });
        }
      } catch {}
    };
  }

  static connect(opts: ConnectOpts): Promise<LiveSession> {
    return new Promise((resolve, reject) => {
      const wsUrl = BACKEND_URL.replace(/^http/, "ws") + "/live-ws";
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify(opts));
        resolve(new LiveSession(ws));
      };
      ws.onerror = () => reject(new Error("WebSocket connection failed"));
    });
  }

  onChunk(cb: (c: Chunk) => void) {
    this._onChunk = cb;
  }

  sendAudioBase64(base64: string) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ kind: "audio", data: base64 }));
    }
  }

  close() {
    this.ws.close();
  }
}
