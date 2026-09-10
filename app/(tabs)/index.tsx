import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { decryptBackup, decryptLocal, encryptBackup, encryptLocal } from '@/lib/cardbox-security';
import {
  Alert,
  AppState,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';

type Card = {
  id: string;
  name: string;
  number: string;
  cvv: string;
  expiry: string;
  note: string;
  image?: string;
  tone: string;
};

const STORAGE_KEY = 'cardbox.cards.v1';
const tones = ['#2F59C7', '#141820', '#F4C63D', '#287A6C', '#B84E4E', '#5368A5'];
const starterCards: Card[] = [
  { id: '1', name: '招商银行', number: '6225 1234 5678 1234', cvv: '123', expiry: '12/30', note: '日常消费', tone: '#2F59C7' },
  { id: '2', name: '中信银行', number: '4333 2222 1111 8888', cvv: '456', expiry: '09/29', note: '备用卡', tone: '#141820' },
  { id: '3', name: '中国银行', number: '6217 2345 6789 8888', cvv: '789', expiry: '11/29', note: '海外消费', tone: '#B84E4E' },
  { id: '4', name: '汇丰银行', number: '5447 1234 5678 9012', cvv: '321', expiry: '12/28', note: '旅行专用', tone: '#287A6C' },
];

const maskNumber = (value: string) => {
  const digits = value.replace(/\s/g, '');
  if (digits.length <= 4) return value;
  return `•••• •••• •••• ${digits.slice(-4)}`;
};

async function buildBackupCards(cards: Card[]) {
  return Promise.all(cards.map(async (card) => {
    if (!card.image || Platform.OS === 'web' || card.image.startsWith('data:')) return card;
    try {
      const imageData = await FileSystem.readAsStringAsync(card.image, { encoding: FileSystem.EncodingType.Base64 });
      return { ...card, imageData };
    } catch {
      return card;
    }
  }));
}

async function restoreBackupCards(cards: Array<Card & { imageData?: string }>) {
  return Promise.all(cards.map(async (card) => {
    if (!card.imageData || Platform.OS === 'web') return card;
    try {
      const uri = `${FileSystem.documentDirectory}cardbox-card-${card.id}.jpg`;
      await FileSystem.writeAsStringAsync(uri, card.imageData, { encoding: FileSystem.EncodingType.Base64 });
      const { imageData: _imageData, ...rest } = card;
      return { ...rest, image: uri };
    } catch {
      return card;
    }
  }));
}

function CardFace({ card, compact = false }: { card: Card; compact?: boolean }) {
  return (
    <View style={[styles.cardFace, { backgroundColor: card.tone }, compact && styles.compactFace]}>
      {card.image ? <Image source={{ uri: card.image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" /> : null}
      <View style={styles.cardShade} />
      <View style={styles.cardTop}>
        <Text style={styles.cardBrand}>CardBox</Text>
        <Text style={styles.cardType}>BANK CARD</Text>
      </View>
      <Text style={[styles.cardName, compact && styles.compactName]}>{card.name}</Text>
      <Text style={[styles.cardNumber, compact && styles.compactNumber]}>{maskNumber(card.number)}</Text>
      <View style={styles.cardBottom}>
        <Text style={styles.cardExpiry}>{card.expiry}</Text>
        <Text style={styles.cardChip}>▦</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const [cards, setCards] = useState<Card[]>(starterCards);
  const [selected, setSelected] = useState(0);
  const [screen, setScreen] = useState<'home' | 'all' | 'backup'>('home');
  const [showSensitive, setShowSensitive] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupMode, setBackupMode] = useState<'export' | 'import'>('export');
  const [password, setPassword] = useState('');
  const [appLocked, setAppLocked] = useState(false);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(async (saved) => {
      if (!saved) return;
      try {
        setCards(JSON.parse(await decryptLocal(saved)));
      } catch {
        try { setCards(JSON.parse(saved)); } catch { /* keep starter cards */ }
      }
    });
  }, []);

  useEffect(() => {
    encryptLocal(JSON.stringify(cards)).then((encrypted) => AsyncStorage.setItem(STORAGE_KEY, encrypted));
    if (selected >= cards.length) setSelected(Math.max(0, cards.length - 1));
  }, [cards, selected]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') backgroundAt.current = Date.now();
      if (nextState === 'active' && backgroundAt.current && Date.now() - backgroundAt.current > 60_000) {
        setAppLocked(true);
        setShowSensitive(false);
        backgroundAt.current = null;
      }
    });
    return () => subscription.remove();
  }, []);

  const current = cards[selected];
  const countLabel = useMemo(() => `${cards.length ? selected + 1 : 0} / ${cards.length}`, [cards.length, selected]);
  const swipeResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) < 45 || cards.length < 2) return;
      setSelected((index) => gesture.dx < 0 ? (index + 1) % cards.length : (index + cards.length - 1) % cards.length);
    },
  });

  const toggleSensitive = async () => {
    if (showSensitive || Platform.OS === 'web') return setShowSensitive(!showSensitive);
    try {
      const LocalAuthentication = require('expo-local-authentication') as typeof import('expo-local-authentication');
      const [hasHardware, isEnrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
      if (!hasHardware || !isEnrolled) return Alert.alert('未设置生物识别', '请先在系统设置中录入指纹或面容，也可以继续使用隐藏信息模式。');
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: '验证身份后显示卡片敏感信息', disableDeviceFallback: false });
      if (result.success) setShowSensitive(true);
    } catch {
      Alert.alert('暂不可用', '当前设备无法调用生物识别验证。');
    }
  };

  const unlockApp = async () => {
    if (Platform.OS === 'web') return setAppLocked(false);
    try {
      const LocalAuthentication = require('expo-local-authentication') as typeof import('expo-local-authentication');
      const [hasHardware, isEnrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
      if (!hasHardware || !isEnrolled) return Alert.alert('需要设备验证', '请先在系统设置中录入指纹或面容。');
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: '解锁 CardBox', disableDeviceFallback: false });
      if (result.success) setAppLocked(false);
    } catch {
      Alert.alert('解锁失败', '无法完成设备验证，请稍后重试。');
    }
  };

  const openNew = () => {
    setEditing({ id: Date.now().toString(), name: '', number: '', cvv: '', expiry: '', note: '', tone: tones[cards.length % tones.length] });
    setEditorOpen(true);
  };

  const saveCard = (next: Card) => {
    setCards((prev) => prev.some((item) => item.id === next.id) ? prev.map((item) => item.id === next.id ? next : item) : [...prev, next]);
    setSelected(Math.max(0, cards.findIndex((item) => item.id === next.id)));
    setEditorOpen(false);
  };

  const deleteCard = () => {
    if (!current) return;
    Alert.alert('删除卡片', `确定删除“${current.name}”？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => setCards((prev) => prev.filter((item) => item.id !== current.id)) },
    ]);
  };

  const moveCard = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= cards.length) return;
    const copy = [...cards];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    setCards(copy);
  };

  const chooseImage = async () => {
    if (!editing) return;
    if (Platform.OS === 'web') return Alert.alert('移动端功能', '安装到 Android 后可从相册选择并裁剪卡面图片。');
    const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1.586, 1], quality: 0.85 });
    if (!result.canceled) setEditing({ ...editing, image: result.assets[0].uri });
  };

  const exportBackup = async () => {
    if (!password.trim()) return Alert.alert('需要密码', '请输入备份密码后再导出。');
    const backupCards = await buildBackupCards(cards);
    const payload = encryptBackup(JSON.stringify({ version: 2, cards: backupCards }), password);
    const uri = `${FileSystem.cacheDirectory}CardBox_${new Date().toISOString().slice(0, 10)}.cardbox`;
    await FileSystem.writeAsStringAsync(uri, payload);
    setBackupOpen(false);
    setPassword('');
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/octet-stream', dialogTitle: '导出 CardBox 备份' });
    else Alert.alert('导出完成', '备份文件已生成在应用缓存目录。');
  };

  const importBackup = async () => {
    if (!password.trim()) return Alert.alert('需要密码', '请输入备份密码后再导入。');
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled) return;
    try {
      const raw = await FileSystem.readAsStringAsync(picked.assets[0].uri);
      const parsed = JSON.parse(decryptBackup(raw, password));
      if (!Array.isArray(parsed.cards)) throw new Error('invalid');
      setCards(await restoreBackupCards(parsed.cards));
      setSelected(0);
      setBackupOpen(false);
      setPassword('');
      Alert.alert('导入完成', `已恢复 ${parsed.cards.length} 张卡片。`);
    } catch {
      Alert.alert('导入失败', '备份文件无效或密码不正确。');
    }
  };

  return (
    <ScreenContainer className="bg-[#F5F7FB]" edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View><Text style={styles.title}>CardBox</Text><Text style={styles.subtitle}>简单 · 安全 · 纯本地</Text></View>
          <Pressable style={styles.moreButton} onPress={() => setScreen(screen === 'backup' ? 'home' : 'backup')}><Text style={styles.more}>•••</Text></Pressable>
        </View>

        {screen === 'backup' ? <BackupMenu onBack={() => setScreen('home')} onExport={() => { setBackupMode('export'); setBackupOpen(true); }} onImport={() => { setBackupMode('import'); setBackupOpen(true); }} onSort={() => setScreen('all')} /> : screen === 'all' ? <AllCards cards={cards} onBack={() => setScreen('home')} onOpen={(i) => { setSelected(i); setScreen('home'); }} onMove={moveCard} onAdd={openNew} /> : (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {current ? <>
              <Pressable {...swipeResponder.panHandlers} onPress={() => setSelected((selected + cards.length - 1) % cards.length)} onLongPress={() => setScreen('all')}>
                <CardFace card={current} />
              </Pressable>
              <View style={styles.counterRow}><Text style={styles.counter}>{countLabel}</Text><Text style={styles.hint}>左右滑动切换 · 长按管理顺序</Text></View>
              <View style={styles.infoCard}>
                <View style={styles.infoHeader}><View><Text style={styles.infoName}>{current.name || '未命名卡片'}</Text><Text style={styles.infoNote}>{current.note || '暂无备注'}</Text></View><Pressable onPress={toggleSensitive} style={styles.visibility}><Text>{showSensitive ? '隐藏' : '验证后显示'}</Text></Pressable></View>
                <InfoRow label="卡号" value={showSensitive ? current.number : maskNumber(current.number)} />
                <InfoRow label="CVV" value={showSensitive ? current.cvv : '•••'} />
                <InfoRow label="到期" value={current.expiry || '--/--'} />
                <View style={styles.actionRow}><Pressable style={styles.outlineButton} onPress={() => { setEditing(current); setEditorOpen(true); }}><Text style={styles.outlineText}>编辑卡片</Text></Pressable><Pressable style={styles.deleteButton} onPress={deleteCard}><Text style={styles.deleteText}>删除</Text></Pressable></View>
              </View>
            </> : <EmptyState onAdd={openNew} />}
          </ScrollView>
        )}

        {screen !== 'all' && screen !== 'backup' ? <View style={styles.bottomBar}><Pressable style={styles.navItem} onPress={() => setScreen('home')}><Text style={[styles.navIcon, screen === 'home' && styles.activeText]}>▣</Text><Text style={[styles.navLabel, screen === 'home' && styles.activeText]}>卡片</Text></Pressable><Pressable style={styles.addButton} onPress={openNew}><Text style={styles.addText}>＋</Text></Pressable><Pressable style={styles.navItem} onPress={() => setScreen('all')}><Text style={styles.navIcon}>▦</Text><Text style={styles.navLabel}>全部</Text></Pressable></View> : null}
      </View>

      <Modal visible={editorOpen} animationType="slide" transparent onRequestClose={() => setEditorOpen(false)}><Editor card={editing} onClose={() => setEditorOpen(false)} onSave={saveCard} onPickImage={chooseImage} /></Modal>
      <Modal visible={backupOpen} animationType="slide" transparent onRequestClose={() => setBackupOpen(false)}><View style={styles.modalBackdrop}><View style={styles.sheet}><Text style={styles.sheetTitle}>{backupMode === 'export' ? '导出备份' : '导入备份'}</Text><Text style={styles.sheetDesc}>{backupMode === 'export' ? '全部卡片资料与卡面将打包为一个加密备份文件。' : '选择 .cardbox 文件，并输入备份密码恢复卡包。'}</Text><TextInput value={password} onChangeText={setPassword} placeholder="输入备份密码" secureTextEntry style={styles.input} /><Pressable style={styles.primaryButton} onPress={backupMode === 'export' ? exportBackup : importBackup}><Text style={styles.primaryText}>{backupMode === 'export' ? '生成加密备份' : '选择文件并导入'}</Text></Pressable><Pressable onPress={() => setBackupOpen(false)}><Text style={styles.cancelText}>取消</Text></Pressable></View></View></Modal>
      {appLocked ? <View style={lockStyles.lockOverlay}><View style={lockStyles.lockCard}><Text style={lockStyles.lockIcon}>▣</Text><Text style={lockStyles.lockTitle}>CardBox 已锁定</Text><Text style={lockStyles.lockDesc}>应用在后台停留超过 1 分钟，验证身份后继续。</Text><Pressable style={styles.primaryButton} onPress={unlockApp}><Text style={styles.primaryText}>指纹 / 面容解锁</Text></Pressable></View></View> : null}
    </ScreenContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) { return <View style={styles.infoRow}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>; }
function EmptyState({ onAdd }: { onAdd: () => void }) { return <View style={styles.empty}><Text style={styles.emptyIcon}>▱</Text><Text style={styles.emptyTitle}>还没有卡片</Text><Text style={styles.emptyDesc}>点击下方 +，添加第一张卡片</Text><Pressable style={styles.primaryButton} onPress={onAdd}><Text style={styles.primaryText}>添加卡片</Text></Pressable></View>; }
function BackupMenu({ onBack, onExport, onImport, onSort }: { onBack: () => void; onExport: () => void; onImport: () => void; onSort: () => void }) { return <View style={styles.menu}><Pressable onPress={onBack}><Text style={styles.back}>‹  返回</Text></Pressable><Text style={styles.menuTitle}>更多功能</Text><Pressable style={styles.menuItem} onPress={onExport}><Text style={styles.menuIcon}>⇧</Text><View><Text style={styles.menuItemTitle}>导出备份</Text><Text style={styles.menuItemDesc}>密码保护全部卡片资料</Text></View></Pressable><Pressable style={styles.menuItem} onPress={onImport}><Text style={styles.menuIcon}>⇩</Text><View><Text style={styles.menuItemTitle}>导入备份</Text><Text style={styles.menuItemDesc}>换手机后恢复整个卡包</Text></View></Pressable><Pressable style={styles.menuItem} onPress={onSort}><Text style={styles.menuIcon}>☷</Text><View><Text style={styles.menuItemTitle}>排序管理</Text><Text style={styles.menuItemDesc}>调整卡片的自定义顺序</Text></View></Pressable><View style={styles.localTip}><Text style={styles.localTipTitle}>离线模式</Text><Text style={styles.localTipDesc}>所有数据只保存在本机，不需要账号或网络权限。</Text></View></View>; }
function SortableCardItem({ card, index, onOpen, onMove }: { card: Card; index: number; onOpen: () => void; onMove: (index: number, direction: -1 | 1) => void }) {
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dy) < 35) return;
      onMove(index, gesture.dy < 0 ? -1 : 1);
    },
  })).current;
  return <Pressable {...responder.panHandlers} style={styles.gridItem} onPress={onOpen}>
    <CardFace card={card} compact />
    <Text style={styles.gridName}>{card.name || '未命名卡片'}</Text>
    <View style={styles.orderRow}><Text style={styles.orderText}>第 {index + 1} 张 · 长按上下拖动</Text><Pressable onPress={() => onMove(index, -1)} style={styles.arrow}><Text>↑</Text></Pressable><Pressable onPress={() => onMove(index, 1)} style={styles.arrow}><Text>↓</Text></Pressable></View>
  </Pressable>;
}
function AllCards({ cards, onBack, onOpen, onMove, onAdd }: { cards: Card[]; onBack: () => void; onOpen: (i: number) => void; onMove: (i: number, d: -1 | 1) => void; onAdd: () => void }) {
  return <ScrollView contentContainerStyle={styles.allPage}><View style={styles.pageHeader}><Pressable onPress={onBack}><Text style={styles.back}>‹  首页</Text></Pressable><Text style={styles.pageTitle}>全部卡片</Text><Pressable onPress={onAdd}><Text style={styles.headerAdd}>＋</Text></Pressable></View><Text style={styles.pageDesc}>长按卡片上下拖动排序，也可以使用箭头微调</Text><View style={styles.grid}>{cards.map((card, i) => <SortableCardItem key={card.id} card={card} index={i} onOpen={() => onOpen(i)} onMove={onMove} />)}</View></ScrollView>;
}
function Editor({ card, onClose, onSave, onPickImage }: { card: Card | null; onClose: () => void; onSave: (c: Card) => void; onPickImage: () => void }) { const [draft, setDraft] = useState<Card | null>(card); if (!draft) return null; const set = (key: keyof Card, value: string) => setDraft({ ...draft, [key]: value }); return <View style={styles.modalBackdrop}><ScrollView contentContainerStyle={styles.sheet}><View style={styles.sheetHeader}><Pressable onPress={onClose}><Text style={styles.back}>取消</Text></Pressable><Text style={styles.sheetTitle}>{draft.name ? '编辑卡片' : '添加卡片'}</Text><Pressable onPress={() => onSave(draft)}><Text style={styles.saveText}>保存</Text></Pressable></View><Pressable onPress={onPickImage}><CardFace card={draft} /><View style={styles.changeImage}><Text style={styles.changeImageText}>▧  从相册选择卡面</Text></View></Pressable><Text style={styles.fieldLabel}>卡片名称</Text><TextInput value={draft.name} onChangeText={(v) => set('name', v)} placeholder="例如：招商银行" style={styles.input} /><Text style={styles.fieldLabel}>卡号</Text><TextInput value={draft.number} onChangeText={(v) => set('number', v)} placeholder="6222 0000 0000 0000" keyboardType="number-pad" style={styles.input} /><Text style={styles.fieldLabel}>CVV</Text><TextInput value={draft.cvv} onChangeText={(v) => set('cvv', v)} placeholder="3 位安全码" keyboardType="number-pad" secureTextEntry style={styles.input} /><Text style={styles.fieldLabel}>到期时间</Text><TextInput value={draft.expiry} onChangeText={(v) => set('expiry', v)} placeholder="12/30" style={styles.input} /><Text style={styles.fieldLabel}>备注</Text><TextInput value={draft.note} onChangeText={(v) => set('note', v)} placeholder="可选，例如：日常消费" style={[styles.input, styles.noteInput]} multiline /></ScrollView></View>; }

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, paddingBottom: 12 }, title: { fontSize: 29, fontWeight: '800', color: '#14213D' }, subtitle: { color: '#7D889B', fontSize: 12, marginTop: 2 }, moreButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8EDF6', alignItems: 'center', justifyContent: 'center' }, more: { color: '#14213D', letterSpacing: 2, fontWeight: '800' }, scroll: { paddingTop: 8, paddingBottom: 120 }, cardFace: { height: 210, borderRadius: 22, padding: 20, overflow: 'hidden', justifyContent: 'space-between', shadowColor: '#17336F', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }, compactFace: { height: 100, borderRadius: 14, padding: 10, shadowOpacity: 0.1, shadowRadius: 5 }, cardShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.10)' }, cardTop: { flexDirection: 'row', justifyContent: 'space-between' }, cardBrand: { color: '#FFF', fontWeight: '800', fontSize: 16 }, cardType: { color: 'rgba(255,255,255,0.72)', fontSize: 10, letterSpacing: 1 }, cardName: { color: '#FFF', fontSize: 16, fontWeight: '700', marginTop: 24 }, compactName: { fontSize: 11, marginTop: 0 }, cardNumber: { color: '#FFF', fontSize: 21, fontWeight: '700', letterSpacing: 1.5 }, compactNumber: { fontSize: 10, letterSpacing: 0.3 }, cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardExpiry: { color: '#FFF', fontSize: 13, fontWeight: '600' }, cardChip: { color: '#FFF', fontSize: 28 }, counterRow: { alignItems: 'center', paddingVertical: 14 }, counter: { color: '#34415D', fontSize: 14, fontWeight: '700' }, hint: { color: '#96A0B1', fontSize: 11, marginTop: 3 }, infoCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#E8ECF4' }, infoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }, infoName: { fontSize: 20, fontWeight: '800', color: '#16213A' }, infoNote: { color: '#8993A5', fontSize: 12, marginTop: 3 }, visibility: { borderRadius: 20, backgroundColor: '#EEF2FF', paddingHorizontal: 11, paddingVertical: 7 }, visibilityText: { color: '#3456BF', fontWeight: '700' }, infoRow: { flexDirection: 'row', paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F0F2F7' }, rowLabel: { width: 70, color: '#8A94A6', fontSize: 13 }, rowValue: { color: '#25334E', fontSize: 14, fontWeight: '600', flex: 1 }, actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 }, outlineButton: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#3B5FCB', alignItems: 'center', paddingVertical: 12 }, outlineText: { color: '#3156C3', fontWeight: '800' }, deleteButton: { flex: 1, borderRadius: 12, backgroundColor: '#FFF0F0', alignItems: 'center', paddingVertical: 12 }, deleteText: { color: '#CE5353', fontWeight: '800' }, bottomBar: { height: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#E5EAF3', backgroundColor: '#F5F7FB' }, navItem: { alignItems: 'center', gap: 2, minWidth: 70 }, navIcon: { fontSize: 22, color: '#9BA5B6' }, navLabel: { color: '#9BA5B6', fontSize: 11, fontWeight: '700' }, activeText: { color: '#315AC8' }, addButton: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#315AC8', alignItems: 'center', justifyContent: 'center', marginTop: -24, shadowColor: '#315AC8', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 5 }, addText: { color: '#FFF', fontSize: 32, fontWeight: '300', marginTop: -3 }, empty: { alignItems: 'center', paddingTop: 110 }, emptyIcon: { fontSize: 70, color: '#A4B3D8' }, emptyTitle: { fontSize: 21, fontWeight: '800', color: '#25334E', marginTop: 14 }, emptyDesc: { color: '#8993A5', marginTop: 6, marginBottom: 24 }, primaryButton: { backgroundColor: '#315AC8', borderRadius: 13, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' }, primaryText: { color: '#FFF', fontWeight: '800', fontSize: 15 }, modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,24,44,0.42)' }, sheet: { backgroundColor: '#F7F8FC', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 36, maxHeight: '94%' }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }, sheetTitle: { fontSize: 22, fontWeight: '800', color: '#14213D' }, saveText: { color: '#315AC8', fontWeight: '800', fontSize: 16 }, fieldLabel: { fontSize: 13, color: '#657086', fontWeight: '700', marginTop: 15, marginBottom: 7 }, input: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E0E5EE', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1F2B43' }, noteInput: { minHeight: 76, textAlignVertical: 'top' }, changeImage: { position: 'absolute', top: 176, left: 0, right: 0, alignItems: 'center' }, changeImageText: { color: '#FFF', backgroundColor: 'rgba(0,0,0,0.46)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, fontWeight: '700' }, sheetDesc: { color: '#7D889B', lineHeight: 20, marginBottom: 18 }, cancelText: { textAlign: 'center', color: '#6B768A', marginTop: 18, fontWeight: '700' }, pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }, back: { color: '#315AC8', fontSize: 15, fontWeight: '700' }, pageTitle: { fontSize: 21, fontWeight: '800', color: '#16213A' }, headerAdd: { color: '#315AC8', fontSize: 28 }, allPage: { paddingTop: 10, paddingBottom: 30 }, pageDesc: { color: '#8A94A6', fontSize: 12, marginBottom: 18 }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14 }, gridItem: { width: '47%', backgroundColor: '#FFF', padding: 8, borderRadius: 16, borderWidth: 1, borderColor: '#E8ECF4' }, gridName: { fontWeight: '800', color: '#263450', marginTop: 8, marginLeft: 3 }, orderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 5 }, orderText: { color: '#A1A9B8', marginRight: 'auto', marginLeft: 3, fontSize: 12 }, arrow: { width: 27, height: 27, borderRadius: 8, backgroundColor: '#F0F3FA', alignItems: 'center', justifyContent: 'center' }, menu: { paddingTop: 14 }, menuTitle: { fontSize: 26, fontWeight: '800', color: '#14213D', marginTop: 28, marginBottom: 18 }, menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 10, gap: 15, borderWidth: 1, borderColor: '#E9EDF5' }, menuIcon: { fontSize: 25, color: '#315AC8', width: 32, textAlign: 'center' }, menuItemTitle: { fontSize: 16, fontWeight: '800', color: '#23314D' }, menuItemDesc: { color: '#8A94A6', marginTop: 3, fontSize: 12 }, localTip: { backgroundColor: '#EAF0FF', borderRadius: 16, padding: 16, marginTop: 18 }, localTipTitle: { color: '#315AC8', fontWeight: '800' }, localTipDesc: { color: '#627395', lineHeight: 19, marginTop: 4, fontSize: 12 },
});
const lockStyles = StyleSheet.create({
  lockOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10, backgroundColor: 'rgba(245,247,251,0.98)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  lockCard: { width: '100%', maxWidth: 340, backgroundColor: '#FFF', borderRadius: 24, padding: 26, alignItems: 'center', borderWidth: 1, borderColor: '#E5EAF3', shadowColor: '#203A7C', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  lockIcon: { fontSize: 48, color: '#315AC8', marginBottom: 12 },
  lockTitle: { fontSize: 22, fontWeight: '800', color: '#14213D' },
  lockDesc: { color: '#7D889B', textAlign: 'center', lineHeight: 20, marginTop: 8, marginBottom: 22 },
});
function BackupMenuPlaceholder() { return null; }
