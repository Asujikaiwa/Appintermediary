import { useNetInfo } from "@react-native-community/netinfo";
import { View } from "react-native";
import { Banner, Button, Icon, Text } from "react-native-paper";

/** Shared empty / error / offline states (BLUEPRINT.md §5.2 — every screen). */

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
      <Icon source={icon} size={48} />
      <Text variant="titleMedium" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {body ? (
        <Text variant="bodyMedium" style={{ textAlign: "center", opacity: 0.7 }}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button mode="contained-tonal" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

export function ErrorView({
  message = "เกิดข้อผิดพลาด กรุณาลองใหม่",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
      <Icon source="alert-circle-outline" size={48} />
      <Text variant="bodyMedium" style={{ textAlign: "center" }}>
        {message}
      </Text>
      <Button mode="outlined" onPress={onRetry}>
        ลองใหม่
      </Button>
    </View>
  );
}

/** Sticky banner when the device is offline; cached content stays usable. */
export function OfflineBanner() {
  const net = useNetInfo();
  const offline = net.isConnected === false;
  return (
    <Banner visible={offline} icon="wifi-off">
      ออฟไลน์อยู่ — แสดงข้อมูลล่าสุดที่บันทึกไว้ การเปลี่ยนแปลงจะซิงก์เมื่อกลับมาออนไลน์
    </Banner>
  );
}
