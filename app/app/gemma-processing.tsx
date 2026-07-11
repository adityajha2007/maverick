import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

type StepState = "pending" | "active" | "done";

interface Step {
  label: string;
  icon: string;
  state: StepState;
}

const STEP_LABELS = [
  { label: "Parsing Audio", icon: "🎙" },
  { label: "Identifying Clinical Intent", icon: "🔍" },
  { label: "Mapping to Health DNA", icon: "🧬" },
  { label: "Updating Memory", icon: "💾" },
];

function StepRow({ step }: { step: Step }) {
  return (
    <View
      className={`flex-row items-center gap-4 py-3 ${
        step.state === "pending" ? "opacity-40" : ""
      }`}
    >
      <View
        className={`h-8 w-8 items-center justify-center rounded-full border ${
          step.state === "done"
            ? "border-clinical-secondary bg-clinical-secondary/10"
            : step.state === "active"
              ? "border-clinical-primary bg-clinical-primary/10"
              : "border-clinical-outline-var bg-clinical-surface-mid"
        }`}
      >
        <Text className="text-sm">
          {step.state === "done" ? "✓" : step.state === "active" ? "⏳" : "○"}
        </Text>
      </View>
      <Text
        className={`flex-1 text-sm ${
          step.state === "active"
            ? "font-bold text-clinical-primary"
            : step.state === "done"
              ? "text-clinical-fg"
              : "text-clinical-muted"
        }`}
      >
        {step.label}
      </Text>
    </View>
  );
}

export default function GemmaProcessing() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= STEP_LABELS.length) {
          clearInterval(interval);
          setComplete(true);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const steps: Step[] = STEP_LABELS.map((s, i) => ({
    ...s,
    state: i < currentStep ? "done" : i === currentStep ? "active" : "pending",
  }));

  const progress = Math.min((currentStep / STEP_LABELS.length) * 100, 100);

  return (
    <View className="flex-1 items-center justify-center bg-clinical-surface px-6">
      {/* AI Icon */}
      <View
        className={`mb-6 h-20 w-20 items-center justify-center rounded-full ${
          complete ? "bg-clinical-secondary/10" : "bg-clinical-primary/10"
        }`}
      >
        <Text className="text-4xl">{complete ? "✅" : "🤖"}</Text>
      </View>

      {/* Headline */}
      <Text
        className={`text-2xl font-bold ${
          complete ? "text-clinical-secondary" : "text-clinical-fg"
        }`}
      >
        {complete ? "Memory Updated" : "Processing Memory"}
      </Text>
      <Text className="mt-2 text-center text-sm text-clinical-muted">
        {complete
          ? "Doctor record has been successfully saved."
          : "Gemma is analyzing your visit data on-device."}
      </Text>

      {/* Steps */}
      <View className="mt-8 w-full rounded-xl border border-clinical-outline-var bg-clinical-card p-5">
        {steps.map((step, i) => (
          <StepRow key={i} step={step} />
        ))}
        {/* Progress bar */}
        <View className="mt-4 h-1 w-full rounded-full bg-clinical-surface-mid">
          <View
            className={`h-1 rounded-full ${
              complete ? "bg-clinical-secondary" : "bg-clinical-primary"
            }`}
            style={{ width: `${progress}%` }}
          />
        </View>
      </View>

      {/* Privacy Badge */}
      {complete && (
        <View className="mt-6 w-full rounded-xl border border-clinical-outline-var bg-clinical-surface-low p-4">
          <View className="flex-row items-start gap-3">
            <Text className="text-base">🔒</Text>
            <View className="flex-1">
              <Text className="text-[11px] font-bold uppercase tracking-widest text-clinical-fg">
                ENCRYPTED & STORED ON-DEVICE
              </Text>
              <Text className="mt-0.5 text-xs text-clinical-muted">
                No data has left your hardware.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Actions */}
      {complete && (
        <View className="mt-8 w-full gap-3">
          <Pressable
            onPress={() => router.push("/(tabs)/timeline")}
            className="w-full items-center rounded-xl bg-clinical-primary py-3.5"
          >
            <Text className="text-sm font-bold text-white">View Timeline</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)")}
            className="w-full items-center rounded-xl border border-clinical-primary/20 py-3.5"
          >
            <Text className="text-sm font-bold text-clinical-primary">Back to Home</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
