export class AudioCapture {
  private recording: any = null;
  available = true;

  async start(onChunk: (base64: string) => void): Promise<void> {
    try {
      const ExpoAudio = require("expo-audio");
      const perm = await ExpoAudio.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        this.available = false;
        return;
      }

      const recording = new ExpoAudio.Recording();
      await recording.prepareToRecordAsync();
      await recording.startAsync();
      this.recording = recording;
    } catch {
      this.available = false;
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.recording) {
        await this.recording.stopAndUnloadAsync();
        this.recording = null;
      }
    } catch {}
  }
}
