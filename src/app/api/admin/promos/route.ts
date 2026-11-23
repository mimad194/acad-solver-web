import { NextResponse } from "next/server";
import crypto from "crypto";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  deletePromoCode,
  getPromoCode,
  listPromoCodes,
  normalizeCode,
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
      batchCount?: number;
      note?: string;
      active?: boolean;
    };

    const batchCount = Math.min(50, Math.max(1, Math.round(Number(body.batchCount ?? 1) || 1)));
    const baseCode = normalizeCode(String(body.code ?? ""));

    // Batch generation of N unique single-use individual codes (e.g., VIP-A4K9 ...)
    if (batchCount > 1) {
      if (!baseCode || baseCode.length < 2 || !/^[A-Z0-9_-]+$/.test(baseCode)) {
        return NextResponse.json(
          { error: "يرجى كتابة بادئة إنجليزية صالحة لتوليد الدفعة (مثل VIP أو UFC)." },
          { status: 400 }
        );
      }
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const created = [];
      for (let i = 0; i < batchCount; i++) {
        let suffix = "";
        for (let k = 0; k < 4; k++) {
          suffix += chars[crypto.randomInt(0, chars.length)];
        }
        const uniqueCode = `${baseCode}-${suffix}`;
        const promo = await upsertPromoCode({
          code: uniqueCode,
          discountPercent: Number(body.discountPercent ?? 100),
          maxUses: 1, // Strictly 1 use per individual VIP code!
          note: body.note?.trim()
            ? `${body.note.trim()} (#${i + 1})`
            : `كود فردي استخدام واحد (#${i + 1})`,
          active: body.active ?? true,
          source: "admin",
        });
        created.push(promo);
      }
      return NextResponse.json({ promos: created, promo: created[0] }, { status: 201 });
    }

    const promo = await upsertPromoCode({
      code: baseCode,
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
