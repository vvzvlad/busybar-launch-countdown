import { generateXpm2, textWidth } from "@busy-app/busy-lib";
import { formatDay, formatHM, formatMonth, formatWeekday } from "@shared/datetime";
import manifest from "./appmeta/manifest.json";
import { createScreen, type Element } from "./screen";

/** The name the app draws under; the device clears elements by this id. */
const APP = manifest.id;

/** The next five launches, list mode: about 6 KB. */
// hide_recent_previous: without it the list starts with the launches of the past 24 hours.
const SOURCE = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=5&mode=list&hide_recent_previous=true";
const POLL_MS = 15 * 60 * 1000;

const WHITE = "#FFFFFFFF";
const GREEN = "#00FF00FF";
const YELLOW = "#FFD000FF";
const RED = "#FF0000FF";

/** The rocket at the left of the front, 9 px wide, rows 0..12 of the picture: r red, w white, b the window, g the nozzle. */
const ROCKET = [
  "....r....",
  "...rrr...",
  "...rrr...",
  "...www...",
  "...wbw...",
  "...www...",
  "...www...",
  "...www...",
  "...www...",
  "...www...",
  "..rwwwr..",
  ".rrwwwrr.",
  ".rr.g.rr.",
];
/** Its launch pad, rows 13..15. */
const PAD = ["ggggggggg", ".g.....g.", ".g.....g."];
/** The flame under the nozzle at liftoff: y yellow, o orange. */
const FLAME = ["...oyo...", "...yoy...", "....o...."];
const ROCKET_PALETTE = { ".": "none", r: "#E02020", w: "#E0E0E0", b: "#40A0FF", g: "#707070", y: "#FFD000", o: "#FF6000" };
/** Liftoff: the rocket rises LIFTOFF_STEP px a frame, LIFTOFF_MS apart, until it and its flame are off the top. */
const LIFTOFF_STEP = 2;
const LIFTOFF_MS = 150;
const LIFTOFF_FRAMES = (ROCKET.length + FLAME.length) / LIFTOFF_STEP + 1;

/** The back display without the status bar's 12 px on the right, and the lines it gives the mission name. */
const BACK_WIDTH = 148;
const NAME_LINES = 3;

interface Launch {
  /** The mission name broken into lines for the back display. */
  nameLines: string[];
  /** Unix time of the launch, seconds. */
  net: number;
  /** Status abbreviation, "Go", and full name, "Go for Launch". */
  status: string;
  statusName: string;
  /** Launch time on the bar's clock, "Sat 14 Nov 01:45". */
  when: string;
}

/** Go is green, TBC/TBD yellow, Hold red, anything else white. */
function statusColor(abbrev: string): string {
  if (abbrev === "Go") return GREEN;
  if (abbrev === "TBC" || abbrev === "TBD") return YELLOW;
  if (abbrev === "Hold") return RED;
  return WHITE;
}

/** The fonts draw printable ASCII only. */
function ascii(text: string): string {
  let out = "";
  for (const ch of text) out += ch >= " " && ch <= "~" ? ch : "?";
  return out;
}

/** Breaks the name at spaces into lines as wide as the back display in the "normal" font; a name longer than NAME_LINES lines is cut with "...". */
function nameLines(name: string): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of name.split(" ")) {
    const longer = current ? `${current} ${word}` : word;
    if (!current || textWidth(longer, "normal") <= BACK_WIDTH) {
      current = longer;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  if (lines.length <= NAME_LINES) return lines;
  let last = lines[NAME_LINES - 1];
  while (last && textWidth(`${last}...`, "normal") > BACK_WIDTH) last = last.slice(0, -1);
  return [...lines.slice(0, NAME_LINES - 1), `${last}...`];
}

/** Fetches the upcoming launches. Rejects on a network error or a non-200 answer. */
async function load(): Promise<Launch[]> {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as {
    results: { name: string; net: string; status: { name: string; abbrev: string } }[];
  };
  return body.results.map((r) => {
    const net = Math.floor(Date.parse(r.net) / 1000);
    const at = new Date(net * 1000);
    return {
      nameLines: nameLines(ascii(r.name)),
      net,
      status: r.status.abbrev,
      statusName: ascii(r.status.name),
      when: `${formatWeekday(at)} ${formatDay(at)} ${formatMonth(at)} ${formatHM(at)}`,
    };
  });
}

const HOUR_S = 3600;
const DAY_S = 24 * HOUR_S;

/** Seconds from now to the launch. */
function secondsLeft(launch: Launch): number {
  return launch.net - Math.floor(Date.now() / 1000);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * The time to the launch in large digits right of the rocket: "02:13:44" under a day, "3D 07H" further out, "00:00:00"
 * from T-0. Text, not the firmware's countdown element: that one draws in a small font of its own.
 */
function timeLeft(launch: Launch): Element {
  const left = Math.max(0, secondsLeft(launch));
  const color = statusColor(launch.status);
  if (left >= DAY_S) {
    const text = `${Math.floor(left / DAY_S)}D ${pad2(Math.floor((left % DAY_S) / HOUR_S))}H`;
    return { type: "text", id: "left", text, font: "extra_large", color, x: 41, y: 8, align: "center" };
  }
  const text = `${pad2(Math.floor(left / HOUR_S))}:${pad2(Math.floor((left % HOUR_S) / 60))}:${pad2(left % 60)}`;
  // Anchored on the left, where "00:00:00" (54 px) sits centered right of the rocket: a 1 is 3 px narrower than the
  // other digits, and centered text would shift on every second.
  return { type: "text", id: "left", text, font: "extra_large", color, x: 14, y: 8, align: "mid_left" };
}

/** The rocket on its pad as one picture; with `rise` set it has lifted off that many px, its flame under it. */
function rocket(rise: number | null): Element {
  const grid = [...ROCKET.map((row) => row.replace(/./g, ".")), ...PAD];
  const put = (rows: string[], top: number) =>
    rows.forEach((row, i) => {
      const y = top + i;
      if (y < 0 || y >= grid.length) return;
      let cells = "";
      for (let x = 0; x < row.length; x++) cells += row[x] === "." ? grid[y][x] : row[x];
      grid[y] = cells;
    });
  if (rise !== null) put(FLAME, ROCKET.length - rise);
  put(ROCKET, -(rise ?? 0));
  return { type: "xpmbitmap", id: "rocket", data: generateXpm2({ palette: ROCKET_PALETTE, grid }), x: 0, y: 0, align: "top_left" };
}

/** The back display: the mission name, its status, the launch time on the bar's clock, and which of the launches it is. */
function back(launch: Launch, index: number, count: number): Element[] {
  const out: Element[] = launch.nameLines.map(
    (text, i): Element => ({ type: "text", id: `name${i}`, text, font: "normal", color: WHITE, x: 0, y: i * 12, align: "top_left", display: "back" }),
  );
  out.push(
    { type: "text", id: "status", text: launch.statusName, font: "normal", color: WHITE, x: 0, y: 44, align: "top_left", display: "back" },
    { type: "text", id: "when", text: launch.when, font: "normal", color: WHITE, x: 0, y: 58, align: "top_left", display: "back" },
    { type: "text", id: "position", text: `${index + 1}/${count}`, font: "normal", color: WHITE, x: BACK_WIDTH, y: 58, align: "top_right", display: "back" },
  );
  return out;
}

/** The rocket and the countdown on the front, the details on the back; "--" while there is nothing to show. `rise`: the liftoff, as rocket() takes it. */
function frame(launches: Launch[], index: number, rise: number | null): Element[] {
  const launch = launches[index];
  if (!launch) {
    return [{ type: "text", id: "dash", text: "--", font: "large", color: WHITE, x: 36, y: 8, align: "center" }];
  }
  return [rocket(rise), timeLeft(launch), ...back(launch, index, launches.length)];
}

/**
 * Entry point, called at the end of the file: the device runs this script from top to bottom and starts nothing by itself.
 */
function main(): void {
  let launches: Launch[] = [];
  let index = 0;
  let loading = false;
  let stopped = false;

  const report = (err: unknown) =>
    console.error(`${APP}: ${err instanceof Error ? err.message : String(err)}`);
  const screen = createScreen(APP, report);

  // Under a day the countdown is redrawn just after every second, the "3D 07H" text on the hour. A launch shown at
  // T-0 or past it lifts off and leaves the list: on the second it gets there, or when the wheel comes back to one
  // that got there while another was shown.
  let ticker: ReturnType<typeof setTimeout> | undefined;
  let liftoff: ReturnType<typeof setTimeout> | undefined;
  const redraw = () => {
    if (ticker !== undefined) clearTimeout(ticker);
    if (liftoff !== undefined) clearTimeout(liftoff);
    ticker = undefined;
    liftoff = undefined;
    const launch = launches[index];
    if (launch && secondsLeft(launch) <= 0) {
      lift(0);
      return;
    }
    screen.show(frame(launches, index, null));
    const left = launch ? secondsLeft(launch) : 0;
    if (left >= DAY_S) ticker = setTimeout(redraw, ((left % HOUR_S) + 1) * 1000);
    else if (left > 0) ticker = setTimeout(redraw, 1000 - (Date.now() % 1000) + 20);
  };

  /** One frame of the liftoff; after the last the launch leaves the list and the next one is shown. */
  const lift = (step: number) => {
    liftoff = undefined;
    if (step < LIFTOFF_FRAMES) {
      screen.show(frame(launches, index, step * LIFTOFF_STEP));
      liftoff = setTimeout(() => lift(step + 1), LIFTOFF_MS);
      return;
    }
    launches.splice(index, 1);
    if (index >= launches.length) index = 0;
    redraw();
  };

  // One request at a time; a failed one shows "--" until the next poll.
  async function poll(): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      // A launch already past T-0 when it arrives (the list keeps them until confirmed) is dropped: it would sit at
      // 00:00:00, or lift off minutes after its time.
      launches = (await load()).filter((launch) => secondsLeft(launch) > 0);
    } catch (err) {
      launches = [];
      report(err);
    }
    loading = false;
    if (index >= launches.length) index = 0;
    if (!stopped) redraw();
  }

  redraw();
  void poll();
  const timer = setInterval(() => void poll(), POLL_MS);

  const unbind = listen("input", (event) => {
    if (stopped) return;

    // The wheel steps through the launches, up to five.
    if (event.key === "encoder") {
      if (launches.length === 0) return;
      index = (index + event.delta + launches.length) % launches.length;
      redraw();
      return;
    }

    // Back leaves the app. Once the timer is cleared and the handler detached, nothing keeps it alive and the device takes the screen back.
    if (event.key !== "back" || event.action !== "short") return;

    stopped = true;
    screen.close();
    clearInterval(timer);
    if (ticker !== undefined) clearTimeout(ticker);
    if (liftoff !== undefined) clearTimeout(liftoff);

    // Not detached from inside the handler itself: with nothing else left the unbind stops the app on the spot, while this handler is still running.
    setTimeout(unbind, 0);
  });
}

main();
