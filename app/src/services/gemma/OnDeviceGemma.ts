import type { GemmaClient, GemmaResponse } from "./GemmaClient";

export async function probeOnDeviceAvailable(): Promise<boolean> {
  try {
    const { LlmInference } = require("react-native-llm-mediapipe");
    return !!LlmInference;
  } catch {
    return false;
  }
}

export class OnDeviceGemma implements GemmaClient {
  private inference: any = null;

  async generate(opts: { prompt: string; factsJson: string }): Promise<GemmaResponse> {
    if (!this.inference) {
      const { LlmInference } = require("react-native-llm-mediapipe");
      this.inference = await LlmInference.createFromOptions({
        modelPath: "gemma-2b-it-cpu-int4.bin",
        maxTokens: 1024,
      });
    }

    const fullPrompt = `You are a medical assistant. Answer based only on the patient records below.\n\nRecords: ${opts.factsJson}\n\nQuestion: ${opts.prompt}\n\nProvide a helpful answer, then append a JSON object: {"confidence": "grounded"|"uncertain"|"defer", "reasoning": "<one-line>"}`;

    const result = await this.inference.generateResponse(fullPrompt);
    return { text: result };
  }
}
