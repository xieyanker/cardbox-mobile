import { FlatList, Pressable, Text, View } from "react-native";
import { CARD_TYPES, type Card } from "../../shared/cardbox";
import { expiryStatus } from "../../shared/cardbox-tools";
import { CardFace } from "./card-face";
import { useCardboxStyles } from "./styles";

export function CardGrid({
  cards,
  favorites,
  busy,
  privateImages,
  onSelect,
}: {
  cards: Card[];
  favorites: string[];
  busy: boolean;
  privateImages: boolean;
  onSelect: (id: string) => void;
}) {
  const { styles } = useCardboxStyles();
  return (
    <FlatList
      data={cards}
      keyExtractor={(card) => card.id}
      numColumns={2}
      contentContainerStyle={styles.content}
      columnWrapperStyle={{ gap: 18 }}
      initialNumToRender={8}
      windowSize={5}
      ListEmptyComponent={<Text style={styles.muted}>没有匹配的卡片</Text>}
      renderItem={({ item: card }) => (
        <Pressable
          disabled={busy}
          style={[styles.gridItem, { marginBottom: 18 }]}
          onPress={() => onSelect(card.id)}
          accessibilityRole="button"
          accessibilityLabel={`选择${card.name}`}
        >
          <CardFace card={card} compact hideImage={privateImages} />
          <Text style={styles.gridName} numberOfLines={2}>
            {favorites.includes(card.id) ? "★ " : ""}
            {card.name}
          </Text>
          <View style={styles.spaced}>
            <Text style={styles.muted}>{CARD_TYPES[card.type]}</Text>
            <Text style={styles.error}>{expiryStatus(card.expiry)}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}
