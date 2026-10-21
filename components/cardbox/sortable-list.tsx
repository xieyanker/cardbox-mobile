import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FlatList, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import {
  createSortDragController,
  SORT_ROW_HEIGHT,
  type SortDragSnapshot,
} from "../../lib/cardbox-sort-drag";
import { useCardboxStyles } from "./styles";

const PADDING = 22;
const TOP_PADDING = 14;
const CONTROLS_WIDTH = 88;

// The detector and preview live outside virtualized rows, so recycling cannot end a drag.
export function SortableList<T extends { id: string; name: string }>({
  items,
  busy,
  onMove,
  renderRow,
  description,
  testID,
  footer,
}: {
  items: T[];
  busy: boolean;
  onMove: (id: string, target: number) => void;
  renderRow: (
    item: T,
    index: number,
    floating: boolean,
    disabled: boolean,
  ) => ReactNode;
  description: string;
  testID: string;
  footer?: ReactNode;
}) {
  const { styles, colors } = useCardboxStyles();
  const list = useRef<FlatList<T>>(null);
  const layout = useRef({
    width: 0,
    height: 0,
    contentHeight: 0,
    headerHeight: 0,
    offset: 0,
  });
  const metrics = useSharedValue(layout.current);
  const candidate = useSharedValue<{ index: number; pointerY: number } | null>(
    null,
  );
  const updateLayout = useCallback(
    (next: Partial<typeof layout.current>) => {
      layout.current = { ...layout.current, ...next };
      metrics.value = layout.current;
    },
    [metrics],
  );
  const live = useRef({ items, onMove, busy });
  live.current = { items, onMove, busy };
  const mounted = useRef(true);
  const [dragging, setDragging] = useState<{ item: T; target: number } | null>(
    null,
  );
  const top = useSharedValue(0);
  const controller = useMemo(
    () =>
      createSortDragController({
        requestFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (handle) => cancelAnimationFrame(handle),
        scrollTo: (offset) => {
          updateLayout({ offset });
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
              previous?.item.id === snapshot.id &&
              previous.target === snapshot.target
            )
              return previous;
            const item = live.current.items.find(
              (value) => value.id === snapshot.id,
            );
            return item ? { item, target: snapshot.target } : null;
          });
        },
        commit: (id, target) => {
          if (!live.current.busy) live.current.onMove(id, target);
        },
      }),
    [top, updateLayout],
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
  }, [items, busy, controller]);

  // Make the native ScrollView wait for the long press to succeed or fail.
  // A quick swipe fails the pan and scrolls; a held row gives the drag ownership.
  const scrollGesture = useMemo(() => Gesture.Native(), []);
  const itemCount = items.length;
  const beginDrag = useCallback(
    (start: { index: number; pointerY: number }) => {
      const current = layout.current;
      if (
        !mounted.current ||
        !live.current.items[start.index] ||
        live.current.busy
      )
        return;
      controller.begin({
        id: live.current.items[start.index].id,
        index: start.index,
        count: live.current.items.length,
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
    },
    [controller],
  );
  const moveDrag = controller.move;
  const finishDrag = controller.finish;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!busy)
        .maxPointers(1)
        .activateAfterLongPress(300)
        .blocksExternalGesture(scrollGesture)
        .shouldCancelWhenOutside(false)
        .onTouchesDown((event, manager) => {
          "worklet";
          candidate.value = null;
          const touch = event.allTouches[0];
          const current = metrics.value;
          if (!touch || event.numberOfTouches !== 1) {
            manager.fail();
            return;
          }
          // Local coordinates avoid Android status-bar/window offsets in measureInWindow.
          const contentY =
            touch.y + current.offset - TOP_PADDING - current.headerHeight;
          const index = Math.floor(contentY / SORT_ROW_HEIGHT);
          const withinRow = contentY - index * SORT_ROW_HEIGHT;
          if (
            touch.x < PADDING ||
            touch.x > current.width - PADDING - CONTROLS_WIDTH ||
            index < 0 ||
            index >= itemCount ||
            withinRow > SORT_ROW_HEIGHT - 10
          ) {
            manager.fail();
            return;
          }
          candidate.value = { index, pointerY: touch.y };
        })
        .onStart(() => {
          "worklet";
          if (candidate.value) runOnJS(beginDrag)(candidate.value);
        })
        .onUpdate((event) => {
          "worklet";
          runOnJS(moveDrag)(event.y);
        })
        .onEnd((_event, success) => {
          "worklet";
          runOnJS(finishDrag)(success);
        })
        .onFinalize(() => {
          "worklet";
          candidate.value = null;
          runOnJS(finishDrag)(false);
        }),
    [
      busy,
      scrollGesture,
      candidate,
      metrics,
      itemCount,
      beginDrag,
      moveDrag,
      finishDrag,
    ],
  );
  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: top.value }],
  }));
  return (
    <GestureDetector gesture={pan} touchAction="pan-y">
      <View
        collapsable={false}
        onLayout={(event) => {
          controller.finish(false);
          const { width, height } = event.nativeEvent.layout;
          updateLayout({ width, height });
        }}
        style={{ flex: 1, overflow: "hidden" }}
        testID={testID}
      >
        <GestureDetector gesture={scrollGesture}>
          <FlatList
            ref={list}
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.content, { gap: 0 }]}
            initialNumToRender={10}
            windowSize={5}
            scrollEnabled={!dragging}
            scrollEventThrottle={16}
            onScroll={(event) => {
              if (!controller.snapshot())
                updateLayout({ offset: event.nativeEvent.contentOffset.y });
            }}
            onContentSizeChange={(_width, height) => {
              updateLayout({ contentHeight: height });
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
                  updateLayout({
                    headerHeight: event.nativeEvent.layout.height,
                  });
                }}
                style={{ paddingBottom: 18 }}
              >
                <Text style={styles.muted}>{description}</Text>
              </View>
            }
            ListFooterComponent={
              footer ? <View style={{ paddingTop: 18 }}>{footer}</View> : null
            }
            renderItem={({ item, index }) => (
              <View style={{ opacity: dragging?.item.id === item.id ? 0 : 1 }}>
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
                {renderRow(item, index, false, busy || Boolean(dragging))}
              </View>
            )}
          />
        </GestureDetector>
        {dragging && (
          <Animated.View
            pointerEvents="none"
            accessibilityLabel={`拖动中的${dragging.item.name}`}
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
            {renderRow(dragging.item, dragging.target, true, true)}
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}
