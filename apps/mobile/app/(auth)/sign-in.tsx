import { normalizeThaiPhone } from "@yodkai/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Button, HelperText, Text, TextInput } from "react-native-paper";

import { requestOtp } from "@/features/auth/api";

/**
 * Screen 5 — Sign-in with Thai phone number + OTP.
 * Google / Sign in with Apple arrive with the store-prep step.
 */
export default function SignInScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const e164 = normalizeThaiPhone(phone);
    if (!e164) {
      setError("กรุณากรอกเบอร์มือถือไทยให้ถูกต้อง เช่น 0812345678");
      return;
    }
    setError(null);
    setSending(true);
    try {
      await requestOtp(e164);
      router.push({ pathname: "/verify", params: { phone: e164 } });
    } catch {
      setError("ส่งรหัส OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 16 }}>
        <Text variant="headlineMedium">Yodkai</Text>
        <Text variant="bodyMedium">
          กรอกเบอร์มือถือ ระบบจะส่งรหัส OTP ทาง SMS เพื่อเข้าสู่ระบบ
        </Text>
        <View>
          <TextInput
            mode="outlined"
            label="เบอร์มือถือ"
            placeholder="0812345678"
            keyboardType="phone-pad"
            autoComplete="tel"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              if (error) setError(null);
            }}
            error={error != null}
            testID="phone-input"
          />
          <HelperText type="error" visible={error != null}>
            {error ?? " "}
          </HelperText>
        </View>
        <Button
          mode="contained"
          onPress={submit}
          loading={sending}
          disabled={sending || phone.trim().length === 0}
          testID="send-otp"
        >
          ส่งรหัส OTP
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
