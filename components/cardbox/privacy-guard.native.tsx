import { useEffect } from "react";
import { Alert } from "react-native";
import * as ScreenCapture from "expo-screen-capture";
export function PrivacyGuard() {
  useEffect(() => {
    void ScreenCapture.preventScreenCaptureAsync("cardbox").catch(() =>
      Alert.alert(
        "屏幕保护未启用",
        "此设备暂未启用截图保护，请注意屏幕中的敏感信息。",
      ),
    );
    return () => {
      void ScreenCapture.allowScreenCaptureAsync("cardbox").catch(
        () => undefined,
      );
    };
  }, []);
  return null;
}
