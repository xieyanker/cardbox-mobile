import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CardFace } from "@/components/cardbox/card-face";
import {
  BrowseModePicker,
  CardBrowser,
} from "@/components/cardbox/card-browser";
import { CardDetails } from "@/components/cardbox/card-details";
import { CardEditor } from "@/components/cardbox/card-editor";
import { CardImageEditor } from "@/components/cardbox/card-image-editor";
import { CardGrid } from "@/components/cardbox/card-grid";
import { CardSort } from "@/components/cardbox/card-sort";
import { BackupPanel } from "@/components/cardbox/backup-panel";
import { useCardboxStyles } from "@/components/cardbox/styles";
import { useCardboxAccess } from "@/hooks/use-cardbox-access";
import { useCardboxCards } from "@/hooks/use-cardbox-cards";
import { useCardboxBrowse } from "@/hooks/use-cardbox-browse";
import { useCardboxPreferences } from "@/hooks/use-cardbox-preferences";
import { useCardboxOperations } from "@/hooks/use-cardbox-operations";
import {
  useCardboxNavigation,
  screenTitle,
} from "@/hooks/use-cardbox-navigation";
import { useCardboxEditor } from "@/hooks/use-cardbox-editor";
import { useCardboxBackup } from "@/hooks/use-cardbox-backup";
import { useCardboxBackNavigation } from "@/hooks/use-cardbox-back-navigation";
import { useCardboxStorageManagement } from "@/hooks/use-cardbox-storage-management";
import { filterCards } from "@/shared/cardbox-tools";
import { APP_AUTHOR, APP_REPOSITORY_URL, APP_VERSION } from "@/shared/app-info";
import { BROWSE_MODES, DEFAULT_BROWSE_ORDER } from "@/shared/cardbox-browse";
import { CARD_TYPES, lockTimeoutLabel } from "@/shared/cardbox";

export default function HomeScreen() {
  const { styles, colors } = useCardboxStyles();
  const storage = useCardboxCards();
  const access = useCardboxAccess();
  const browse = useCardboxBrowse();
  const preferences = useCardboxPreferences();
  const operations = useCardboxOperations(access, storage.busy);
  const navigation = useCardboxNavigation({
    storage,
    access,
    preferences,
    operations,
  });
  const editor = useCardboxEditor({ storage, access, operations, navigation });
  const backup = useCardboxBackup({
    storage,
    access,
    operations,
    navigation,
    preferences,
  });
  const { requestBack, closeTransientState } = useCardboxBackNavigation(
    navigation,
    editor,
    backup,
    operations,
  );
  const { inventory, loadInventory } = useCardboxStorageManagement(
    storage,
    operations,
    editor.draft,
  );
  const {
    busy,
    working,
    notice,
    setNotice,
    notify,
    confirmation,
    resolveConfirmation,
    run,
    ensureAccessible,
    authenticate,
  } = operations;
  const {
    screen,
    setScreen,
    selectedIndex,
    current,
    showSensitive,
    setRevealed,
    menuOpen,
    setMenuOpen,
    backupMenuOpen,
    setBackupMenuOpen,
    openPage,
    chooseCard,
    toggleSensitive,
    copyField,
    reorderTo,
    swipe,
  } = navigation;
  const {
    draft,
    setDraft,
    leaveEditor,
    setLeaveEditor,
    pendingImage,
    setPendingImage,
    startNew,
    editCurrent,
    saveDraft,
    chooseImage,
    deleteCurrent,
  } = editor;
  const {
    backupRecord,
    changes,
    backupProgress,
    password,
    setPassword,
    passwordVisible,
    setPasswordVisible,
    passwordConfirmation,
    setPasswordConfirmation,
    includeImages,
    setIncludeImages,
    mergeImport,
    setMergeImport,
    backupAsset,
    chooseBackup,
    exportBackup,
    importBackup,
    restorePreviousPack,
  } = backup;
  const cards = storage.cards;
  const hidePhotos = !preferences.ready || preferences.privateImages;
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const filtered = useMemo(
    () =>
      filterCards(
        cards,
        query,
        typeFilter,
        preferences.favorites,
        onlyFavorites,
      ),
    [cards, query, typeFilter, preferences.favorites, onlyFavorites],
  );
  const icon = (
    name: React.ComponentProps<typeof Ionicons>["name"],
    size = 22,
  ) => <Ionicons name={name} size={size} color={colors.primary} />;
  const unlock = () =>
    void run(async () => {
      await access.unlock();
    });

  const cardDetails = current && (
    <CardDetails
      card={current}
      showSensitive={showSensitive}
      disabled={busy}
      onToggleSensitive={() => void run(toggleSensitive)}
      onEdit={() => void run(editCurrent)}
      onDelete={() => void run(deleteCurrent)}
      favorite={preferences.favorites.includes(current.id)}
      onFavorite={() =>
        void run(() =>
          preferences.update((value) => ({
            ...value,
            favorites: value.favorites.includes(current.id)
              ? value.favorites.filter((id) => id !== current.id)
              : [...value.favorites, current.id],
          })),
        )
      }
      onCopy={(field) => void run(() => copyField(field))}
    />
  );
  const cardNavigation = current && (
    <View style={[styles.spaced, { justifyContent: "center" }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled:
            busy ||
            cards.length < 2 ||
            (browse.mode !== "classic" && selectedIndex === 0),
        }}
        disabled={
          busy ||
          cards.length < 2 ||
          (browse.mode !== "classic" && selectedIndex === 0)
        }
        style={styles.iconButton}
        accessibilityLabel="上一张卡片"
        onPress={() =>
          chooseCard(
            cards[
              browse.mode === "classic"
                ? (selectedIndex + cards.length - 1) % cards.length
                : Math.max(0, selectedIndex - 1)
            ].id,
          )
        }
      >
        {icon(browse.mode === "classic" ? "chevron-back" : "chevron-up", 17)}
      </Pressable>
      <Text style={styles.counter}>
        {selectedIndex + 1} / {cards.length}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled:
            busy ||
            cards.length < 2 ||
            (browse.mode !== "classic" && selectedIndex === cards.length - 1),
        }}
        disabled={
          busy ||
          cards.length < 2 ||
          (browse.mode !== "classic" && selectedIndex === cards.length - 1)
        }
        style={styles.iconButton}
        accessibilityLabel="下一张卡片"
        onPress={() =>
          chooseCard(
            cards[
              browse.mode === "classic"
                ? (selectedIndex + 1) % cards.length
                : Math.min(cards.length - 1, selectedIndex + 1)
            ].id,
          )
        }
      >
        {icon(
          browse.mode === "classic" ? "chevron-forward" : "chevron-down",
          17,
        )}
      </Pressable>
    </View>
  );

  if (access.locked || access.obscured) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.empty}>
          {icon("lock-closed-outline", 52)}
          <Text style={styles.heading}>CardBox 已锁定</Text>
          <Text style={[styles.muted, styles.centerText]}>
            验证身份后查看和管理卡片
          </Text>
          {!access.obscured && (
            <Pressable
              disabled={busy}
              onPress={unlock}
              style={[styles.primary, busy && styles.disabled]}
            >
              <Text style={styles.primaryText}>
                {busy ? "正在验证…" : "指纹 / 锁屏密码解锁"}
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (!storage.ready && screen !== "import") {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.empty}>
          {storage.error ? (
            <>
              <Text style={styles.heading}>卡片暂时无法读取</Text>
              <Text style={[styles.muted, styles.centerText]}>
                {storage.error}
              </Text>
              <Pressable
                style={styles.primary}
                onPress={() => void storage.reload()}
              >
                <Text style={styles.primaryText}>重新读取</Text>
              </Pressable>
              <Pressable
                style={styles.iconButton}
                onPress={() => openPage("import")}
              >
                <Text style={styles.outlineText}>使用加密备份恢复</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>正在读取卡片…</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.page}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.header}>
        <View style={styles.headerGroup}>
          {screen !== "home" && (
            <Pressable
              disabled={busy}
              style={styles.iconButton}
              onPress={requestBack}
              accessibilityLabel="返回首页"
            >
              {icon("chevron-back")}
            </Pressable>
          )}
          <Text style={styles.title} numberOfLines={1}>
            {screenTitle(
              screen,
              cards.some((card) => card.id === draft?.id),
            )}
          </Text>
        </View>
        {working && (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginRight: 8 }}
          />
        )}
        {screen === "home" && (
          <>
            <Pressable
              disabled={busy}
              style={styles.iconButton}
              onPress={() => openPage("all")}
              accessibilityLabel="全部卡片"
            >
              {icon("grid-outline")}
            </Pressable>
            <Pressable
              disabled={busy}
              style={styles.iconButton}
              onPress={() => setMenuOpen(true)}
              accessibilityLabel="更多菜单"
            >
              {icon("ellipsis-vertical")}
            </Pressable>
          </>
        )}
        {screen === "all" && (
          <Pressable
            disabled={busy}
            style={styles.iconButton}
            onPress={() => openPage("sort")}
            accessibilityLabel="排序管理"
          >
            {icon("swap-vertical-outline")}
          </Pressable>
        )}
        {screen === "editor" && (
          <Pressable
            disabled={busy}
            style={styles.iconButton}
            onPress={() => void run(saveDraft)}
            accessibilityLabel="保存卡片"
          >
            {icon("checkmark")}
          </Pressable>
        )}
      </View>

      {notice && (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.surface, { marginHorizontal: 22, marginBottom: 8 }]}
        >
          <View style={styles.spaced}>
            <Text style={styles.gridName}>{notice.title}</Text>
            <Pressable
              accessibilityLabel="关闭提示"
              style={styles.iconButton}
              onPress={() => setNotice(null)}
            >
              {icon("close", 18)}
            </Pressable>
          </View>
          <Text style={styles.text}>{notice.description}</Text>
        </View>
      )}

      {screen === "home" && current && (
        <BrowseModePicker
          mode={browse.mode}
          order={browse.order}
          disabled={busy}
          onChange={(mode) => {
            setRevealed(null);
            void run(() => browse.selectMode(mode));
          }}
        />
      )}
      {screen === "home" &&
        (current ? (
          browse.mode === "classic" ? (
            <ScrollView contentContainerStyle={styles.content}>
              <View {...swipe.panHandlers}>
                <CardFace
                  card={current}
                  hideImage={hidePhotos && !showSensitive}
                />
              </View>
              {cardNavigation}
              {cardDetails}
            </ScrollView>
          ) : (
            <View style={styles.grow}>
              <CardBrowser
                hideImages={hidePhotos}
                cards={cards}
                selectedIndex={selectedIndex}
                mode={browse.mode}
                disabled={busy}
                onSelect={chooseCard}
                onOpen={() => {
                  setRevealed(null);
                  setScreen("details");
                }}
              />
              {cardNavigation}
              <View
                style={[
                  styles.surface,
                  { marginHorizontal: 22, marginBottom: 16, padding: 14 },
                ]}
              >
                <View style={styles.spaced}>
                  <View style={styles.grow}>
                    <Text style={styles.gridName} numberOfLines={1}>
                      {current.name}
                    </Text>
                    <Text style={styles.muted}>{CARD_TYPES[current.type]}</Text>
                  </View>
                  <Pressable
                    disabled={busy}
                    style={styles.iconButton}
                    accessibilityLabel="查看卡片详情"
                    onPress={() => {
                      setRevealed(null);
                      setScreen("details");
                    }}
                  >
                    <Text style={styles.outlineText}>查看详情</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )
        ) : (
          <View style={styles.empty}>
            {icon("wallet-outline", 68)}
            <Text style={styles.heading}>还没有卡片</Text>
            <Text style={[styles.muted, styles.centerText]}>
              从右上角菜单选择“添加卡片”{"\n"}开始建立你的专属卡包
            </Text>
          </View>
        ))}
      {screen === "details" && current && (
        <ScrollView contentContainerStyle={styles.content}>
          <CardFace card={current} hideImage={hidePhotos && !showSensitive} />
          {cardDetails}
        </ScrollView>
      )}

      {screen === "all" && (
        <View style={styles.grow}>
          <View style={[styles.surface, { marginHorizontal: 22, padding: 12 }]}>
            <TextInput
              accessibilityLabel="搜索卡片"
              value={query}
              onChangeText={setQuery}
              placeholder="搜索名称或卡号后四位"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCorrect={false}
            />
            <View style={styles.choices}>
              {[["all", "全部"], ...Object.entries(CARD_TYPES)].map(
                ([type, name]) => (
                  <Pressable
                    key={type}
                    accessibilityRole="radio"
                    accessibilityLabel={name + "筛选"}
                    accessibilityState={{ checked: typeFilter === type }}
                    onPress={() => setTypeFilter(type)}
                    style={[
                      styles.choice,
                      typeFilter === type && styles.selectedChoice,
                    ]}
                  >
                    <Text
                      style={
                        typeFilter === type ? styles.outlineText : styles.muted
                      }
                    >
                      {name}
                    </Text>
                  </Pressable>
                ),
              )}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="只看常用卡"
                accessibilityState={{ checked: onlyFavorites }}
                onPress={() => setOnlyFavorites(!onlyFavorites)}
                style={[styles.choice, onlyFavorites && styles.selectedChoice]}
              >
                <Text style={styles.outlineText}>★ 常用</Text>
              </Pressable>
            </View>
            <Text style={styles.muted}>
              找到 {filtered.length} 张卡片 · 常用卡置顶
            </Text>
            {preferences.error ? (
              <Text style={styles.error}>{preferences.error}</Text>
            ) : null}
          </View>
          <CardGrid
            cards={filtered}
            favorites={preferences.favorites}
            privateImages={hidePhotos}
            busy={busy}
            onSelect={chooseCard}
          />
        </View>
      )}

      {screen === "sort" && (
        <CardSort
          hideImages={hidePhotos}
          cards={cards}
          busy={busy}
          onMove={(id, target) => void run(() => reorderTo(id, target))}
        />
      )}

      {screen === "editor" && draft && (
        <CardEditor
          card={draft}
          onChange={setDraft}
          onPickImage={() => void run(chooseImage)}
          onRemoveImage={() =>
            setDraft((previous) =>
              previous ? { ...previous, image: undefined } : previous,
            )
          }
          busy={busy}
        />
      )}

      {(screen === "export" || screen === "import") && (
        <BackupPanel
          importing={screen === "import"}
          busy={busy}
          working={working}
          progress={backupProgress}
          password={password}
          onPassword={setPassword}
          confirmation={passwordConfirmation}
          onConfirmation={setPasswordConfirmation}
          visible={passwordVisible}
          onVisible={() => setPasswordVisible(!passwordVisible)}
          assetName={backupAsset?.name}
          onChoose={() => void run(chooseBackup)}
          onSubmit={() =>
            void run(screen === "export" ? exportBackup : importBackup)
          }
          record={backupRecord.value}
          changes={changes}
          includeImages={includeImages}
          onImages={() => setIncludeImages(!includeImages)}
          merge={mergeImport}
          onMerge={setMergeImport}
          onRestorePoint={() => void run(restorePreviousPack)}
        />
      )}

      {screen === "browse-settings" && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.muted}>
            调整首页显示模式的顺序，修改后自动保存。
          </Text>
          {browse.order.map((mode, index) => (
            <View key={mode} style={styles.surface}>
              <View style={styles.spaced}>
                <Text style={[styles.text, styles.grow]}>
                  {index + 1}. {BROWSE_MODES[mode]}
                </Text>
                {([-1, 1] as const).map((direction) => {
                  const disabled =
                    busy ||
                    index + direction < 0 ||
                    index + direction >= browse.order.length;
                  return (
                    <Pressable
                      key={direction}
                      accessibilityRole="button"
                      accessibilityState={{ disabled }}
                      accessibilityLabel={`${direction < 0 ? "上移" : "下移"}${BROWSE_MODES[mode]}模式`}
                      disabled={disabled}
                      style={[styles.iconButton, disabled && styles.disabled]}
                      onPress={() => {
                        const next = [...browse.order];
                        [next[index], next[index + direction]] = [
                          next[index + direction],
                          next[index],
                        ];
                        void run(() => browse.saveOrder(next));
                      }}
                    >
                      {icon(direction < 0 ? "arrow-up" : "arrow-down", 20)}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          <Pressable
            accessibilityLabel="恢复默认模式顺序"
            disabled={busy}
            style={styles.outline}
            onPress={() =>
              void run(() => browse.saveOrder([...DEFAULT_BROWSE_ORDER]))
            }
          >
            <Text style={styles.outlineText}>恢复默认顺序</Text>
          </Pressable>
        </ScrollView>
      )}

      {screen === "settings" && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.muted}>
            应用切到后台后，超过设定时间需要重新验证身份。冷启动始终需要验证。
          </Text>
          {[1, 60_000, 300_000, 0].map((timeout) => (
            <Pressable
              key={timeout}
              disabled={busy || !access.settingsReady}
              style={styles.surface}
              onPress={() =>
                void run(async () => {
                  if (await authenticate("验证身份后修改自动锁定设置"))
                    await access.setTimeout(timeout);
                })
              }
            >
              <View style={styles.spaced}>
                <Text style={styles.text}>{lockTimeoutLabel(timeout)}</Text>
                {access.timeout === timeout && icon("checkmark-circle")}
              </View>
            </Pressable>
          ))}
          <Pressable
            disabled={busy || !preferences.ready}
            accessibilityRole="switch"
            accessibilityLabel="照片隐私模式"
            accessibilityState={{ checked: preferences.privateImages }}
            style={styles.surface}
            onPress={() =>
              void run(() =>
                preferences.update((value) => ({
                  ...value,
                  privateImages: !value.privateImages,
                })),
              )
            }
          >
            <Text style={styles.text}>
              照片隐私模式：{preferences.privateImages ? "开启" : "关闭"}
            </Text>
            <Text style={styles.muted}>
              开启后隐藏原始卡面照片，验证并显示敏感信息时才在详情中展示。敏感信息
              30 秒后自动隐藏。
            </Text>
          </Pressable>
          <Pressable
            disabled={busy}
            style={styles.primary}
            accessibilityLabel="立即锁定"
            onPress={() => access.lock()}
          >
            <Text style={styles.primaryText}>立即锁定</Text>
          </Pressable>
        </ScrollView>
      )}

      {screen === "about" && (
        <View style={styles.empty}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={{ width: 112, height: 112, borderRadius: 24 }}
            accessibilityLabel="CardBox 三卡叠放应用图标"
          />
          <Text style={styles.heading}>CardBox</Text>
          <Text style={styles.text}>版本 {APP_VERSION}</Text>
          <Text style={styles.text}>作者：{APP_AUTHOR}</Text>
          <Text style={styles.muted}>简单 · 安全 · 纯本地</Text>
          <Text style={[styles.muted, styles.centerText]}>
            卡片资料保存在本机，无需账号。{"\n"}请定期导出加密备份。
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="打开 GitHub 项目"
            style={styles.iconButton}
            onPress={() =>
              void run(async () => {
                await Linking.openURL(APP_REPOSITORY_URL);
              })
            }
          >
            <Text style={styles.outlineText}>GitHub 项目</Text>
            <Text selectable style={[styles.muted, styles.centerText]}>
              {APP_REPOSITORY_URL}
            </Text>
          </Pressable>
        </View>
      )}

      {screen === "storage" && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>卡面存储</Text>
          <Text style={styles.muted}>
            {Platform.OS === "web"
              ? "Web 卡面保存在加密卡包中；原生应用可查看私有图片目录占用。"
              : "清理会保留当前卡包和导入恢复点中的图片。"}
          </Text>
          {inventory && (
            <Text style={styles.text}>
              {inventory.files} 个图片文件 ·{" "}
              {(inventory.bytes / 1024 / 1024).toFixed(2)} MB ·{" "}
              {inventory.unused.length} 个无引用文件
            </Text>
          )}
          <Pressable
            disabled={busy}
            style={styles.primary}
            onPress={() => void run(() => loadInventory())}
          >
            <Text style={styles.primaryText}>查看存储占用</Text>
          </Pressable>
          <Pressable
            disabled={busy || Platform.OS === "web"}
            style={styles.outline}
            onPress={() => void run(() => loadInventory(true))}
          >
            <Text style={styles.outlineText}>清理无用卡面</Text>
          </Pressable>
        </ScrollView>
      )}

      {screen === "all" && (
        <Pressable
          disabled={busy}
          onPress={() => void run(async () => startNew())}
          style={[styles.fab, busy && styles.disabled]}
          accessibilityLabel="添加卡片"
        >
          <Ionicons name="add" size={30} color="white" />
        </Pressable>
      )}

      {menuOpen && (
        <View style={styles.backdrop}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              setMenuOpen(false);
              setBackupMenuOpen(false);
            }}
            accessibilityLabel="关闭菜单"
          />
          <View style={styles.menu}>
            {backupMenuOpen && (
              <Pressable
                style={[styles.menuItem, styles.submenuHeading]}
                onPress={() => setBackupMenuOpen(false)}
                accessibilityLabel="返回一级菜单"
              >
                {icon("chevron-back", 18)}
                <Text style={styles.text}>备份管理</Text>
              </Pressable>
            )}
            {(backupMenuOpen
              ? ([
                  ["export", "cloud-upload-outline", "导出备份"],
                  ["import", "cloud-download-outline", "导入备份"],
                ] as const)
              : ([
                  ["add", "add-outline", "添加卡片"],
                  ["sort", "swap-vertical-outline", "卡片排序"],
                  ["backup", "folder-open-outline", "备份管理"],
                  ["settings", "lock-closed-outline", "自动锁定"],
                  ["lock", "lock-closed", "立即锁定"],
                  ["browse-settings", "options-outline", "浏览模式"],
                  ["storage", "folder-outline", "存储管理"],
                  ["about", "information-circle-outline", "关于应用"],
                ] as const)
            ).map(([page, name, label]) => (
              <Pressable
                key={page}
                accessibilityLabel={label}
                disabled={busy}
                style={styles.menuItem}
                onPress={() => {
                  if (page === "add") void run(async () => startNew());
                  else if (page === "lock") access.lock();
                  else if (page === "backup") setBackupMenuOpen(true);
                  else openPage(page);
                }}
              >
                {icon(name, 18)}
                <Text style={[styles.text, styles.grow]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {pendingImage && (
        <CardImageEditor
          key={pendingImage.uri}
          source={pendingImage}
          onConfirm={(uri) => {
            ensureAccessible();
            setDraft((previous) =>
              previous ? { ...previous, image: uri } : previous,
            );
            setPendingImage(null);
          }}
          onCancel={() => setPendingImage(null)}
          onChoose={() => {
            setPendingImage(null);
            void run(chooseImage);
          }}
          onError={(message) => notify("卡面未完成", message)}
        />
      )}

      {leaveEditor && (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>尚未保存</Text>
            <Text style={styles.muted}>卡片内容已修改，离开前是否保存？</Text>
            <Pressable
              disabled={busy}
              style={styles.primary}
              onPress={() => {
                setLeaveEditor(false);
                void run(saveDraft);
              }}
            >
              <Text style={styles.primaryText}>保存修改</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              style={styles.destructive}
              onPress={closeTransientState}
            >
              <Text style={styles.destructiveText}>放弃修改</Text>
            </Pressable>
            <Pressable
              style={styles.outline}
              onPress={() => setLeaveEditor(false)}
            >
              <Text style={styles.outlineText}>继续编辑</Text>
            </Pressable>
          </View>
        </View>
      )}

      {confirmation && (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{confirmation.title}</Text>
            <Text style={styles.muted}>{confirmation.description}</Text>
            <View style={styles.row}>
              <Pressable
                style={styles.outline}
                onPress={() => {
                  resolveConfirmation(false);
                }}
              >
                <Text style={styles.outlineText}>取消</Text>
              </Pressable>
              <Pressable
                style={styles.destructive}
                onPress={() => {
                  resolveConfirmation(true);
                }}
              >
                <Text style={styles.destructiveText}>确认</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
