import { Text, View } from "react-native";

export function ChatBubble({ text, mine }: { text: string; mine: boolean }) {
  return (
    <View
      className={`mb-2 max-w-[85%] rounded-xl px-4 py-3 ${
        mine
          ? "ml-12 self-end rounded-br-md bg-clinical-primary"
          : "mr-12 self-start rounded-bl-md border border-clinical-outline-var bg-clinical-card"
      }`}
    >
      <Text className={`text-sm ${mine ? "text-white" : "text-clinical-fg"}`}>
        {text}
      </Text>
    </View>
  );
}
