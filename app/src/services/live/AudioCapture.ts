export class AudioCapture {
  private recording: any = null;
  available = true;

  async start(onChunk: (base64: string) => void): Promise<void> {
    try {
      const { Audio } = require("expo-av");
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        this.available = false;
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
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
