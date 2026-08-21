import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "../src/lib/auth";
import {
  canAccessAdminSection,
  canListAdminBookings,
  isPrivilegedStaff,
  staffAuthorization,
} from "../src/lib/staff";

test("hashes passwords with scrypt and rejects look-alike secrets", async () => {
  const encoded = await hashPassword("Reludcir-clave-segura");
  assert.match(encoded, /^scrypt-v1\$/);
  assert.equal(await verifyPassword("Reludcir-clave-segura", encoded), true);
  assert.equal(await verifyPassword("reludcir-clave-segura", encoded), false);
  assert.equal(await verifyPassword("Reludcir-clave-segura", null), false);
  assert.equal(await verifyPassword("Reludcir-clave-segura", "plain-text"), false);
});

test("only admin and support roles can reconcile payments", () => {
  assert.equal(isPrivilegedStaff("admin"), true);
  assert.equal(isPrivilegedStaff("support"), true);
  assert.equal(isPrivilegedStaff("customer"), false);
  assert.equal(isPrivilegedStaff("agent"), false);
  assert.equal(isPrivilegedStaff(null), false);
});

test("non-admin users receive 403 for admin booking access", () => {
  assert.equal(staffAuthorization({ role: "customer" }, "admin")?.status, 403);
  assert.equal(staffAuthorization({ role: "support" }, "admin")?.status, 403);
  assert.equal(staffAuthorization(null, "admin")?.status, 401);
  assert.equal(staffAuthorization({ role: "admin" }, "admin"), null);
  assert.equal(canListAdminBookings("admin"), true);
  assert.equal(canListAdminBookings("support"), false);
  assert.equal(canListAdminBookings("customer"), false);
  assert.equal(canAccessAdminSection("support", "payments"), true);
  assert.equal(canAccessAdminSection("support", "bookings"), false);
});
