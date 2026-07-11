import { Pressable, Text, View } from "react-native";
import type { Flag } from "../types";

export function FlagCard({
  flag,
  onAck,
  onDismiss,
}: {
  flag: Flag;
  onAck: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const isUrgent = flag.confidence === "grounded";

  return (
    <View
      className={`mx-4 mb-3 rounded-xl border p-4 ${
        isUrgent
          ? "border-clinical-error/30 bg-clinical-error-bg"
          : "border-clinical-outline-var bg-clinical-card"
      }`}
    >
      <View className="flex-row items-start gap-3">
        <View
          className={`mt-0.5 h-8 w-8 items-center justify-center rounded-full ${
            isUrgent ? "bg-clinical-error/10" : "bg-clinical-processing/10"
          }`}
        >
          <Text className="text-sm">{isUrgent ? "⚠" : "ℹ"}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-clinical-fg">{flag.subject}</Text>
          <Text className="mt-1 text-sm text-clinical-muted">{flag.reasoning}</Text>
          <View className="mt-2 flex-row items-center gap-2">
            <View
              className={`rounded px-2 py-0.5 ${
                isUrgent ? "bg-clinical-error/10" : "bg-clinical-processing/10"
              }`}
            >
              <Text
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isUrgent ? "text-clinical-error" : "text-clinical-processing"
                }`}
              >
                {flag.confidence}
              </Text>
            </View>
            <Text className="text-xs text-clinical-muted">via {flag.agent}</Text>
          </View>
        </View>
      </View>

      <View className="mt-3 flex-row gap-2">
        <Pressable
          onPress={() => onAck(flag.id)}
          className="flex-1 items-center rounded-lg border border-clinical-primary py-2"
        >
          <Text className="text-xs font-semibold text-clinical-primary">Acknowledge</Text>
        </Pressable>
        <Pressable
          onPress={() => onDismiss(flag.id)}
          className="flex-1 items-center rounded-lg border border-clinical-outline-var py-2"
        >
          <Text className="text-xs font-semibold text-clinical-muted">Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}
