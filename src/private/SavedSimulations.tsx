import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Simulator } from "../components/Simulator";
import type {
  SimulationContext,
  SimulatorInputs,
} from "../components/Simulator";
import { Button } from "../components/ui/button";
import { formatExactMoney } from "../lib/finance";
import { displayDate } from "./domain";
import { check, db } from "./workspace";
import {
  restoreSimulation,
  savedSimulationSchema,
  simulationPayload,
} from "./simulations";
import type { SavedSimulation } from "./simulations";

const pageSize = 10;
export function SavedSimulations({
  inputs,
  onChange,
  financialContext,
}: {
  inputs: SimulatorInputs;
  onChange: (inputs: SimulatorInputs) => void;
  financialContext: SimulationContext;
}) {
  const [name, setName] = useState("");
  const [savedContext, setSavedContext] = useState<SimulationContext | null>(
    null,
  );
  const [source, setSource] = useState<SavedSimulation | null>(null);
  const [items, setItems] = useState<SavedSimulation[]>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const request = useRef({ signature: "", id: crypto.randomUUID() });
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
      setListError("");
      try {
        const result = await db()
          .from("saved_simulations")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id")
          .range(page * pageSize, page * pageSize + pageSize - 1)
          .abortSignal(controller.signal);
        check(result);
        const rows = savedSimulationSchema.array().parse(result.data);
        if (!active) return;
        if (!rows.length && page > 0) {
          setPage(page - 1);
          return;
        }
        setItems(rows);
        setCount(result.count ?? 0);
      } catch {
        if (active) {
          setItems([]);
          setListError("Could not load saved comparisons. Please try again.");
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
  }, [page, revision]);
  const context = savedContext ?? financialContext;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const payload = simulationPayload(name, inputs, context);
      const signature = JSON.stringify(payload);
      if (request.current.signature !== signature)
        request.current = { signature, id: crypto.randomUUID() };
      // Immutable inserts: an interrupted response can retry the same UUID without a duplicate.
      check(
        await db()
          .from("saved_simulations")
          .upsert(
            { id: request.current.id, ...payload },
            { onConflict: "id", ignoreDuplicates: true },
          ),
      );
      if (mounted.current) {
        setMessage(
          "Comparison saved. Your balances and loans have not changed.",
        );
        setPage(0);
        setRevision((v) => v + 1);
      }
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not save the comparison. Please retry.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  const remove = async (item: SavedSimulation) => {
    if (
      busy.current ||
      !window.confirm(
        `Delete saved comparison “${item.name}”? This cannot be undone. Your financial records will not change.`,
      )
    )
      return;
    busy.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      check(await db().from("saved_simulations").delete().eq("id", item.id));
      if (mounted.current) {
        setRevision((v) => v + 1);
        // A deleted snapshot may remain open as a draft, but saving it needs a new UUID.
        request.current = { signature: "", id: crypto.randomUUID() };
        setMessage("Saved comparison deleted. The open draft is unchanged.");
      }
    } catch {
      if (mounted.current)
        setError("Could not delete the comparison. Please retry.");
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return (
    <>
      <section
        className="card private-panel"
        aria-label="Comparison assumptions"
      >
        <div className="panel-heading">
          <div>
            <h2>
              {source
                ? `Assumptions from ${source.name}`
                : "Using your current plan"}
            </h2>
            <p>
              {source
                ? `Saved ${displayDate(source.created_at)}. Changes below create a new draft using these saved assumptions.`
                : "Saving includes today's plan, active loan EMI and available cash."}
            </p>
          </div>
          {source && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setSource(null);
                setSavedContext(null);
                setMessage("");
              }}
            >
              Use current plan
            </Button>
          )}
        </div>
      </section>
      <fieldset className="simulation-controls" disabled={pending}>
        <Simulator
          inputs={inputs}
          onChange={onChange}
          financialContext={context}
        />
      </fieldset>
      <section className="card private-panel">
        <h2>Save this comparison</h2>
        <p>
          Keep a private snapshot of the purchase and its assumptions. Saving
          never posts a transaction or creates a loan.
        </p>
        <form className="saved-simulation-form" onSubmit={(e) => void save(e)}>
          <label>
            Comparison name
            <input
              value={name}
              maxLength={80}
              required
              disabled={pending}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Laptop upgrade"
            />
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save comparison"}
          </Button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </section>
      <section
        className="card private-panel"
        aria-labelledby="saved-comparisons-title"
      >
        <div className="panel-heading">
          <h2 id="saved-comparisons-title">Saved comparisons</h2>
          <Button
            variant="ghost"
            disabled={loading || pending}
            onClick={() => setRevision((v) => v + 1)}
          >
            Refresh comparisons
          </Button>
        </div>
        {loading ? (
          <p role="status">Loading saved comparisons…</p>
        ) : listError ? (
          <p role="alert">{listError}</p>
        ) : items.length === 0 ? (
          <p>No saved comparisons yet.</p>
        ) : (
          items.map((item) => (
            <div className="saved-simulation-record" key={item.id}>
              <div>
                <h3>{item.name}</h3>
                <p>
                  {formatExactMoney(item.price_paise)} ·{" "}
                  {displayDate(item.created_at)}
                </p>
              </div>
              <div className="saved-simulation-actions">
                <Button
                  variant="outline"
                  disabled={pending}
                  aria-label={`Open ${item.name}`}
                  onClick={() => {
                    const restored = restoreSimulation(item);
                    onChange(restored.inputs);
                    setSavedContext(restored.context);
                    setSource(item);
                    setName(item.name);
                    setMessage("");
                    setError("");
                  }}
                >
                  Open
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  aria-label={`Delete ${item.name}`}
                  onClick={() => void remove(item)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
        {!loading && !listError && count > pageSize && (
          <div className="saved-simulation-actions">
            <Button
              variant="outline"
              disabled={page === 0 || pending}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous comparisons
            </Button>
            <span>
              Page {page + 1} of {Math.ceil(count / pageSize)}
            </span>
            <Button
              variant="outline"
              disabled={(page + 1) * pageSize >= count || pending}
              onClick={() => setPage((p) => p + 1)}
            >
              Next comparisons
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
