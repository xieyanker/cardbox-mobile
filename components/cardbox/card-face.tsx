import { Image, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { CARD_TYPES, type Card } from "../../shared/cardbox";
import { cardTextColor } from "../../shared/cardbox-color";
import { useCardboxStyles } from "./styles";

export function maskCardNumber(number: string) {
  const digits = number.replace(/\s/g, "");
  return digits.length > 4 ? `•••• •••• •••• ${digits.slice(-4)}` : "••••";
}

export function CardFace({
  card,
  compact = false,
  hideImage = false,
}: {
  card: Card;
  compact?: boolean;
  hideImage?: boolean;
}) {
  const { styles } = useCardboxStyles();
  const foreground = { color: cardTextColor(card.tone) };
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [card.image]);
  return (
    <View
      style={[
        styles.cardFace,
        { backgroundColor: card.tone },
        compact && styles.compactFace,
      ]}
    >
      {card.image && !hideImage && !imageFailed ? (
        <Image
          source={{ uri: card.image }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          accessibilityLabel={`${card.name}卡面`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <>
          <View style={styles.cardMeta}>
            <Text
              style={[
                styles.cardBrand,
                foreground,
                compact && { fontSize: 12 },
              ]}
            >
              {card.name || "CardBox"}
            </Text>
            {!compact && (
              <Text style={[styles.cardSmall, foreground]}>
                {CARD_TYPES[card.type]}
              </Text>
            )}
          </View>
          <Text
            style={[
              styles.cardNumber,
              foreground,
              compact && styles.compactNumber,
            ]}
          >
            {maskCardNumber(card.number)}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardSmall, foreground]}>
              {card.expiry || "BANK CARD"}
            </Text>
            <Text style={[styles.cardSmall, foreground]}>▦</Text>
          </View>
        </>
      )}
    </View>
  );
}
