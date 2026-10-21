import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { captureRef } from "react-native-view-shot";
import {
  CARD_RATIO,
  cropGeometry,
  type CropSource,
} from "../../shared/cardbox-crop";
import { useCardboxStyles } from "./styles";

type Props = {
  source: CropSource;
  onConfirm: (uri: string) => Promise<void> | void;
  onCancel: () => void;
  onChoose: () => void;
  onError: (message: string) => void;
};
export function CardImageEditor({
  source,
  onConfirm,
  onCancel,
  onChoose,
  onError,
}: Props) {
  const { styles } = useCardboxStyles();
  const [image, setImage] = useState(source);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
  const [width, setWidth] = useState(280);
  const [mask, setMask] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => setLoaded(false), [image.uri]);
  const shot = useRef<View>(null);
  const panStart = useRef(center);
  const maskStart = useRef(mask);
  const geometry = cropGeometry(
    image.width,
    image.height,
    zoom,
    center.x,
    center.y,
  );
  const scale = width / geometry.width;
  const height = width / CARD_RATIO;
  // Keep responder identity stable for the entire touch, including state updates.
  const live = useRef({ busy, center, mask, scale, image, width, height });
  live.current = { busy, center, mask, scale, image, width, height };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !live.current.busy,
        onPanResponderGrant: () => {
          panStart.current = live.current.center;
          setDragging(true);
        },
        onPanResponderMove: (_, gesture) => {
          const current = live.current;
          setCenter({
            x: Math.max(
              0,
              Math.min(
                1,
                panStart.current.x -
                  gesture.dx / current.scale / current.image.width,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                1,
                panStart.current.y -
                  gesture.dy / current.scale / current.image.height,
              ),
            ),
          });
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: () => setDragging(false),
        onPanResponderTerminate: () => setDragging(false),
      }),
    [],
  );
  const maskPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !live.current.busy,
        onPanResponderGrant: () => {
          maskStart.current = live.current.mask;
          setDragging(true);
        },
        onPanResponderMove: (_, gesture) => {
          const start = maskStart.current;
          if (start)
            setMask({
              ...start,
              x: Math.max(
                0,
                Math.min(
                  1 - start.width,
                  start.x + gesture.dx / live.current.width,
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  1 - start.height,
                  start.y + gesture.dy / live.current.height,
                ),
              ),
            });
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: () => setDragging(false),
        onPanResponderTerminate: () => setDragging(false),
      }),
    [],
  );
  async function rotate() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await ImageManipulator.manipulateAsync(
        image.uri,
        [{ rotate: 90 }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 },
      );
      setImage({ uri: next.uri, width: next.width, height: next.height });
      setCenter({ x: 0.5, y: 0.5 });
      setZoom(1);
    } catch {
      onError("旋转失败，请重新选择图片。");
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      let uri: string;
      if (Platform.OS === "web") {
        const element = document.createElement("img");
        element.src = image.uri;
        await element.decode();
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(1200, geometry.width);
        canvas.height = Math.round(canvas.width / CARD_RATIO);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("图片处理不可用。");
        context.drawImage(
          element,
          geometry.originX,
          geometry.originY,
          geometry.width,
          geometry.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        if (mask) {
          context.fillStyle = "#141820";
          context.fillRect(
            mask.x * canvas.width,
            mask.y * canvas.height,
            mask.width * canvas.width,
            mask.height * canvas.height,
          );
        }
        uri = canvas.toDataURL("image/jpeg", 0.85);
      } else if (mask) {
        // Capture only the crop surface; the opaque band becomes pixels in the saved image.
        uri = await captureRef(shot, {
          format: "jpg",
          quality: 0.9,
          result: "tmpfile",
          width: 1200,
          height: Math.round(1200 / CARD_RATIO),
        });
      } else {
        const next = await ImageManipulator.manipulateAsync(
          image.uri,
          [
            { crop: geometry },
            ...(geometry.width > 1200 ? [{ resize: { width: 1200 } }] : []),
          ],
          { format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 },
        );
        uri = next.uri;
      }
      await onConfirm(uri);
    } catch (error) {
      onError(error instanceof Error ? error.message : "卡面处理失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.sheetBackdrop}>
      <ScrollView
        style={{ flexGrow: 0, maxHeight: "100%" }}
        contentContainerStyle={styles.sheet}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!dragging}
      >
        <Text style={styles.title}>确认使用卡面</Text>
        <Text style={styles.muted}>
          拖动图片调整裁剪位置；遮挡条可拖动，会写入新生成的卡面图片。
        </Text>
        <View
          ref={shot}
          testID="card-image-crop-surface"
          collapsable={false}
          {...pan.panHandlers}
          onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
          style={{
            width: "100%",
            aspectRatio: CARD_RATIO,
            overflow: "hidden",
            backgroundColor: "#141820",
            ...(Platform.OS === "web" ? { touchAction: "none" as const } : {}),
          }}
        >
          <Image
            source={{ uri: image.uri }}
            resizeMode="stretch"
            onLoad={() => setLoaded(true)}
            onError={() => onError("图片无法读取，请重新选择。")}
            style={{
              position: "absolute",
              width: image.width * scale,
              height: image.height * scale,
              left: -geometry.originX * scale,
              top: -geometry.originY * scale,
            }}
            accessibilityLabel="卡面裁剪预览"
          />
          {mask && (
            <View
              {...maskPan.panHandlers}
              accessibilityLabel="照片遮挡条"
              style={{
                position: "absolute",
                left: mask.x * width,
                top: mask.y * height,
                width: mask.width * width,
                height: mask.height * height,
                backgroundColor: "#141820",
              }}
            />
          )}
        </View>
        <View style={styles.row}>
          <Pressable
            accessibilityLabel="缩小卡面"
            disabled={busy || zoom <= 1}
            style={styles.outline}
            onPress={() => setZoom(Math.max(1, zoom - 0.25))}
          >
            <Text style={styles.outlineText}>缩小</Text>
          </Pressable>
          <Text style={styles.muted}>{zoom.toFixed(2)}×</Text>
          <Pressable
            accessibilityLabel="放大卡面"
            disabled={busy || zoom >= 4}
            style={styles.outline}
            onPress={() => setZoom(Math.min(4, zoom + 0.25))}
          >
            <Text style={styles.outlineText}>放大</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="旋转卡面"
            disabled={busy}
            style={styles.outline}
            onPress={() => void rotate()}
          >
            <Text style={styles.outlineText}>旋转</Text>
          </Pressable>
        </View>
        <Pressable
          disabled={busy}
          accessibilityLabel={mask ? "移除遮挡条" : "添加遮挡条"}
          style={styles.outline}
          onPress={() =>
            setMask(
              mask ? null : { x: 0.05, y: 0.55, width: 0.9, height: 0.18 },
            )
          }
        >
          <Text style={styles.outlineText}>
            {mask ? "移除遮挡条" : "添加遮挡条"}
          </Text>
        </Pressable>
        {mask && (
          <View style={styles.row}>
            <Pressable
              disabled={busy}
              style={styles.outline}
              onPress={() =>
                setMask({ ...mask, height: Math.max(0.08, mask.height - 0.05) })
              }
            >
              <Text style={styles.outlineText}>遮挡变薄</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              style={styles.outline}
              onPress={() => {
                const next = Math.min(0.6, mask.height + 0.05);
                setMask({
                  ...mask,
                  height: next,
                  y: Math.min(mask.y, 1 - next),
                });
              }}
            >
              <Text style={styles.outlineText}>遮挡加厚</Text>
            </Pressable>
          </View>
        )}
        <Pressable
          disabled={busy || !loaded}
          style={styles.primary}
          onPress={() => void confirm()}
        >
          <Text style={styles.primaryText}>
            {busy ? "正在处理…" : loaded ? "确认使用" : "正在读取图片…"}
          </Text>
        </Pressable>
        <Pressable disabled={busy} style={styles.outline} onPress={onChoose}>
          <Text style={styles.outlineText}>重新选择</Text>
        </Pressable>
        <Pressable disabled={busy} style={styles.iconButton} onPress={onCancel}>
          <Text style={styles.muted}>取消</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
