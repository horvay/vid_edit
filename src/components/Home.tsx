import { useMutation, useQuery } from "convex/react";
import { Film, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { cn } from "../lib/hooks";
import { relativeTime, timecode } from "../lib/time";
import { Modal } from "./Modal";
import { ProfileButton } from "./Shell";
import { useToast } from "./Toast";
import { useUploads } from "./Uploads";

type Video = Doc<"videos"> & { openNotes: number; notes: number };

export function Home() {
  const videos = useQuery(api.videos.list);
  const { start } = useUploads();
  const fileInput = useRef<HTMLInputElement>(null);
  const dragging = useFileDrag((files) => start(files, { kind: "new" }));
  const pick = () => fileInput.current?.click();

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <div className="grid size-8 place-items-center rounded-lg bg-ink text-bg">
            <Film size={17} />
          </div>
          <h1 className="font-semibold tracking-tight">Video Review</h1>
          <div className="flex-1" />
          <button
            onClick={pick}
            className="flex h-9 items-center gap-2 rounded-xl bg-ink px-3.5 text-sm font-medium text-bg hover:opacity-90"
          >
            <Upload size={16} /> Upload
          </button>
          <ProfileButton />
        </div>
      </header>
      <input
        ref={fileInput}
        type="file"
        accept="video/*,.mp4,.mov,.m4v"
        multiple
        hidden
        onChange={(e) => {
          start([...(e.target.files ?? [])], { kind: "new" });
          e.target.value = "";
        }}
      />

      <main className="mx-auto max-w-7xl px-4 py-6">
        {videos === undefined ? (
          <p className="py-20 text-center text-muted">Loading…</p>
        ) : videos.length === 0 ? (
          <button
            onClick={pick}
            className="mx-auto mt-10 flex w-full max-w-xl flex-col items-center rounded-3xl border-2 border-dashed border-line-strong px-6 py-16 text-center transition hover:border-accent hover:bg-surface"
          >
            <Upload size={32} className="text-muted" />
            <p className="mt-4 text-lg font-semibold">Upload your first video</p>
            <p className="mt-1 text-sm text-muted">Drop an MP4 anywhere on this page, or click to choose one.</p>
          </button>
        ) : (
          <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((v) => (
              <VideoCard key={v._id} video={v} />
            ))}
          </div>
        )}
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-accent/10 p-6 backdrop-blur-[2px]">
          <div className="rounded-3xl border-2 border-dashed border-accent bg-surface px-10 py-8 text-center shadow-float">
            <Upload size={28} className="mx-auto text-accent" />
            <p className="mt-3 font-semibold">Drop to upload</p>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoCard({ video }: { video: Video }) {
  const setTrashed = useMutation(api.videos.setTrashed);
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [thumbOk, setThumbOk] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  return (
    <div className="group relative">
      <Link href={`/v/${video._id}`} className="block">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#0b0b0c] shadow-soft ring-1 ring-line transition group-hover:shadow-float">
          {thumbOk ? (
            <img
              src={`/media/thumbs/${video.latestFileId}.jpg`}
              alt=""
              loading="lazy"
              onError={() => setThumbOk(false)}
              className="size-full object-contain transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <Film size={28} className="absolute inset-0 m-auto text-white/30" />
          )}
          <span className="absolute right-2 bottom-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-white">
            {timecode(video.latestDuration)}
          </span>
          {video.latestVersion > 1 && (
            <span className="absolute top-2 left-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              v{video.latestVersion}
            </span>
          )}
          {video.openNotes > 0 && (
            <span className="absolute top-2 right-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
              {video.openNotes} open
            </span>
          )}
        </div>
        <p className="mt-2.5 truncate pr-8 font-medium">{video.title}</p>
        <p className="text-sm text-muted">
          {video.notes === 0 ? "No comments" : `${video.notes} comment${video.notes === 1 ? "" : "s"}`} · updated{" "}
          {relativeTime(video.updatedAt)}
        </p>
      </Link>

      <div ref={menuRef} className="absolute right-0 bottom-6">
        <button
          onClick={() => setMenu((m) => !m)}
          aria-label="Video options"
          className={cn(
            "grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink",
            !menu && "sm:opacity-0 sm:group-hover:opacity-100",
          )}
        >
          <MoreHorizontal size={17} />
        </button>
        {menu && (
          <div className="absolute right-0 bottom-full z-20 mb-1 w-40 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-float">
            <button
              onClick={() => {
                setMenu(false);
                setRenaming(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-2"
            >
              <Pencil size={14} /> Rename
            </button>
            <button
              onClick={() => {
                setMenu(false);
                void setTrashed({ videoId: video._id, trashed: true });
                toast({
                  message: `Deleted "${video.title}"`,
                  action: { label: "Undo", run: () => void setTrashed({ videoId: video._id, trashed: false }) },
                });
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-danger hover:bg-surface-2"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      </div>
      {renaming && <RenameDialog video={video} onClose={() => setRenaming(false)} />}
    </div>
  );
}

function RenameDialog({ video, onClose }: { video: Video; onClose: () => void }) {
  const rename = useMutation(api.videos.rename);
  const [title, setTitle] = useState(video.title);
  return (
    <Modal onClose={onClose} className="max-w-sm">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await rename({ videoId: video._id, title });
          onClose();
        }}
        className="p-5"
      >
        <h2 className="mb-3 font-semibold">Rename video</h2>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="h-10 w-full rounded-xl border border-line bg-bg px-3 outline-none focus:border-accent"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-xl px-4 text-sm hover:bg-surface-2">
            Cancel
          </button>
          <button className="h-9 rounded-xl bg-ink px-4 text-sm font-medium text-bg">Save</button>
        </div>
      </form>
    </Modal>
  );
}

/** True while files are dragged over the window; calls onDrop with them. */
function useFileDrag(onDrop: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const cb = useRef(onDrop);
  cb.current = onDrop;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (--depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      cb.current([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return dragging;
}
