import { TENULI_LOGO } from "../lib/brand";
import { useState, type ReactNode } from "react";
import { Form } from "../components/Controls";
import { decimalMinor } from "../lib/format";
import type { Field, Row } from "../lib/types";
const sinhala: Record<string, string> = {
  reported_problem: "වාහනයේ දැනුම් දුන් ගැටලුව",
  requested_work: "ඉල්ලා ඇති වැඩ",
  assessor_details: "තක්සේරුකරුගේ විස්තර",
  chassis_number: "චැසි අංකය",
  manufacture_notes: "නිෂ්පාදන විස්තර",
  accident_date: "අනතුර සිදුවූ දිනය",
  insurance: "රක්ෂණ සමාගම",
  policy_number: "රක්ෂණ ඔප්පු අංකය",
  claim_number: "හිමිකම් යොමු අංකය",
  valid_until: "වලංගු අවසන් දිනය",
  advisor: "සේවා උපදේශක",
  expected_date: "අපේක්ෂිත නිම කිරීමේ දිනය",
  customer_name: "පාරිභෝගික නම",
  phone: "දුරකථන අංකය",
  address: "ලිපිනය",
  registration: "වාහන අංකය",
  make_model: "වාහන වර්ගය",
  notes: "සටහන්",
  name: "නම",
  description: "විස්තරය",
  quantity: "ප්‍රමාණය",
  unit: "ඒකකය",
  estimated_minor: "ඇස්තමේන්තු මුදල (රු.)",
  actual_minor: "තහවුරු කළ මුදල — නොදන්නේ නම් හිස්ව තබන්න (රු.)",
  amount_minor: "මුදල (රු.)",
  reference: "යොමු අංකය",
  purchase_date: "මිලදී ගත් දිනය",
  due_date: "ගෙවිය යුතු දිනය",
  terms: "ගෙවීම් කොන්දේසි",
  contact: "සම්බන්ධතා නම",
  reason: "හේතුව / අනුමැතියේ යොමුව",
  expected_customer_minor: "අපේක්ෂිත පාරිභෝගික ගෙවීම (රු.)",
  expected_insurer_minor: "අපේක්ෂිත රක්ෂණ ගෙවීම (රු.)",
};
export const field = (
  key: string,
  en: string,
  type = "text",
  required = false,
): Field => ({ key, en, si: sinhala[key], type, required });
export const amount = (key: string, en: string, required = true): Field => ({
  ...field(key, en + " (LKR)", "number", required),
  min: 0,
  step: "0.01",
});
export const choice = (key: string, en: string, values: string[]): Field => ({
  key,
  en,
  required: true,
  options: values.map((value) => ({
    value,
    label: value.replaceAll("_", " "),
  })),
});
export const reason = field(
  "reason",
  "Reason / approval reference",
  "text",
  true,
);
export function ActionForm({
  fields,
  initial = {},
  onSave,
  onCancel,
  language = "en",
  businessLogo = false,
  optionalKeys = [],
  fieldGroups = [],
  children,
}: {
  fields: Field[];
  initial?: Row;
  onSave: (p: Row) => Promise<void>;
  onCancel: () => void;
  language?: string;
  businessLogo?: boolean;
  optionalKeys?: string[];
  fieldGroups?: { title: string; keys: string[] }[];
  children?: ReactNode;
}) {
  const [logo, setLogo] = useState(initial.logo || TENULI_LOGO),
    [logoError, setLogoError] = useState("");
  const values = { ...initial };
  for (const f of fields)
    if (f.key.endsWith("_minor") && values[f.key] != null)
      values[f.key] = (Number(values[f.key]) / 100).toFixed(2);
  return (
    <>
      {businessLogo && (
        <div className="tenuli-logo-setting">
          <img src={logo} alt="Business logo preview" width="158" height="65" />
          <label>
            Upload business logo (PNG/JPEG/WebP, up to 280 KB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (
                  f.size > 280 * 1024 ||
                  !["image/png", "image/jpeg", "image/webp"].includes(f.type)
                ) {
                  setLogoError("Choose a PNG, JPEG or WebP up to 280 KB");
                  return;
                }
                setLogoError("");
                const r = new FileReader();
                r.onload = () => setLogo(String(r.result));
                r.onerror = () => setLogoError("Could not read logo");
                r.readAsDataURL(f);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setLogo(TENULI_LOGO);
              setLogoError("");
            }}
          >
            Use Tenuli logo
          </button>
          {logoError && <p className="error">{logoError}</p>}
        </div>
      )}
      <Form
        fields={businessLogo ? fields.filter((f) => f.key !== "logo") : fields}
        initial={values}
        language={language}
        optionalKeys={optionalKeys}
        fieldGroups={fieldGroups}
        children={children}
        onCancel={onCancel}
        onSave={async (v) => {
          const p = { ...v };
          if (businessLogo) {
            if (logoError) throw Error(logoError);
            p.logo = logo;
          }
          for (const f of fields)
            if (f.key.endsWith("_minor"))
              p[f.key] =
                v[f.key] === "" ? null : decimalMinor(String(v[f.key]));
          await onSave(p);
        }}
      />
    </>
  );
}
