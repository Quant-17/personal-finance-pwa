// Deterministic receipt candidates, never executable email HTML or accounting instructions.
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const MERCHANT_QUERY =
  "{from:uber.com from:uber.in from:zomato.com from:swiggy.in from:swiggy.com from:amazon.in}";
export type Receipt = {
  message_id: string;
  dedupe_key: string;
  merchant: string;
  amount_paise: number | null;
  occurred_on: string;
  kind: "charge" | "refund" | "cancellation" | "uncertain";
  reference: string;
  subscription_hint: string | null;
};
export type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
};
export type GmailMessage = {
  id: string;
  internalDate: string;
  payload?: GmailPart;
};
export function rupeesToPaise(value: string): number | null {
  if (
    !/^(?:\d+|\d{1,3}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(
      value,
    )
  )
    return null;
  const [whole, fraction = ""] = value.replaceAll(",", "").split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return amount > 0n && amount <= 1_000_000_000_000n ? Number(amount) : null;
}
function bodyText(part: GmailPart, depth = 0): string {
  if (depth > 8) return "";
  if (part.parts) {
    // Prefer plain text over the duplicate HTML alternative.
    const plain = part.parts.filter((p) => p.mimeType === "text/plain");
    return (plain.length ? plain : part.parts)
      .slice(0, 20)
      .map((p) => bodyText(p, depth + 1))
      .join("\n")
      .slice(0, 100_000);
  }
  if (
    !["text/plain", "text/html"].includes(part.mimeType ?? "") ||
    !part.body?.data ||
    part.body.data.length > 200_000
  )
    return "";
  try {
    const raw = atob(part.body.data.replaceAll("-", "+").replaceAll("_", "/"));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(raw, (c) => c.charCodeAt(0)),
    );
    return part.mimeType === "text/html"
      ? text
          .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;|&#160;/gi, " ")
          .replace(/&#8377;|&#x20b9;/gi, "₹")
          .replace(/&amp;/g, "&")
      : text;
  } catch {
    return "";
  }
}
export function parseReceipt(message: GmailMessage): Receipt | null {
  if (!/^[a-f0-9]{1,40}$/i.test(message.id)) return null;
  const headers = message.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  const from = header("from")
    .match(/(?:<|\s|^)[^\s<>@]+@([a-z0-9.-]+)>?\s*$/i)?.[1]
    ?.toLowerCase();
  const merchant =
    from &&
    [
      ["Uber", ["uber.com", "uber.in"]],
      ["Zomato", ["zomato.com"]],
      ["Swiggy", ["swiggy.in", "swiggy.com"]],
      ["Amazon", ["amazon.in"]],
    ].find(([, domains]) =>
      (domains as string[]).some((d) => from === d || from.endsWith("." + d)),
    )?.[0];
  if (typeof merchant !== "string") return null;
  const date = new Date(Number(message.internalDate));
  if (!Number.isFinite(date.getTime())) return null;
  const occurred_on = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const subject = header("subject").slice(0, 1000);
  const text = (subject + "\n" + bodyText(message.payload ?? {})).slice(
    0,
    100_000,
  );
  // Conservative: reminders/promos/COD are not settled payments. Refunds never become income automatically.
  const kind: Receipt["kind"] = /\b(refund|refunded|reversal)\b/i.test(text)
    ? "refund"
    : /\b(cancelled|canceled|cancellation)\b/i.test(text)
      ? "cancellation"
      : /\b(cash on delivery|pay on delivery|payment pending|payment failed|offer|discount code|payment due)\b/i.test(
            text,
          )
        ? "uncertain"
        : /\b(paid|payment successful|payment received|charged|trip receipt|tax invoice)\b/i.test(
              text,
            )
          ? "charge"
          : "uncertain";
  const amounts = [
    ...text.matchAll(
      /(?:amount\s+(?:paid|charged)|total\s+(?:paid|charged)|grand\s+total|total|paid|charged)\s*[:-]?\s*(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)(?![\d.])/gi,
    ),
  ]
    .map((m) => rupeesToPaise(m[1]))
    .filter((n): n is number => n !== null);
  const unique = [...new Set(amounts)];
  const amount_paise = unique.length === 1 ? unique[0] : null;
  // Only explicit reference labels; never infer a card/account from email content.
  const reference =
    text
      .match(
        /\b(?:order|trip|invoice)\s*(?:id|number|no\.?|#)\s*[:#-]?\s*([a-z0-9][a-z0-9-]{5,59})\b/i,
      )?.[1]
      ?.toUpperCase() ?? "";
  const subscription_hint =
    text.match(/\b(amazon prime|swiggy one|zomato gold|uber one)\b/i)?.[1] ??
    null;
  return {
    message_id: message.id,
    dedupe_key: `${merchant}:${kind}:${reference || message.id}`,
    merchant,
    amount_paise,
    occurred_on,
    kind,
    reference,
    subscription_hint,
  };
}
