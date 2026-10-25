import { activatePhotoAccount } from "./lib/local-photos";
import { LocalPhotoStorage } from "./features/LocalPhotos";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  Car,
  LayoutDashboard,
  CalendarDays,
  Users,
  FileText,
  Wallet,
  ShieldCheck,
  MapPin,
  Bell,
  Settings,
  LogOut,
  Menu,
  Sun,
  Moon,
  RefreshCw,
  ArrowUpRight,
  ChevronRight,
  Search,
  ChartNoAxesCombined,
  Shield,
  Check,
} from "lucide-react";
import type { Row, RentalData, LegacyData } from "./lib/types";
import { emptyRental, emptyLegacy } from "./lib/types";
import {
  supabase,
  configured,
  clearRequestCache,
  identity,
  legacy,
  rental,
  subscribe,
} from "./lib/api";
import { authStorageKey } from "./lib/session-storage";
import { money, date, balanceFor } from "./lib/format";
import { Badge } from "./components/Controls";
import LoginPage from "./components/LoginPage";
import { AutomartLauncher, WorkshopSetup } from "./components/WorkshopAccess";
import { workshopAccess } from "./lib/workshop-access";
const Rentals = lazy(() => import("./features/Rentals")),
  Legacy = lazy(() => import("./features/Legacy")),
  Repairs = lazy(() => import("./features/Repairs")),
  ShopCosts = lazy(() => import("./features/ShopCosts")),
  Security = lazy(() => import("./features/Security"));
function preference(key: string, fallback: string, allowed: string[]) {
  try {
    const value = localStorage.getItem(key);
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
export default function App() {
  const [language, setLanguage] = useState(() =>
      preference("insuredrive-language", "en", ["en", "si"]),
    ),
    [theme, setTheme] = useState(() =>
      preference("insuredrive-theme", "light", ["light", "dark"]),
    );
  const [profile, setProfile] = useState<Row | null>(null),
    [permissions, setPermissions] = useState<Set<string>>(new Set()),
    [data, setData] = useState<RentalData>(emptyRental),
    [old, setOld] = useState<LegacyData>(emptyLegacy),
    [page, setPage] = useState("dashboard"),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false),
    [loggingOut, setLoggingOut] = useState(false),
    [error, setError] = useState(""),
    [rentalError, setRentalError] = useState(""),
    [loaded, setLoaded] = useState<Date | null>(null);
  const signedOut = useRef(false);
  const epoch = useRef(0),
    refreshing = useRef(false),
    refreshQueued = useRef(false),
    t = (en: string, si: string) => (language === "si" ? si : en);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("insuredrive-theme", theme);
    } catch {
      /* Preferences remain in memory. */
    }
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("insuredrive-language", language);
    } catch {
      /* Preferences remain in memory. */
    }
  }, [language]);
  const clear = useCallback(() => {
    epoch.current++;
    refreshQueued.current = false;
    clearRequestCache();
    activatePhotoAccount(null);
    setProfile(null);
    setPermissions(new Set());
    setData(emptyRental);
    setOld(emptyLegacy);
    setPage("dashboard");
    setLoaded(null);
    setRentalError("");
    setMobile(false);
  }, []);
  const refresh = useCallback(
    async function refreshRecords() {
      if (signedOut.current) return;
      if (refreshing.current) {
        refreshQueued.current = true;
        return;
      }
      refreshing.current = true;
      const token = epoch.current;
      setBusy(true);
      setError("");
      try {
        const who = await identity();
        if (token !== epoch.current) return;
        activatePhotoAccount(
          import.meta.env.VITE_SUPABASE_URL + ":" + who.profile.id,
        );
        setProfile(who.profile);
        setPermissions(who.permissions);
        const o = await legacy();
        if (token !== epoch.current) return;
        setOld(o);
        const has = [...who.permissions].some((p) =>
          [
            "view_rentals",
            "manage_rentals",
            "view_own_rentals",
            "view_billing",
            "manage_billing",
            "refund_payments",
          ].includes(p),
        );
        if (has) {
          try {
            const r = await rental("list");
            if (token !== epoch.current) return;
            setData(r);
            setRentalError("");
          } catch (e) {
            if (token !== epoch.current) return;
            setData(emptyRental);
            setRentalError((e as Error).message);
          }
        } else {
          setData(emptyRental);
          setRentalError("");
        }
        setLoaded(new Date());
      } catch (e) {
        if (token !== epoch.current) return;
        clear();
        setError((e as Error).message);
      } finally {
        refreshing.current = false;
        setBusy(false);
        if (refreshQueued.current) {
          refreshQueued.current = false;
          void refreshRecords();
        }
      }
    },
    [clear],
  );
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void refresh();
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        signedOut.current = true;
        clear();
      } else if (session) setTimeout(() => void refresh(), 0);
    });
    return () => subscription.unsubscribe();
  }, [refresh, clear]);
  useEffect(() => {
    if (!profile) return;
    return subscribe(() => void refresh());
  }, [profile?.id, refresh]);
  async function login(email: string, password: string) {
    if (!supabase)
      throw Error(
        "Add the Supabase URL and publishable key to .env.local and restart the web app.",
      );
    if (loggingOut) throw Error("Sign-out is still finishing");
    signedOut.current = false;
    const { error: e } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (e) throw e;
    await refresh();
  }
  async function logout() {
    setLoggingOut(true);
    signedOut.current = true;
    clear();
    setError("");
    try {
      const result = await supabase?.auth.signOut({ scope: "local" });
      if (!result?.error) {
        setLoggingOut(false);
        return;
      }
    } catch {
      /* Still remove local access when server revocation fails. */
    }
    try {
      const key = authStorageKey(import.meta.env.VITE_SUPABASE_URL);
      for (const suffix of ["", "-user", "-code-verifier"])
        window.sessionStorage.removeItem(key + suffix);
    } catch {
      /* Reload also discards the memory-only storage fallback. */
    }
    window.location.replace(
      window.location.pathname + "?signedout=unconfirmed",
    );
  }
  const can = (p: string) => permissions.has(p),
    any = (...p: string[]) => p.some(can),
    rentalAccess = any(
      "view_rentals",
      "manage_rentals",
      "view_own_rentals",
      "view_billing",
      "manage_billing",
      "refund_payments",
    ),
    billingAccess = any("view_billing", "manage_billing", "refund_payments");
  const workshop = workshopAccess(profile?.role, permissions);
  const nav = [
    {
      id: "repairs",
      en: "Repair Billing",
      si: "අලුත්වැඩියා බිල්පත්",
      icon: FileText,
      show: workshop.showRepairs,
      group: "AUTOMART & SERVICES",
    },
    {
      id: "shop-costs",
      en: "Shop Costs & Profit",
      si: "වියදම් සහ ලාභ",
      icon: ChartNoAxesCombined,
      show: workshop.showShop,
      group: "AUTOMART & SERVICES",
    },
    {
      id: "dashboard",
      en: "Overview",
      si: "දළ විශ්ලේෂණය",
      icon: LayoutDashboard,
      show: true,
      group: "WORKSPACE",
    },
    {
      id: "rentals",
      en: "Rental bookings",
      si: "කුලී වෙන්කිරීම්",
      icon: CalendarDays,
      show: rentalAccess,
      group: "WORKSPACE",
    },
    {
      id: "vehicles",
      en: "Vehicle fleet",
      si: "වාහන",
      icon: Car,
      show: any("view_all_vehicles", "view_own_vehicles"),
      group: "WORKSPACE",
    },
    {
      id: "customers",
      en: "Rental customers",
      si: "කුලී පාරිභෝගිකයන්",
      icon: Users,
      show: any("view_rentals", "manage_rentals"),
      group: "WORKSPACE",
    },
    {
      id: "owners",
      en: "Vehicle owners",
      si: "වාහන හිමිකරුවන්",
      icon: Users,
      show: any("view_vehicle_owners", "view_all_users"),
      group: "WORKSPACE",
    },
    {
      id: "invoices",
      en: "Invoices",
      si: "බිල්පත්",
      icon: FileText,
      show: billingAccess,
      group: "FINANCE",
    },
    {
      id: "payments",
      en: "Payments & deposits",
      si: "ගෙවීම් සහ තැන්පතු",
      icon: Wallet,
      show: billingAccess,
      group: "FINANCE",
    },
    {
      id: "reports",
      en: "Reports",
      si: "වාර්තා",
      icon: ChartNoAxesCombined,
      show: billingAccess,
      group: "FINANCE",
    },
    {
      id: "policies",
      en: "Insurance",
      si: "රක්ෂණ",
      icon: ShieldCheck,
      show: any("view_all_policies", "view_own_policies"),
      group: "OPERATIONS",
    },
    {
      id: "compliance",
      en: "Compliance",
      si: "වාහන බලපත්‍ර",
      icon: Shield,
      show: any("view_all_vehicles", "view_own_vehicles"),
      group: "OPERATIONS",
    },
    {
      id: "tracking",
      en: "GPS tracking",
      si: "GPS නිරීක්ෂණය",
      icon: MapPin,
      show: any("view_all_vehicles", "view_own_vehicles"),
      group: "OPERATIONS",
    },
    {
      id: "notifications",
      en: "Notifications",
      si: "දැනුම්දීම්",
      icon: Bell,
      show: any("view_all_notifications", "view_own_notifications"),
      group: "OPERATIONS",
    },
    {
      id: "admin",
      en: "Access & audit",
      si: "ප්‍රවේශ සහ විගණන",
      icon: Shield,
      show: any(
        "view_all_users",
        "view_audit_logs",
        "manage_access_privileges",
      ),
      group: "SYSTEM",
    },
    {
      id: "settings",
      en: "Settings",
      si: "සැකසුම්",
      icon: Settings,
      show:
        workshop.administrator ||
        can("manage_system_settings") ||
        can("manage_repairs"),
      group: "SYSTEM",
    },
  ].filter((n) => n.show);
  const active = nav.find((n) => n.id === page) || nav[0];
  const effectivePage = active.id;
  function go(p: string) {
    setPage(p);
    setMobile(false);
  }
  if (!profile)
    return (
      <LoginPage
        language={language}
        theme={theme}
        setLanguage={setLanguage}
        setTheme={setTheme}
        onLogin={login}
        configured={configured}
        busy={busy || loggingOut}
        error={error}
      />
    );
  const due = data.invoices
      .filter((i) => i.status === "issued")
      .reduce((sum, i) => sum + balanceFor(i, data), 0),
    activeBookings = data.bookings.filter((b) => b.status === "active"),
    upcoming = data.bookings
      .filter((b) => b.status === "confirmed")
      .sort((a, b) => a.pickup_at.localeCompare(b.pickup_at));
  return (
    <div className="app-layout">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <button className="brand" onClick={() => go("dashboard")}>
          <img src="/tenuli-capture-logo.png" alt="" />
          <div>
            <strong>Tenuli Auto Care</strong>
            <span>AUTO CARE & RENTALS</span>
          </div>
        </button>
        <div className="workspace-label">
          <span className="workspace-icon">TAC</span>
          <div>
            <strong>{data.business?.name || "Tenuli Auto Care"}</strong>
            <small>{t("Connected workspace", "සම්බන්ධිත වැඩබිම")}</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {nav.map((n, i) => (
            <div key={n.id}>
              {(i === 0 || nav[i - 1].group !== n.group) && (
                <span className="nav-group">{n.group}</span>
              )}
              <button
                className={effectivePage === n.id ? "active" : ""}
                onClick={() => go(n.id)}
              >
                <n.icon size={18} />
                <span>{t(n.en, n.si)}</span>
                {n.id === "rentals" && activeBookings.length > 0 && (
                  <b>{activeBookings.length}</b>
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">
            {profile.full_name?.slice(0, 1) || "U"}
          </span>
          <div>
            <strong>{profile.full_name}</strong>
            <small>{profile.role.replaceAll("_", " ")}</small>
          </div>
          <button
            className="icon"
            title="Sign out"
            aria-label="Sign out"
            onClick={logout}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Close menu"
          onClick={() => setMobile(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <button
            className="icon mobile-menu"
            aria-label="Open menu"
            onClick={() => setMobile(true)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{t(active.en, active.si)}</strong>
          </div>
          <div className="top-controls">
            <button
              onClick={() => setLanguage(language === "en" ? "si" : "en")}
            >
              {language === "en" ? "සිංහල" : "English"}
            </button>
            <button
              className="icon"
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              className="icon"
              aria-label="Refresh records"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={18} className={busy ? "spin" : ""} />
            </button>
            <span className="avatar small">
              {profile.full_name?.slice(0, 1)}
            </span>
          </div>
        </header>
        <div className="content">
          <div
            className={
              "page-heading" +
              (["repairs", "shop-costs"].includes(effectivePage)
                ? " tenuli-hidden-heading"
                : "")
            }
          >
            <div>
              <span className="eyebrow blue">
                {effectivePage === "dashboard"
                  ? t(
                      workshop.administrator
                        ? "AUTOMART & SERVICES"
                        : "FLEET OPERATIONS",
                      workshop.administrator
                        ? "ඔටෝමාට් සහ සේවා"
                        : "වාහන කළමනාකරණය",
                    )
                  : active.group}
              </span>
              <h1>
                {effectivePage === "dashboard"
                  ? t(
                      workshop.administrator
                        ? "Automart & service overview"
                        : "Your fleet, at a glance",
                      workshop.administrator
                        ? "ඔටෝමාට් සහ සේවා සාරාංශය"
                        : "ඔබේ වාහන එකම තැනකින්",
                    )
                  : t(active.en, active.si)}
              </h1>
              <p>
                {effectivePage === "dashboard"
                  ? t(
                      "A clear view of your rentals, vehicles and what needs attention.",
                      "කුලී වෙන්කිරීම්, වාහන සහ අවධානය යොමු කළ යුතු දෑ.",
                    )
                  : t(
                      "Manage your records with confidence.",
                      "ඔබේ වාර්තා පහසුවෙන් කළමනාකරණය කරන්න.",
                    )}
              </p>
            </div>
            <div className="sync-status">
              <span className={busy ? "status-dot busy" : "status-dot"} />
              {busy
                ? "Updating…"
                : loaded
                  ? t("Updated ", "යාවත්කාලීන කළේ ") +
                    loaded.toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Colombo",
                    })
                  : "Connecting"}
            </div>
          </div>
          {error && <p className="error">{error}</p>}
          {rentalError && (
            <p className="error">
              Rental module: {rentalError}. Apply the rental migration after its
              prerequisites.
            </p>
          )}
          {effectivePage === "dashboard" ? (
            <>
              <AutomartLauncher
                role={profile.role}
                permissions={permissions}
                language={language}
                onOpen={go}
              />
              <div className="metric-grid">
                <Metric
                  icon={<Car />}
                  title={t("Total vehicles", "මුළු වාහන")}
                  value={String(old.vehicles.length)}
                  note={
                    old.vehicles.filter((v) => v.is_active).length +
                    " active in your fleet"
                  }
                />
                <Metric
                  icon={<CalendarDays />}
                  title={t("Active rentals", "දැනට කුලියට දුන්")}
                  value={String(activeBookings.length)}
                  note={
                    activeBookings.filter(
                      (b) => new Date(b.return_at) < new Date(),
                    ).length + " overdue returns"
                  }
                  tone="blue"
                />
                <Metric
                  icon={<Check />}
                  title={t("Upcoming bookings", "ඉදිරි වෙන්කිරීම්")}
                  value={String(upcoming.length)}
                  note="Confirmed reservations"
                />
                {billingAccess && (
                  <Metric
                    icon={<Wallet />}
                    title={t("Outstanding balance", "ලැබිය යුතු මුදල")}
                    value={money(due)}
                    note={
                      data.invoices.filter(
                        (i) => i.status === "issued" && balanceFor(i, data) > 0,
                      ).length + " invoices awaiting payment"
                    }
                    tone="orange"
                  />
                )}
              </div>
              <div className="dashboard-grid">
                <section className="card">
                  <div className="section-head">
                    <div>
                      <h2>{t("Upcoming rentals", "ඉදිරි කුලී වෙන්කිරීම්")}</h2>
                      <p>Your next confirmed departures</p>
                    </div>
                    <button onClick={() => go("rentals")}>
                      View all <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {upcoming.slice(0, 5).map((b) => (
                    <div className="upcoming-row" key={b.id}>
                      <span className="vehicle-icon">
                        <Car size={24} />
                      </span>
                      <div>
                        <strong>
                          {
                            old.vehicles.find((v) => v.id === b.vehicle_id)
                              ?.registration_number
                          }
                        </strong>
                        <small>
                          {data.customers.find((c) => c.id === b.customer_id)
                            ?.name || "Reserved vehicle"}
                        </small>
                      </div>
                      <div>
                        <strong>{date(b.pickup_at)}</strong>
                        <small>{b.agreement_ref || "Confirmed rental"}</small>
                      </div>
                      <Badge value="confirmed" />
                    </div>
                  ))}
                  {!upcoming.length && (
                    <div className="empty">No upcoming confirmed rentals.</div>
                  )}
                  <div className="section-bottom">
                    <CalendarDays size={17} />
                    <span>Reservations use Sri Lanka time.</span>
                  </div>
                </section>
                <section className="card action-card">
                  <span className="eyebrow blue">QUICK ACTIONS</span>
                  <h2>{t("Keep things moving", "වැඩ පහසුවෙන් කරගන්න")}</h2>
                  {[
                    {
                      page: "rentals",
                      title: "Manage rental bookings",
                      sub: "Checkout, return and calculate charges",
                      icon: CalendarDays,
                      show: rentalAccess,
                    },
                    {
                      page: "customers",
                      title: "Rental customers",
                      sub: "Keep renter contact details in one place",
                      icon: Users,
                      show: any("view_rentals", "manage_rentals"),
                    },
                    {
                      page: "invoices",
                      title: "Invoices & receipts",
                      sub: "Print, download and share documents",
                      icon: FileText,
                      show: billingAccess,
                    },
                  ]
                    .filter((x) => x.show)
                    .map((x) => (
                      <button key={x.page} onClick={() => go(x.page)}>
                        <x.icon size={21} />
                        <span>
                          <strong>{x.title}</strong>
                          <small>{x.sub}</small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                </section>
              </div>
              <section className="card">
                <div className="section-head">
                  <div>
                    <h2>{t("Fleet availability", "වාහන ලබාගත හැකි බව")}</h2>
                    <p>
                      Current status · Check booking dates before confirming
                    </p>
                  </div>
                  <button onClick={() => go("vehicles")}>
                    View fleet <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="fleet-grid">
                  {old.vehicles.slice(0, 6).map((v) => {
                    const occupied = activeBookings.some(
                      (b) => b.vehicle_id === v.id,
                    );
                    return (
                      <div className="fleet-tile" key={v.id}>
                        <div className="fleet-tile-top">
                          <Car size={30} />
                          <Badge
                            value={
                              !v.is_active
                                ? "inactive"
                                : occupied
                                  ? "active"
                                  : "available"
                            }
                          />
                        </div>
                        <h3>
                          {v.make} {v.model}
                        </h3>
                        <p>{v.registration_number}</p>
                        <hr />
                        <small>{v.owner_name}</small>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            <Suspense fallback={<div className="empty">Loading…</div>}>
              {effectivePage === "repairs" ? (
                workshop.repairs ? (
                  <Repairs
                    key={profile.id}
                    photoScope={
                      import.meta.env.VITE_SUPABASE_URL + ":" + profile.id
                    }
                    permissions={permissions}
                    language={language}
                    administrator={workshop.administrator}
                    refreshAccess={refresh}
                  />
                ) : (
                  <WorkshopSetup
                    module="Repair Billing"
                    administrator={workshop.administrator}
                    language={language}
                    onRetry={refresh}
                  />
                )
              ) : effectivePage === "shop-costs" ? (
                workshop.shop ? (
                  <ShopCosts
                    permissions={permissions}
                    language={language}
                    administrator={workshop.administrator}
                    refreshAccess={refresh}
                  />
                ) : (
                  <WorkshopSetup
                    module="Shop Costs & Profit"
                    administrator={workshop.administrator}
                    language={language}
                    onRetry={refresh}
                  />
                )
              ) : effectivePage === "settings" ? (
                <>
                  {can("manage_repairs") && (
                    <LocalPhotoStorage
                      key={profile.id}
                      scope={
                        import.meta.env.VITE_SUPABASE_URL + ":" + profile.id
                      }
                      language={language}
                    />
                  )}
                  {workshop.administrator && (
                    <Security language={language} onSignOut={logout} />
                  )}
                  {can("manage_system_settings") && (
                    <details className="more-details settings-business">
                      <summary>
                        {t("Business details", "ව්‍යාපාර විස්තර")}
                      </summary>
                      <Legacy
                        page="settings"
                        data={old}
                        rentalData={data}
                        permissions={permissions}
                        language={language}
                        refresh={refresh}
                      />
                    </details>
                  )}
                </>
              ) : [
                  "customers",
                  "rentals",
                  "invoices",
                  "payments",
                  "reports",
                ].includes(effectivePage) ? (
                <Rentals
                  key={effectivePage}
                  page={effectivePage}
                  data={data}
                  legacy={old}
                  permissions={permissions}
                  language={language}
                  refresh={refresh}
                />
              ) : (
                <Legacy
                  key={effectivePage}
                  page={effectivePage}
                  data={old}
                  rentalData={data}
                  permissions={permissions}
                  language={language}
                  refresh={refresh}
                />
              )}
            </Suspense>
          )}
          <footer className="app-footer">
            <span>Tenuli Auto Care · Repairs & Rentals · v1.17.0</span>
            <span>LKR · Asia/Colombo</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
function Metric({
  icon,
  title,
  value,
  note,
  tone = "",
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <div className={"metric " + tone}>
      <div className="metric-heading">
        <span>{title}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
