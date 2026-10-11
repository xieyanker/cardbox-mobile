import { useRef, useState } from "react";
import { TextInput } from "react-native";
import { editExpiryInput, expiryInputMask } from "../../shared/cardbox-expiry";
import { useCardboxStyles } from "./styles";

type ExpiryInputProps = {
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
};

export function ExpiryInput({ value, onChange, editable }: ExpiryInputProps) {
  const { styles, colors } = useCardboxStyles();
  const currentSelection = useRef({ start: 0, end: 0 });
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  return (
    <TextInput
      accessibilityLabel="到期时间"
      accessibilityHint="连续输入四位数字，月份两位、年份两位，斜杠自动添加；可以留空"
      value={expiryInputMask(value)}
      onChangeText={(text) => {
        const edit = editExpiryInput(value, text, currentSelection.current);
        currentSelection.current = edit.selection;
        setSelection(edit.selection);
        onChange(edit.value);
      }}
      selection={selection}
      onSelectionChange={({ nativeEvent }) => {
        currentSelection.current = nativeEvent.selection;
      }}
      onFocus={() => {
        const length = value.replace(/\D/g, "").length;
        const cursor = length < 2 ? length : Math.min(length + 1, 5);
        const next = { start: cursor, end: cursor };
        currentSelection.current = next;
        setSelection(next);
      }}
      keyboardType="number-pad"
      autoCorrect={false}
      spellCheck={false}
      placeholder="__/__"
      placeholderTextColor={colors.muted}
      style={styles.input}
      editable={editable}
    />
  );
}
