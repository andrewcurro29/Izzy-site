// Adds new photos from Izzy's shared iCloud album to gallery/ and gallery.json.
// Runs daily from .github/workflows/update-gallery.yml. Needs Node 20+ and `sharp`.
// The album token (the part after # in the shared album link) comes from the
// ICLOUD_ALBUM_TOKEN secret so the private album link is not in the public repo.
import fs from "node:fs/promises";
import sharp from "sharp";

const TOKEN = process.env.ICLOUD_ALBUM_TOKEN;
if (!TOKEN) { console.error("ICLOUD_ALBUM_TOKEN is not set"); process.exit(1); }
const MAX_SIDE = 720;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

let host = "p23-sharedstreams.icloud.com";
async function call(path, body) {
  for (let tries = 0; tries < 3; tries++) {
    const r = await fetch(`https://${host}/${TOKEN}/sharedstreams/${path}`, {
      method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body), redirect: "manual",
    });
    if (r.status === 330) { host = (await r.json())["X-Apple-MMe-Host"] || r.headers.get("X-Apple-MMe-Host"); continue; }
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  }
  throw new Error(`${path}: too many redirects`);
}

const galleryPath = "gallery.json";
const gallery = JSON.parse(await fs.readFile(galleryPath, "utf8"));
const known = new Set([...(gallery.photos || []).map(p => p.guid), ...(gallery.exclude || [])].filter(Boolean));

const ws = await call("webstream", { streamCtag: null });
const fresh = (ws.photos || []).filter(p => !known.has(p.photoGuid) && (p.mediaAssetType || "photo") !== "video");
console.log(`album: ${ws.photos?.length ?? 0} items, new photos: ${fresh.length}`);
if (!fresh.length) process.exit(0);

const items = {};
for (let i = 0; i < fresh.length; i += 25) {
  const j = await call("webasseturls", { photoGuids: fresh.slice(i, i + 25).map(p => p.photoGuid) });
  Object.assign(items, j.items);
}

await fs.mkdir("gallery", { recursive: true });
const used = new Set((await fs.readdir("gallery")).map(f => f.replace(/\.webp$/, "")));
let n = 0;
for (const p of fresh) {
  const d = p.derivatives || {};
  const keys = Object.keys(d).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b);
  const pick = keys.find(k => +k >= 1000) || keys.at(-1);
  const it = pick && items[d[pick].checksum];
  if (!it) { console.warn("no url for", p.photoGuid); continue; }
  const r = await fetch(`https://${it.url_location}${it.url_path}`);
  if (!r.ok) { console.warn("download failed", p.photoGuid, r.status); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  let name; do { name = "a" + p.photoGuid.slice(0, 8).toLowerCase() + (n ? n : ""); n++; } while (used.has(name)); n = 0; used.add(name);
  const out = await sharp(buf).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
  await fs.writeFile(`gallery/${name}.webp`, out.data);
  const date = (p.dateCreated || "").slice(0, 10);
  const label = date && !date.startsWith("1980") ? `${MONTHS[+date.slice(5, 7) - 1]} ${date.slice(0, 4)}` : "";
  gallery.photos.push({ src: `gallery/${name}.webp`, w: out.info.width, h: out.info.height,
    date: label ? date : "", guid: p.photoGuid, alt: p.caption || ("Izzy Bisceglia" + (label ? `, ${label}` : "")) });
  console.log("added", name, date);
}

gallery.photos.sort((a, b) => (b.date || "0").localeCompare(a.date || "0"));
gallery.updated = new Date().toISOString().slice(0, 10);
await fs.writeFile(galleryPath, JSON.stringify(gallery));
