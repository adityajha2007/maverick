import Constants from "expo-constants";

const devHost =
  Constants.expoConfig?.hostUri?.split(":")[0] ??
  Constants.manifest2?.extra?.expoGo?.debuggerHost?.split(":")[0] ??
  "192.168.124.137";

export const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ?? `http://${devHost}:8000`;
