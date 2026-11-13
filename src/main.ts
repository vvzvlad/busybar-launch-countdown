import manifest from "./appmeta/manifest.json";
import { createScreen, type Element } from "./screen";

/** The name the app draws under; the device clears elements by this id. */
const APP = manifest.id;

/** The next five launches, list mode: about 6 KB. */
// hide_recent_previous: without it the list starts with the launches of the past 24 hours.
const SOURCE = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=5&mode=list&hide_recent_previous=true";
const POLL_MS = 15 * 60 * 1000;

const WHITE = "#FFFFFFFF";
const SUBTLE_WHITE = "#FFFFFFA0";
const GREEN = "#00FF00FF";
const YELLOW = "#FFD000FF";
const RED = "#FF0000FF";

interface Launch {
  name: string;
  /** Unix time of the launch, seconds. */
  net: number;
  status: string;
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

/** Fetches the upcoming launches. Rejects on a network error or a non-200 answer. */
async function load(): Promise<Launch[]> {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as {
    results: { name: string; net: string; status: { abbrev: string } }[];
  };
  return body.results.map((r) => ({
    name: ascii(r.name),
    net: Math.floor(Date.parse(r.net) / 1000),
    status: r.status.abbrev,
  }));
}

const HOUR_S = 3600;
const DAY_S = 24 * HOUR_S;

/** Seconds from now to the launch. */
function secondsLeft(launch: Launch): number {
  return launch.net - Math.floor(Date.now() / 1000);
}

/**
 * The time to the launch. Under a day the firmware's countdown ticks it; further out it is text, "3d 07h": the
 * countdown element shows the hours modulo 60 (103 hours left read 43:45:09 on the emulator).
 */
function timeLeft(launch: Launch): Element {
  const color = statusColor(launch.status);
  const left = secondsLeft(launch);
  if (left < DAY_S) {
    return {
      type: "countdown",
      id: "countdown",
      timestamp: String(launch.net),
      direction: "time_left",
      show_hours: "always",
      color,
      x: 36,
      y: 0,
      align: "top_mid",
    };
  }
  const days = Math.floor(left / DAY_S);
  const hours = Math.floor((left % DAY_S) / HOUR_S);
  return {
    type: "text",
    id: "days",
    text: `${days}d ${String(hours).padStart(2, "0")}h`,
    font: "small",
    color,
    x: 36,
    y: 0,
    align: "top_mid",
  };
}

/** Countdown on top, the mission name scrolling under it; "--" while there is nothing to show. */
function frame(launch: Launch | undefined): Element[] {
  if (!launch) {
    return [{ type: "text", id: "dash", text: "--", font: "large", color: WHITE, x: 36, y: 8, align: "center" }];
  }
  return [
    timeLeft(launch),
    {
      type: "text",
      id: "name",
      text: launch.name,
      font: "tiny",
      color: SUBTLE_WHITE,
      width: 72,
      scroll_rate: 1200,
      scroll_start_delay: 1500,
      scroll_repeat_delay: 1500,
      x: 0,
      y: 10,
      align: "top_left",
    },
  ];
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

  // The "3d 07h" text changes on the hour, so it is redrawn then; the countdown ticks by itself.
  let hourly: ReturnType<typeof setTimeout> | undefined;
  const redraw = () => {
    if (hourly !== undefined) clearTimeout(hourly);
    hourly = undefined;
    const launch = launches[index];
    screen.show(frame(launch));
    const left = launch ? secondsLeft(launch) : 0;
    if (left >= DAY_S) hourly = setTimeout(redraw, ((left % HOUR_S) + 1) * 1000);
  };

  // One request at a time; a failed one shows "--" until the next poll.
  async function poll(): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      launches = await load();
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

    // The wheel steps through the five launches.
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
    if (hourly !== undefined) clearTimeout(hourly);

    // Not detached from inside the handler itself: with nothing else left the unbind stops the app on the spot, while this handler is still running.
    setTimeout(unbind, 0);
  });
}

main();
