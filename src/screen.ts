import { device } from "@shared/device";
import type { DisplayDrawParams } from "@busy-app/busy-lib";

/** One display element as DisplayDraw takes it. */
export type Element = DisplayDrawParams["elements"][number];

/** Front display of the app. */
export interface Screen {
  /** Draws a whole frame: only its elements that changed since the last frame are sent, those not in it are cleared. */
  show(elements: Element[]): void;
  /** Stops drawing: frames asked for after this are dropped. */
  close(): void;
}

/**
 * Keeps at most one display request in flight: a frame asked for while one is on its way waits, and a newer one
 * replaces it.
 */
export function createScreen(app: string, report: (err: unknown) => void): Screen {
  /** What is on the displays now: element id → its description as sent. */
  let shown = new Map<string, string>();
  let next: Element[] | null = null;
  let busy = false;
  let closed = false;

  async function flush(): Promise<void> {
    busy = true;
    while (next && !closed) {
      const elements = next;
      next = null;
      const ids = elements.map((e) => e.id);
      const gone = [...shown.keys()].filter((id) => ids.indexOf(id) < 0);
      const changed = elements.filter((e) => shown.get(e.id) !== JSON.stringify(e));
      try {
        if (gone.length > 0) {
          await device.DisplayClear({ application_name: app, element_ids: gone });
          for (const id of gone) shown.delete(id);
        }
        if (changed.length > 0) await device.DisplayDraw({ application_name: app, priority: 50, elements: changed });
        shown = new Map(elements.map((e): [string, string] => [e.id, JSON.stringify(e)]));
      } catch (err) {
        report(err);
      }
    }
    busy = false;
  }

  return {
    show(elements) {
      if (closed) return;
      next = elements;
      if (!busy) void flush();
    },
    close() {
      closed = true;
    },
  };
}
