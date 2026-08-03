import { describe, expect, it } from "vitest";
import { lastKnown } from "./lastKnown";

// The back-swipe flicker fix (results list → home → back): the list page is
// remounted by every return, and with nothing remembered it must paint the
// skeleton and refetch — a white flash on a phone. This cell remembers the
// last successful fetch for the life of the module (a client-side session),
// so a remount can paint real cards on its first frame and revalidate
// silently behind them.

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("lastKnown", () => {
  it("starts with nothing", () => {
    const cell = lastKnown(async () => 1);
    expect(cell.current()).toBeNull();
  });

  it("remembers what a successful refresh produced", async () => {
    const cell = lastKnown(async () => [1, 2, 3]);
    await expect(cell.refresh()).resolves.toEqual([1, 2, 3]);
    expect(cell.current()).toEqual([1, 2, 3]);
  });

  it("keeps the last good value through a failed refresh", async () => {
    let fail = false;
    const cell = lastKnown(async () => {
      if (fail) throw new Error("api down");
      return "good";
    });
    await cell.refresh();
    fail = true;
    await expect(cell.refresh()).rejects.toThrow("api down");
    expect(cell.current()).toBe("good");
  });

  // Two refreshes in flight: the later CALL is the truth, whatever order the
  // responses land in. Without this, a slow first response overwrites the
  // fresh second one and the list quietly goes stale.
  it("ignores a stale response that lands after a newer refresh", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const queue = [first.promise, second.promise];
    const cell = lastKnown(() => queue.shift()!);

    const a = cell.refresh();
    const b = cell.refresh();
    second.resolve("fresh");
    await b;
    first.resolve("stale");
    await a;

    expect(cell.current()).toBe("fresh");
  });
});
