import { Stack } from "expo-router";
import { useEffect } from "react";

import "../global.css";
import { registerOnDeviceCandidate } from "../src/services/gemma/GemmaClient";
import { OnDeviceGemma, probeOnDeviceAvailable } from "../src/services/gemma/OnDeviceGemma";

export default function RootLayout() {
  useEffect(() => {
    registerOnDeviceCandidate(() => new OnDeviceGemma(), probeOnDeviceAvailable);
  }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}
