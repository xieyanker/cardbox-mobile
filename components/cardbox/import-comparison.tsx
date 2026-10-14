import { FlatList, Pressable, Text, View } from "react-native";
import { CARD_TYPES, type BackupCard } from "../../shared/cardbox";
import type { ImportConflict, ImportPlan } from "../../shared/cardbox-import";
import { useCardboxStyles } from "./styles";

function differences(current: BackupCard, incoming: BackupCard) {
  const fields = [
    ["name", "名称"],
    ["type", "类型"],
    ["expiry", "到期时间"],
    ["billingDay", "账单日"],
    ["repaymentDay", "还款日"],
    ["note", "备注"],
    ["tone", "卡面颜色"],
  ] as const;
  const rows: { label: string; before: string; after: string }[] = fields
    .filter(([key]) => (current[key] ?? "") !== (incoming[key] ?? ""))
    .map(([key, label]) => {
      const display = (card: BackupCard) =>
        key === "type"
          ? CARD_TYPES[card.type]
          : (key === "billingDay" || key === "repaymentDay") && card[key]
            ? `每月 ${Number(card[key])} 日`
            : card[key] || "未填写";
      return { label, before: display(current), after: display(incoming) };
    });
  if (current.cvv !== incoming.cvv)
    rows.push({
      label: "CVV（内容不同，已隐藏）",
      before: current.cvv ? "已填写" : "未填写",
      after: incoming.cvv ? "已填写" : "未填写",
    });
  if (
    current.image !== incoming.image ||
    current.imageData !== incoming.imageData
  )
    rows.push({
      label: "卡面来源",
      before: current.image || current.imageData ? "有图片" : "无图片",
      after:
        incoming.image || incoming.imageData
          ? "有图片（采用备份会替换当前卡面）"
          : "无图片（采用备份会移除当前卡面）",
    });
  return rows;
}

export function ImportComparison({
  plan,
  busy,
  onChoose,
  onConfirm,
  onCancel,
}: {
  plan: ImportPlan;
  busy: boolean;
  onChoose: (id: string, choice: "keep" | "replace") => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { styles } = useCardboxStyles();
  const renderItem = ({
    item,
    index,
  }: {
    item: ImportConflict;
    index: number;
  }) => {
    const rows = differences(item.current, item.incoming);
    const keep = item.fromBackup ? "保留前项" : "保留本机";
    return (
      <View style={styles.surface}>
        <Text style={styles.title}>
          {index + 1}. {item.incoming.name} · 尾号{" "}
          {item.incoming.number.replace(/\s/g, "").slice(-4)}
        </Text>
        <Text style={styles.muted}>
          {item.fromBackup
            ? "与前面已选的备份条目卡号相同"
            : `与本机“${item.current.name}”卡号相同`}
        </Text>
        {rows.length ? (
          rows.map((row) => (
            <View key={row.label} style={styles.field}>
              <Text style={styles.fieldLabel}>{row.label}</Text>
              <Text style={styles.text}>当前：{row.before}</Text>
              <Text style={styles.text}>备份：{row.after}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>资料一致，可以保留当前条目。</Text>
        )}
        <View style={styles.choices}>
          {(
            [
              ["keep", keep],
              ["replace", "采用备份"],
            ] as const
          ).map(([choice, label]) => (
            <Pressable
              key={choice}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityLabel={`冲突${index + 1}${label}`}
              accessibilityState={{ checked: item.choice === choice }}
              aria-checked={item.choice === choice}
              onPress={() => onChoose(item.key, choice)}
              style={[
                styles.choice,
                item.choice === choice && styles.selectedChoice,
              ]}
            >
              <Text
                style={
                  item.choice === choice ? styles.outlineText : styles.muted
                }
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };
  return (
    <FlatList
      contentContainerStyle={styles.content}
      data={plan.conflicts}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      extraData={busy}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.field}>
          <Text style={styles.heading}>导入冲突比较</Text>
          <Text style={styles.muted}>
            默认保留当前资料。采用备份会替换整张卡片的资料和卡面；本机卡片的位置与常用状态保留。同卡号有多张本机卡时只比较第一张，其余保留。备份内部重复按文件顺序处理。
          </Text>
        </View>
      }
      ListFooterComponent={
        <View style={styles.field}>
          <Text style={styles.text}>
            将新增 {plan.added} 张，更新 {plan.updated} 张，跳过 {plan.skipped}{" "}
            项。
          </Text>
          <Pressable disabled={busy} style={styles.primary} onPress={onConfirm}>
            <Text style={styles.primaryText}>
              {busy ? "正在处理…" : "确认导入选择"}
            </Text>
          </Pressable>
          <Pressable disabled={busy} style={styles.outline} onPress={onCancel}>
            <Text style={styles.outlineText}>取消导入</Text>
          </Pressable>
        </View>
      }
    />
  );
}
