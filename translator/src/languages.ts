// BCP-47 language tags for Gemini Live's speechConfig.
// Kept intentionally short — Indian languages plus English for the doctor.
export interface LangOption {
  code: string;
  label: string;
}

export const LANGUAGES: LangOption[] = [
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "mr-IN", label: "Marathi" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ur-IN", label: "Urdu" },
  { code: "en-US", label: "English" },
];

export function labelOf(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
