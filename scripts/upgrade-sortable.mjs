import fs from 'node:fs';
const path = 'app/(tabs)/index.tsx';
const source = fs.readFileSync(path, 'utf8');
const replacement = String.raw`function SortableCardItem({ card, index, onOpen, onMove }: { card: Card; index: number; onOpen: () => void; onMove: (index: number, direction: -1 | 1) => void }) {
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
function Editor`;
const updated = source.replace(/function AllCards[\s\S]*?\nfunction Editor/, replacement);
if (updated === source) throw new Error('AllCards block not found');
fs.writeFileSync(path, updated);
