import { Text, View } from "react-native";
import type { ConfidenceLevel } from "../types";

const BADGE_STYLES: Record<ConfidenceLevel, { bg: string; text: string; label: string }> = {
  grounded: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Grounded" },
  uncertain: { bg: "bg-amber-100", text: "text-amber-700", label: "Uncertain" },
  defer: { bg: "bg-red-100", text: "text-red-700", label: "Defer to Doctor" },
};

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const s = BADGE_STYLES[level];
  return (
    <View className={`flex-row items-center gap-1 rounded px-2 py-0.5 ${s.bg}`}>
      <Text className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}>
        {s.label}
      </Text>
    </View>
  );
}
