import {
  getUserById,
  updateUser,
  deleteUser,
} from "@/controllers/userController";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthForApi } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(user);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Require authenticated user (no role checks)
  try {
    const auth = await verifyAuthForApi(request);
    if (auth instanceof NextResponse) return auth;
    // auth present — continue
  } catch (err) {
    console.error("Auth check failed for PUT /api/users/[id]", err);
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  try {
    const body = await request.json();
    await updateUser(id, body);
    return NextResponse.json({ message: "User updated" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Require authenticated user (no role checks)
  try {
    const auth = await verifyAuthForApi(request);
    if (auth instanceof NextResponse) return auth;
    // auth present — continue
  } catch (err) {
    console.error("Auth check failed for DELETE /api/users/[id]", err);
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  try {
    await deleteUser(id);
    return NextResponse.json({ message: "User deleted" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}