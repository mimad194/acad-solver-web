import { NextResponse } from "next/server";
import { getPublicAppConfigAsync } from "@/lib/pricing-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getPublicAppConfigAsync();
  return NextResponse.json(config);
}
