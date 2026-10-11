import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  Pressable as GesturePressable,
} from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  clamp,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import {
  BROWSE_MODES,
  type AnimatedBrowseMode,
  type BrowseMode,
} from "../../shared/cardbox-browse";
import type { Card } from "../../shared/cardbox";
import { CardFace } from "./card-face";
import { useCardboxStyles } from "./styles";

export function BrowseModePicker({
  mode,
  disabled,
  onChange,
}: {
  mode: BrowseMode;
  disabled: boolean;
  onChange: (mode: BrowseMode) => void;
}) {
  const { colors } = useCardboxStyles();
  return (
    <View
      style={[
        local.modes,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {(Object.keys(BROWSE_MODES) as BrowseMode[]).map((value) => (
        <Pressable
          key={value}
          accessibilityRole="radio"
          accessibilityLabel={`${BROWSE_MODES[value]}模式`}
          accessibilityState={{ selected: mode === value, disabled }}
          disabled={disabled}
          onPress={() => onChange(value)}
          style={[
            local.mode,
            mode === value && { backgroundColor: colors.primary },
          ]}
        >
          <Text
            style={{
              color: mode === value ? colors.background : colors.muted,
              fontSize: 13,
              fontWeight: mode === value ? "700" : "500",
            }}
          >
            {BROWSE_MODES[value]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const spring = {
  damping: 24,
  stiffness: 210,
  mass: 0.85,
  overshootClamping: true,
};

function BrowserCard({
  card,
  index,
  selected,
  position,
  mode,
  height,
  top,
  disabled,
  onSelect,
  onOpen,
  pan,
}: {
  card: Card;
  index: number;
  selected: boolean;
  position: SharedValue<number>;
  mode: AnimatedBrowseMode;
  height: number;
  top: number;
  disabled: boolean;
  onSelect: () => void;
  onOpen: () => void;
  pan: ReturnType<typeof Gesture.Pan>;
}) {
  const animated = useAnimatedStyle(() => {
    const distance = index - position.value;
    const absolute = Math.abs(distance);
    let translateY: number,
      scale: number,
      opacity = 1,
      rotation = 0;
    let zIndex = 100 - Math.round(absolute * 10);
    if (mode === "focus") {
      translateY = distance * (height + 26);
      scale = interpolate(
        absolute,
        [0, 1, 2],
        [1, 0.88, 0.76],
        Extrapolation.CLAMP,
      );
      opacity = interpolate(
        absolute,
        [0, 1, 2],
        [1, 0.6, 0.18],
        Extrapolation.CLAMP,
      );
    } else if (mode === "stack") {
      translateY =
        distance >= 0 ? -Math.min(distance, 3) * 22 : distance * (height + 45);
      scale = distance >= 0 ? 1 - Math.min(distance, 3) * 0.065 : 1;
      opacity = distance >= 0 ? 1 : clamp(1 + distance, 0, 1);
      rotation = distance >= 0 ? Math.min(distance, 3) * 2.4 : distance * -5;
    } else {
      translateY =
        distance <= 0
          ? distance * 42
          : interpolate(
              distance,
              [0, 1, 2, 3],
              [0, height + 18, height + 60, height + 102],
              Extrapolation.EXTEND,
            );
      scale = interpolate(absolute, [0, 1], [1, 0.95], Extrapolation.CLAMP);
      zIndex = index + 10;
    }
    return {
      opacity,
      zIndex,
      transform: [{ translateY }, { scale }, { rotateZ: `${rotation}deg` }],
    };
  });
  return (
    <Animated.View style={[local.card, { top }, animated]}>
      <GesturePressable
        requireExternalGestureToFail={pan}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled }}
        accessibilityLabel={
          selected ? `查看${card.name}详情` : `选择${card.name}`
        }
        disabled={disabled}
        onPress={selected ? onOpen : onSelect}
      >
        <CardFace card={card} />
      </GesturePressable>
    </Animated.View>
  );
}

/** Only seven neighboring cards are mounted. Gestures and transforms run on the native UI thread. */
export function CardBrowser({
  cards,
  selectedIndex,
  mode,
  disabled,
  onSelect,
  onOpen,
}: {
  cards: Card[];
  selectedIndex: number;
  mode: AnimatedBrowseMode;
  disabled: boolean;
  onSelect: (id: string) => void;
  onOpen: () => void;
}) {
  const { colors, styles } = useCardboxStyles();
  const [size, setSize] = useState({ width: 320, height: 380 });
  const position = useSharedValue(selectedIndex);
  const start = useSharedValue(selectedIndex);
  const cardHeight = size.width / 1.586;
  const step = Math.max(110, cardHeight * 0.65);
  useEffect(() => {
    position.value = withSpring(selectedIndex, spring);
  }, [selectedIndex, position]);
  const select = useCallback(
    (index: number) => {
      if (!disabled && cards[index]) onSelect(cards[index].id);
    },
    [cards, disabled, onSelect],
  );
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled && cards.length > 1)
        .activeOffsetY([-10, 10])
        .failOffsetX([-28, 28])
        .onStart(() => {
          cancelAnimation(position);
          start.value = position.value;
        })
        .onUpdate((event) => {
          position.value = clamp(
            start.value - event.translationY / step,
            Math.max(0, selectedIndex - 1),
            Math.min(cards.length - 1, selectedIndex + 1),
          );
        })
        .onEnd((event) => {
          const target = clamp(
            Math.round(position.value - event.velocityY / 1500),
            Math.max(0, selectedIndex - 1),
            Math.min(cards.length - 1, selectedIndex + 1),
          );
          position.value = withSpring(target, spring);
          runOnJS(select)(target);
        })
        .onFinalize((_event, success) => {
          if (!success) position.value = withSpring(selectedIndex, spring);
        }),
    [cards.length, disabled, position, selectedIndex, select, start, step],
  );
  const first = Math.max(0, selectedIndex - 3);
  const last = Math.min(cards.length, selectedIndex + 4);
  const top = Math.max(
    75,
    (size.height - cardHeight) / 2 +
      (mode === "stack" ? 22 : mode === "wallet" ? -35 : 0),
  );
  return (
    <View style={local.browser}>
      <Text style={[styles.muted, local.hint]}>
        上下滑动切换 · 点击卡片查看详情
      </Text>
      <GestureDetector gesture={gesture}>
        <View
          style={local.viewport}
          collapsable={false}
          testID={`card-browser-${mode}`}
          onLayout={({ nativeEvent: { layout } }) => {
            if (layout.width !== size.width || layout.height !== size.height)
              setSize({ width: layout.width, height: layout.height });
          }}
        >
          {cards.slice(first, last).map((card, offset) => (
            <BrowserCard
              key={card.id}
              card={card}
              index={first + offset}
              selected={first + offset === selectedIndex}
              position={position}
              mode={mode}
              pan={gesture}
              height={cardHeight}
              top={top}
              disabled={disabled}
              onSelect={() => select(first + offset)}
              onOpen={onOpen}
            />
          ))}
          {mode === "wallet" && (
            <View
              pointerEvents="none"
              style={[
                local.pocket,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View
                style={[local.stitch, { backgroundColor: colors.border }]}
              />
            </View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

const local = StyleSheet.create({
  modes: {
    flexDirection: "row",
    marginHorizontal: 22,
    marginTop: 4,
    marginBottom: 8,
    padding: 4,
    borderWidth: 1,
    borderRadius: 14,
    gap: 4,
  },
  mode: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  browser: { flex: 1, paddingHorizontal: 22, minHeight: 260 },
  hint: { textAlign: "center", paddingTop: 6, paddingBottom: 10 },
  viewport: { flex: 1, overflow: "hidden" },
  card: {
    position: "absolute",
    left: 0,
    right: 0,
    shadowColor: "#10263F",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
  },
  pocket: {
    position: "absolute",
    bottom: -22,
    left: -6,
    right: -6,
    height: 55,
    borderWidth: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    zIndex: 2000,
  },
  stitch: { height: 1, marginHorizontal: 16, marginTop: 12, opacity: 0.65 },
});
