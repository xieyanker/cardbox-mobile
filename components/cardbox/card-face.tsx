import { Image, StyleSheet, Text, View } from "react-native";
import { CARD_TYPES, type Card } from "../../shared/cardbox";
import { useCardboxStyles } from "./styles";

export function maskCardNumber(number: string) {
  const digits = number.replace(/\s/g, "");
  return digits.length > 4 ? `•••• •••• •••• ${digits.slice(-4)}` : "••••";
}

export function CardFace({
  card,
  compact = false,
}: {
  card: Card;
  compact?: boolean;
}) {
  const { styles } = useCardboxStyles();
  return (
    <View
      style={[
        styles.cardFace,
        { backgroundColor: card.tone },
        compact && styles.compactFace,
      ]}
    >
      {card.image ? (
        <Image
          source={{ uri: card.image }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          accessibilityLabel={`${card.name}卡面`}
        />
      ) : (
        <>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardBrand, compact && { fontSize: 12 }]}>
              {card.name || "CardBox"}
            </Text>
            {!compact && (
              <Text style={styles.cardSmall}>{CARD_TYPES[card.type]}</Text>
            )}
          </View>
          <Text style={[styles.cardNumber, compact && styles.compactNumber]}>
            {maskCardNumber(card.number)}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardSmall}>{card.expiry || "BANK CARD"}</Text>
            <Text style={styles.cardSmall}>▦</Text>
          </View>
        </>
      )}
    </View>
  );
}
