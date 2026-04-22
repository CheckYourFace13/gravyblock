import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "gb_admin_session";

function signingSecret() {
  const value = process.env.ADMIN_SECRET ?? "";
  if (process.env.NODE_ENV === "production" && !value) {
    throw new Error("ADMIN_SECRET is required in production");
  }
  return value || "dev-only-change-me";
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

export function buildSessionToken() {
  const password = adminPassword();
  if (!password) return "";
  return createHmac("sha256", signingSecret()).update(password).digest("hex");
}

export async function isAdminSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  const expected = buildSessionToken();
  if (!token || !expected) return false;
  try {
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function setAdminSessionCookie() {
  const token = buildSessionToken();
  if (!token) return;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAdminSessionCookie() {
  (await cookies()).set(COOKIE, "", { path: "/", maxAge: 0 });
}
