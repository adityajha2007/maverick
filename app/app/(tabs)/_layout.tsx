import { Tabs } from "expo-router";
import { Text, View } from "react-native";

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <View className="items-center pt-1">
      <Text
        className={`text-lg ${focused ? "text-clinical-primary" : "text-clinical-muted"}`}
      >
        {icon}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#C3C5D9",
          borderTopWidth: 0.5,
          paddingBottom: 4,
          height: 56,
        },
        tabBarActiveTintColor: "#0043C8",
        tabBarInactiveTintColor: "#737688",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon icon="⌂" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: "Timeline",
          tabBarIcon: ({ focused }) => <TabIcon icon="◷" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: "Records",
          tabBarIcon: ({ focused }) => <TabIcon icon="▤" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon icon="○" focused={focused} />,
        }}
      />
      {/* Hide legacy tab files from navigation */}
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="noticed" options={{ href: null }} />
      <Tabs.Screen name="inbox" options={{ href: null }} />
    </Tabs>
  );
}
