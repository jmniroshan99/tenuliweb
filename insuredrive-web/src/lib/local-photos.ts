import { uuid } from "./format.ts";
/** Device-only storage. No upload endpoint, cloud bucket or financial mutation. */
export type Photo = {
  id: string;
  originalName: string;
  extension: string;
  type: string;
  size: number;
  checksum: string;
  caption: string;
  label: string;
  blob?: Blob;
  thumbnail?: Blob;
  filename?: string;
  savedDestination?: string;
  savedAt?: string;
  error?: string;
};
export type PhotoJob = {
  id: string;
  created_at: string;
  number?: string;
  info: { registration?: string; photo_draft_id?: string };
};
export type PhotoQueue = {
  id: string;
  scope: string;
  jobId?: string;
  reference?: string;
  path?: string;
  photos: Photo[];
  createdAt: string;
  error?: string;
  manifestDestination?: string;
  durable?: boolean;
  saving?: boolean;
  manifestAttempt?: string;
  removedPhotoIds?: string[];
};
export interface PhotoFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Blob | string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}
export interface PhotoDirectory {
  name: string;
  entries?(): AsyncIterable<[string, { kind: string }]>;
  queryPermission(p: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(p: { mode: "readwrite" }): Promise<PermissionState>;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<PhotoDirectory>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<PhotoFileHandle>;
  removeEntry(name: string): Promise<void>;
}
export type PhotoDestination = { id: string; handle: PhotoDirectory };
export const PHOTO_LIMIT = 10 * 1024 * 1024,
  QUEUE_LIMIT = 100 * 1024 * 1024,
  PHOTO_COUNT = 40;
export const PHOTO_LABELS = [
  "Other",
  "Front",
  "Rear",
  "Left",
  "Right",
  "Damage",
];
let account: string | null = null;
let generation = 0;
const memory = new Map<string, unknown>();
export function activatePhotoAccount(scope: string | null) {
  if (account !== scope) {
    generation++;
    account = scope;
    memory.clear();
  }
}
function assertAccount(scope: string, epoch = generation) {
  if (account !== scope || epoch !== generation)
    throw Error(
      "Account changed or folder connection changed. Reopen the job in the original account to recover its photos.",
    );
}
export function supportsDirectoryAccess() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "showDirectoryPicker" in window
  );
}
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined")
      return reject(Error("Browser storage unavailable"));
    const r = indexedDB.open("tenuli-local-photos-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("records");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(Error("Close other Tenuli tabs to open photo storage"));
  });
}
async function storage(
  scope: string,
  key: string,
  value?: unknown,
  remove = false,
): Promise<unknown> {
  assertAccount(scope);
  const epoch = generation,
    full = JSON.stringify([scope, key]);
  const db = await openDB();
  assertAccount(scope, epoch);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "records",
        value !== undefined || remove ? "readwrite" : "readonly",
      );
      const store = tx.objectStore("records"),
        r = remove
          ? store.delete(full)
          : value !== undefined
            ? store.put(value, full)
            : store.get(full);
      tx.oncomplete = () => {
        try {
          assertAccount(scope, epoch);
          resolve(r.result);
        } catch (e) {
          reject(e);
        }
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || Error("Photo storage transaction aborted"));
    });
  } finally {
    db.close();
  }
}
export async function saveQueue(queue: PhotoQueue): Promise<boolean> {
  assertAccount(queue.scope);
  memory.set(queue.id, queue);
  try {
    await storage(queue.scope, queue.id, {
      ...queue,
      durable: true,
      saving: false,
    });
    queue.durable = true;
    return true;
  } catch {
    assertAccount(queue.scope);
    queue.durable = false;
    return false;
  }
}
export async function loadQueues(scope: string): Promise<PhotoQueue[]> {
  assertAccount(scope);
  const epoch = generation;
  try {
    const db = await openDB();
    const entries: PhotoQueue[] = await new Promise((resolve, reject) => {
      const out: PhotoQueue[] = [],
        tx = db.transaction("records"),
        r = tx.objectStore("records").openCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return;
        const [owner, key] = JSON.parse(String(c.key));
        if (owner === scope && key !== "destination") out.push(c.value);
        c.continue();
      };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    assertAccount(scope, epoch);
    for (const entry of entries)
      if (!memory.has(entry.id)) memory.set(entry.id, entry);
  } catch {
    assertAccount(scope, epoch);
  }
  return [...memory.values()].filter(
    (v): v is PhotoQueue =>
      !!v &&
      typeof v === "object" &&
      "photos" in v &&
      (v as PhotoQueue).scope === scope,
  );
}
export async function destination(
  scope: string,
): Promise<PhotoDestination | undefined> {
  assertAccount(scope);
  const cached = memory.get("destination") as PhotoDestination | undefined;
  if (memory.has("destination")) return cached || undefined;
  try {
    const value = (await storage(scope, "destination")) as
      | PhotoDestination
      | undefined;
    if (value) memory.set("destination", value);
    return value;
  } catch {
    assertAccount(scope);
    return undefined;
  }
}
// Must be called directly by a click handler, before any awaited work.
export async function chooseDestination(
  scope: string,
): Promise<{ value: PhotoDestination; durable: boolean }> {
  assertAccount(scope);
  let epoch = generation;
  const handle = await (
    window as unknown as {
      showDirectoryPicker(o: object): Promise<PhotoDirectory>;
    }
  ).showDirectoryPicker({ id: "tenuli-vehicle-photos", mode: "readwrite" });
  assertAccount(scope, epoch);
  generation++;
  epoch = generation;
  const value = { id: uuid(), handle };
  memory.set("destination", value);
  try {
    await storage(scope, "destination", value);
    return { value, durable: true };
  } catch {
    assertAccount(scope, epoch);
    return { value, durable: false };
  }
}
export async function disconnectDestination(scope: string) {
  assertAccount(scope);
  generation++;
  memory.set("destination", null);
  try {
    await storage(scope, "destination", undefined, true);
  } catch {
    throw Error(
      "Disconnected in this tab. Browser storage could not forget the folder; revoke this site’s folder permission in browser settings before restarting.",
    );
  }
}
export function safeSegment(value: string, fallback = "Unknown", max = 90) {
  let s = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, max)
    .replace(/[. ]+$/g, "");
  if (!s || /^\.+$/.test(s)) s = fallback;
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(s))
    s = "_" + s;
  return s;
}
export function jobPhotoPath(job: PhotoJob) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(job.created_at));
  return `Tenuli Auto Care/Estimates/${parts.find((p) => p.type === "year")!.value}/${parts.find((p) => p.type === "month")!.value}/JOB-${safeSegment(job.id)}_${safeSegment(job.info.registration || "Unknown", "Unknown", 50)}/Photos`;
}
export async function checksum(blob: Blob) {
  if (!crypto.subtle)
    throw Error(
      "Open Tenuli over HTTPS or localhost to prepare photos securely.",
    );
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function readPhoto(file: File): Promise<Photo> {
  if (!file.size || file.size > PHOTO_LIMIT)
    throw Error(`${file.name}: choose a nonempty image up to 10 MB.`);
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ext =
    b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
      ? "jpg"
      : [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
        ? "png"
        : String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...b.slice(8, 12)) === "WEBP"
          ? "webp"
          : "";
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const type = types[ext];
  if (!type || (file.type && file.type !== type))
    throw Error(
      `${file.name}: only valid JPEG, PNG and WebP files are supported.`,
    );
  return {
    id: uuid(),
    originalName: file.name,
    extension: ext,
    type,
    size: file.size,
    checksum: await checksum(file),
    caption: "",
    label: "Other",
    blob: file,
  };
}
export async function bindQueue(q: PhotoQueue, job: PhotoJob) {
  assertAccount(q.scope);
  if (q.jobId && q.jobId !== job.id)
    throw Error("Photos are already linked to a different job.");
  q.jobId = job.id;
  q.reference = job.number;
  q.path ||= jobPhotoPath(job);
  await saveQueue(q);
}
export function photoFilename(p: Photo, index: number) {
  return `${String(index + 1).padStart(3, "0")}_${safeSegment(p.label || "Other", "Other", 20)}_${safeSegment(p.id)}.${p.extension}`;
}
export function photoManifest(q: PhotoQueue) {
  return {
    version: 1,
    timezone: "Asia/Colombo",
    job_id: q.jobId,
    estimate_reference: q.reference || null,
    folder: q.path,
    saved_at: new Date().toISOString(),
    photos: q.photos.map((p, i) => ({
      photo_id: p.id,
      original_filename: p.originalName,
      saved_filename: p.filename || photoFilename(p, i),
      caption: p.caption,
      label: p.label,
      ordering: i + 1,
      checksum: p.checksum,
      saved_at: p.savedAt || null,
      local_status: p.error
        ? "needs_attention"
        : p.savedAt
          ? "saved"
          : "pending",
    })),
  };
}
async function directoryAt(
  root: PhotoDirectory,
  path: string,
  create: boolean,
  guard: () => void,
) {
  let dir = root;
  for (const name of path.split("/")) {
    guard();
    dir = await dir.getDirectoryHandle(name, { create });
  }
  guard();
  return dir;
}
async function existing(
  dir: PhotoDirectory,
  name: string,
): Promise<File | undefined> {
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch (e) {
    if ((e as Error).name === "NotFoundError") return;
    throw e;
  }
}
async function write(
  dir: PhotoDirectory,
  name: string,
  data: Blob | string,
  guard: () => void,
) {
  guard();
  const handle = await dir.getFileHandle(name, { create: true });
  guard();
  const stream = await handle.createWritable();
  try {
    guard();
    await stream.write(data);
    guard();
    await stream.close();
    guard();
  } catch (e) {
    try {
      await stream.abort();
    } catch {
      /* Already closed or disconnected. */
    }
    throw e;
  }
}
const inFlight = new Map<string, Promise<void>>();
export async function savePhotos(
  q: PhotoQueue,
  target: PhotoDestination,
  changed: () => void = () => {},
) {
  const key = `tenuli-photos:${q.jobId || q.id}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const epoch = generation,
    guard = () => assertAccount(q.scope, epoch);
  const operation = async () => {
    guard();
    if (!q.jobId || !q.path)
      throw Error("Save the estimate before saving its photos.");
    if (
      (await target.handle.queryPermission({ mode: "readwrite" })) !== "granted"
    )
      throw Error("Folder permission is required. Use Reconnect folder.");
    try {
      const matches = await findJobFolders(target.handle, q.jobId, guard);
      if (matches.length > 1)
        throw Error(
          "Multiple local folders match this job. Resolve the duplicate folders before saving.",
        );
      if (matches.length === 1) q.path = matches[0].path;
    } catch (e) {
      if ((e as Error).name !== "NotFoundError") throw e;
    }
    await saveQueue(q);
    guard();
    const dir = await directoryAt(target.handle, q.path, true, guard);
    const prior = await existing(dir, "manifest.json");
    if (prior) {
      let previous: { job_id?: string; photos?: Record<string, any>[] };
      try {
        previous = JSON.parse(await prior.text());
      } catch {
        if (q.manifestAttempt !== target.id)
          throw Error(
            "Existing manifest is unreadable. Choose another destination.",
          );
        previous = { job_id: q.jobId };
      }
      if (previous.job_id !== q.jobId)
        throw Error(
          "This folder belongs to a different job. Choose another destination.",
        );
      if (previous.photos) {
        if (
          !Array.isArray(previous.photos) ||
          previous.photos.length > PHOTO_COUNT
        )
          throw Error("Invalid photo manifest.");
        const retained: Photo[] = [];
        for (const entry of [...previous.photos].sort(
          (a, b) => Number(a.ordering) - Number(b.ordering),
        )) {
          if (
            !q.photos.some((p) => p.id === entry.photo_id) &&
            !q.removedPhotoIds?.includes(String(entry.photo_id))
          )
            retained.push(await manifestPhoto(entry, dir, target.id, guard));
        }
        q.photos = [...retained, ...q.photos];
        if (
          new Set(q.photos.map((p) => p.id)).size !== q.photos.length ||
          new Set(q.photos.filter((p) => p.filename).map((p) => p.filename))
            .size !== q.photos.filter((p) => p.filename).length
        )
          throw Error("Duplicate photo metadata in manifest.");
        if (
          q.photos.length > PHOTO_COUNT ||
          q.photos.reduce((n, p) => n + p.size, 0) > QUEUE_LIMIT
        )
          throw Error(
            "The combined local gallery exceeds 40 photos / 100 MB. Remove unneeded gallery entries before retrying.",
          );
      }
    }
    q.manifestDestination = undefined;
    q.error = undefined;
    for (let i = 0; i < q.photos.length; i++) {
      guard();
      const p = q.photos[i];
      p.error = undefined;
      try {
        p.filename ||= photoFilename(p, i);
        await saveQueue(q);
        guard();
        let old = await existing(dir, p.filename);
        if (old && (await checksum(old)) !== p.checksum) {
          p.filename = `${photoFilename(p, i).slice(0, -p.extension.length - 1)}_${uuid()}.${p.extension}`;
          await saveQueue(q);
          guard();
          old = await existing(dir, p.filename);
          if (old)
            throw Error(
              "Filename conflict. Retry with a different destination.",
            );
        }
        if (!old) {
          if (!p.blob)
            throw Error(
              "Original file unavailable. Reselect the original image with the same checksum.",
            );
          if ((await checksum(p.blob)) !== p.checksum)
            throw Error(
              "Original image checksum changed; reselect the original file.",
            );
          try {
            await write(dir, p.filename, p.blob, guard);
          } catch (e) {
            try {
              guard();
              await dir.removeEntry(p.filename);
            } catch {
              /* A failed partial file is checked on retry. */
            }
            throw e;
          }
        }
        guard();
        p.savedDestination = target.id;
        p.savedAt = new Date().toISOString();
      } catch (e) {
        guard();
        p.error = (e as Error).message;
        p.savedDestination = undefined;
      }
      await saveQueue(q);
      guard();
      changed();
    }
    q.manifestAttempt = target.id;
    await saveQueue(q);
    guard();
    try {
      await write(
        dir,
        "manifest.json",
        JSON.stringify(photoManifest(q), null, 2),
        guard,
      );
    } catch (e) {
      if (!prior) {
        try {
          guard();
          await dir.removeEntry("manifest.json");
        } catch {
          /* Retry repairs an interrupted manifest written by this queue. */
        }
      }
      throw e;
    }
    q.manifestAttempt = undefined;
    q.manifestDestination = q.photos.every(
      (p) => p.savedDestination === target.id && !p.error,
    )
      ? target.id
      : undefined;
    await saveQueue(q);
    changed();
    if (!q.manifestDestination)
      throw Error("Some photos need attention. The estimate remains saved.");
  };
  const task = (async () => {
    try {
      guard();
      q.saving = true;
      changed();
      if (typeof navigator !== "undefined" && navigator.locks)
        await navigator.locks.request(key, operation);
      else await operation();
    } catch (e) {
      guard();
      q.error = (e as Error).message;
      await saveQueue(q);
      changed();
      throw e;
    } finally {
      q.saving = false;
      if (account === q.scope && epoch === generation) {
        await saveQueue(q);
      }
      if (account === q.scope) changed();
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}
export async function availablePhoto(
  q: PhotoQueue,
  p: Photo,
  target?: PhotoDestination,
): Promise<Blob | undefined> {
  assertAccount(q.scope);
  const epoch = generation;
  if (p.blob) return p.blob;
  if (
    !target ||
    !q.path ||
    !p.filename ||
    (await target.handle.queryPermission({ mode: "readwrite" })) !== "granted"
  )
    return;
  const dir = await directoryAt(target.handle, q.path, false, () =>
    assertAccount(q.scope, epoch),
  );
  const file = await existing(dir, p.filename);
  assertAccount(q.scope, epoch);
  if (file && (await checksum(file)) === p.checksum) return file;
}

async function manifestPhoto(
  entry: Record<string, any>,
  dir: PhotoDirectory,
  destinationId: string,
  guard: () => void,
): Promise<Photo> {
  const filename = String(entry.saved_filename || ""),
    ext = filename.split(".").at(-1) || "";
  if (
    filename.length > 220 ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(filename) ||
    !["jpg", "png", "webp"].includes(ext) ||
    !/^\w[\w-]{0,79}$/.test(String(entry.photo_id)) ||
    !/^([a-f0-9]{64})$/.test(String(entry.checksum))
  )
    throw Error("Unsafe or invalid photo metadata in manifest.");
  const original = await existing(dir, filename),
    valid =
      !!original &&
      original.size <= PHOTO_LIMIT &&
      (await checksum(original)) === entry.checksum;
  guard();
  return {
    id: String(entry.photo_id),
    originalName: String(entry.original_filename || filename),
    extension: ext,
    type: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
    size: original?.size || 0,
    checksum: entry.checksum,
    caption: String(entry.caption || "").slice(0, 500),
    label: PHOTO_LABELS.includes(entry.label) ? entry.label : "Other",
    filename,
    savedAt: valid ? entry.saved_at || new Date().toISOString() : undefined,
    savedDestination: valid ? destinationId : undefined,
    error: valid
      ? undefined
      : "Original file missing or changed. Reselect the original image.",
  };
}

async function findJobFolders(
  handle: PhotoDirectory,
  jobId: string,
  guard: () => void,
): Promise<{ dir: PhotoDirectory; path: string }[]> {
  const root = await directoryAt(
      handle,
      "Tenuli Auto Care/Estimates",
      false,
      guard,
    ),
    matches: { dir: PhotoDirectory; path: string }[] = [];
  if (!root.entries)
    throw Error(
      "This browser cannot scan saved photo folders. Open your local folder directly.",
    );
  for await (const [year, y] of root.entries()) {
    guard();
    if (y.kind !== "directory" || !/^\d{4}$/.test(year)) continue;
    const yd = await root.getDirectoryHandle(year);
    if (!yd.entries) continue;
    for await (const [month, m] of yd.entries()) {
      guard();
      if (m.kind !== "directory" || !/^\d{2}$/.test(month)) continue;
      const md = await yd.getDirectoryHandle(month);
      if (!md.entries) continue;
      for await (const [name, n] of md.entries()) {
        guard();
        if (
          n.kind !== "directory" ||
          !name.startsWith(`JOB-${safeSegment(jobId)}_`)
        )
          continue;
        const dir = await (
          await md.getDirectoryHandle(name)
        ).getDirectoryHandle("Photos");
        matches.push({
          dir,
          path: `Tenuli Auto Care/Estimates/${year}/${month}/${name}/Photos`,
        });
      }
    }
  }
  return matches;
}

/** Explicit recovery scans only the authorized Estimates tree for this job UUID. */
export async function recoverLocalGallery(
  scope: string,
  job: PhotoJob,
  target: PhotoDestination,
): Promise<PhotoQueue> {
  const epoch = generation,
    guard = () => assertAccount(scope, epoch);
  guard();
  if (
    (await target.handle.queryPermission({ mode: "readwrite" })) !== "granted"
  )
    throw Error("Reconnect the selected folder in Settings first.");
  const matches = await findJobFolders(target.handle, job.id, guard);
  if (matches.length !== 1)
    throw Error(
      matches.length
        ? "Multiple folders match this job. Keep one job folder in this destination before recovery."
        : "No local photo folder was found for this job.",
    );
  const { dir, path } = matches[0],
    file = await existing(dir, "manifest.json");
  if (!file || file.size > 1024 * 1024)
    throw Error("A valid local manifest is required for recovery.");
  const manifest = JSON.parse(await file.text());
  guard();
  if (
    manifest.job_id !== job.id ||
    !Array.isArray(manifest.photos) ||
    manifest.photos.length > PHOTO_COUNT
  )
    throw Error("Manifest does not match this job.");
  const q: PhotoQueue = {
    id: uuid(),
    scope,
    jobId: job.id,
    reference: job.number,
    path,
    photos: [],
    createdAt: new Date().toISOString(),
  };
  for (const entry of [...manifest.photos].sort(
    (a, b) => Number(a.ordering) - Number(b.ordering),
  )) {
    guard();
    q.photos.push(await manifestPhoto(entry, dir, target.id, guard));
  }
  if (new Set(q.photos.map((p) => p.id)).size !== q.photos.length)
    throw Error("Duplicate photo IDs in manifest.");
  q.manifestDestination = q.photos.every((p) => !p.error)
    ? target.id
    : undefined;
  await saveQueue(q);
  return q;
}

// Uncompressed ZIP keeps original bytes and avoids lossy image processing.
function crc32(b: Uint8Array) {
  let crc = -1;
  for (const value of b) {
    crc ^= value;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
export async function buildPhotoZIP(
  q: PhotoQueue,
  target?: PhotoDestination,
): Promise<Blob> {
  assertAccount(q.scope);
  const epoch = generation;
  if (!q.jobId || !q.path)
    throw Error("Link the photos to a saved estimate first.");
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < q.photos.length; i++) {
    const p = q.photos[i],
      file = await availablePhoto(q, p, target);
    assertAccount(q.scope, epoch);
    if (!file) throw Error(`Reselect missing original: ${p.originalName}`);
    if ((await checksum(file)) !== p.checksum)
      throw Error(`Checksum mismatch: ${p.originalName}`);
    files.push({
      name: `${q.path}/${p.filename || photoFilename(p, i)}`,
      data: new Uint8Array(await file.arrayBuffer()),
    });
  }
  const manifest = {
    ...photoManifest(q),
    export: "ZIP download; extraction and backup are the user's responsibility",
  };
  files.push({
    name: `${q.path}/manifest.json`,
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });
  const parts: BlobPart[] = [],
    central: Uint8Array[] = [];
  let offset = 0,
    centralSize = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name),
      local = new Uint8Array(30 + name.length),
      v = new DataView(local.buffer),
      crc = crc32(file.data);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, file.data.length, true);
    v.setUint32(22, file.data.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    const entry = new Uint8Array(46 + name.length),
      c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, file.data.length, true);
    c.setUint32(24, file.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    entry.set(name, 46);
    parts.push(local, file.data as Uint8Array<ArrayBuffer>);
    central.push(entry);
    centralSize += entry.length;
    offset += local.length + file.data.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  assertAccount(q.scope, epoch);
  return new Blob([...parts, ...(central as Uint8Array<ArrayBuffer>[]), end], {
    type: "application/zip",
  });
}
