import { Stack } from "expo-router";

/** Auth flow: phone entry → OTP verify (BLUEPRINT.md §5.2 screens 5–6). */
export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen name="sign-in" options={{ title: "เข้าสู่ระบบ" }} />
      <Stack.Screen name="verify" options={{ title: "ยืนยันรหัส OTP" }} />
    </Stack>
  );
}
