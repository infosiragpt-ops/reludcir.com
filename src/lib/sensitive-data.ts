import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";
const AAD = Buffer.from("reludcir:sensitive-data:v1", "utf8");

function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (secret) return createHash("sha256").update(secret).digest();
  if (process.env.NODE_ENV !== "production") {
    return createHash("sha256")
      .update("reludcir-development-sensitive-data-secret")
      .digest();
  }
  throw new Error("AUTH_SECRET is required to protect sensitive data.");
}

export function sealSensitiveValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authenticationTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authenticationTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function openSensitiveValue(sealedValue: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] =
    sealedValue.split(".");
  if (
    version !== VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    extra.length > 0
  ) {
    throw new Error("Invalid encrypted value.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
