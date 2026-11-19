import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "./client";
import { parseTransactions, snapshotSchema } from "./domain";
import type { Entry, Snapshot } from "./domain";
export const db = () => {
  if (!client) throw new Error("Workspace configuration is unavailable.");
  return client;
};
export function check(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}
export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  const refresh = useCallback(() => {
    if (mounted.current) setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const initialized = await db()
          .rpc("initialize_workspace")
          .abortSignal(controller.signal);
        check(initialized);
        const result = await db()
          .rpc("workspace_snapshot")
          .abortSignal(controller.signal);
        check(result);
        const parsed = snapshotSchema.parse(result.data);
        const ledger = await db()
          .from("transactions")
          .select("*", { count: "exact" })
          .order("occurred_on", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id")
          .range(page * 50, page * 50 + 49)
          .abortSignal(controller.signal);
        check(ledger);
        const rows = parseTransactions(ledger.data);
        if (active) {
          setSnapshot(parsed);
          setEntries(rows);
          setCount(ledger.count ?? 0);
        }
      } catch (failure) {
        if (active) {
          setSnapshot(null);
          setEntries([]);
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load records.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [revision, page]);
  return { snapshot, entries, page, setPage, count, error, loading, refresh };
}
