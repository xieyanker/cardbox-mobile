import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import {
  NativePasswordBridge,
  PASSWORD_SERVICE_HTML,
  PASSWORD_SERVICE_ORIGIN,
  registerPasswordDeriver,
  isPasswordServiceUrl,
} from "../../lib/cardbox-native-kdf";

/** Invisible, offline WebCrypto worker using the system WebView's native crypto. */
export function PasswordService() {
  const view = useRef<WebView>(null);
  const [generation, setGeneration] = useState(0);
  const [bridge] = useState(
    () =>
      new NativePasswordBridge((request) => {
        if (!view.current) throw new Error("Password worker unavailable");
        view.current.injectJavaScript(
          `window.cardboxDerive(${JSON.stringify(request)});true;`,
        );
      }),
  );
  useEffect(() => {
    bridge.activate();
    const unregister = registerPasswordDeriver(bridge.derive);
    setGeneration((value) => value + 1);
    return () => {
      unregister();
      bridge.fail();
    };
  }, [bridge]);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        opacity: 0,
        overflow: "hidden",
      }}
    >
      <WebView
        key={generation}
        ref={view}
        source={{
          html: PASSWORD_SERVICE_HTML,
          baseUrl: PASSWORD_SERVICE_ORIGIN,
        }}
        originWhitelist={["https://cardbox.invalid"]}
        onShouldStartLoadWithRequest={({ url }) => isPasswordServiceUrl(url)}
        onMessage={({ nativeEvent }) => {
          if (isPasswordServiceUrl(nativeEvent.url))
            bridge.receive(nativeEvent.data);
        }}
        onError={() => bridge.fail()}
        onContentProcessDidTerminate={() => bridge.fail()}
        onRenderProcessGone={() => {
          bridge.fail();
        }}
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        incognito
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        javaScriptCanOpenWindowsAutomatically={false}
        webviewDebuggingEnabled={false}
        scrollEnabled={false}
      />
    </View>
  );
}
