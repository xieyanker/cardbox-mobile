import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import type { Card } from "../../shared/cardbox";
import {
  createSortDragController,
  SORT_ROW_HEIGHT,
  type SortDragSnapshot,
} from "../../lib/cardbox-sort-drag";
import { CardFace } from "./card-face";
import { useCardboxStyles } from "./styles";

const PADDING = 22;
const TOP_PADDING = 14;
const HANDLE_LEFT = PADDING + 12;
const HANDLE_WIDTH = 40;

function SortRow({
  card,
  index,
  count,
  busy,
  onMove,
  hideImages,
  floating = false,
}: {
  card: Card;
  index: number;
  count: number;
  busy: boolean;
  onMove: (id: string, target: number) => void;
  hideImages: boolean;
  floating?: boolean;
}) {
  const { styles } = useCardboxStyles();
  return (
    <View style={{ height: SORT_ROW_HEIGHT, paddingBottom: 10 }}>
      <View style={[styles.sortRow, { flex: 1 }]}>
        <View
          accessibilityLabel={floating ? undefined : `拖动${card.name}`}
          style={{
            width: HANDLE_WIDTH,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            ...(Platform.OS === "web" ? { touchAction: "none" as const } : {}),
          }}
        >
          <Text style={styles.muted}>☰</Text>
        </View>
        <Text style={styles.position}>{index + 1}</Text>
        <View style={{ width: 52 }}>
          <CardFace card={card} compact hideImage={hideImages} />
        </View>
        <Text style={[styles.gridName, styles.grow]} numberOfLines={2}>
          {card.name}
        </Text>
        {([-1, 1] as const).map((direction) => (
          <Pressable
            key={direction}
            disabled={
              busy || index + direction < 0 || index + direction >= count
            }
            accessibilityLabel={
              floating
                ? undefined
                : `${direction < 0 ? "上移" : "下移"}${card.name}`
            }
            style={styles.iconButton}
            onPress={() => onMove(card.id, index + direction)}
          >
            <Text style={styles.outlineText}>{direction < 0 ? "↑" : "↓"}</Text>
          </Pressable>
        ))}
      </View>
    </View>
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
  const { styles, colors } = useCardboxStyles();
  const list = useRef<FlatList<Card>>(null);
  const viewport = useRef<View>(null);
  const layout = useRef({
    x: 0,
    y: 0,
    height: 0,
    contentHeight: 0,
    headerHeight: 0,
    offset: 0,
  });
  const candidate = useRef<{ index: number; pointerY: number } | null>(null);
  const live = useRef({ cards, onMove, busy });
  live.current = { cards, onMove, busy };
  const mounted = useRef(true);
  const [dragging, setDragging] = useState<{
    card: Card;
    target: number;
  } | null>(null);
  const top = useSharedValue(0);
  const controller = useMemo(
    () =>
      createSortDragController({
        requestFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (handle) => cancelAnimationFrame(handle),
        scrollTo: (offset) => {
          layout.current.offset = offset;
          list.current?.scrollToOffset({ offset, animated: false });
        },
        onUpdate: (snapshot: SortDragSnapshot | null) => {
          if (!mounted.current) return;
          if (!snapshot) {
            setDragging(null);
            return;
          }
          top.value = snapshot.top;
          setDragging((previous) => {
            if (
              previous?.card.id === snapshot.id &&
              previous.target === snapshot.target
            )
              return previous;
            const card = live.current.cards.find(
              (item) => item.id === snapshot.id,
            );
            return card ? { card, target: snapshot.target } : null;
          });
        },
        commit: (id, target) => {
          if (!live.current.busy) live.current.onMove(id, target);
        },
      }),
    [top],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.finish(false);
    };
  }, [controller]);
  useEffect(() => {
    controller.finish(false);
  }, [cards, busy, controller]);

  const measureViewport = useCallback(() => {
    controller.finish(false);
    viewport.current?.measureInWindow((x, y, _width, height) => {
      layout.current = { ...layout.current, x, y, height };
    });
  }, [controller]);
  // The detector is outside virtualized rows so recycling cannot cancel an active drag.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!busy)
        .runOnJS(true)
        .maxPointers(1)
        .activateAfterLongPress(300)
        .shouldCancelWhenOutside(false)
        .onTouchesDown((event, manager) => {
          const touch = event.allTouches[0];
          const current = layout.current;
          if (!touch || event.numberOfTouches !== 1) {
            manager.fail();
            return;
          }
          const x = touch.absoluteX - current.x;
          const y = touch.absoluteY - current.y;
          const contentY =
            y + current.offset - TOP_PADDING - current.headerHeight;
          const index = Math.floor(contentY / SORT_ROW_HEIGHT);
          const withinRow = contentY - index * SORT_ROW_HEIGHT;
          if (
            x < HANDLE_LEFT ||
            x > HANDLE_LEFT + HANDLE_WIDTH ||
            index < 0 ||
            index >= live.current.cards.length ||
            withinRow < 12 ||
            withinRow > 64
          ) {
            candidate.current = null;
            manager.fail();
            return;
          }
          candidate.current = { index, pointerY: y };
        })
        .onStart(() => {
          const start = candidate.current;
          const current = layout.current;
          if (!start || !live.current.cards[start.index]) return;
          controller.begin({
            id: live.current.cards[start.index].id,
            index: start.index,
            count: live.current.cards.length,
            pointerY: start.pointerY,
            rowTop:
              TOP_PADDING +
              current.headerHeight +
              start.index * SORT_ROW_HEIGHT -
              current.offset,
            scrollOffset: current.offset,
            viewportHeight: current.height,
            contentHeight: current.contentHeight,
          });
        })
        .onUpdate((event) =>
          controller.move(event.absoluteY - layout.current.y),
        )
        .onEnd((_event, success) => controller.finish(success))
        .onFinalize(() => {
          candidate.current = null;
          controller.finish(false);
        }),
    [busy, controller],
  );
  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: top.value }],
  }));
  return (
    <GestureDetector gesture={pan} touchAction="pan-y">
      <View
        ref={viewport}
        collapsable={false}
        onLayout={measureViewport}
        style={{ flex: 1, overflow: "hidden" }}
        testID="card-sort-viewport"
      >
        <FlatList
          ref={list}
          data={cards}
          keyExtractor={(card) => card.id}
          contentContainerStyle={[styles.content, { gap: 0 }]}
          initialNumToRender={10}
          windowSize={5}
          scrollEnabled={!dragging}
          scrollEventThrottle={16}
          onScroll={(event) => {
            if (!controller.snapshot())
              layout.current.offset = event.nativeEvent.contentOffset.y;
          }}
          onContentSizeChange={(_width, height) => {
            layout.current.contentHeight = height;
          }}
          getItemLayout={(_data, index) => ({
            length: SORT_ROW_HEIGHT,
            offset:
              TOP_PADDING +
              layout.current.headerHeight +
              index * SORT_ROW_HEIGHT,
            index,
          })}
          ListHeaderComponent={
            <View
              onLayout={(event) => {
                layout.current.headerHeight = event.nativeEvent.layout.height;
              }}
              style={{ paddingBottom: 18 }}
            >
              <Text style={styles.muted}>
                长按把手拖动，靠近上下边缘可自动滚动；松手后保存顺序。也可点击箭头调整。
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={{ opacity: dragging?.card.id === item.id ? 0 : 1 }}>
              {dragging?.target === index && (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: -2,
                    left: 0,
                    right: 0,
                    height: 2,
                    backgroundColor: colors.primary,
                  }}
                />
              )}
              <SortRow
                card={item}
                index={index}
                count={cards.length}
                busy={busy || Boolean(dragging)}
                onMove={onMove}
                hideImages={hideImages}
              />
            </View>
          )}
        />
        {dragging && (
          <Animated.View
            pointerEvents="none"
            accessibilityLabel={`拖动中的${dragging.card.name}`}
            style={[
              {
                position: "absolute",
                left: PADDING,
                right: PADDING,
                top: 0,
                zIndex: 100,
                elevation: 8,
                opacity: 0.95,
              },
              overlayStyle,
            ]}
          >
            <SortRow
              card={dragging.card}
              index={dragging.target}
              count={cards.length}
              busy
              onMove={onMove}
              hideImages={hideImages}
              floating
            />
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}
