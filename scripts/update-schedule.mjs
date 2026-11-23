// Pulls Izzy's upcoming classes from the public Best Fitness Albany (Central Ave) schedule
// and writes them to izzy-schedule.json, which the website reads.
// No login needed: the schedule page embeds every class with its instructor name.
// Run: node scripts/update-schedule.mjs   (Node 18+; no packages to install)
import { writeFile, readFile } from "node:fs/promises";

const PAGE = "https://bestfitnessgyms.com/albany-ny-central/group-fitness/class-schedule/";
const INSTRUCTOR = /bisceglia/i;
const OUT = new URL("../izzy-schedule.json", import.meta.url);

export function extractEvents(html) {
  const marker = "var EventSettings = ";
  const at = html.indexOf(marker);
  if (at < 0) throw new Error("Schedule data not found on the page; the Best Fitness site may have changed.");
  // Walk the JSON object, respecting strings, to find where it ends.
  let i = at + marker.length, depth = 0, inStr = false, esc = false;
  const start = i;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  const settings = JSON.parse(html.slice(start, i));
  const list = Array.isArray(settings.EventList) ? settings.EventList : JSON.parse(settings.EventList);
  return list;
}

export function toClasses(events) {
  return events
    .filter(e => INSTRUCTOR.test(e.instructor_name || ""))
    .map(e => {
      const book = ((e.btndata || "").match(/href='([^']+)'/) || [])[1];
      return { title: e.title, start: e.start.slice(0, 16).replace(" ", "T"), end: e.end.slice(0, 16).replace(" ", "T"), ...(book ? { book } : {}) };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

async function main() {
  const res = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (schedule sync for izzy's website)" } });
  if (!res.ok) throw new Error(`Best Fitness page returned ${res.status}`);
  const classes = toClasses(extractEvents(await res.text()));
  if (!classes.length) throw new Error("No classes found for Izzy; leaving the old schedule in place.");
  let prev = null;
  try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
  if (prev && JSON.stringify(prev.classes) === JSON.stringify(classes)) { console.log("Schedule unchanged."); return; }
  const out = { updated: new Date().toISOString(), source: PAGE, instructor: "Isabella Bisceglia", location: "Best Fitness Albany, 911 Central Ave", classes };
  await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote ${classes.length} classes.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
