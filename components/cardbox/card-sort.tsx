import { Platform, Pressable, Text, View } from "react-native";
import type { Card } from "../../shared/cardbox";
import { SORT_ROW_HEIGHT } from "../../lib/cardbox-sort-drag";
import { CardFace } from "./card-face";
import { SortableList } from "./sortable-list";
import { useCardboxStyles } from "./styles";

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
  return (
    <SortableList
      items={cards}
      busy={busy}
      onMove={onMove}
      testID="card-sort-viewport"
      description="长按卡片或把手拖动，靠近上下边缘可自动滚动；松手后保存顺序。也可点击箭头调整。"
      renderRow={(card, index, floating, disabled) => (
        <SortRow
          card={card}
          index={index}
          count={cards.length}
          busy={disabled}
          onMove={onMove}
          hideImages={hideImages}
          floating={floating}
        />
      )}
    />
  );
}
