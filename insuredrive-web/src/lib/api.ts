import { uuid } from "./format";
import { createClient } from "@supabase/supabase-js";
import type { Row, LegacyData } from "./types";
import { emptyLegacy } from "./types";
import { publicAuthConfig } from "./auth-config";
import { createSessionStorage } from "./session-storage";
const config = publicAuthConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
export const configured = config.valid;
export const supabase = config.valid
  ? createClient(config.url, config.key, {
      auth: {
        storage: createSessionStorage(config.url),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    })
  : null;
const pending = new Map<string, string>();
export function clearRequestCache() {
  pending.clear();
}
export async function rental(action: string, payload: Row = {}) {
  const read = ["list", "quote"].includes(action),
    signature = action + JSON.stringify(payload);
  let request = pending.get(signature);
  if (!read && !request) {
    request = uuid();
    pending.set(signature, request);
  }
  try {
    let data;
    {
      if (!supabase) throw Error("Configure Supabase first");
      const r = await supabase.rpc("rental_api", {
        p_action: action,
        p_payload: payload,
        p_request_id: request ?? null,
      });
      if (r.error) throw r.error;
      data = r.data;
    }
    pending.delete(signature);
    return data;
  } catch (e) {
    throw Error(
      e instanceof Error ? e.message : (e as Row).message || "Request failed",
    );
  }
}
export async function identity() {
  if (!supabase) throw Error("Supabase not configured");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || user.is_anonymous)
    throw Error("Please sign in with your staff account");
  const { data: profile, error: pe } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (pe) throw pe;
  if (
    !profile ||
    profile.id !== user.id ||
    profile.account_status !== "active" ||
    profile.is_active !== true
  )
    throw Error("This account is inactive or suspended");
  const { data: p, error: ee } = await supabase.rpc(
    "get_effective_permissions",
  );
  if (ee) throw ee;
  return {
    profile,
    permissions: new Set<string>((p || []).map((x: Row) => x.permission_key)),
  };
}
const tableNames: Record<string, string> = {
  vehicles: "vehicles",
  profiles: "profiles",
  policies: "insurance_policies",
  revenue: "vehicle_revenue_licences",
  emission: "vehicle_emission_certificates",
  fitness: "vehicle_fitness_certificates",
  locations: "vehicle_latest_location",
  trips: "vehicle_trips",
  notifications: "notification_history",
  audit: "audit_logs",
};
export async function legacy(): Promise<LegacyData> {
  const result: LegacyData = { ...emptyLegacy, errors: {} };
  await Promise.all(
    Object.entries(tableNames).map(async ([k, t]) => {
      try {
        const rows: Row[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase!
            .from(t)
            .select("*")
            .order(k === "locations" ? "vehicle_id" : "id")
            .range(offset, offset + 499);
          if (error) throw error;
          rows.push(...data);
          if (data.length < 500) break;
        }
        (result as Row)[k] = rows;
      } catch (e) {
        result.errors[k] = (e as Row).message || "Unable to load";
      }
    }),
  );
  return result;
}
export async function saveLegacy(
  table: string,
  value: Row,
  id?: string,
  expectedUpdatedAt?: string,
) {
  let r;
  if (id) {
    let query = supabase!
      .from(table)
      .update(
        expectedUpdatedAt
          ? { ...value, updated_at: new Date().toISOString() }
          : value,
      )
      .eq("id", id);
    if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
    r = await query.select().maybeSingle();
    if (!r.error && !r.data)
      throw Error(
        "This record changed or is no longer accessible. Refresh and reopen it before saving.",
      );
  } else r = await supabase!.from(table).insert(value).select().single();
  if (r.error) throw r.error;
  return r.data;
}
export async function callLegacy(name: string, args: Row) {
  const { data, error } = await supabase!.rpc(name, args);
  if (error) throw error;
  return data;
}
export function subscribe(refresh: () => void) {
  if (!supabase) return () => {};
  let timer: ReturnType<typeof setTimeout>;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 300);
  };
  let c = supabase.channel("insuredrive-web-" + uuid());
  for (const table of [
    ...Object.values(tableNames),
    "rental_customers",
    "rental_bookings",
    "rental_invoices",
    "rental_ledger",
    "rental_allocations",
    "rental_business",
  ])
    c = c.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      changed,
    );
  c.subscribe((status) => {
    if (status === "SUBSCRIBED") changed();
  });
  window.addEventListener("online", changed);
  window.addEventListener("focus", changed);
  const poll = setInterval(changed, 60000);
  return () => {
    clearTimeout(timer);
    clearInterval(poll);
    window.removeEventListener("online", changed);
    window.removeEventListener("focus", changed);
    void supabase?.removeChannel(c);
  };
}
