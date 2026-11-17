import Decimal from "decimal.js";
import { calculateLoan } from "../lib/finance";
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export function loanSchedule(
  principalPaise: number,
  apr: number,
  months: number,
) {
  const { emiPaise } = calculateLoan(principalPaise, apr, months);
  const rate = new D(apr).div(1200);
  let balance = new D(principalPaise);
  return Array.from({ length: months }, (_, index) => {
    const interest = balance.times(rate).toDecimalPlaces(0);
    const due = balance.plus(interest);
    const payment = index === months - 1 ? due : D.min(emiPaise, due);
    const principal = payment.minus(interest);
    balance = due.minus(payment);
    return {
      month: index + 1,
      paymentPaise: payment.toNumber(),
      principalPaise: principal.toNumber(),
      interestPaise: interest.toNumber(),
      balancePaise: balance.toNumber(),
    };
  });
}
