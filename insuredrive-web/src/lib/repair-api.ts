import { supabase } from "./api";
import type { Row } from "./types";
import { uuid } from "./format";
const reads = new Set([
  "list",
  "bill_status",
  "document",
  "service_document",
  "document_copy",
  "shop_list",
  "report",
  "report_export",
]);
export async function repair(action: string, payload: Row = {}): Promise<any> {
  const actor = (await supabase?.auth.getSession())?.data.session?.user.id;
  if (!actor) throw Error("Please sign in again");
  let request: string | null = null,
    cacheKey = "";
  if (!reads.has(action)) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(action + JSON.stringify(payload)),
    );
    cacheKey =
      "tenuli-request:" +
      actor +
      ":" +
      Array.from(new Uint8Array(digest), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join("");
    request = sessionStorage.getItem(cacheKey) || uuid();
    sessionStorage.setItem(cacheKey, request);
  }
  let data;
  {
    if (!supabase) throw Error("Supabase is not configured");
    const response = await supabase.rpc("repair_api", {
      p_action: action,
      p_payload: payload,
      p_request_id: request,
    });
    if (response.error)
      throw Object.assign(new Error(response.error.message), {
        code: response.error.code,
      });
    data = response.data;
  }
  if (cacheKey) sessionStorage.removeItem(cacheKey);
  return data;
}
export async function uploadShopBill(billId: string, file: File) {
  if (!supabase) throw Error("Sign in first");
  const extensions: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const ext = extensions[file.type];
  if (!ext || file.size > 5 * 1024 * 1024)
    throw Error("Choose a PDF, PNG, JPEG or WebP up to 5 MB");
  const path = billId + "/" + uuid() + "." + ext;
  const r = await supabase.storage
    .from("tenuli-shop-bills")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (r.error) throw Error(r.error.message);
  await repair("attachment_link", { bill_id: billId, path });
}
export async function shopBillURL(path: string) {
  if (!supabase) throw Error("Private attachments require live sign-in");
  const r = await supabase.storage
    .from("tenuli-shop-bills")
    .createSignedUrl(path, 60);
  if (r.error) throw Error(r.error.message);
  return r.data.signedUrl;
}
