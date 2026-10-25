import { useEffect, useRef, useState } from "react";
import { supabase } from "./api";
import type { CatalogueEntry } from "./repair-catalogue-types";
import type { RepairLine } from "./repair-model";

async function catalogueRequest(
  action: string,
  payload: Record<string, unknown> = {},
) {
  if (!supabase || !(await supabase.auth.getSession()).data.session?.user.id)
    throw Error("Please sign in again");
  const { data, error } = await supabase.rpc("repair_catalogue_api", {
    p_action: action,
    p_payload: payload,
  });
  if (error)
    throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

export function useSharedRepairCatalogue(scope: string, enabled: boolean) {
  const [state, setState] = useState<{
    scope: string;
    items: CatalogueEntry[];
    ready: boolean;
    error: string;
  }>({ scope, items: [], ready: false, error: "" });
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const run = ++generation.current;
    setState({ scope, items: [], ready: false, error: "" });
    if (enabled)
      void catalogueRequest("list")
        .then((result) => {
          if (run === generation.current)
            setState({
              scope,
              items: result.items || [],
              ready: true,
              error: "",
            });
        })
        .catch(() => {
          if (run === generation.current)
            setState({ scope, items: [], ready: false, error: "unavailable" });
        });
    return () => {
      generation.current++;
    };
  }, [scope, enabled, reload]);
  const current =
    state.scope === scope
      ? state
      : { scope, items: [], ready: false, error: "" };
  return {
    ...current,
    retry: () => setReload((n) => n + 1),
    save: async (line: RepairLine) => {
      const run = generation.current;
      const entry: CatalogueEntry = await catalogueRequest("add", {
        category: line.category,
        description: line.description.trim(),
        unit: line.unit,
      });
      if (run === generation.current)
        setState((s) => ({
          ...s,
          items: [...s.items.filter((x) => x.id !== entry.id), entry],
        }));
      return entry;
    },
  };
}
