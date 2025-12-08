import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { redirect } from "next/navigation";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn("JWT_SECRET is not set — server-side auth will fail without it.");
}

/**
 * Decoded token shape (extend as needed)
 */
type DecodedToken = {
  iat?: number;
  exp?: number;
  sub?: string;
  email?: string;
  role?: string;
  isAdmin?: boolean;
  [k: string]: unknown;
};

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
    const decoded = jwt.verify(token, JWT_SECRET as string) as DecodedToken;
    return decoded;
  } catch (err) {
    // invalid token -> redirect to login
    redirect("/login");
  }
}


 
export async function verifyAuthForApi(
  request: NextRequest,
  // kept for compatibility with route handlers; not used to perform extra checks.
  _opts?: { requireAdmin?: boolean }
): Promise<DecodedToken | NextResponse> {
  try {
    // read cookie from request.headers (server runtime)
    const cookieHeader = request.headers.get("cookie") || "";
    const tokenMatch = cookieHeader
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("token="));
    const token = tokenMatch ? tokenMatch.replace(/^token=/, "") : null;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET as string) as DecodedToken;

      // Per your instruction: do NOT check role/isAdmin or other admin claims.
      // Any authenticated user is allowed for routes that previously requiredAdmin.

      return decoded;
    } catch (err) {
      return NextResponse.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }
  } catch (err) {
    console.error("verifyAuthForApi error:", err);
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }
}