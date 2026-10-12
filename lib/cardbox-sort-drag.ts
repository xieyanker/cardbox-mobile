export const SORT_ROW_HEIGHT = 86;
const EDGE_SIZE = 72;
const MAX_SPEED = 650;

/** Speed in points per second, independent of frame rate. */
export function sortEdgeVelocity(pointerY: number, height: number) {
  if (height <= 0 || pointerY < 0 || pointerY > height) return 0;
  const edge = Math.min(EDGE_SIZE, height / 3);
  if (pointerY < edge) return -MAX_SPEED * (1 - pointerY / edge);
  if (pointerY > height - edge)
    return MAX_SPEED * (1 - (height - pointerY) / edge);
  return 0;
}
export type SortDragStart = {
  id: string;
  index: number;
  count: number;
  pointerY: number;
  rowTop: number;
  scrollOffset: number;
  viewportHeight: number;
  contentHeight: number;
};
export type SortDragSnapshot = {
  id: string;
  target: number;
  top: number;
  scrollOffset: number;
};

/** A drag owns one frame loop and one final write; cancelled gestures never persist. */
export function createSortDragController(dependencies: {
  requestFrame: (callback: (timestamp: number) => void) => number;
  cancelFrame: (handle: number) => void;
  scrollTo: (offset: number) => void;
  onUpdate: (snapshot: SortDragSnapshot | null) => void;
  commit: (id: string, target: number) => void;
}) {
  let session:
    | (SortDragStart & { currentY: number; currentScroll: number })
    | null = null;
  let frame: number | null = null;
  let previousTime: number | null = null;
  function snapshot(): SortDragSnapshot | null {
    if (!session) return null;
    const delta = session.currentY - session.pointerY;
    const distance = delta + session.currentScroll - session.scrollOffset;
    return {
      id: session.id,
      target: Math.max(
        0,
        Math.min(
          session.count - 1,
          session.index + Math.round(distance / SORT_ROW_HEIGHT),
        ),
      ),
      top: session.rowTop + delta,
      scrollOffset: session.currentScroll,
    };
  }
  function tick(timestamp: number) {
    frame = null;
    if (!session) return;
    const seconds =
      previousTime === null
        ? 0
        : Math.min(32, Math.max(0, timestamp - previousTime)) / 1000;
    previousTime = timestamp;
    const maxOffset = Math.max(
      0,
      session.contentHeight - session.viewportHeight,
    );
    const next = Math.max(
      0,
      Math.min(
        maxOffset,
        session.currentScroll +
          sortEdgeVelocity(session.currentY, session.viewportHeight) * seconds,
      ),
    );
    if (next !== session.currentScroll) {
      session.currentScroll = next;
      dependencies.scrollTo(next);
      dependencies.onUpdate(snapshot());
    }
    frame = dependencies.requestFrame(tick);
  }
  function finish(commit: boolean) {
    const final = snapshot();
    const originalIndex = session?.index;
    session = null;
    previousTime = null;
    if (frame !== null) dependencies.cancelFrame(frame);
    frame = null;
    dependencies.onUpdate(null);
    if (commit && final && final.target !== originalIndex)
      dependencies.commit(final.id, final.target);
  }
  return {
    begin(start: SortDragStart) {
      finish(false);
      if (
        start.index < 0 ||
        start.index >= start.count ||
        start.viewportHeight <= 0
      )
        return;
      session = {
        ...start,
        currentY: start.pointerY,
        currentScroll: start.scrollOffset,
      };
      dependencies.onUpdate(snapshot());
      frame = dependencies.requestFrame(tick);
    },
    move(pointerY: number) {
      if (!session) return;
      session.currentY = pointerY;
      dependencies.onUpdate(snapshot());
    },
    finish,
    snapshot,
  };
}
