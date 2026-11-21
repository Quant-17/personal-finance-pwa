const encoder = new TextEncoder();
export const randomSecret = () =>
  toBase64(crypto.getRandomValues(new Uint8Array(32)));
export const toBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
export const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
export async function sha256(value: string) {
  return toBase64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
}
export async function tokenCipher(secret: string) {
  const bytes = fromBase64(secret);
  if (bytes.length !== 32) throw new Error("Invalid encryption configuration.");
  const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return {
    async seal(value: string, context: string) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
        key,
        encoder.encode(value),
      );
      return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
    },
    async open(value: string, context: string) {
      const [version, iv, data] = value.split(".");
      if (version !== "v1" || !iv || !data)
        throw new Error("Invalid encrypted credential.");
      return new TextDecoder().decode(
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: fromBase64(iv),
            additionalData: encoder.encode(context),
          },
          key,
          fromBase64(data),
        ),
      );
    },
  };
}
