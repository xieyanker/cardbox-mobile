import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useCardboxStyles } from "./styles";
import type { BackupRecord } from "../../lib/cardbox-backup-record";
type Props = {
  importing: boolean;
  busy: boolean;
  working: boolean;
  progress: string;
  password: string;
  onPassword: (value: string) => void;
  confirmation: string;
  onConfirmation: (value: string) => void;
  visible: boolean;
  onVisible: () => void;
  assetName?: string;
  onChoose: () => void;
  onSubmit: () => void;
  record: BackupRecord | null;
  changes: { changed: number; removed: number };
  includeImages: boolean;
  onImages: () => void;
  merge: boolean;
  onMerge: (value: boolean) => void;
  onRestorePoint: () => void;
};
export function BackupPanel(props: Props) {
  const { styles, colors } = useCardboxStyles();
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>
        {props.importing ? "恢复或合并卡片" : "导出加密备份"}
      </Text>
      <Text style={styles.muted}>
        上次成功导出：
        {props.record ? new Date(props.record.at).toLocaleString() : "尚无记录"}
      </Text>
      <Text style={styles.muted}>
        {props.changes.changed} 张卡片新增或修改，{props.changes.removed}{" "}
        张已删除
      </Text>
      {props.record && (
        <Text style={styles.muted}>
          上次备份范围：
          {props.record.includeImages ? "卡片资料和图片" : "仅卡片资料"}
        </Text>
      )}
      {props.importing ? (
        <>
          <Pressable
            disabled={props.busy}
            style={styles.surface}
            onPress={props.onChoose}
          >
            <Text style={styles.text}>
              {props.assetName ? `已选择：${props.assetName}` : "选择备份文件"}
            </Text>
          </Pressable>
          <View style={styles.choices}>
            {[
              [false, "替换卡包"],
              [true, "合并导入"],
            ].map(([value, name]) => (
              <Pressable
                key={String(value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: props.merge === value }}
                disabled={props.busy}
                style={[
                  styles.choice,
                  props.merge === value && styles.selectedChoice,
                ]}
                onPress={() => props.onMerge(Boolean(value))}
              >
                <Text style={styles.outlineText}>{String(name)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.muted}>
            合并时可比较重复卡号的资料，默认保留当前条目。替换或合并前保存本机加密恢复点。
          </Text>
        </>
      ) : (
        <Pressable
          disabled={props.busy}
          accessibilityRole="checkbox"
          accessibilityLabel="包含卡面图片"
          accessibilityState={{ checked: props.includeImages }}
          style={styles.surface}
          onPress={props.onImages}
        >
          <Text style={styles.text}>
            {props.includeImages ? "✓ 包含卡面图片" : "仅备份卡片资料"}
          </Text>
          <Text style={styles.muted}>
            图片丢失时可选择仅备份资料，原卡包和图片不受影响。
          </Text>
        </Pressable>
      )}
      <View style={styles.password}>
        <TextInput
          accessibilityLabel="备份密码"
          value={props.password}
          onChangeText={props.onPassword}
          editable={!props.busy}
          secureTextEntry={!props.visible}
          placeholder={props.importing ? "输入原备份密码" : "设置备份密码"}
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.passwordInput]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          disabled={props.busy}
          accessibilityLabel={props.visible ? "隐藏密码" : "显示密码"}
          style={[styles.iconButton, styles.passwordButton]}
          onPress={props.onVisible}
        >
          <Text style={styles.outlineText}>
            {props.visible ? "隐藏" : "显示"}
          </Text>
        </Pressable>
      </View>
      {!props.importing && (
        <TextInput
          accessibilityLabel="确认备份密码"
          value={props.confirmation}
          onChangeText={props.onConfirmation}
          editable={!props.busy}
          secureTextEntry={!props.visible}
          placeholder="再次输入备份密码"
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
      <Pressable
        disabled={props.busy}
        style={[styles.primary, props.busy && styles.disabled]}
        onPress={props.onSubmit}
      >
        <Text style={styles.primaryText}>
          {props.working
            ? props.progress || "正在处理…"
            : props.importing
              ? "开始导入"
              : "生成加密备份"}
        </Text>
      </Pressable>
      <Text style={styles.muted}>
        请保管文件和密码，密码丢失后无法恢复。换机或卸载应用前请先导出
        .cardbox；系统迁移不能代替此备份。
      </Text>
      {props.importing && (
        <Pressable
          disabled={props.busy}
          accessibilityLabel="恢复上次导入前卡包"
          style={styles.outline}
          onPress={props.onRestorePoint}
        >
          <Text style={styles.outlineText}>恢复上次导入前卡包</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
