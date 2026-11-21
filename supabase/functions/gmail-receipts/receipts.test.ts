import { describe, expect, it } from "vitest";
import { parseReceipt, rupeesToPaise } from "./receipts";
import type { GmailMessage } from "./receipts";
const email = (
  body: string,
  from = "receipts@uber.com",
  subject = "Trip receipt",
): GmailMessage => ({
  id: "abc123",
  internalDate: String(new Date("2026-11-19T20:00:00Z").getTime()),
  payload: {
    mimeType: "text/plain",
    headers: [
      { name: "From", value: `Receipts <${from}>` },
      { name: "Subject", value: subject },
    ],
    body: { data: Buffer.from(body).toString("base64url") },
  },
});
describe("Gmail receipt candidates", () => {
  it("converts rupees without floating point and respects Indian grouping", () => {
    expect(rupeesToPaise("7,268.43")).toBe(726843);
    expect(rupeesToPaise("1,23,456.07")).toBe(12345607);
    expect(rupeesToPaise("1,234,567.89")).toBe(123456789);
    for (const n of [
      "1.001",
      "1,23.45",
      "-2",
      "0",
      "10000000000.01",
      "NaN",
      "1e3",
    ])
      expect(rupeesToPaise(n)).toBeNull();
  });
  it("recognizes a settled charge, INR paise and Kolkata arrival date", () => {
    expect(
      parseReceipt(
        email(
          "Payment successful\nAmount paid: INR 425.29\nTrip ID: SYNTHETIC-123",
        ),
      ),
    ).toEqual({
      message_id: "abc123",
      dedupe_key: "Uber:charge:SYNTHETIC-123",
      merchant: "Uber",
      amount_paise: 42529,
      occurred_on: "2026-11-20",
      kind: "charge",
      reference: "SYNTHETIC-123",
      subscription_hint: null,
    });
  });
  it("rejects lookalike sender domains and unsupported merchants", () => {
    for (const sender of [
      "x@uber.com.attacker.invalid",
      "x@notuber.com",
      "x@example.invalid",
    ])
      expect(parseReceipt(email("Total INR 10", sender))).toBeNull();
    expect(
      parseReceipt(email("Paid INR 1", "receipts@email.swiggy.in"))?.merchant,
    ).toBe("Swiggy");
  });
  it("does not mistake refunds, COD, cancellations, promotions or order confirmations for expenses", () => {
    for (const [body, kind] of [
      ["Refund issued. Total INR 10", "refund"],
      ["Payment successful then cancelled. Total INR 10", "cancellation"],
      ["Cash on delivery. Total INR 10", "uncertain"],
      ["Offer! Paid INR 10", "uncertain"],
    ])
      expect(parseReceipt(email(body))?.kind).toBe(kind);
    expect(
      parseReceipt(
        email(
          "Order placed. Grand total INR 100",
          "auto-confirm@amazon.in",
          "Your order",
        ),
      )?.kind,
    ).toBe("uncertain");
  });
  it("requires review when two totals conflict or no supported total exists", () => {
    expect(
      parseReceipt(email("Paid INR 100.29; Total INR 200.29"))?.amount_paise,
    ).toBeNull();
    expect(
      parseReceipt(email("Total INR 100.29; Paid INR 100.29"))?.amount_paise,
    ).toBe(10029);
    expect(parseReceipt(email("Total USD 3.00"))?.amount_paise).toBeNull();
  });
  it("deduplicates follow-ups by merchant, event kind and labeled order reference", () => {
    const first = email("Paid INR 100.00\nOrder # SYNTHETIC-123");
    expect(parseReceipt(first)?.dedupe_key).toBe(
      parseReceipt({ ...first, id: "def456" })?.dedupe_key,
    );
    expect(
      parseReceipt(email("Refund INR 100.00\nOrder # SYNTHETIC-123"))
        ?.dedupe_key,
    ).not.toBe(parseReceipt(first)?.dedupe_key);
  });
  it("never renders or executes HTML and prioritizes the plain-text alternative", () => {
    const m = email("unused");
    m.payload = {
      mimeType: "multipart/alternative",
      headers: m.payload!.headers,
      parts: [
        {
          mimeType: "text/html",
          body: {
            data: Buffer.from(
              "<script>Total INR 999</script><p>Paid: &#8377; 100.29</p>",
            ).toString("base64url"),
          },
        },
      ],
    };
    expect(parseReceipt(m)?.amount_paise).toBe(10029);
    m.payload.parts!.push({
      mimeType: "text/plain",
      body: { data: Buffer.from("Paid INR 25.07").toString("base64url") },
    });
    expect(parseReceipt(m)?.amount_paise).toBe(2507);
  });
  it("suggests memberships without inferring recurrence from normal orders", () => {
    expect(
      parseReceipt(
        email("Swiggy One membership. Paid INR 99", "orders@swiggy.in"),
      )?.subscription_hint?.toLowerCase(),
    ).toBe("swiggy one");
    expect(
      parseReceipt(email("Lunch. Paid INR 99", "orders@swiggy.in"))
        ?.subscription_hint,
    ).toBeNull();
  });
});
