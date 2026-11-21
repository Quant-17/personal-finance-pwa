/** Conservative statement identities. Never remove digits from a payee identifier. */
export type StatementRecipient = {
  key: string;
  name: string;
  detail: string;
  exclusionOnly?: boolean;
};
const clean = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();
export function statementRecipient(
  narration: string,
): StatementRecipient | null {
  const text = clean(narration);
  const sbi = text.match(
    /UPI\/(?:DR|CR)\/[^/]+\/([^/]+)\/([^/]+)\/([^/]+)(?:\/|$)/,
  );
  if (sbi) {
    const bank = sbi[2].replace(/\s/g, "");
    const name = clean(sbi[1]),
      payee = sbi[3].replace(/\s/g, "");
    if (/^[A-Z]{4}$/.test(bank) && name.length >= 3 && payee.length >= 4)
      return {
        key: `sbi-upi:${bank}:${name}:${payee}`,
        name,
        detail: `${bank} · ${payee}`,
      };
    return null;
  }
  const kotak = text.match(/\bUPI\/([^/]+)\/([^/]+)\/[^/]+(?:\/|$)/);
  if (kotak && !/^(DR|CR)$/.test(kotak[1])) {
    const name = clean(kotak[1]),
      bank = kotak[2].replace(/\s/g, "");
    if (/^[A-Z]{4}$/.test(bank) && name.length >= 3)
      return {
        key: `kotak-upi:${bank}:${name}`,
        name,
        detail: `${bank} · statement name may be truncated`,
      };
  }
  const pcd = text.match(/\bPCD\/[^/]+\/([^/]+)\//);
  if (pcd && pcd[1].trim().length >= 3)
    return {
      key: `card:${clean(pcd[1])}`,
      name: clean(pcd[1]),
      detail: "Card merchant",
    };
  // A mandate is a stable identifier; a NACHDB/reference number is not.
  const nach = text.match(/\bNACH-[^·]*?-\s*([A-Z0-9]{12,40})(?=\s*(?:·|$))/);
  if (nach)
    return { key: `nach:${nach[1]}`, name: "NACH mandate", detail: nach[1] };
  // Exact merchant tokens only within a card-purchase narration, never arbitrary UPI remarks.
  if (/\b(?:POS|OTH P?G|OTHPG)\b/.test(text)) {
    const merchant = text.match(
      /\b(OPENAI\s*\*?\s*CHATGPT|APPLE\s+MEDIA|AMAZON|ZOMATO|SWIGGY|UBER)\b/,
    );
    if (merchant) {
      const name = clean(merchant[1]).replace(/\s*\*\s*/g, " ");
      return { key: `card:${name}`, name, detail: "Card merchant token" };
    }
  }
  if (/\bDIRECT\s+DR\b/.test(text))
    return {
      key: "sbi-direct-dr:unidentified",
      name: "SBI direct debit",
      detail:
        "No recipient is shown. Only an exact-amount exclusion rule is supported; reconcile its purpose separately.",
      exclusionOnly: true,
    };
  // Unknown formats stay manual rather than guessing from a changing numeric reference.
  return null;
}
export function statementNeedsReconciliation(text: string) {
  return (
    /kotakccpay/i.test(text) ||
    /\b(refund|reversal|reversed|cashback|pending|failed|declined|cancelled|self|kotakccpay|card\s*(?:bill|payment)|payment received|payment thank)\b/i.test(
      text,
    )
  );
}
