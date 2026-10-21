import { useMemo } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import {
  BROWSE_MODES,
  DEFAULT_BROWSE_ORDER,
  type BrowseMode,
} from "../../shared/cardbox-browse";
import { SORT_ROW_HEIGHT } from "../../lib/cardbox-sort-drag";
import { SortableList } from "./sortable-list";
import { useCardboxStyles } from "./styles";

export function BrowseModeSort({
  order,
  busy,
  onSave,
}: {
  order: BrowseMode[];
  busy: boolean;
  onSave: (order: BrowseMode[]) => void;
}) {
  const { styles } = useCardboxStyles();
  const items = useMemo(
    () => order.map((id) => ({ id, name: `${BROWSE_MODES[id]}模式` })),
    [order],
  );
  function move(id: string, target: number) {
    const index = order.findIndex((mode) => mode === id);
    if (index < 0 || target < 0 || target >= order.length || index === target)
      return;
    const next = [...order];
    next.splice(target, 0, next.splice(index, 1)[0]);
    onSave(next);
  }
  return (
    <SortableList
      items={items}
      busy={busy}
      onMove={move}
      testID="browse-mode-sort-viewport"
      description="长按模式或把手拖动，松手后自动保存首页模式顺序；也可点击箭头调整。"
      footer={
        <Pressable
          accessibilityLabel="恢复默认模式顺序"
          disabled={busy}
          style={styles.outline}
          onPress={() => onSave([...DEFAULT_BROWSE_ORDER])}
        >
          <Text style={styles.outlineText}>恢复默认顺序</Text>
        </Pressable>
      }
      renderRow={(item, index, floating, disabled) => (
        <View style={{ height: SORT_ROW_HEIGHT, paddingBottom: 10 }}>
          <View style={[styles.sortRow, { flex: 1 }]}>
            <View
              accessibilityLabel={floating ? undefined : `拖动${item.name}`}
              style={{
                width: 40,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                ...(Platform.OS === "web"
                  ? { touchAction: "none" as const }
                  : {}),
              }}
            >
              <Text style={styles.muted}>☰</Text>
            </View>
            <Text style={styles.position}>{index + 1}</Text>
            <Text style={[styles.text, styles.grow]}>
              {BROWSE_MODES[item.id]}
            </Text>
            {([-1, 1] as const).map((direction) => (
              <Pressable
                key={direction}
                accessibilityRole="button"
                accessibilityLabel={
                  floating
                    ? undefined
                    : `${direction < 0 ? "上移" : "下移"}${item.name}`
                }
                disabled={
                  disabled ||
                  index + direction < 0 ||
                  index + direction >= order.length
                }
                style={styles.iconButton}
                onPress={() => move(item.id, index + direction)}
              >
                <Text style={styles.outlineText}>
                  {direction < 0 ? "↑" : "↓"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    />
  );
}
