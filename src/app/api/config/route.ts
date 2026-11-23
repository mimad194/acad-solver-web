import { NextResponse } from "next/server";
import { getPublicAppConfig } from "@/lib/pricing-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPublicAppConfig());
}
