import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  deletePromoCode,
  getPromoCode,
  listPromoCodes,
  upsertPromoCode,
} from "@/lib/promo-referral";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const promos = await listPromoCodes();
  return NextResponse.json({ promos });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as {
      code?: string;
      discountPercent?: number;
      maxUses?: number;
      note?: string;
      active?: boolean;
    };
    const promo = await upsertPromoCode({
      code: String(body.code ?? ""),
      discountPercent: Number(body.discountPercent ?? 20),
      maxUses: Number(body.maxUses ?? 0),
      note: body.note,
      active: body.active ?? true,
      source: "admin",
    });
    return NextResponse.json({ promo }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر إنشاء كود البرومو." },
      { status: 400 }
    );
  }
}

export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as { code?: string; active?: boolean };
    const existing = await getPromoCode(String(body.code ?? ""));
    if (!existing) {
      return NextResponse.json({ error: "الكود غير موجود." }, { status: 404 });
    }
    const promo = await upsertPromoCode({
      ...existing,
      active: body.active !== undefined ? Boolean(body.active) : !existing.active,
    });
    return NextResponse.json({ promo });
  } catch {
    return NextResponse.json({ error: "تعذر تحديث الكود." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code") ?? "";
  const ok = await deletePromoCode(code);
  if (!ok) {
    return NextResponse.json({ error: "الكود غير موجود." }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
