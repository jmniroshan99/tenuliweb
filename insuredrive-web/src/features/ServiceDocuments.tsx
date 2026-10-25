import { useState } from "react";
import { Form, Modal } from "../components/Controls";
import { repair } from "../lib/repair-api";
import {
  date,
  localInput,
  colomboISO,
  decimalMinor,
  money,
} from "../lib/format";
import type { Field, Row } from "../lib/types";

const f = (
  key: string,
  en: string,
  si: string,
  type = "text",
  required = false,
): Field => ({
  key,
  en,
  si,
  type,
  required,
  wide: type === "textarea",
  maxLength: ["reason", "handover_notes"].includes(key)
    ? 1000
    : type === "textarea"
      ? 2000
      : 200,
});
const identity = [
  f("customer_name", "Customer name", "පාරිභෝගික නම", "text", true),
  f("registration", "Vehicle registration", "වාහන අංකය", "text", true),
  f("phone", "Phone (optional)", "දුරකථන අංකය (අත්‍යවශ්‍ය නැත)", "tel"),
  f("make_model", "Make / model", "වාහන වර්ගය"),
];
const receiving = [
  f(
    "received_at",
    "Received date and time",
    "භාරගත් දිනය සහ වේලාව",
    "datetime-local",
    true,
  ),
  f(
    "reported_problem",
    "Customer’s reported problem",
    "පාරිභෝගිකයා සඳහන් කළ දෝෂය",
    "textarea",
    true,
  ),
  f(
    "requested_work",
    "Requested repairs / services",
    "ඉල්ලා සිටි අලුත්වැඩියා / සේවා",
    "textarea",
    true,
  ),
  f(
    "expected_date",
    "Expected completion date",
    "නිම කිරීමට අපේක්ෂිත දිනය",
    "date",
  ),
  f("odometer", "Odometer (km)", "ධාවන දුර (කි.මී.)", "number"),
  f("fuel_level", "Fuel level", "ඉන්ධන මට්ටම"),
  f("damage", "Existing damage", "දැනට පවතින හානි", "textarea"),
  f("condition", "Vehicle condition", "වාහනයේ තත්ත්වය", "textarea"),
  f("accessories", "Accessories received", "භාරගත් උපාංග", "textarea"),
  f("notes", "Additional notes", "අමතර සටහන්", "textarea"),
];
const completion = [
  f("work_performed", "Work performed", "සිදු කළ වැඩ", "textarea", true),
  f(
    "parts_replaced",
    "Parts replaced (if any)",
    "මාරු කළ අමතර කොටස් (තිබේ නම්)",
    "textarea",
  ),
  f("checks", "Checks performed", "සිදු කළ පරීක්ෂණ", "textarea"),
  f("recommendations", "Recommendations", "නිර්දේශ", "textarea"),
  f(
    "warranty",
    "Warranty terms (if applicable)",
    "වගකීම් කොන්දේසි (අදාළ නම්)",
    "textarea",
  ),
  f("notes", "Additional notes", "අමතර සටහන්", "textarea"),
];
const correction = f(
  "reason",
  "Reason for this revision",
  "මෙම සංශෝධනයට හේතුව",
  "textarea",
  true,
);
export function ReceivingForm({
  language,
  job,
  previous,
  jobs = [],
  canPay = false,
  onCancel,
  onIssued,
}: {
  language: string;
  job?: Row;
  previous?: Row;
  jobs?: Row[];
  canPay?: boolean;
  onCancel: () => void;
  onIssued: (doc: Row) => Promise<void>;
}) {
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const [chosen, setChosen] = useState<Row | null>(null);
  const [advanceEnabled, setAdvanceEnabled] = useState(false);
  return (
    <>
      {!job && jobs.length > 0 && (
        <label className="arrival-search">
          {t(
            "Find a previous customer / vehicle (optional)",
            "පෙර පාරිභෝගිකයා / වාහනය සොයන්න (අත්‍යවශ්‍ය නැත)",
          )}
          <input
            type="search"
            list="arrival-existing"
            placeholder={t(
              "Type a name or vehicle number",
              "නම හෝ වාහන අංකය ඇතුළත් කරන්න",
            )}
            onChange={(e) => {
              const found = jobs.find(
                (j) =>
                  `${j.info.customer_name} — ${j.info.registration} · ${j.job_number || j.number}` ===
                  e.target.value,
              );
              if (found) setChosen(found);
            }}
          />
          <datalist id="arrival-existing">
            {jobs.map((j) => (
              <option
                key={j.id}
                value={`${j.info.customer_name} — ${j.info.registration} · ${j.job_number || j.number}`}
              />
            ))}
          </datalist>
          <small>
            {t(
              "Choose a match to fill the details, or enter a new customer below.",
              "ගැළපෙන වාර්තාවක් තෝරන්න හෝ පහතින් නව විස්තර ඇතුළත් කරන්න.",
            )}
          </small>
        </label>
      )}
      <Form
        key={chosen?.id || job?.id || "new"}
        language={language}
        fields={[...identity, ...receiving, ...(previous ? [correction] : [])]}
        initial={{
          ...chosen?.info,
          ...previous?.snapshot.info,
          ...job?.info,
          ...previous?.snapshot.content,
          reported_problem:
            previous?.snapshot.content?.reported_problem ||
            job?.info?.reported_problem ||
            chosen?.info?.reported_problem ||
            "",
          requested_work:
            previous?.snapshot.content?.requested_work ||
            job?.info?.requested_work ||
            chosen?.info?.requested_work ||
            "",
          received_at: localInput(
            previous?.snapshot.received_at ||
              job?.received_at ||
              new Date().toISOString(),
          ),
        }}
        optionalKeys={[
          "phone",
          "make_model",
          "expected_date",
          "odometer",
          "fuel_level",
          "damage",
          "condition",
          "accessories",
          "notes",
        ]}
        submit={t(
          previous ? "Issue revised receiving note" : "Issue receiving note",
          previous
            ? "සංශෝධිත භාරගැනීමේ සටහන නිකුත් කරන්න"
            : "භාරගැනීමේ සටහන නිකුත් කරන්න",
        )}
        onCancel={onCancel}
        onSave={async (p) =>
          onIssued(
            await repair(job ? "arrival_issue" : "arrival_create", {
              ...p,
              advance_minor: advanceEnabled
                ? decimalMinor(p.advance_amount)
                : 0,
              confirm_advance: advanceEnabled && p.confirm_advance === "on",
              received_at: colomboISO(p.received_at),
              job_id: job?.id,
              version: job?.version,
              document_revision: previous?.revision || 0,
            }),
          )
        }
      >
        {previous?.snapshot.payment_ack && (
          <p className="tenuli-note">
            {t("Advance already acknowledged", "දැනටමත් පිළිගත් අත්තිකාරම")}:{" "}
            {money(previous.snapshot.payment_ack.advance_minor)}.{" "}
            {t(
              "Reprinting does not collect it again.",
              "නැවත මුද්‍රණයෙන් මුදල් නැවත අය නොකෙරේ.",
            )}
          </p>
        )}
        {canPay && (
          <section className="arrival-advance">
            <label className="service-confirm">
              <input
                type="checkbox"
                checked={advanceEnabled}
                onChange={(e) => setAdvanceEnabled(e.target.checked)}
              />
              {t(
                "Collect an advance now (optional)",
                "දැන් අත්තිකාරමක් ලබාගන්න (අත්‍යවශ්‍ය නැත)",
              )}
            </label>
            {advanceEnabled && (
              <>
                <div className="form-grid">
                  <label>
                    {t("Advance amount (LKR)", "අත්තිකාරම් මුදල (රු.)")}
                    <input
                      name="advance_amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </label>
                  <label>
                    {t("Payment method", "ගෙවීම් ක්‍රමය")}
                    <select name="method" required defaultValue="">
                      <option value="">
                        {t("Select a method", "ක්‍රමයක් තෝරන්න")}
                      </option>
                      <option value="cash">{t("Cash", "මුදල්")}</option>
                      <option value="bank">
                        {t("Bank transfer", "බැංකු මාරුව")}
                      </option>
                      <option value="card">{t("Card", "කාඩ්පත")}</option>
                    </select>
                  </label>
                  <label>
                    {t(
                      "Payment reference (optional)",
                      "ගෙවීමේ යොමුව (අත්‍යවශ්‍ය නැත)",
                    )}
                    <input name="reference" maxLength={200} />
                  </label>
                </div>
                <label className="service-confirm">
                  <input type="checkbox" name="confirm_advance" required />
                  {t(
                    "I confirm this advance has actually been received.",
                    "මෙම අත්තිකාරම සැබවින්ම ලැබුණු බව තහවුරු කරමි.",
                  )}
                </label>
              </>
            )}
          </section>
        )}
        <p className="tenuli-note">
          {t(
            "Receiving does not approve repairs or confirm prices. Payment time is recorded when you confirm. All times use Sri Lanka time.",
            "භාරගැනීම අලුත්වැඩියාවට අනුමැතියක් හෝ මිල තහවුරු කිරීමක් නොවේ. තහවුරු කරන විට ගෙවීම් වේලාව සටහන් වේ. වේලාව ශ්‍රී ලංකා වේලාවයි.",
          )}
        </p>
      </Form>
    </>
  );
}
export default function ServiceDocuments({
  data,
  job,
  manage,
  billing,
  language,
  open,
  reload,
}: {
  data: Row;
  job: Row;
  manage: boolean;
  billing: boolean;
  language: string;
  open: (d: Row) => void;
  reload: () => Promise<void>;
}) {
  const [mode, setMode] = useState("");
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const docs: Row[] = (data.service_documents || [])
    .filter((d: Row) => d.job_id === job.id)
    .sort((a: Row, b: Row) => b.revision - a.revision);
  const rn = docs.find((d) => d.kind === "receiving"),
    cn = docs.find((d) => d.kind === "completion");
  const hand = (data.handovers || []).find((h: Row) => h.job_id === job.id);
  const canComplete =
    manage && (billing || !(data.invoiced_jobs || []).includes(job.id));
  const active = job.status !== "cancelled";
  const current =
    cn &&
    cn.job_revision === job.revision &&
    cn.snapshot.completed_at === job.completed_at;
  const issued = async (d: Row) => {
    setMode("");
    await reload();
    open(d);
  };
  if (!data.service_documents_enabled)
    return (
      <p className="tenuli-note">
        {t(
          "Install the included ENABLE_AUTOMART.sql update to enable receiving notes, completion notes and vehicle handover.",
          "භාරගැනීමේ සටහන් සහ වාහන භාරදීම සක්‍රිය කිරීමට ENABLE_AUTOMART.sql යාවත්කාලීනය ස්ථාපනය කරන්න.",
        )}{" "}
        <a href="/setup/ENABLE_AUTOMART.sql" download>
          Download SQL
        </a>
      </p>
    );
  return (
    <section className="service-documents">
      <h3>
        {t(
          "Customer documents & vehicle handover",
          "පාරිභෝගික ලේඛන සහ වාහන භාරදීම",
        )}
      </h3>
      <div className="service-status">
        <span>
          {t("Received", "භාරගත් වේලාව")}:{" "}
          <b>{job.received_at ? date(job.received_at) : "—"}</b>
        </span>
        <span>
          {t("Completed", "නිම කළ වේලාව")}:{" "}
          <b>{job.completed_at ? date(job.completed_at) : "—"}</b>
        </span>
        <span>
          {t("Vehicle handover", "වාහනය භාරදීම")}:{" "}
          <b>
            {hand
              ? date(hand.handed_over_at)
              : t("Not recorded", "වාර්තා කර නැත")}
          </b>
        </span>
      </div>
      <div className="actions service-actions">
        {(rn || (manage && active)) && (
          <button onClick={() => (rn ? open(rn) : setMode("receiving"))}>
            {t("Print Receiving Note", "භාරගැනීමේ සටහන මුද්‍රණය")}
          </button>
        )}
        {rn && manage && active && (
          <button onClick={() => setMode("receiving")}>
            {t("Correct receiving note", "භාරගැනීමේ සටහන සංශෝධනය")}
          </button>
        )}
        {(cn || (canComplete && job.status === "completed")) && (
          <button onClick={() => (cn ? open(cn) : setMode("completion"))}>
            {t("Print Completion Note", "නිමකිරීමේ සටහන මුද්‍රණය")}
          </button>
        )}
        {cn && canComplete && job.status === "completed" && (
          <button onClick={() => setMode("completion")}>
            {t("Revise completion note", "නිමකිරීමේ සටහන සංශෝධනය")}
          </button>
        )}
        {canComplete && job.status === "completed" && !hand && (
          <button
            className="primary"
            disabled={!current}
            onClick={() => setMode("handover")}
          >
            {t("Record Vehicle Handover", "වාහනය භාරදීම වාර්තා කරන්න")}
          </button>
        )}
      </div>
      {job.status === "completed" && !hand && (
        <p className="muted">
          {t(
            "Issue a current completion note, then confirm handover only when the vehicle has been returned. Printing does not record handover or payment.",
            "වත්මන් නිමකිරීමේ සටහන නිකුත් කරන්න. වාහනය ආපසු භාරදුන් විට පමණක් භාරදීම තහවුරු කරන්න. මුද්‍රණයෙන් භාරදීම හෝ ගෙවීම වාර්තා නොවේ.",
          )}
        </p>
      )}
      {manage && !canComplete && (
        <p className="tenuli-note">
          {t(
            "This job has an invoice. A staff member with repair management and billing access must issue the completion note and record handover.",
            "මෙම කාර්යයට බිල්පතක් ඇත. නිමකිරීමේ සටහන සහ භාරදීම සඳහා අලුත්වැඩියා කළමනාකරණ සහ බිල්පත් අවසර අවශ්‍යයි.",
          )}
        </p>
      )}
      {cn && (
        <p className="muted">
          {t(
            "Amounts on issued copies stay fixed. Use “Revise completion note” to show later payments or corrections.",
            "නිකුත් කළ පිටපත් වල මුදල් ස්ථිරයි. පසු ගෙවීම් හෝ වෙනස්කම් පෙන්වීමට නිමකිරීමේ සටහන සංශෝධනය කරන්න.",
          )}
        </p>
      )}
      {mode && (
        <Modal
          title={t(
            mode === "receiving"
              ? "Vehicle receiving note"
              : mode === "completion"
                ? "Repair completion note"
                : "Confirm vehicle handover",
            mode === "receiving"
              ? "වාහන භාරගැනීමේ සටහන"
              : mode === "completion"
                ? "අලුත්වැඩියා නිමකිරීමේ සටහන"
                : "වාහනය භාරදීම තහවුරු කරන්න",
          )}
          onClose={() => setMode("")}
        >
          {mode === "receiving" ? (
            <ReceivingForm
              language={language}
              job={job}
              previous={rn}
              onCancel={() => setMode("")}
              onIssued={issued}
            />
          ) : mode === "completion" ? (
            <Form
              language={language}
              fields={[
                ...identity,
                ...completion,
                ...(!job.completed_at
                  ? [
                      f(
                        "completed_at",
                        "Actual completion date and time",
                        "නිම කළ දිනය සහ වේලාව",
                        "datetime-local",
                        true,
                      ),
                    ]
                  : []),
                ...(cn ? [correction] : []),
              ]}
              initial={{
                ...job.info,
                ...cn?.snapshot.info,
                ...cn?.snapshot.content,
              }}
              optionalKeys={[
                "phone",
                "make_model",
                "checks",
                "recommendations",
                "warranty",
                "notes",
              ]}
              submit={t("Issue completion note", "නිමකිරීමේ සටහන නිකුත් කරන්න")}
              onCancel={() => setMode("")}
              onSave={async (p) =>
                issued(
                  await repair("completion_issue", {
                    ...p,
                    completed_at: p.completed_at
                      ? colomboISO(p.completed_at)
                      : undefined,
                    job_id: job.id,
                    version: job.version,
                    document_revision: cn?.revision || 0,
                  }),
                )
              }
            >
              <p className="tenuli-note">
                {t(
                  "Describe the actual completed work. This document does not confirm vehicle handover. Each narrative field allows up to 2,000 characters.",
                  "නිම කළ වැඩ සඳහන් කරන්න. මෙය වාහනය භාරදීම තහවුරු නොකරයි. එක් විස්තරයකට අකුරු 2,000ක් දක්වා ඇතුළත් කළ හැක.",
                )}
              </p>
            </Form>
          ) : (
            <Form
              language={language}
              fields={[
                f(
                  "recipient",
                  "Vehicle received by",
                  "වාහනය භාරගත් පුද්ගලයා",
                  "text",
                  true,
                ),
                f(
                  "handover_notes",
                  "Handover notes",
                  "භාරදීමේ සටහන්",
                  "textarea",
                ),
              ]}
              optionalKeys={["handover_notes"]}
              initial={{ recipient: job.info.customer_name }}
              submit={t(
                "Confirm vehicle returned",
                "වාහනය ආපසු භාරදුන් බව තහවුරු කරන්න",
              )}
              onCancel={() => setMode("")}
              onSave={async (p) =>
                issued(
                  await repair("handover", {
                    ...p,
                    confirm: p.confirm === "on",
                    job_id: job.id,
                    version: job.version,
                    document_revision: cn?.revision,
                  }),
                )
              }
            >
              <label className="service-confirm">
                <input type="checkbox" name="confirm" required />
                {t(
                  "I confirm the vehicle has actually been returned to this person. Record the current date and time.",
                  "මෙම පුද්ගලයාට වාහනය ආපසු භාරදුන් බව තහවුරු කරමි. වත්මන් දිනය සහ වේලාව වාර්තා කරන්න.",
                )}
              </label>
              <p className="tenuli-note">
                {t(
                  "Any outstanding balance remains payable. A new completion-note revision will record this handover.",
                  "ඉතිරි මුදල් ගෙවිය යුතු ලෙසම පවතී. නව සංශෝධිත නිමකිරීමේ සටහනක මෙම භාරදීම වාර්තා වේ.",
                )}
              </p>
            </Form>
          )}
        </Modal>
      )}
    </section>
  );
}
