import { NextResponse } from "next/server";
import { checkDbConnection } from "@/lib/db-check";


export async function GET() {
  const result = await checkDbConnection({ doPing: true, pingTimeoutMs: 2500 });

  if (result.ok) {
    return NextResponse.json(result);
  } else {
    return NextResponse.json(result, { status: 500 });
  }
}