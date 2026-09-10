import fs from 'node:fs';
const path = 'app/(tabs)/index.tsx';
let source = fs.readFileSync(path, 'utf8');
source = source.replace('function BackupMenu({ onBack, onExport, onImport, onSort }: { onBack: () => void; onExport: () => void; onImport: () => void; onSort: () => void })', 'function BackupMenu({ onBack, onExport, onImport, onSort, onLockSettings, lockTimeoutLabel }: { onBack: () => void; onExport: () => void; onImport: () => void; onSort: () => void; onLockSettings: () => void; lockTimeoutLabel: string })');
source = source.replace("</Pressable><View style={styles.localTip}><Text style={styles.localTipTitle}>离线模式</Text>", "</Pressable><Pressable style={styles.menuItem} onPress={onLockSettings}><Text style={styles.menuIcon}>◉</Text><View><Text style={styles.menuItemTitle}>自动锁定</Text><Text style={styles.menuItemDesc}>{lockTimeoutLabel}</Text></View></Pressable><View style={styles.localTip}><Text style={styles.localTipTitle}>离线模式</Text>");
fs.writeFileSync(path, source);
