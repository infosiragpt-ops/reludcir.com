import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";

const SESSION_COOKIE = "reludcir_session";
const SESSION_DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD_KEY_LENGTH = 64;

export type AuthenticatedUser = {
  id: number;
  email: string;
  role: string;
};

function derivePasswordKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, PASSWORD_KEY_LENGTH, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = await derivePasswordKey(password, salt);
  return `scrypt-v1$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string | null,
): Promise<boolean> {
  if (!encodedHash) {
    return false;
  }

  const [version, salt, expectedValue] = encodedHash.split("$");
  if (version !== "scrypt-v1" || !salt || !expectedValue) {
    return false;
  }

  const expected = Buffer.from(expectedValue, "base64url");
  const actual = await derivePasswordKey(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(userId: number, remember = false) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + (remember ? 30 : 1) * SESSION_DAY_MS,
  );

  await getDb().insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return { expiresAt };
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const [result] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  return result ?? null;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  // Clear the browser credential first. A transient database failure must never
  // leave an apparently logged-out shared browser with a reusable session cookie.
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  if (token) {
    await getDb()
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(token)));
  }
}
