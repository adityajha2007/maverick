export class AudioCapture {
  private recorder: any = null;
  available = true;

  async start(onChunk: (base64: string) => void): Promise<void> {
    try {
      const { requestRecordingPermissionsAsync, RecordingPresets, AudioModule } =
        require("expo-audio");

      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        this.available = false;
        return;
      }

      const options = RecordingPresets.HIGH_QUALITY;
      const recorder = new AudioModule.AudioRecorder(options);
      await recorder.prepareToRecordAsync(options);
      recorder.record();
      this.recorder = recorder;
    } catch {
      this.available = false;
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.recorder) {
        await this.recorder.stop();
        this.recorder = null;
      }
    } catch {}
  }
}
