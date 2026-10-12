import { createContext, useContext, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  type CellRendererProps,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import type { Card } from "../../shared/cardbox";
import { CardFace } from "./card-face";
import { useCardboxStyles } from "./styles";

const HEIGHT = 86;
const DraggingCard = createContext<string | null>(null);
function SortCell({
  children,
  style,
  onLayout,
  item,
}: CellRendererProps<Card>) {
  const dragging = useContext(DraggingCard);
  return (
    <View
      onLayout={onLayout}
      style={[style, { zIndex: dragging === item.id ? 100 : 0 }]}
    >
      {children}
    </View>
  );
}
function SortRow({
  card,
  index,
  count,
  busy,
  onMove,
  onDragging,
  hideImages,
}: {
  card: Card;
  index: number;
  count: number;
  busy: boolean;
  onMove: (id: string, target: number) => void;
  onDragging: (value: string | null) => void;
  hideImages: boolean;
}) {
  const { styles } = useCardboxStyles();
  const offset = useSharedValue(0);
  const active = useSharedValue(false);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!busy)
        .activateAfterLongPress(300)
        .onStart(() => {
          active.value = true;
          runOnJS(onDragging)(card.id);
        })
        .onUpdate((event) => {
          offset.value = Math.max(
            -index * HEIGHT,
            Math.min((count - 1 - index) * HEIGHT, event.translationY),
          );
        })
        .onEnd(() => {
          runOnJS(onMove)(
            card.id,
            Math.max(
              0,
              Math.min(count - 1, index + Math.round(offset.value / HEIGHT)),
            ),
          );
        })
        .onFinalize(() => {
          offset.value = 0;
          active.value = false;
          runOnJS(onDragging)(null);
        }),
    [busy, index, count, offset, active, onMove, onDragging, card.id],
  );
  const animation = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    zIndex: active.value ? 100 : 0,
    elevation: active.value ? 8 : 0,
    opacity: active.value ? 0.9 : 1,
  }));
  return (
    <Animated.View style={[{ height: HEIGHT, paddingBottom: 10 }, animation]}>
      <View style={[styles.sortRow, { flex: 1 }]}>
        <GestureDetector gesture={pan}>
          <View accessibilityLabel={`拖动${card.name}`} style={{ padding: 8 }}>
            <Text style={styles.muted}>☰</Text>
          </View>
        </GestureDetector>
        <Text style={styles.position}>{index + 1}</Text>
        <View style={{ width: 52 }}>
          <CardFace card={card} compact hideImage={hideImages} />
        </View>
        <Text style={[styles.gridName, styles.grow]} numberOfLines={2}>
          {card.name}
        </Text>
        <Pressable
          disabled={busy || index === 0}
          accessibilityLabel={`上移${card.name}`}
          style={styles.iconButton}
          onPress={() => onMove(card.id, index - 1)}
        >
          <Text style={styles.outlineText}>↑</Text>
        </Pressable>
        <Pressable
          disabled={busy || index === count - 1}
          accessibilityLabel={`下移${card.name}`}
          style={styles.iconButton}
          onPress={() => onMove(card.id, index + 1)}
        >
          <Text style={styles.outlineText}>↓</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
export function CardSort({
  cards,
  busy,
  onMove,
  hideImages,
}: {
  cards: Card[];
  busy: boolean;
  onMove: (id: string, target: number) => void;
  hideImages: boolean;
}) {
  const { styles } = useCardboxStyles();
  const [dragging, setDragging] = useState<string | null>(null);
  return (
    <DraggingCard.Provider value={dragging}>
      <FlatList
        CellRendererComponent={SortCell}
        data={cards}
        keyExtractor={(card) => card.id}
        contentContainerStyle={styles.content}
        initialNumToRender={10}
        windowSize={5}
        scrollEnabled={!dragging}
        removeClippedSubviews={!dragging}
        ListHeaderComponent={
          <Text style={[styles.muted, { marginBottom: 18 }]}>
            长按拖动把手或点击箭头调整顺序，移动结束后自动保存。
          </Text>
        }
        renderItem={({ item, index }) => (
          <SortRow
            card={item}
            index={index}
            count={cards.length}
            busy={busy}
            onMove={onMove}
            onDragging={setDragging}
            hideImages={hideImages}
          />
        )}
      />
    </DraggingCard.Provider>
  );
}
