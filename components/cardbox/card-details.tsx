import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { CARD_TYPES, type Card } from "../../shared/cardbox";
import { maskCardNumber } from "./card-face";
import { useCardboxStyles } from "./styles";

export function CardDetails({
  card,
  showSensitive,
  disabled,
  onToggleSensitive,
  onEdit,
  onDelete,
}: {
  card: Card;
  showSensitive: boolean;
  disabled: boolean;
  onToggleSensitive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { styles, colors } = useCardboxStyles();
  return (
    <View style={styles.surface}>
      <View style={styles.spaced}>
        <View style={[styles.row, styles.grow]}>
          <Text style={[styles.title, { fontSize: 18, flexShrink: 1 }]}>
            {card.name}
          </Text>
          <Text style={styles.muted}>{CARD_TYPES[card.type]}</Text>
        </View>
        <Pressable
          disabled={disabled}
          style={styles.visibility}
          onPress={onToggleSensitive}
          accessibilityLabel={
            showSensitive ? "隐藏敏感信息" : "验证并显示敏感信息"
          }
        >
          <Ionicons
            name={showSensitive ? "eye-off-outline" : "eye-outline"}
            size={15}
            color={colors.primary}
          />
          <Text style={styles.outlineText}>
            {showSensitive ? "隐藏" : "显示"}
          </Text>
        </Pressable>
      </View>
      <View>
        {[
          ["卡号", showSensitive ? card.number : maskCardNumber(card.number)],
          ["CVV", showSensitive ? card.cvv || "未填写" : "•••"],
          ["到期", card.expiry || "未填写"],
          ["备注", card.note || "暂无备注"],
        ].map(([label, value]) => (
          <View key={label} style={styles.information}>
            <Text style={styles.label}>{label}</Text>
            <Text selectable={showSensitive} style={styles.value}>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable disabled={disabled} style={styles.outline} onPress={onEdit}>
          <Text style={styles.outlineText}>修改</Text>
        </Pressable>
        <Pressable
          disabled={disabled}
          style={styles.destructive}
          onPress={onDelete}
        >
          <Text style={styles.destructiveText}>删除</Text>
        </Pressable>
      </View>
    </View>
  );
}
