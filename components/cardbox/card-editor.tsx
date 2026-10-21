import { Ionicons } from "@expo/vector-icons";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { CARD_TYPES, type Card } from "../../shared/cardbox";
import { formatCardNumber } from "../../shared/cardbox-tools";
import { CardFace } from "./card-face";
import { ExpiryInput } from "./expiry-input";
import { useCardboxStyles } from "./styles";

type EditorProps = {
  card: Card;
  onChange: (card: Card) => void;
  onPickImage: () => void;
  busy: boolean;
  onRemoveImage: () => void;
};

export function CardEditor({
  card,
  onChange,
  onPickImage,
  onRemoveImage,
  busy,
}: EditorProps) {
  const { styles, colors } = useCardboxStyles();
  const set = (key: keyof Card, value: string) =>
    onChange({ ...card, [key]: value });
  return (
    <KeyboardAvoidingView
      style={styles.grow}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <CardFace card={card} />
        <Pressable
          style={[
            styles.outline,
            { flex: 0, minHeight: 48, justifyContent: "center" },
          ]}
          disabled={busy}
          onPress={onPickImage}
          accessibilityRole="button"
        >
          <View style={styles.row}>
            <Ionicons name="image-outline" size={18} color={colors.primary} />
            <Text style={styles.outlineText}>更换卡面图片</Text>
          </View>
        </Pressable>
        {card.image && (
          <Pressable
            accessibilityLabel="移除卡面图片"
            disabled={busy}
            style={styles.outline}
            onPress={onRemoveImage}
          >
            <Text style={styles.outlineText}>移除图片，恢复默认卡面</Text>
          </Pressable>
        )}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>卡片名称</Text>
          <TextInput
            accessibilityLabel="卡片名称"
            value={card.name}
            onChangeText={(value) => set("name", value)}
            maxLength={120}
            placeholder="例如：招商银行"
            placeholderTextColor={colors.muted}
            style={styles.input}
            editable={!busy}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>卡片类型</Text>
          <View style={styles.choices}>
            {(Object.keys(CARD_TYPES) as (keyof typeof CARD_TYPES)[]).map(
              (type) => (
                <Pressable
                  key={type}
                  style={[
                    styles.choice,
                    card.type === type && styles.selectedChoice,
                  ]}
                  disabled={busy}
                  onPress={() => set("type", type)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: card.type === type }}
                >
                  <Text
                    style={
                      card.type === type ? styles.outlineText : styles.muted
                    }
                  >
                    {CARD_TYPES[type]}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>卡号</Text>
          <TextInput
            accessibilityLabel="卡号"
            value={formatCardNumber(card.number)}
            onChangeText={(value) => set("number", value.replace(/\s/g, ""))}
            maxLength={32}
            keyboardType="number-pad"
            placeholder="输入卡号"
            placeholderTextColor={colors.muted}
            style={styles.input}
            editable={!busy}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>CVV</Text>
          <TextInput
            accessibilityLabel="CVV"
            value={card.cvv}
            onChangeText={(value) => set("cvv", value)}
            maxLength={4}
            keyboardType="number-pad"
            placeholder="3 或 4 位安全码，可选"
            placeholderTextColor={colors.muted}
            style={styles.input}
            editable={!busy}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>到期时间</Text>
          <ExpiryInput
            value={card.expiry}
            onChange={(value) => set("expiry", value)}
            editable={!busy}
          />
        </View>
        {card.type === "credit" && (
          <View style={styles.field}>
            {(
              [
                ["billingDay", "账单日"],
                ["repaymentDay", "还款日"],
              ] as const
            ).map(([key, label]) => (
              <View key={key} style={styles.field}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput
                  accessibilityLabel={label}
                  value={card[key] ?? ""}
                  onChangeText={(value) => set(key, value)}
                  maxLength={2}
                  keyboardType="number-pad"
                  placeholder="每月几号（1—31，可选）"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  editable={!busy}
                />
              </View>
            ))}
            <Text style={styles.muted}>
              仅记录日期，不发送提醒；实际账期以银行账单为准。
            </Text>
          </View>
        )}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>备注</Text>
          <TextInput
            accessibilityLabel="备注"
            value={card.note}
            onChangeText={(value) => set("note", value)}
            maxLength={5000}
            multiline
            placeholder="可选"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.note]}
            editable={!busy}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
