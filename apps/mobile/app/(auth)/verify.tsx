import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button, HelperText, Text, TextInput } from "react-native-paper";

import { requestOtp, verifyOtp } from "@/features/auth/api";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

/**
 * Screen 6 — OTP verify: 6 digits + resend timer.
 * On success supabase fires SIGNED_IN → the Stack.Protected guard in
 * app/_layout swaps (auth) out for (tabs) automatically; no manual redirect.
 */
export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (token: string) => {
    if (!phone) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyOtp(phone, token);
      // SIGNED_IN event flips the route guard; nothing else to do here
    } catch {
      setError("รหัสไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่");
      setCode("");
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (!phone) return;
    setCooldown(RESEND_COOLDOWN_S);
    setError(null);
    try {
      await requestOtp(phone);
    } catch {
      setError("ส่งรหัสใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 16 }}>
        <Text variant="titleMedium">กรอกรหัส {OTP_LENGTH} หลัก</Text>
        <Text variant="bodyMedium">ส่งไปที่ {phone}</Text>
        <View>
          <TextInput
            mode="outlined"
            label="รหัส OTP"
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={OTP_LENGTH}
            value={code}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, "");
              setCode(digits);
              if (digits.length === OTP_LENGTH) void submit(digits);
            }}
            error={error != null}
            disabled={verifying}
            testID="otp-input"
          />
          <HelperText type="error" visible={error != null}>
            {error ?? " "}
          </HelperText>
        </View>
        <Button
          mode="contained"
          onPress={() => void submit(code)}
          loading={verifying}
          disabled={verifying || code.length !== OTP_LENGTH}
          testID="verify-otp"
        >
          ยืนยัน
        </Button>
        <Button mode="text" onPress={() => void resend()} disabled={cooldown > 0}>
          {cooldown > 0 ? `ส่งรหัสใหม่ได้ในอีก ${cooldown} วิ` : "ส่งรหัสใหม่"}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
