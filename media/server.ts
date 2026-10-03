// Video files live on this machine's disk, never in Convex. The browser talks
// to this server through Vite's /media proxy (see vite.config.ts), so it
// travels whatever path the page does: straight across the LAN when Tailscale
// has a direct connection, through the Funnel gate for public visitors.
//
// Uploads come in chunks so a dropped connection only costs one chunk and a
// multi-gigabyte file never sits in memory:
//
//   POST /media/uploads                  {name, size}  -> {uploadId, chunkSize}
//   PUT  /media/uploads/:id?offset=N     chunk bytes   -> {received}
//   POST /media/uploads/:id/finish                     -> file info
//
// Finishing remuxes the MP4 with its index up front ("faststart", no
// re-encode) so playback starts before the whole file arrives, and grabs a
// thumbnail. Playback and downloads are range requests on /media/files/:id.
import { mkdir, rename, rm, stat, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const PORT = Number(process.env.MEDIA_PORT || 5181);
const DATA = resolve(process.env.MEDIA_DIR || join(import.meta.dir, "..", "data"));
const UPLOADS = join(DATA, "uploads");
const FILES = join(DATA, "files");
const THUMBS = join(DATA, "thumbs");
const CHUNK_SIZE = 16 * 1024 * 1024;
const ID = /^[0-9a-f-]{36}$/;

// In-progress uploads only live in memory, so leftovers from a previous run are dead.
await rm(UPLOADS, { recursive: true, force: true });
await Promise.all([UPLOADS, FILES, THUMBS].map((d) => mkdir(d, { recursive: true })));

type Upload = { name: string; size: number };
const uploads = new Map<string, Upload>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sizeOf(path: string) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function run(cmd: string[]) {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { out, err, code };
}

async function probe(path: string) {
  const { out, err, code } = await run([
    "ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path,
  ]);
  if (code !== 0) throw new Error(`Not a playable video (${err.trim().split("\n")[0] || "ffprobe failed"})`);
  const info = JSON.parse(out);
  const video = info.streams?.find((s: any) => s.codec_type === "video");
  if (!video) throw new Error("That file has no video track");
  const [n, d] = String(video.avg_frame_rate || video.r_frame_rate || "30/1").split("/").map(Number);
  const fps = n && d ? n / d : 30;
  // Phones store portrait video as landscape plus a rotation flag.
  const rotation = Math.abs(
    Number(video.side_data_list?.find((s: any) => s.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0),
  );
  const sideways = rotation === 90 || rotation === 270;
  return {
    duration: Number(info.format?.duration ?? video.duration ?? 0),
    width: sideways ? video.height : video.width,
    height: sideways ? video.width : video.height,
    fps: Math.round(fps * 1000) / 1000,
  };
}

async function finish(uploadId: string, upload: Upload) {
  const part = join(UPLOADS, `${uploadId}.part`);
  const received = await sizeOf(part);
  if (received !== upload.size) return json({ error: `Only ${received} of ${upload.size} bytes arrived` }, 409);

  let meta;
  try {
    meta = await probe(part);
  } catch (e) {
    await rm(part, { force: true });
    uploads.delete(uploadId);
    return json({ error: (e as Error).message }, 422);
  }

  const fileId = crypto.randomUUID();
  const dest = join(FILES, `${fileId}.mp4`);
  const fast = join(UPLOADS, `${uploadId}.fast.mp4`);
  const remux = await run([
    "ffmpeg", "-v", "error", "-y", "-i", part, "-map", "0:v:0", "-map", "0:a?", "-c", "copy",
    "-movflags", "+faststart", fast,
  ]);
  if (remux.code === 0) {
    await rename(fast, dest);
    await rm(part, { force: true });
  } else {
    console.warn(`[media] faststart failed for ${upload.name}, keeping the original: ${remux.err.trim()}`);
    await rm(fast, { force: true });
    await rename(part, dest);
  }

  const at = Math.min(meta.duration * 0.2, 5).toFixed(2);
  await run([
    "ffmpeg", "-v", "error", "-y", "-ss", at, "-i", dest, "-frames:v", "1", "-vf", "scale=640:-2",
    "-q:v", "4", join(THUMBS, `${fileId}.jpg`),
  ]);

  uploads.delete(uploadId);
  console.log(`[media] stored ${upload.name} (${(upload.size / 1e6).toFixed(1)} MB) as ${fileId}`);
  return json({ fileId, fileName: upload.name, size: await sizeOf(dest), ...meta });
}

function serveFile(req: Request, path: string, type: string, download?: string) {
  const file = Bun.file(path);
  const size = file.size;
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    // A fileId always means the same bytes.
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!range) return new Response(file, { headers: { ...headers, "Content-Length": String(size) } });

  let start = range[1] ? Number(range[1]) : NaN;
  let end = range[2] ? Number(range[2]) : size - 1;
  if (Number.isNaN(start)) {
    start = Math.max(0, size - end); // "bytes=-N": the last N bytes
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  maxRequestBodySize: CHUNK_SIZE + 1024 * 1024,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean); // ["media", ...]
    if (parts[0] !== "media") return new Response("Not found", { status: 404 });
    const [, kind, id, action] = parts;

    if (kind === "uploads" && !id && req.method === "POST") {
      const { name, size } = (await req.json()) as { name?: string; size?: number };
      if (!name || !size || size <= 0) return json({ error: "Need a file name and size" }, 400);
      const uploadId = crypto.randomUUID();
      uploads.set(uploadId, { name: name.slice(0, 200), size });
      await Bun.write(join(UPLOADS, `${uploadId}.part`), "");
      return json({ uploadId, chunkSize: CHUNK_SIZE });
    }

    if (kind === "uploads" && id && ID.test(id)) {
      const upload = uploads.get(id);
      if (!upload) return json({ error: "Upload not found (the media server may have restarted)" }, 404);
      const part = join(UPLOADS, `${id}.part`);

      if (req.method === "PUT" && !action) {
        const offset = Number(url.searchParams.get("offset"));
        // Read the body even if we won't use it: answering early makes proxies drop the connection.
        const bytes = new Uint8Array(await req.arrayBuffer());
        const received = await sizeOf(part);
        // A retried chunk that already landed, or a gap: tell the client where we are.
        if (offset !== received) return json({ received }, 409);
        if (received + bytes.length > upload.size) return json({ error: "More bytes than announced" }, 400);
        await appendFile(part, bytes);
        return json({ received: received + bytes.length });
      }
      if (req.method === "POST" && action === "finish") return finish(id, upload);
      if (req.method === "DELETE") {
        uploads.delete(id);
        await rm(part, { force: true });
        return json({ ok: true });
      }
    }

    if (req.method === "GET" || req.method === "HEAD") {
      const fileId = id?.replace(/\.(mp4|jpg)$/, "");
      if (!fileId || !ID.test(fileId)) return new Response("Not found", { status: 404 });
      if (kind === "files") {
        const path = join(FILES, `${fileId}.mp4`);
        if (!(await Bun.file(path).exists())) return new Response("Not found", { status: 404 });
        return serveFile(req, path, "video/mp4", url.searchParams.get("download") ?? undefined);
      }
      if (kind === "thumbs") {
        const path = join(THUMBS, `${fileId}.jpg`);
        if (!(await Bun.file(path).exists())) return new Response("Not found", { status: 404 });
        return serveFile(req, path, "image/jpeg");
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`[media] 127.0.0.1:${PORT}, files in ${DATA}`);
