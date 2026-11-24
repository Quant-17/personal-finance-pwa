import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { formatExactMoney as money } from "../lib/finance";

export function MonthlyCommitmentBucket({
  title,
  amountPaise,
  count,
  item,
  icon: Icon,
  headingLevel = 3,
  periodLabel = "per month · estimated",
  children,
}: {
  title: string;
  amountPaise: number | null;
  count: number;
  item: "loan" | "subscription";
  icon: LucideIcon;
  headingLevel?: 2 | 3;
  periodLabel?: string;
  children: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const amount =
    amountPaise === null ? "Over supported range" : money(amountPaise);
  return (
    <section className="commitment-bucket" aria-label={title}>
      <div className="commitment-bucket-heading">
        <Icon size={22} aria-hidden="true" />
        <div>
          <Heading>{title}</Heading>
          <span>
            {count} active {item}
            {count === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="commitment-bucket-value">
        <strong data-long={amountPaise !== null && amount.length > 13}>
          {amount}
        </strong>
        <span>{periodLabel}</span>
      </div>
      <div>{children}</div>
    </section>
  );
}
