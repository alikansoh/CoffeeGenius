import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { redirect } from "next/navigation";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn("JWT_SECRET is not set — server-side auth will fail without it.");
}

/**
 * requireAuth (server components / pages)
 * - If token cookie missing or invalid, redirects to /login
 * - Returns decoded token payload when valid
 */
export async function requireAuth() {
  const tokenCookie = (await cookies()).get("token");
  if (!tokenCookie) {
    redirect("/login");
  }

  const token = tokenCookie?.value;
  try {
    const decoded = jwt.verify(token, JWT_SECRET as string);
    return decoded;
  } catch (err) {
    // invalid token -> redirect to login
    redirect("/login");
  }
}


export async function verifyAuthForApi(request: NextRequest) {
  try {
    // read cookie from request.headers (server runtime)
    const cookieHeader = request.headers.get("cookie") || "";
    const tokenMatch = cookieHeader.split(";").map((s) => s.trim()).find((s) => s.startsWith("token="));
    const token = tokenMatch ? tokenMatch.replace(/^token=/, "") : null;

    if (!token) {
      // unauthorized
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) as never;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET as string);
      return decoded;
    } catch (err) {
      return NextResponse.json({ success: false, message: "Invalid token" }, { status: 401 }) as never;
    }
  } catch (err) {
    console.error("verifyAuthForApi error:", err);
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) as never;
  }
}