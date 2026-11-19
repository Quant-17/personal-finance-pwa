import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Check,
  CircleHelp,
  CreditCard,
  Pause,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  calculateLoan,
  formatExactMoney,
  formatMoney,
  monthlySavings,
  parseRupees,
} from "../lib/finance";
import { demo } from "../lib/data";

export interface SimulatorInputs {
  price: string;
  apr: string;
  months: string;
  delay: string;
  method: string;
}

export function Simulator({
  inputs,
  onChange,
  compact = false,
  financialContext,
  onExpand,
}: {
  financialContext?: typeof demo;
  inputs: SimulatorInputs;
  onChange: (inputs: SimulatorInputs) => void;
  compact?: boolean;
  onExpand?: () => void;
}) {
  const context = financialContext ?? demo;
  const freeCash = context.income - context.expenses - context.existingEmi;
  const { price, apr, months, delay, method } = inputs;
  const update = (key: keyof SimulatorInputs, value: string) =>
    onChange({ ...inputs, [key]: value });
  const pricePaise = parseRupees(price);
  const valid =
    pricePaise !== null &&
    pricePaise > 0 &&
    apr !== "" &&
    Number(apr) >= 0 &&
    Number(apr) <= 60 &&
    Number.isInteger(Number(months)) &&
    Number(months) >= 1 &&
    Number(months) <= 120;
  const loan = valid
    ? calculateLoan(pricePaise!, Number(apr), Number(months))
    : null;
  const savedMonthly = loan ? monthlySavings(pricePaise!, Number(delay)) : 0;
  const choices = [
    {
      key: "cash",
      title: "Pay in full",
      icon: Banknote,
      value: loan ? formatMoney(pricePaise!) : "—",
      suffix: "one-time payment",
      cost: pricePaise ?? 0,
      monthly: 0,
      cash: context.liquidCash - (pricePaise ?? 0),
    },
    {
      key: "emi",
      title: "Monthly EMI",
      icon: CreditCard,
      value: loan ? formatExactMoney(loan.emiPaise) : "—",
      suffix: `per month for ${months || "—"} months`,
      cost: loan?.totalPaise ?? 0,
      monthly: loan?.emiPaise ?? 0,
      cash: context.liquidCash,
    },
    {
      key: "delay",
      title: "Save & buy later",
      icon: CalendarClock,
      value: loan ? formatMoney(savedMonthly) : "—",
      suffix: `save monthly for ${delay} months`,
      cost: pricePaise ?? 0,
      monthly: savedMonthly,
      cash: context.liquidCash,
    },
    {
      key: "skip",
      title: "Skip for now",
      icon: Pause,
      value: "₹0",
      suffix: "keep your plans on track",
      cost: 0,
      monthly: 0,
      cash: context.liquidCash,
    },
  ];
  const selected = choices.find((c) => c.key === method)!;
  const remaining = freeCash - selected.monthly;
  const reserveShortfall = method === "cash" && selected.cash < context.reserve;
  return (
    <section
      className={`card simulator ${compact ? "compact-simulator" : ""}`}
      aria-labelledby="simulator-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <Sparkles size={13} /> A LITTLE CLARITY BEFORE YOU BUY
          </span>
          <h2 id="simulator-title">Can this purchase fit your life?</h2>
          <p>See the trade-offs. Make room for what matters.</p>
        </div>
        {compact && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open full simulator"
            onClick={onExpand}
          >
            <ArrowRight size={20} />
          </Button>
        )}
      </div>
      <div className="simulator-inputs">
        <label>
          Purchase price{" "}
          <span className="money-input">
            <span>₹</span>
            <input
              inputMode="decimal"
              value={price}
              onChange={(e) => update("price", e.target.value)}
              aria-invalid={pricePaise === null || pricePaise === 0}
              aria-describedby={!valid ? "simulator-error" : undefined}
            />
          </span>
        </label>
        <label>
          Payment method
          <select
            value={method}
            onChange={(e) => update("method", e.target.value)}
          >
            <option value="emi">Monthly EMI</option>
            <option value="cash">Pay in full</option>
            <option value="delay">Save & buy later</option>
            <option value="skip">Skip for now</option>
          </select>
        </label>
        <label>
          Annual interest (%)
          <input
            type="number"
            min="0"
            max="60"
            step="0.1"
            value={apr}
            onChange={(e) => update("apr", e.target.value)}
          />
        </label>
        <label>
          EMI tenure (months)
          <input
            type="number"
            min="1"
            max="120"
            step="1"
            value={months}
            onChange={(e) => update("months", e.target.value)}
          />
        </label>
      </div>
      {!valid && (
        <p role="alert" id="simulator-error" className="error">
          Enter a price from ₹0.01 to ₹1 crore, APR from 0–60%, and a whole
          tenure from 1–120 months.
        </p>
      )}
      <div className="scenario-grid">
        {choices.map((choice) => (
          <button
            className={`scenario ${method === choice.key ? "selected" : ""}`}
            key={choice.key}
            onClick={() => update("method", choice.key)}
            aria-pressed={method === choice.key}
          >
            <span className="scenario-top">
              <choice.icon size={18} />
              {method === choice.key && <Check size={15} />}
            </span>
            <span className="scenario-name">{choice.title}</span>
            <strong>{choice.value}</strong>
            <small>{choice.suffix}</small>
            {!compact && (
              <span className="scenario-total">
                Total purchase cost{" "}
                <b>{loan ? formatExactMoney(choice.cost) : "—"}</b>
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        className={`simulator-insight ${loan && (remaining < 0 || reserveShortfall) ? "caution" : ""}`}
        aria-live="polite"
      >
        <ShieldCheck size={20} />
        <p>
          {!loan ? (
            "Complete the inputs to see your purchase comparison."
          ) : reserveShortfall ? (
            `This would leave ${formatMoney(selected.cash)} in cash, below your ${formatMoney(context.reserve)} emergency reserve.`
          ) : remaining < 0 ? (
            `This plan exceeds your monthly surplus by ${formatMoney(-remaining)}.`
          ) : (
            <>
              <strong>
                {formatMoney(remaining)} left in your monthly plan.
              </strong>{" "}
              {method === "emi"
                ? `${formatExactMoney(loan.interestPaise)} total interest; your emergency reserve stays untouched.`
                : method === "delay"
                  ? "Your existing cash stays intact while you save for this purchase."
                  : method === "cash"
                    ? `${formatMoney(selected.cash)} cash remains after purchase.`
                    : "Your cash and monthly surplus stay available for other goals."}
            </>
          )}
        </p>
      </div>
      {!compact && (
        <div className="assumptions">
          <div>
            <h3>
              <CircleHelp size={16} /> Behind the numbers
            </h3>
            <p>
              {financialContext ? "Planned" : "Fictional"} monthly income{" "}
              {formatMoney(context.income)} − living expenses{" "}
              {formatMoney(context.expenses)} − existing EMI{" "}
              {formatMoney(context.existingEmi)} ={" "}
              <strong>{formatMoney(freeCash)} available.</strong> Subscriptions
              are included in living expenses. Liquid cash:{" "}
              {formatMoney(context.liquidCash)}. Emergency reserve target:{" "}
              {formatMoney(context.reserve)}.
            </p>
            <p>
              Fixed monthly reducing balance, interest rounded to paise. Final
              EMI: {loan ? formatExactMoney(loan.finalPaymentPaise) : "—"}. No
              fees, GST, investment returns, price changes or inflation
              included. Delayed purchase assumes new savings from monthly
              surplus, with paise rounding adjusted in the last month. Figures
              are illustrations, not financial advice.
            </p>
          </div>
          <label>
            Save before buying
            <select
              value={delay}
              onChange={(e) => update("delay", e.target.value)}
            >
              <option value="3">3 months</option>
              <option value="6">6 months</option>
              <option value="12">12 months</option>
              <option value="24">24 months</option>
            </select>
          </label>
        </div>
      )}
    </section>
  );
}
