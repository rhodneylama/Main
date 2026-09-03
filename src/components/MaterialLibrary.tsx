"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fileSize, relativeTime } from "@/lib/format";
import { useRepIdentity } from "@/lib/use-rep";
import type { MaterialKind, MaterialWithProgress } from "@/lib/types";

const KIND_ICONS: Record<MaterialKind, string> = {
  pdf: "📄",
  video: "🎬",
  image: "🖼️",
  link: "🔗",
  doc: "📝",
};

const ACCEPT =
  "application/pdf,image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,text/plain";

/** Uploaded files stream from the API; links open wherever they live. */
function materialHref(material: MaterialWithProgress): string {
  return material.filePath ? `/api/materials/${material.id}/file` : (material.url ?? "#");
}

export default function MaterialLibrary({ materials }: { materials: MaterialWithProgress[] }) {
  const { rep, loaded } = useRepIdentity();
  const [items, setItems] = useState(materials);
  const [category, setCategory] = useState<string>("All");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The server renders the library without knowing who is looking, so "have I
   * done this" is filled in here, once the browser has told us who the rep is.
   */
  const reload = useCallback(async () => {
    const query = rep ? `?repId=${encodeURIComponent(rep.id)}` : "";
    try {
      const res = await fetch(`/api/materials${query}`, { cache: "no-store" });
      const data = (await res.json()) as { materials?: MaterialWithProgress[] };
      setItems(data.materials ?? []);
    } catch {
      /* keep whatever is already on screen */
    }
  }, [rep]);

  useEffect(() => {
    if (loaded) void reload();
  }, [loaded, reload]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(items.map((m) => m.category))).sort()],
    [items],
  );

  const visible = items.filter((m) => category === "All" || m.category === category);
  const required = items.filter((m) => m.required);
  const requiredDone = required.filter((m) => m.completedByMe).length;

  async function toggleComplete(material: MaterialWithProgress) {
    if (!rep) {
      setError("Pick your name in the header first — completions need somewhere to go.");
      return;
    }
    setBusy(material.id);
    setError(null);
    try {
      await fetch(`/api/materials/${material.id}/complete`, {
        method: material.completedByMe ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repId: rep.id }),
      });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function remove(material: MaterialWithProgress) {
    setBusy(material.id);
    try {
      await fetch(`/api/materials/${material.id}`, { method: "DELETE" });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy("new");
    setError(null);
    try {
      const res = await fetch("/api/materials", { method: "POST", body: new FormData(form) });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      form.reset();
      setOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`segmented-item ${category === c ? "segmented-item-active" : ""}`}
              >
                {c}
              </button>
            ))}
          </div>
          {required.length > 0 && (
            <span className="chip">
              {requiredDone}/{required.length} required done
            </span>
          )}
        </div>
        <button type="button" className="btn-primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Add material"}
        </button>
      </div>

      {open && (
        <form onSubmit={upload} className="panel space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="mat-title">
                Title
              </label>
              <input id="mat-title" name="title" className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="mat-category">
                Category
              </label>
              <input
                id="mat-category"
                name="category"
                className="field"
                defaultValue="General"
                list="material-categories"
              />
              <datalist id="material-categories">
                {categories
                  .filter((c) => c !== "All")
                  .map((c) => (
                    <option key={c} value={c} />
                  ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="mat-description">
              What it covers
            </label>
            <input id="mat-description" name="description" className="field" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="mat-file">
                Upload a file
              </label>
              <input
                id="mat-file"
                name="file"
                type="file"
                accept={ACCEPT}
                className="field file:mr-3 file:rounded file:border-0 file:bg-edge file:px-2
                           file:py-1 file:text-xs file:text-slate-200"
              />
              <p className="mt-1 text-xs text-muted">PDF, image, video or audio. Up to 100MB.</p>
            </div>
            <div>
              <label className="label" htmlFor="mat-url">
                …or paste a link
              </label>
              <input
                id="mat-url"
                name="url"
                type="url"
                className="field"
                placeholder="https://drive.google.com/…"
              />
              <p className="mt-1 text-xs text-muted">
                For anything already hosted — Drive, Loom, YouTube, a doc.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="mat-duration">
                Minutes
              </label>
              <input
                id="mat-duration"
                name="durationMin"
                type="number"
                min={0}
                className="field"
                defaultValue={10}
              />
            </div>
            <div>
              <label className="label" htmlFor="mat-points">
                Points on completion
              </label>
              <input
                id="mat-points"
                name="points"
                type="number"
                min={0}
                className="field"
                defaultValue={15}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input name="required" type="checkbox" value="true" className="h-4 w-4" />
                Required for everyone
              </label>
            </div>
          </div>

          {error && <p className="text-sm text-bad">{error}</p>}

          <button type="submit" className="btn-primary" disabled={busy === "new"}>
            {busy === "new" ? "Saving…" : "Add to library"}
          </button>
        </form>
      )}

      {error && !open && <p className="text-sm text-bad">{error}</p>}

      {visible.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-muted">
          Nothing in this category yet. Add the playbook, a call recording, or a link to whatever
          the team already uses.
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((material) => (
            <li key={material.id} className="panel flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-7" aria-hidden>
                  {KIND_ICONS[material.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={materialHref(material)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-white hover:text-accent hover:underline"
                    >
                      {material.title}
                    </a>
                    {material.required && (
                      <span className="chip border-status-warning/40 text-status-warning">
                        Required
                      </span>
                    )}
                  </div>
                  {material.description && (
                    <p className="mt-1 text-sm text-muted">{material.description}</p>
                  )}
                  <p className="mt-1.5 text-xs text-muted">
                    {material.category}
                    {material.durationMin > 0 && ` · ${material.durationMin} min`}
                    {material.sizeBytes > 0 && ` · ${fileSize(material.sizeBytes)}`}
                    {` · ${material.points} pts`}
                    {` · added ${relativeTime(material.createdAt)}`}
                  </p>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-edge pt-3">
                <span className="text-xs text-muted">
                  {material.completedBy} {material.completedBy === 1 ? "rep has" : "reps have"}{" "}
                  completed this
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={material.completedByMe ? "btn-ghost !py-1 text-xs" : "btn-primary !py-1 text-xs"}
                    disabled={busy === material.id}
                    onClick={() => toggleComplete(material)}
                  >
                    {material.completedByMe ? "✓ Completed" : "Mark complete"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1 text-xs"
                    disabled={busy === material.id}
                    onClick={() => remove(material)}
                    aria-label={`Delete ${material.title}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
