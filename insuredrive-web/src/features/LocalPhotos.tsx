import { uuid } from "../lib/format";
import { useEffect, useRef, useState } from "react";
import {
  availablePhoto,
  bindQueue,
  buildPhotoZIP,
  chooseDestination,
  destination,
  disconnectDestination,
  loadQueues,
  PHOTO_COUNT,
  PHOTO_LABELS,
  QUEUE_LIMIT,
  readPhoto,
  recoverLocalGallery,
  savePhotos,
  saveQueue,
  supportsDirectoryAccess,
  type Photo,
  type PhotoDestination,
  type PhotoJob,
  type PhotoQueue,
} from "../lib/local-photos";

const photoLabelSI: Record<string, string> = {
  Other: "වෙනත්",
  Front: "ඉදිරිපස",
  Rear: "පසුපස",
  Left: "වම්පස",
  Right: "දකුණුපස",
  Damage: "හානි",
};
const changed = () => window.dispatchEvent(new Event("tenuli-photos-changed"));
export function newPhotoQueue(scope: string): PhotoQueue {
  return {
    id: uuid(),
    scope,
    photos: [],
    createdAt: new Date().toISOString(),
  };
}
export async function saveEstimatePhotos(
  q: PhotoQueue | undefined,
  job: PhotoJob,
) {
  if (!q || (!q.photos.length && !q.removedPhotoIds?.length)) return;
  q.saving = true;
  changed();
  try {
    await bindQueue(q, job);
    const target = await destination(q.scope);
    if (!target) {
      q.error =
        "Choose a local folder or download Photos ZIP. / ෆෝල්ඩරයක් තෝරන්න හෝ ZIP ගන්න.";
      await saveQueue(q);
    } else await savePhotos(q, target, changed);
  } catch (e) {
    q.error = (e as Error).message;
  } finally {
    q.saving = false;
    try {
      await saveQueue(q);
    } catch {
      /* The originating account may have signed out. */
    }
    changed();
  }
}
function Thumb({
  photo,
  queue,
  target,
}: {
  photo: Photo;
  queue: PhotoQueue;
  target?: PhotoDestination;
}) {
  const [url, setURL] = useState("");
  useEffect(() => {
    let active = true,
      objectURL = "";
    (async () => {
      const original =
        photo.thumbnail || (await availablePhoto(queue, photo, target));
      if (!original || !active) return;
      objectURL = URL.createObjectURL(original);
      setURL(objectURL);
    })().catch(() => {});
    return () => {
      active = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [photo.id, photo.thumbnail, photo.blob, queue.scope, target]);
  return url ? (
    <img src={url} alt={photo.caption || photo.originalName} loading="lazy" />
  ) : (
    <span>Preview unavailable / පෙරදසුන නොමැත</span>
  );
}
async function thumbnail(blob: Blob): Promise<Blob | undefined> {
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width * bitmap.height > 60000000)
      throw Error("Image dimensions exceed 60 megapixels.");
    const canvas = document.createElement("canvas"),
      scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b || undefined), "image/jpeg", 0.8),
    );
  } finally {
    bitmap.close();
  }
}
export function LocalPhotoStorage({
  scope,
  language,
}: {
  scope: string;
  language: string;
}) {
  const [target, setTarget] = useState<PhotoDestination>(),
    [permission, setPermission] = useState(""),
    [message, setMessage] = useState("");
  const [queues, setQueues] = useState<PhotoQueue[]>([]);
  const t = (en: string, si: string) => (language === "si" ? si : en);
  async function refresh() {
    const d = await destination(scope);
    setTarget(d);
    setQueues(await loadQueues(scope));
    setPermission(
      d
        ? await d.handle
            .queryPermission({ mode: "readwrite" })
            .catch(() => "denied")
        : "",
    );
  }
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (alive) void refresh().catch(() => {});
    };
    run();
    window.addEventListener("tenuli-photos-changed", run);
    return () => {
      alive = false;
      window.removeEventListener("tenuli-photos-changed", run);
    };
  }, [scope]);
  const choose = () => {
    setMessage("");
    void chooseDestination(scope)
      .then(async (r) => {
        setTarget(r.value);
        setPermission(
          await r.value.handle.queryPermission({ mode: "readwrite" }),
        );
        if (!r.durable)
          setMessage(
            t(
              "Folder access is available for this session only; choose it again after restart.",
              "මෙම සැසියට පමණක් ප්‍රවේශය ඇත. නැවත විවෘත කළ විට ෆෝල්ඩරය තෝරන්න.",
            ),
          );
        changed();
      })
      .catch((e) => setMessage(e.message));
  };
  return (
    <section className="local-photo-storage">
      <h3>{t("Local Photo Storage", "පරිගණකයේ ඡායාරූප ගබඩාව")}</h3>
      <p>
        {t(
          "Choose a dedicated folder on this computer. Photos are internal and are never uploaded automatically. Local files are protected by your computer’s filesystem permissions.",
          "මෙම පරිගණකයේ ෆෝල්ඩරයක් තෝරන්න. ඡායාරූප ස්වයංක්‍රීයව upload නොවේ. පිටපත් පරිගණකයේ ගොනු අවසර මගින් ආරක්ෂා වේ.",
        )}
      </p>
      {supportsDirectoryAccess() ? (
        <>
          <p>
            <strong>
              {target?.handle.name ||
                t("No folder selected", "ෆෝල්ඩරයක් තෝරා නැත")}
            </strong>{" "}
            ·{" "}
            {permission === "granted"
              ? t("Connected", "සම්බන්ධයි")
              : target
                ? t("Permission needed", "අවසර අවශ්‍යයි")
                : t("Disconnected", "සම්බන්ධ වී නැත")}
          </p>
          <div className="tenuli-actions">
            <button type="button" onClick={choose}>
              {target
                ? t("Change Folder", "ෆෝල්ඩරය වෙනස් කරන්න")
                : t("Choose Folder", "ෆෝල්ඩරය තෝරන්න")}
            </button>
            {target && permission !== "granted" && (
              <button
                type="button"
                onClick={() => {
                  void target.handle
                    .requestPermission({ mode: "readwrite" })
                    .then(setPermission)
                    .catch((e) => setMessage(e.message));
                }}
              >
                {t("Reconnect folder", "නැවත අවසර දෙන්න")}
              </button>
            )}
            {target && (
              <button
                type="button"
                onClick={() => {
                  void disconnectDestination(scope)
                    .catch((e) => setMessage(e.message))
                    .finally(() => {
                      setTarget(undefined);
                      setPermission("");
                      changed();
                    });
                }}
              >
                {t("Disconnect", "විසන්ධි කරන්න")}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="tenuli-note">
          {t(
            "Automatic folder saving is unavailable in this browser. Use Download Photos ZIP on a saved estimate, then extract it yourself.",
            "මෙම browser එකට ස්වයංක්‍රීය folder saving සහාය නැත. සුරැකි estimate එකෙන් Photos ZIP ලබාගෙන extract කරන්න.",
          )}
        </p>
      )}
      <p className="muted">
        {t(
          "Folder access and pending photos belong to this signed-in account on this device. Browser storage can be cleared or evicted; it is not a permanent backup. Keep original files until local saving is complete.",
          "Folder access සහ pending photos මෙම ගිණුමට සහ device එකට අයත්ය. Browser storage ස්ථිර backup එකක් නොවේ. Local saving අවසන් වන තුරු මුල් ගොනු තබාගන්න.",
        )}
      </p>
      {message && <p role="alert">{message}</p>}
      {!!queues.length && (
        <details className="more-details">
          <summary>
            {t("Photo recovery", "ඡායාරූප නැවත ලබාගැනීම")} ({queues.length})
          </summary>
          {queues.map((q) => (
            <p key={q.id}>
              {q.reference ||
                q.jobId ||
                t("Unsaved estimate draft", "සුරැකී නැති estimate draft")}{" "}
              · {q.photos.length} photos ·{" "}
              {!!target && q.manifestDestination === target.id && !q.error
                ? t("Saved locally", "පරිගණකයට සුරැකී ඇත")
                : t(
                    "Open the linked estimate to retry, or recover the draft in New Estimate.",
                    "නැවත save කිරීමට අදාළ estimate විවෘත කරන්න; draft එක New Estimate තුළින් ලබාගන්න.",
                  )}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
export function VehiclePhotos({
  scope,
  language,
  queue,
  onChange,
  saved = false,
  editable = true,
  onPreparingChange,
}: {
  scope: string;
  language: string;
  queue: PhotoQueue;
  onChange: (q: PhotoQueue) => void;
  saved?: boolean;
  editable?: boolean;
  onPreparingChange?: (busy: boolean) => void;
}) {
  const [target, setTarget] = useState<PhotoDestination>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [drafts, setDrafts] = useState<PhotoQueue[]>([]);
  const picker = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    processing = useRef(false),
    mutation = useRef(0);
  const t = (en: string, si: string) => (language === "si" ? si : en);
  useEffect(() => {
    void destination(scope).then(setTarget);
    void loadQueues(scope).then((qs) =>
      setDrafts(
        qs.filter((q) => !q.jobId && q.photos.length && q.id !== queue.id),
      ),
    );
  }, [scope, queue.id]);
  async function update(photos: Photo[]) {
    const revision = ++mutation.current;
    const removedPhotoIds = [
      ...new Set([
        ...(queue.removedPhotoIds || []),
        ...queue.photos
          .filter(
            (p) =>
              !!(p.filename || p.savedAt) && !photos.some((n) => n.id === p.id),
          )
          .map((p) => p.id),
      ]),
    ];
    const q = {
      ...queue,
      photos,
      removedPhotoIds,
      manifestDestination: undefined,
    };
    onChange(q);
    await saveQueue(q);
    if (revision === mutation.current) onChange({ ...q });
    changed();
  }
  async function add(files: FileList | File[]) {
    if (processing.current) return;
    processing.current = true;
    onPreparingChange?.(true);
    setBusy(true);
    setMessage("");
    const photos = [...queue.photos];
    const errors: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          const p = await readPhoto(file),
            recover = photos.find((x) => x.checksum === p.checksum && !x.blob);
          if (recover) {
            recover.blob = p.blob;
            recover.thumbnail = await thumbnail(file);
            recover.error = undefined;
            continue;
          }
          if (
            photos.length >= PHOTO_COUNT ||
            photos.reduce((n, p) => n + p.size, 0) + file.size > QUEUE_LIMIT
          )
            throw Error(
              "Limit: 40 photos and 100 MB per estimate photo queue.",
            );
          p.thumbnail = await thumbnail(file);
          photos.push(p);
        } catch (e) {
          errors.push(`${file.name}: ${(e as Error).message}`);
        }
      }
      await update(photos);
      if (errors.length) setMessage(errors.join("\n"));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      processing.current = false;
      onPreparingChange?.(false);
      setBusy(false);
    }
  }
  const retry = async (d = target) => {
    if (!d) {
      setMessage(t("Choose a folder first.", "පළමුව ෆෝල්ඩරයක් තෝරන්න."));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await savePhotos(queue, d, () => {
        onChange({ ...queue });
        changed();
      });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      onChange({ ...queue });
      setBusy(false);
    }
  };
  const choose = () => {
    void chooseDestination(scope)
      .then((r) => {
        setTarget(r.value);
        if (!r.durable)
          setMessage(
            t(
              "Folder choice could not be remembered. Reselect after restart.",
              "නැවත විවෘත කරන විට ෆෝල්ඩරය නැවත තෝරන්න.",
            ),
          );
        changed();
      })
      .catch((e) => setMessage(e.message));
  };
  const download = async () => {
    setBusy(true);
    setMessage("");
    try {
      const blob = await buildPhotoZIP(queue, target),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `Tenuli-Photos-${queue.jobId}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage(
        t(
          "ZIP download started. Extract it yourself; this does not confirm a local-folder save.",
          "ZIP download ආරම්භ කළා. ඔබම extract කරන්න; මෙය local folder save වීම තහවුරු නොකරයි.",
        ),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const move = (index: number, by: number) => {
    const photos = [...queue.photos];
    [photos[index], photos[index + by]] = [photos[index + by], photos[index]];
    void update(photos);
  };
  return (
    <section className="vehicle-photos" aria-busy={busy}>
      <header>
        <h3>{t("Vehicle Photos", "වාහනයේ ඡායාරූප")}</h3>
        <small>
          {t("Internal · this device", "අභ්‍යන්තර · මෙම device එක")}
        </small>
      </header>
      <p className="photo-status" role="status">
        {saved && (
          <strong>{t("Estimate saved", "ඇස්තමේන්තුව සුරැකුණා")} · </strong>
        )}
        {queue.saving
          ? t("Photos saving…", "ඡායාරූප සුරකිමින්…")
          : busy
            ? t("Processing photos…", "ඡායාරූප සැකසෙමින්…")
            : !queue.photos.length
              ? t("No photos required", "ඡායාරූප අනිවාර්ය නැත")
              : queue.manifestDestination === target?.id &&
                  !!target &&
                  !queue.error
                ? t("Photos saved locally", "ඡායාරූප පරිගණකයට සුරැකුණා")
                : saved
                  ? t("Photos need attention", "ඡායාරූප සඳහා අවධානය අවශ්‍යයි")
                  : t(
                      "Photos ready for estimate save",
                      "ඇස්තමේන්තුව සමඟ සුරැකීමට සූදානම්",
                    )}
      </p>
      {!!queue.photos.length && !queue.durable && (
        <p role="alert" className="error">
          {t(
            "Browser storage could not retain these photos. Keep this page open and save locally or download ZIP. If closed, recovery requires reselecting the originals.",
            "Browser storage තුළ ඡායාරූප තබාගත නොහැකි විය. Page එක විවෘතව තබා local save හෝ ZIP ලබාගන්න. වසා දැමුවොත් මුල් ගොනු නැවත තේරීම අවශ්‍යයි.",
          )}
        </p>
      )}
      {editable && (
        <>
          {!saved && !queue.jobId && !!drafts.length && (
            <label>
              {t("Recover photo draft", "Photo draft නැවත ලබාගන්න")}
              <select
                value=""
                onChange={(e) => {
                  const q = drafts.find((q) => q.id === e.target.value);
                  if (q) onChange({ ...q });
                }}
              >
                <option value="">{t("Select draft…", "Draft තෝරන්න…")}</option>
                {drafts.map((q) => (
                  <option key={q.id} value={q.id}>
                    {new Date(q.createdAt).toLocaleString()} · {q.photos.length}{" "}
                    photos
                  </option>
                ))}
              </select>
            </label>
          )}
          <div
            className="photo-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy && !queue.saving) void add(e.dataTransfer.files);
            }}
          >
            <p>
              {t(
                "Drop JPEG, PNG or WebP images here. Up to 10 MB each, 40 photos / 100 MB per estimate. Originals keep their quality.",
                "JPEG, PNG හෝ WebP මෙතැනට දමන්න. එකකට 10 MB; estimate එකකට photos 40 / 100 MB. මුල් quality රැකේ.",
              )}
            </p>
            <button
              type="button"
              disabled={queue.saving || busy}
              onClick={() => picker.current?.click()}
            >
              {t("Add Photos", "ඡායාරූප එකතු කරන්න")}
            </button>{" "}
            <button
              type="button"
              disabled={queue.saving || busy}
              onClick={() => camera.current?.click()}
            >
              {t("Use camera", "කැමරාව භාවිත කරන්න")}
            </button>
            <input
              ref={picker}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void add(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={camera}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              hidden
              onChange={(e) => {
                if (e.target.files) void add(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </>
      )}
      <div className="photo-grid">
        {queue.photos.map((p, index) => (
          <article className="photo-card" key={p.id}>
            <Thumb photo={p} queue={queue} target={target} />
            <strong>
              {index + 1}. {p.originalName}
            </strong>
            {editable ? (
              <>
                <label>
                  {t("Label", "ලේබලය")}
                  <select
                    disabled={queue.saving || busy}
                    value={p.label}
                    onChange={(e) =>
                      void update(
                        queue.photos.map((x) =>
                          x.id === p.id ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    {PHOTO_LABELS.map((v) => (
                      <option key={v} value={v}>
                        {language === "si" ? photoLabelSI[v] : v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Caption (optional)", "විස්තරය (විකල්ප)")}
                  <input
                    maxLength={500}
                    value={p.caption}
                    disabled={queue.saving || busy}
                    onChange={(e) =>
                      void update(
                        queue.photos.map((x) =>
                          x.id === p.id ? { ...x, caption: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <div className="tenuli-actions">
                  <button
                    type="button"
                    disabled={queue.saving || busy || index === 0}
                    aria-label={`Move photo ${index + 1} up`}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={
                      queue.saving || busy || index === queue.photos.length - 1
                    }
                    aria-label={`Move photo ${index + 1} down`}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={queue.saving || busy}
                    onClick={() =>
                      void update(queue.photos.filter((x) => x.id !== p.id))
                    }
                  >
                    {t("Remove", "ඉවත් කරන්න")}
                  </button>
                </div>
              </>
            ) : (
              <p>
                {language === "si" ? photoLabelSI[p.label] : p.label} ·{" "}
                {p.caption}
              </p>
            )}
            <small>
              {p.error ||
                (p.savedDestination === target?.id && !!target
                  ? t("Saved locally", "පරිගණකයට සුරැකුණා")
                  : t(
                      "Not saved to the selected folder",
                      "තෝරාගත් ෆෝල්ඩරයට සුරැකී නැත",
                    ))}
            </small>
          </article>
        ))}
      </div>
      {queue.path && <p className="photo-path">{queue.path}/</p>}
      {saved &&
        (!!queue.photos.length || !!queue.removedPhotoIds?.length) &&
        editable && (
          <div className="tenuli-actions">
            {supportsDirectoryAccess() && (
              <>
                <button
                  type="button"
                  disabled={queue.saving || busy || !target}
                  onClick={() => void retry()}
                >
                  {t("Retry Saving Photos", "ඡායාරූප නැවත සුරකින්න")}
                </button>
                <button
                  type="button"
                  disabled={queue.saving || busy}
                  onClick={choose}
                >
                  {t("Choose Another Folder", "වෙනත් ෆෝල්ඩරයක් තෝරන්න")}
                </button>
                {target && (
                  <button
                    type="button"
                    disabled={queue.saving || busy}
                    onClick={() => {
                      void target.handle
                        .requestPermission({ mode: "readwrite" })
                        .then((s) => {
                          if (s === "granted") void retry();
                          else
                            setMessage(
                              t(
                                "Folder permission denied. Use ZIP or another folder.",
                                "Folder අවසර නොලැබුණි. ZIP හෝ වෙනත් folder එකක් භාවිත කරන්න.",
                              ),
                            );
                        })
                        .catch((e) => setMessage(e.message));
                    }}
                  >
                    {t("Reconnect folder", "නැවත අවසර දෙන්න")}
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              disabled={queue.saving || busy}
              onClick={() => void download()}
            >
              {t("Download Photos ZIP", "Photos ZIP බාගන්න")}
            </button>
          </div>
        )}
      {(message || queue.error) && (
        <p className="error" role="alert">
          {message || queue.error}
        </p>
      )}
      <p className="muted">
        {t(
          "Photos never change totals or customer documents. Removing a saved photo from this gallery does not delete its exported file. Keep your own backup; browser recovery storage is temporary.",
          "ඡායාරූප නිසා මුදල් හෝ customer documents වෙනස් නොවේ. Gallery එකෙන් ඉවත් කළත් export කළ ගොනුව මැකෙන්නේ නැත. ඔබේම backup එකක් තබාගන්න.",
        )}
      </p>
    </section>
  );
}
export function JobPhotoGallery({
  scope,
  job,
  language,
  manage,
}: {
  scope: string;
  job: PhotoJob;
  language: string;
  manage: boolean;
}) {
  const [queue, setQueue] = useState<PhotoQueue>();
  const [recoveryError, setRecoveryError] = useState("");
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void loadQueues(scope)
        .then(async (qs) => {
          let q =
            qs.find((q) => q.jobId === job.id) ||
            qs.find((q) => q.id === job.info.photo_draft_id);
          if (q && !q.jobId) {
            await bindQueue(q, job);
          }
          if (alive) setQueue(q ? { ...q } : undefined);
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener("tenuli-photos-changed", refresh);
    return () => {
      alive = false;
      window.removeEventListener("tenuli-photos-changed", refresh);
    };
  }, [scope, job.id, job.info.photo_draft_id]);
  if (!queue)
    return (
      <div className="local-photo-storage">
        <p className="muted">
          {language === "si"
            ? "මෙම device එකේ මෙම job සඳහා ඡායාරූප නොමැත."
            : "No photos for this job are available in this account on this device."}
        </p>
        {manage && supportsDirectoryAccess() && (
          <button
            type="button"
            onClick={() => {
              setRecoveryError("");
              void destination(scope)
                .then(async (target) => {
                  if (!target)
                    throw Error("Choose a local folder in Settings first.");
                  setQueue(await recoverLocalGallery(scope, job, target));
                  changed();
                })
                .catch((e) => setRecoveryError(e.message));
            }}
          >
            {language === "si"
              ? "Local folder එකෙන් gallery නැවත ගන්න"
              : "Recover gallery from local folder"}
          </button>
        )}
        {recoveryError && <p role="alert">{recoveryError}</p>}
      </div>
    );
  return (
    <VehiclePhotos
      scope={scope}
      queue={queue}
      onChange={setQueue}
      language={language}
      saved
      editable={manage}
    />
  );
}
