import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Plus, MapPin } from "lucide-react";
import type { Field, Row, LegacyData, RentalData } from "../lib/types";
import { Table, Form, Modal, Badge, Empty } from "../components/Controls";
import { callLegacy, saveLegacy, supabase, rental } from "../lib/api";
import { date, day, money, today } from "../lib/format";
type Props = {
  page: string;
  data: LegacyData;
  rentalData: RentalData;
  permissions: Set<string>;
  language: string;
  refresh: () => Promise<void>;
};
type Editor = {
  title: string;
  fields: Field[];
  initial?: Row;
  save: (v: Row) => Promise<void>;
};
const text = (
  key: string,
  en: string,
  required = false,
  type = "text",
): Field => ({ key, en, required, type });
function TrackingMap({
  locations,
  vehicles,
  route,
}: {
  locations: Row[];
  vehicles: Row[];
  route: Row[];
}) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!node.current) return;
    const map = L.map(node.current).setView([7.8731, 80.7718], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);
    const points: L.LatLngTuple[] = [];
    for (const p of locations) {
      if (
        !Number.isFinite(Number(p.latitude)) ||
        !Number.isFinite(Number(p.longitude))
      )
        continue;
      const pos: L.LatLngTuple = [Number(p.latitude), Number(p.longitude)];
      points.push(pos);
      const text = document.createElement("div");
      text.textContent =
        (vehicles.find((v) => v.id === p.vehicle_id)?.registration_number ||
          "Vehicle") +
        " · " +
        p.speed_kmh +
        " km/h · " +
        date(p.recorded_at);
      L.circleMarker(pos, { radius: 9, color: "#2168ed", fillOpacity: 0.8 })
        .addTo(map)
        .bindPopup(text);
    }
    if (route.length) {
      const path = route.map(
        (p) => [Number(p.latitude), Number(p.longitude)] as L.LatLngTuple,
      );
      L.polyline(path, { color: "#2168ed", weight: 4 }).addTo(map);
      map.fitBounds(L.latLngBounds(path), { padding: [30, 30] });
    } else if (points.length)
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 13 });
    return () => {
      map.remove();
    };
  }, [locations, vehicles, route]);
  return (
    <div
      className="tracking-map"
      ref={node}
      aria-label="Vehicle tracking map"
    />
  );
}
export default function Legacy({
  page,
  data,
  rentalData,
  permissions,
  language,
  refresh,
}: Props) {
  const [editor, setEditor] = useState<Editor | null>(null),
    [error, setError] = useState(""),
    [route, setRoute] = useState<Row[]>([]),
    [routeBusy, setRouteBusy] = useState(false);
  const t = (en: string, si: string) => (language === "si" ? si : en),
    can = (p: string) => permissions.has(p),
    vehicle = (id: string) =>
      data.vehicles.find((v) => v.id === id)?.registration_number ||
      id?.slice(0, 8);
  async function save(
    table: string,
    v: Row,
    id?: string,
    expectedUpdatedAt?: string,
  ) {
    await saveLegacy(table, v, id, expectedUpdatedAt);
    await refresh();
    setEditor(null);
  }
  async function rpc(name: string, v: Row) {
    await callLegacy(name, v);
    await refresh();
    setEditor(null);
  }
  const owners = data.profiles.filter(
    (p) => p.role === "vehicle_owner" && p.account_status === "active",
  );
  function vehicleForm(row: Row = {}) {
    setEditor({
      title: row.id ? "Edit vehicle" : "Register vehicle",
      initial: row,
      fields: [
        ...(!row.id
          ? [
              {
                key: "user_id",
                en: "Registered owner",
                required: true,
                options: owners.map((o) => ({
                  value: o.id,
                  label: o.full_name,
                })),
              },
            ]
          : []),
        text("registration_number", "Registration number", true),
        text("make", "Make", true),
        text("model", "Model", true),
        text("vehicle_type", "Vehicle type", true),
        text("manufacture_year", "Year", false, "number"),
        text("fuel_type", "Fuel type"),
        text("color", "Colour"),
        text("province", "Province", true),
        text("district", "District", true),
        text("registration_date", "Registration date", false, "date"),
      ],
      save: async (v) => {
        const p: Row = {
          registration_number: v.registration_number,
          make: v.make,
          model: v.model,
          vehicle_type: v.vehicle_type,
          manufacture_year: Number(v.manufacture_year) || null,
          fuel_type: v.fuel_type || null,
          color: v.color || null,
          province: v.province,
          district: v.district,
          registration_date: v.registration_date || null,
        };
        if (!row.id) {
          p.user_id = v.user_id;
          p.owner_name = owners.find((o) => o.id === v.user_id)?.full_name;
        }
        await save("vehicles", p, row.id, row.updated_at);
      },
    });
  }
  function policyForm(row: Row = {}, renew = false) {
    setEditor({
      title: renew
        ? "Renew insurance policy"
        : row.id
          ? "Edit insurance policy"
          : "New insurance policy",
      initial: row,
      fields: [
        ...(!row.id
          ? [
              {
                key: "vehicle_id",
                en: "Vehicle",
                required: true,
                options: data.vehicles.map((v) => ({
                  value: v.id,
                  label: v.registration_number,
                })),
              },
            ]
          : []),
        text("provider", "Provider", true),
        text("policy_number", "Policy number", true),
        text("insurance_type", "Insurance type", true),
        text("start_date", "Start date", true, "date"),
        text("expiry_date", "Expiry date", true, "date"),
        text("premium", "Premium (LKR)", true, "number"),
      ],
      save: async (v) => {
        if (v.expiry_date < v.start_date)
          throw Error("Expiry must be after start date");
        if (renew)
          await rpc("renew_policy", {
            source_policy_id: row.id,
            new_policy_number: v.policy_number,
            new_start_date: v.start_date,
            new_expiry_date: v.expiry_date,
            new_premium: Number(v.premium),
          });
        else {
          const p: Row = {
            provider: v.provider,
            policy_number: v.policy_number,
            insurance_type: v.insurance_type,
            start_date: v.start_date,
            expiry_date: v.expiry_date,
            premium: Number(v.premium),
            currency_code: "LKR",
          };
          if (!row.id) {
            p.vehicle_id = v.vehicle_id;
            p.user_id = data.vehicles.find(
              (x) => x.id === v.vehicle_id,
            )?.user_id;
          }
          await save("insurance_policies", p, row.id, row.updated_at);
        }
      },
    });
  }
  async function trip(r: Row) {
    setRouteBusy(true);
    setError("");
    try {
      const points: Row[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: p, error: e } = await supabase!
          .from("vehicle_locations")
          .select("latitude,longitude,recorded_at")
          .eq("trip_id", r.id)
          .order("recorded_at")
          .range(offset, offset + 999);
        if (e) throw e;
        points.push(...p);
        if (p.length < 1000) break;
      }
      setRoute(points);
      if (!points.length) setError("No retained route points for this trip.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRouteBusy(false);
    }
  }
  const messages = Object.entries(data.errors).filter(([k]) =>
    page === "compliance"
      ? ["revenue", "emission", "fitness"].includes(k)
      : page === "tracking"
        ? ["locations", "trips"].includes(k)
        : page === "admin"
          ? ["profiles", "audit"].includes(k)
          : k === page,
  );
  return (
    <>
      {messages.map(([k, v]) => (
        <p key={k} className="error">
          {k}: {v}
        </p>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {page === "vehicles" && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{t("Vehicle fleet", "වාහන එකතුව")}</h2>
              <p>
                {t(
                  "Shared with your existing Tenuli Auto Care mobile app.",
                  "Tenuli Auto Care mobile app එක සමඟ සම්බන්ධයි.",
                )}
              </p>
            </div>
            {can("add_vehicle") && (
              <button
                className="primary"
                onClick={() =>
                  vehicleForm({
                    vehicle_type: "Car",
                    province: "Western",
                    district: "Colombo",
                  })
                }
              >
                <Plus size={16} />
                Register vehicle
              </button>
            )}
          </div>
          <Table
            rows={data.vehicles}
            columns={[
              {
                label: "Vehicle",
                render: (v) => (
                  <>
                    <strong>{v.registration_number}</strong>
                    <small>
                      {v.make} {v.model}
                    </small>
                  </>
                ),
              },
              { label: "Owner", render: (v) => v.owner_name },
              { label: "Location", render: (v) => v.district },
              {
                label: "Status",
                render: (v) => (
                  <Badge value={v.is_active ? "active" : "inactive"} />
                ),
              },
              {
                label: "Actions",
                render: (v) => (
                  <div className="row-actions">
                    {can("edit_all_vehicles") && (
                      <button onClick={() => vehicleForm(v)}>Edit</button>
                    )}
                    {can("edit_all_vehicles") && (
                      <button
                        onClick={() =>
                          setEditor({
                            title: "Change registered owner",
                            fields: [
                              {
                                key: "owner",
                                en: "New owner",
                                required: true,
                                options: owners.map((o) => ({
                                  value: o.id,
                                  label: o.full_name,
                                })),
                              },
                            ],
                            save: (x) =>
                              rpc("assign_vehicle_owner", {
                                target_vehicle_id: v.id,
                                target_owner_id: x.owner,
                              }),
                          })
                        }
                      >
                        Change owner
                      </button>
                    )}
                    {can("deactivate_vehicles") && (
                      <button
                        onClick={() =>
                          setEditor({
                            title: v.is_active
                              ? "Deactivate vehicle"
                              : "Activate vehicle",
                            fields: [],
                            save: () =>
                              rpc("admin_set_vehicle_active", {
                                target_vehicle_id: v.id,
                                new_active: !v.is_active,
                              }),
                          })
                        }
                      >
                        {v.is_active ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </section>
      )}
      {page === "owners" && (
        <section className="card">
          <div className="section-head">
            <h2>
              {t("Registered vehicle owners", "ලියාපදිංචි වාහන හිමිකරුවන්")}
            </h2>
          </div>
          <Table
            rows={data.profiles.filter((p) => p.role === "vehicle_owner")}
            columns={[
              { label: "Name", render: (p) => <strong>{p.full_name}</strong> },
              { label: "Phone", render: (p) => p.phone },
              { label: "Email", render: (p) => p.email },
              {
                label: "Status",
                render: (p) => <Badge value={p.account_status} />,
              },
            ]}
          />
        </section>
      )}
      {page === "policies" && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{t("Insurance policies", "රක්ෂණ ඔප්පු")}</h2>
              <p>Expiry and renewal records from the existing backend.</p>
            </div>
            {can("create_policies") && (
              <button className="primary" onClick={() => policyForm()}>
                <Plus size={16} />
                New policy
              </button>
            )}
          </div>
          <Table
            rows={data.policies}
            columns={[
              {
                label: "Policy",
                render: (p) => (
                  <>
                    <strong>{p.policy_number}</strong>
                    <small>{p.provider}</small>
                  </>
                ),
              },
              { label: "Vehicle", render: (p) => vehicle(p.vehicle_id) },
              {
                label: "Expiry",
                render: (p) => (
                  <>
                    <span>{day(p.expiry_date)}</span>
                    <small className={p.expiry_date < today() ? "danger" : ""}>
                      {p.expiry_date < today() ? "Expired" : p.policy_state}
                    </small>
                  </>
                ),
              },
              {
                label: "Premium",
                render: (p) => money(Number(p.premium) * 100),
              },
              {
                label: "Actions",
                render: (p) => (
                  <div className="row-actions">
                    {can("edit_policies") && (
                      <button onClick={() => policyForm(p)}>Edit</button>
                    )}
                    {can("renew_policies") && p.policy_state === "active" && (
                      <button onClick={() => policyForm(p, true)}>Renew</button>
                    )}
                    {can("request_renewal") && (
                      <button
                        onClick={() =>
                          setEditor({
                            title: "Request renewal",
                            fields: [text("message", "Message")],
                            save: (v) =>
                              save("renewal_requests", {
                                user_id:
                                  data.profiles.find((x) => x.id === p.user_id)
                                    ?.id || p.user_id,
                                vehicle_id: p.vehicle_id,
                                policy_id: p.id,
                                message: v.message || "",
                              }),
                          })
                        }
                      >
                        Request renewal
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </section>
      )}
      {page === "compliance" && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{t("Vehicle compliance", "වාහන බලපත්‍ර")}</h2>
              <p>Insurance · Revenue licence · Emission · Fitness</p>
            </div>
            {can("manage_revenue_licence") && (
              <button
                className="primary"
                onClick={() =>
                  setEditor({
                    title: "Add compliance record",
                    fields: [
                      {
                        key: "kind",
                        en: "Document",
                        required: true,
                        options: [
                          {
                            value: "vehicle_revenue_licences",
                            label: "Revenue licence",
                          },
                          {
                            value: "vehicle_emission_certificates",
                            label: "Emission certificate",
                          },
                          {
                            value: "vehicle_fitness_certificates",
                            label: "Fitness certificate",
                          },
                        ],
                      },
                      {
                        key: "vehicle_id",
                        en: "Vehicle",
                        required: true,
                        options: data.vehicles.map((v) => ({
                          value: v.id,
                          label: v.registration_number,
                        })),
                      },
                      text("number", "Document number"),
                      text("issue_date", "Issue date", true, "date"),
                      text("expiry_date", "Expiry date", true, "date"),
                    ],
                    save: (v) => {
                      if (v.expiry_date < v.issue_date)
                        throw Error("Invalid date range");
                      return save(v.kind, {
                        vehicle_id: v.vehicle_id,
                        issue_date: v.issue_date,
                        expiry_date: v.expiry_date,
                        [v.kind === "vehicle_revenue_licences"
                          ? "licence_number"
                          : "certificate_number"]: v.number,
                        ...(v.kind === "vehicle_revenue_licences"
                          ? { source: "manual" }
                          : { is_required: true }),
                      });
                    },
                  })
                }
              >
                <Plus size={16} />
                Add document
              </button>
            )}
          </div>
          <Table
            rows={data.vehicles}
            columns={[
              {
                label: "Vehicle",
                render: (v) => <strong>{v.registration_number}</strong>,
              },
              ...(["Insurance", "Revenue", "Emission", "Fitness"] as const).map(
                (label, i) => ({
                  label,
                  render: (v: Row) => {
                    const list = [
                      data.policies,
                      data.revenue,
                      data.emission,
                      data.fitness,
                    ][i]
                      .filter((x) => x.vehicle_id === v.id)
                      .sort((a, b) =>
                        String(b.expiry_date).localeCompare(a.expiry_date),
                      );
                    const x = list[0];
                    return x ? (
                      <>
                        <span
                          className={x.expiry_date < today() ? "danger" : ""}
                        >
                          {day(x.expiry_date)}
                        </span>
                        <small>
                          {x.expiry_date < today() ? "Expired" : "Recorded"}
                        </small>
                      </>
                    ) : (
                      <span className="muted">Not recorded</span>
                    );
                  },
                }),
              ),
            ]}
          />
        </section>
      )}
      {page === "tracking" && (
        <>
          <section className="card">
            <div className="section-head">
              <div>
                <h2>{t("Live vehicle tracking", "වාහන ස්ථාන නිරීක්ෂණය")}</h2>
                <p>
                  Existing Android / external tracker telemetry. Timestamps
                  indicate data freshness.
                </p>
              </div>
              <span className="badge">{data.locations.length} locations</span>
            </div>
            <TrackingMap
              locations={data.locations}
              vehicles={data.vehicles}
              route={route}
            />
            {!data.locations.length && (
              <p className="notice">
                No authorized tracker coordinates available. No simulated
                positions are shown.
              </p>
            )}
          </section>
          <section className="card">
            <div className="section-head">
              <h2>Trip history</h2>
              {route.length > 0 && (
                <button onClick={() => setRoute([])}>Clear route</button>
              )}
            </div>
            <Table
              rows={data.trips}
              columns={[
                { label: "Vehicle", render: (r) => vehicle(r.vehicle_id) },
                { label: "Started", render: (r) => date(r.start_time) },
                {
                  label: "Distance",
                  render: (r) => Number(r.total_distance_km).toFixed(2) + " km",
                },
                { label: "Status", render: (r) => <Badge value={r.status} /> },
                {
                  label: "Route",
                  render: (r) => (
                    <button disabled={routeBusy} onClick={() => trip(r)}>
                      <MapPin size={14} />
                      Show route
                    </button>
                  ),
                },
              ]}
            />
          </section>
        </>
      )}
      {page === "notifications" && (
        <section className="card">
          <div className="section-head">
            <h2>{t("Notifications", "දැනුම්දීම්")}</h2>
          </div>
          <Table
            rows={data.notifications}
            columns={[
              {
                label: "Notification",
                render: (n) => (
                  <>
                    <strong>
                      {n.title ||
                        n.notification_type ||
                        n.event_type ||
                        "Notification"}
                    </strong>
                    <small>{n.body || n.message}</small>
                  </>
                ),
              },
              { label: "Date", render: (n) => date(n.created_at || n.sent_at) },
              {
                label: "Read",
                render: (n) =>
                  n.read_at ? (
                    "Read"
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          await saveLegacy(
                            "notification_history",
                            { read_at: new Date().toISOString() },
                            n.id,
                          );
                          await refresh();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Mark read
                    </button>
                  ),
              },
            ]}
          />
        </section>
      )}
      {page === "admin" && (
        <>
          <section className="card">
            <div className="section-head">
              <div>
                <h2>{t("Access administration", "ප්‍රවේශ පාලනය")}</h2>
                <p>
                  Rental permissions extend existing roles. Officers have no
                  default billing access.
                </p>
              </div>
            </div>
            <Table
              rows={data.profiles}
              columns={[
                {
                  label: "User",
                  render: (u) => (
                    <>
                      <strong>{u.full_name}</strong>
                      <small>{u.email}</small>
                    </>
                  ),
                },
                { label: "Role", render: (u) => <Badge value={u.role} /> },
                {
                  label: "Status",
                  render: (u) => <Badge value={u.account_status} />,
                },
                {
                  label: "Permissions",
                  render: (u) =>
                    can("manage_access_privileges") && (
                      <button
                        onClick={() =>
                          setEditor({
                            title: "Rental permission · " + u.full_name,
                            fields: [
                              {
                                key: "permission",
                                en: "Permission",
                                required: true,
                                options: (u.role === "vehicle_owner"
                                  ? ["view_own_rentals"]
                                  : [
                                      "view_rentals",
                                      "manage_rentals",
                                      "view_billing",
                                      "manage_billing",
                                      "refund_payments",
                                    ]
                                ).map((value) => ({ value, label: value })),
                              },
                              {
                                key: "allowed",
                                en: "Access",
                                required: true,
                                options: [
                                  { value: "true", label: "Allow" },
                                  { value: "false", label: "Deny" },
                                  {
                                    value: "reset",
                                    label: "Reset to role default",
                                  },
                                ],
                              },
                            ],
                            save: (v) =>
                              v.allowed === "reset"
                                ? rpc("admin_remove_user_permission", {
                                    target_user_id: u.id,
                                    target_permission_key: v.permission,
                                  })
                                : rpc("admin_set_user_permission", {
                                    target_user_id: u.id,
                                    target_permission_key: v.permission,
                                    new_allowed: v.allowed === "true",
                                  }),
                          })
                        }
                      >
                        Set permission
                      </button>
                    ),
                },
              ]}
            />
          </section>
          {can("view_audit_logs") && (
            <section className="card">
              <div className="section-head">
                <h2>Audit log</h2>
              </div>
              <Table
                rows={data.audit}
                columns={[
                  {
                    label: "Action",
                    render: (a) => <strong>{a.action}</strong>,
                  },
                  { label: "Entity", render: (a) => a.entity_type },
                  { label: "Date", render: (a) => date(a.created_at) },
                  { label: "Reason", render: (a) => a.metadata?.reason || "—" },
                ]}
              />
            </section>
          )}
        </>
      )}
      {page === "settings" && (
        <section className="card settings-card">
          <div className="section-head">
            <div>
              <h2>
                {t("Invoice business details", "බිල්පතේ ව්‍යාපාර විස්තර")}
              </h2>
              <p>
                Updates apply to future invoices. Issued invoice details remain
                unchanged.
              </p>
            </div>
          </div>
          {can("manage_system_settings") && rentalData.business ? (
            <Form
              key={rentalData.business.version}
              fields={[
                text("name", "Business name", true),
                text("phone", "Telephone"),
                text("address", "Address"),
                {
                  key: "notes",
                  en: "Invoice notes",
                  type: "textarea",
                  wide: true,
                },
              ]}
              initial={rentalData.business}
              onCancel={() => {}}
              onSave={async (v) => {
                await rental("business_save", {
                  ...v,
                  version: rentalData.business!.version,
                });
                await refresh();
              }}
            />
          ) : (
            <Empty>Administrator settings permission required.</Empty>
          )}
        </section>
      )}
      {editor && (
        <Modal title={editor.title} onClose={() => setEditor(null)}>
          <Form
            key={editor.title}
            fields={editor.fields}
            initial={editor.initial}
            onSave={editor.save}
            onCancel={() => setEditor(null)}
            language={language}
          />
        </Modal>
      )}
    </>
  );
}
