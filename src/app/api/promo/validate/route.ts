import { NextResponse } from "next/server";
import { resolvePackagePriceAsync } from "@/lib/pricing-config";
import { validatePromoOrReferralCode } from "@/lib/promo-referral";
import type { PackageId } from "@/types/order";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      code?: string;
      packageId?: PackageId;
    };
    const pkg = await resolvePackagePriceAsync(body.packageId);
    const result = await validatePromoOrReferralCode(
      String(body.code ?? ""),
      pkg.priceDzd
    );
    return NextResponse.json({
      ...result,
      originalPriceDzd: pkg.priceDzd,
    });
  } catch {
    return NextResponse.json(
      { valid: false, message: "تعذر التحقق من الكود حاليا." },
      { status: 400 }
    );
  }
}
