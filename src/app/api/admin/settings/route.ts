import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  getPublicAppConfigAsync,
  saveCommercialOverrides,
  type StoredCommercialOverrides,
} from "@/lib/pricing-config";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const config = await getPublicAppConfigAsync();
  return NextResponse.json({ config });
}

export async function PUT(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as StoredCommercialOverrides;
    const config = await saveCommercialOverrides({
      currency: body.currency,
      previewLockEnabled: body.previewLockEnabled,
      supportWhatsapp: body.supportWhatsapp,
      payment: body.payment,
      packages: body.packages,
    });
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    console.error("PUT /api/admin/settings error:", err);
    return NextResponse.json(
      { error: "تعذر حفظ إعدادات الأسعار والباقات." },
      { status: 500 }
    );
  }
}
