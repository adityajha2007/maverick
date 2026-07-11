import { getGemmaClient, registerOnDeviceCandidate, resetGemmaClientForTests } from "../src/services/gemma/GemmaClient";
import { CloudGemma } from "../src/services/gemma/CloudGemma";

jest.mock("../src/config", () => ({
  BACKEND_URL: "http://test-backend",
  CLOUD_ONLY_MODE: false,
}));

beforeEach(() => resetGemmaClientForTests());

test("returns cloud impl when no on-device candidate registered", async () => {
  const c = await getGemmaClient();
  expect(c).toBeInstanceOf(CloudGemma);
});

test("returns on-device impl when candidate is available", async () => {
  const fake = { generate: async () => ({ text: "ondevice" }) };
  registerOnDeviceCandidate(() => fake, async () => true);
  const c = await getGemmaClient();
  expect(await c.generate({ prompt: "x" })).toEqual({ text: "ondevice" });
});

test("falls back to cloud when on-device probe returns false", async () => {
  const fake = { generate: async () => ({ text: "ondevice" }) };
  registerOnDeviceCandidate(() => fake, async () => false);
  const c = await getGemmaClient();
  expect(c).toBeInstanceOf(CloudGemma);
});

test("falls back to cloud when probe throws", async () => {
  const fake = { generate: async () => ({ text: "ondevice" }) };
  registerOnDeviceCandidate(() => fake, async () => { throw new Error("no bridge"); });
  const c = await getGemmaClient();
  expect(c).toBeInstanceOf(CloudGemma);
});
