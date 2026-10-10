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
import { CardFace } from "./card-face";
import { useCardboxStyles } from "./styles";

type EditorProps = {
  card: Card;
  onChange: (card: Card) => void;
  onPickImage: () => void;
  busy: boolean;
};

export function CardEditor({ card, onChange, onPickImage, busy }: EditorProps) {
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
            value={card.number}
            onChangeText={(value) => set("number", value)}
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
            secureTextEntry
            style={styles.input}
            editable={!busy}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>到期时间</Text>
          <TextInput
            accessibilityLabel="到期时间"
            value={card.expiry}
            onChangeText={(value) => set("expiry", value)}
            maxLength={5}
            placeholder="MM/YY，例如 12/30"
            placeholderTextColor={colors.muted}
            style={styles.input}
            editable={!busy}
          />
        </View>
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
