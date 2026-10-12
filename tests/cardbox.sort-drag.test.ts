import { describe, expect, it, vi } from "vitest";
import {
  createSortDragController,
  sortEdgeVelocity,
  SORT_ROW_HEIGHT,
} from "../lib/cardbox-sort-drag";

function setup(index = 0, count = 1000, offset = index * SORT_ROW_HEIGHT) {
  let frame: ((time: number) => void) | undefined;
  let time = 0;
  const commit = vi.fn();
  const scrollTo = vi.fn();
  const controller = createSortDragController({
    requestFrame: (callback) => {
      frame = callback;
      return 1;
    },
    cancelFrame: () => {
      frame = undefined;
    },
    scrollTo,
    commit,
    onUpdate: vi.fn(),
  });
  controller.begin({
    id: "card",
    index,
    count,
    pointerY: 200,
    rowTop: 170,
    scrollOffset: offset,
    viewportHeight: 600,
    contentHeight: count * SORT_ROW_HEIGHT + 100,
  });
  return {
    controller,
    commit,
    scrollTo,
    advance(ms: number) {
      for (let elapsed = 0; elapsed < ms; elapsed += 16) {
        time += 16;
        const callback = frame;
        frame = undefined;
        callback?.(time);
      }
    },
  };
}
describe("long-list drag lifecycle", () => {
  it("only scrolls in visible edge zones and increases speed near the edge", () => {
    expect(sortEdgeVelocity(300, 600)).toBe(0);
    expect(sortEdgeVelocity(-1, 600)).toBe(0);
    expect(sortEdgeVelocity(601, 600)).toBe(0);
    expect(sortEdgeVelocity(595, 600)).toBeGreaterThan(
      sortEdgeVelocity(550, 600),
    );
    expect(sortEdgeVelocity(5, 600)).toBe(-sortEdgeVelocity(595, 600));
  });
  it("scrolls with a stationary pointer, accounts for distance, and writes once on release", () => {
    const { controller, commit, advance } = setup();
    controller.move(595);
    advance(3000);
    expect(controller.snapshot()!.target).toBeGreaterThan(20);
    expect(controller.snapshot()!.top).toBe(565);
    expect(commit).not.toHaveBeenCalled();
    const target = controller.snapshot()!.target;
    controller.finish(true);
    controller.finish(false);
    advance(1000);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("card", target);
    expect(controller.snapshot()).toBeNull();
  });
  it("scrolls upward and downward to exact bounds without moving the pointer", () => {
    const { controller, advance } = setup(10, 20, 860);
    controller.move(5);
    advance(10000);
    expect(controller.snapshot()).toMatchObject({ target: 0, scrollOffset: 0 });
    controller.move(595);
    advance(10000);
    expect(controller.snapshot()).toMatchObject({
      target: 19,
      scrollOffset: 1220,
    });
  });
  it("stops edge scrolling at the center and on cancellation without saving", () => {
    const { controller, commit, scrollTo, advance } = setup();
    controller.move(595);
    advance(1000);
    controller.move(300);
    const offset = controller.snapshot()!.scrollOffset;
    advance(1000);
    expect(controller.snapshot()!.scrollOffset).toBe(offset);
    controller.finish(false);
    scrollTo.mockClear();
    advance(1000);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
  it("does not write for taps, cancelled lifecycles or an unchanged position", () => {
    const { controller, commit, advance } = setup();
    advance(1000);
    controller.finish(true);
    controller.finish(true);
    expect(commit).not.toHaveBeenCalled();
  });
});
