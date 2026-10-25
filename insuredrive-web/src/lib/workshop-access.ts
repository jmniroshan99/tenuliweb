export const repairPermissions = [
  "view_repairs",
  "manage_repairs",
  "view_repair_billing",
  "manage_repair_payments",
];
export const shopPermissions = ["manage_shop_costs", "view_job_profit"];
// Discovery is separate from authorization: admin setup links must remain visible
// before the additive database module supplies its permissions. Never invent grants.
export function workshopAccess(
  role: string | undefined,
  permissions: ReadonlySet<string>,
) {
  const administrator = role === "administrator";
  const repairs = repairPermissions.some((p) => permissions.has(p));
  const shop = shopPermissions.some((p) => permissions.has(p));
  return {
    administrator,
    repairs,
    shop,
    showRepairs: administrator || repairs,
    showShop: administrator || shop,
  };
}
export function workshopProblem(error?: { code?: string; message?: string }) {
  if (!error) return "permissions";
  if (
    ["PGRST202", "42883", "3F000", "42P01"].includes(error.code || "") ||
    /could not find.*function|function.*does not exist|schema.*does not exist/i.test(
      error.message || "",
    )
  )
    return "installation";
  if (
    error.code === "42501" ||
    /access denied|permission required|permission denied/i.test(
      error.message || "",
    )
  )
    return "permissions";
  return "connection";
}
