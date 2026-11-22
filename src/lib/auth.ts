import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "acad_admin_session";

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || "admin2026";
}

function getSecret(): string {
  return crypto
    .createHash("sha256")
    .update(`acad-solver-secret::${getAdminPassword()}`)
    .digest("hex");
}

export function verifyPassword(input: string): boolean {
  return input.trim() === getAdminPassword();
}

export async function createAdminSession(): Promise<void> {
  const token = getSecret();
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const val = jar.get(COOKIE_NAME)?.value;
  return Boolean(val && val === getSecret());
}
