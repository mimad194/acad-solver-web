import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  __setFirestoreDbForTests,
  sanitizeForFirestore,
} from "@/lib/firebase-admin";
import {
  consumePromoCodeAtomic,
  deletePromoCode,
  getPromoCode,
  getReferralStatsForOrder,
  listPromoCodes,
  processReferralQualification,
  rollbackPromoUsage,
  upsertPromoCode,
  validatePromoOrReferralCode,
} from "@/lib/promo-referral";
import {
  consumeOneCredit,
  issueCreditPassForOrder,
  refundOneCredit,
  validateCreditPass,
} from "@/lib/credit-passes";
import { createOrder, getOrderById, updateOrder } from "@/lib/store";
import {
  getPublicAppConfigAsync,
  saveCommercialOverrides,
} from "@/lib/pricing-config";
import { saveVerifiedBlueprintFromOrder } from "@/lib/blueprints";
import { POST as validateRoutePost } from "@/app/api/promo/validate/route";
import { POST as ordersRoutePost } from "@/app/api/orders/route";
import {
  StrictInMemoryFirestore,
  assertNoUndefinedDeep,
} from "./strict-firestore-harness";
import type { StudentOrder } from "@/types/order";

// Strictly isolate from any production environment variables
delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
delete process.env.FIREBASE_PROJECT_ID;
delete process.env.FIREBASE_CLIENT_EMAIL;
delete process.env.FIREBASE_PRIVATE_KEY;
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;

async function makeOrder(
  overrides: Partial<Parameters<typeof createOrder>[0]> = {}
): Promise<StudentOrder> {
  return createOrder({
    studentName: "طالب تجريبي",
    contact: "0550123456",
    university: "جامعة التكوين المتواصل (UFC)",
    specialty: "ماستر 2 — إدارة المنظمات",
    moduleName: "تحليل المعطيات",
    assignmentTitle: "النشاط الثاني",
    exerciseText: "نص نشاط تجريبي للاختبار",
    notes: "",
    includeCoverPage: false,
    strictReferencesOnly: true,
    packageId: "standard",
    originalPriceDzd: 250,
    discountPercent: 0,
    discountAmountDzd: 0,
    priceDzd: 250,
    paymentStatus: "unpaid",
    paymentReceipt: null,
    paidAt: null,
    files: [],
    ...overrides,
  });
}

describe("1. Strict Firestore Mode (ignoreUndefinedProperties=false enforcement)", () => {
  let db: StrictInMemoryFirestore;

  beforeEach(() => {
    db = new StrictInMemoryFirestore();
    __setFirestoreDbForTests(db.asFirestore());
  });

  afterEach(() => {
    __setFirestoreDbForTests(undefined);
  });

  it("reproduces and fixes the exact 100% promo creation crash (no undefined allowedPackageIds/note/ownerOrderId)", async () => {
    const promo = await upsertPromoCode({
      code: "vip100",
      discountPercent: 100,
      maxUses: 1,
      active: true,
      source: "admin",
      createOnly: true,
    });

    assert.equal(promo.code, "VIP100");
    assert.equal(promo.discountPercent, 100);
    assert.equal(promo.maxUses, 1);
    assert.equal(promo.usedCount, 0);
    assert.equal(promo.active, true);
    assert.equal("allowedPackageIds" in promo, false);

    const rawDoc = db.getRawDocument("promo_codes", "VIP100");
    assert.ok(rawDoc);
    assertNoUndefinedDeep(rawDoc, "");
    assert.equal("allowedPackageIds" in rawDoc, false);
    assert.equal("note" in rawDoc, false);
    assert.equal("ownerOrderId" in rawDoc, false);

    const disabled = await upsertPromoCode({
      code: "VIP100",
      discountPercent: 100,
      maxUses: 1,
      active: false,
    });
    assert.equal(disabled.active, false);

    const scoped = await upsertPromoCode({
      code: "VIP100",
      discountPercent: 100,
      maxUses: 5,
      active: true,
      allowedPackageIds: ["standard"],
      note: "تجربة شخصية",
    });
    assert.deepEqual(scoped.allowedPackageIds, ["standard"]);
    assert.equal(scoped.note, "تجربة شخصية");

    const unscoped = await upsertPromoCode({
      code: "VIP100",
      discountPercent: 100,
      maxUses: 5,
      active: true,
      allowedPackageIds: [],
    });
    assert.equal("allowedPackageIds" in unscoped, false);

    const deleted = await deletePromoCode("VIP100");
    assert.equal(deleted, true);
    assert.equal(await getPromoCode("VIP100"), null);
  });

  it("validates promo percentages (1%..100%), input guards, and package restrictions", async () => {
    await assert.rejects(() => upsertPromoCode({ code: "AB", discountPercent: 10 }), /3 أحرف/);
    await assert.rejects(() => upsertPromoCode({ code: "PASS-123", discountPercent: 10 }), /محجوزة/);
    await assert.rejects(() => upsertPromoCode({ code: "REF-123", discountPercent: 10 }), /محجوزة/);
    await assert.rejects(() => upsertPromoCode({ code: "ZERO", discountPercent: 0 }), /1% و 100%/);
    await assert.rejects(() => upsertPromoCode({ code: "OVER", discountPercent: 101 }), /1% و 100%/);
    await assert.rejects(() => upsertPromoCode({ code: "NEGMAX", discountPercent: 20, maxUses: -1 }), /0/);

    await upsertPromoCode({ code: "TEST1", discountPercent: 1, maxUses: 0 });
    await upsertPromoCode({ code: "TEST33", discountPercent: 33, maxUses: 0 });
    await upsertPromoCode({ code: "TEST100", discountPercent: 100, maxUses: 0 });
    await upsertPromoCode({
      code: "STDONLY",
      discountPercent: 100,
      maxUses: 1,
      allowedPackageIds: ["standard"],
    });

    await assert.rejects(
      () => upsertPromoCode({ code: "TEST100", discountPercent: 50, createOnly: true }),
      /موجود مسبقا/
    );

    const r1 = await validatePromoOrReferralCode("test1", 250, "standard");
    assert.equal(r1.valid, true);
    assert.equal(r1.discountAmountDzd, 3);
    assert.equal(r1.finalPriceDzd, 247);

    const r33 = await validatePromoOrReferralCode("TEST33", 650, "premium");
    assert.equal(r33.valid, true);
    assert.equal(r33.discountAmountDzd, 215);
    assert.equal(r33.finalPriceDzd, 435);

    const r100 = await validatePromoOrReferralCode("TEST100", 3300, "semester");
    assert.equal(r100.valid, true);
    assert.equal(r100.discountAmountDzd, 3300);
    assert.equal(r100.finalPriceDzd, 0);

    const blockedPrem = await validatePromoOrReferralCode("STDONLY", 650, "premium");
    assert.equal(blockedPrem.valid, false);
    assert.match(blockedPrem.message, /نشاط واحد/);

    const allowedStd = await validatePromoOrReferralCode("STDONLY", 250, "standard");
    assert.equal(allowedStd.valid, true);
    assert.equal(allowedStd.finalPriceDzd, 0);
  });

  it("enforces atomic single-use promo consumption under 10x concurrent calls + rollback", async () => {
    await upsertPromoCode({ code: "SINGLE100", discountPercent: 100, maxUses: 1 });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumePromoCodeAtomic("SINGLE100", "standard"))
    );
    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);

    assert.equal(successes.length, 1);
    assert.equal(failures.length, 9);

    const after = await getPromoCode("SINGLE100");
    assert.equal(after?.usedCount, 1);

    const recheck = await validatePromoOrReferralCode("SINGLE100", 250, "standard");
    assert.equal(recheck.valid, false);
    assert.match(recheck.message, /استنفاد/);

    await rollbackPromoUsage("SINGLE100");
    assert.equal((await getPromoCode("SINGLE100"))?.usedCount, 0);

    await rollbackPromoUsage("SINGLE100");
    assert.equal((await getPromoCode("SINGLE100"))?.usedCount, 0);
  });

  it("runs complete 3-referral reward lifecycle with anti-fraud & standard-only lock", async () => {
    const referrer = await makeOrder({
      studentName: "أمين المحيل",
      referralCode: "REF-AMIN1",
      paymentStatus: "paid",
      priceDzd: 250,
    });

    const vRef = await validatePromoOrReferralCode("ref-amin1", 650, "premium");
    assert.equal(vRef.valid, true);
    assert.equal(vRef.kind, "referral");
    assert.equal(vRef.discountPercent, 10);
    assert.equal(vRef.discountAmountDzd, 65);
    assert.equal(vRef.finalPriceDzd, 585);

    const freeOrder = await makeOrder({
      referredByCode: "REF-AMIN1",
      paymentStatus: "paid",
      priceDzd: 0,
    });
    assert.equal(await processReferralQualification(freeOrder), null);

    const passOrder = await makeOrder({
      referredByCode: "REF-AMIN1",
      creditPassUsed: "PASS-FAKE1",
      paymentStatus: "paid",
      priceDzd: 250,
    });
    assert.equal(await processReferralQualification(passOrder), null);

    await makeOrder({ referredByCode: "REF-AMIN1", paymentStatus: "unpaid", priceDzd: 225 });

    const f1 = await makeOrder({ referredByCode: "REF-AMIN1", paymentStatus: "paid", priceDzd: 225 });
    assert.equal(await processReferralQualification(f1), null);
    const f2 = await makeOrder({ referredByCode: "REF-AMIN1", paymentStatus: "paid", priceDzd: 225 });
    assert.equal(await processReferralQualification(f2), null);

    const stats2 = await getReferralStatsForOrder((await getOrderById(referrer.id))!);
    assert.equal(stats2.qualifiedCount, 2);
    assert.equal(stats2.pendingCount, 1);
    assert.equal(stats2.remainingForNextReward, 1);

    const f3 = await makeOrder({ referredByCode: "REF-AMIN1", paymentStatus: "paid", priceDzd: 225 });
    const minted = await processReferralQualification(f3);
    assert.ok(minted && minted.startsWith("FREE-"));

    assert.equal(await processReferralQualification(f3), null);

    const onSem = await validatePromoOrReferralCode(minted, 3300, "semester");
    assert.equal(onSem.valid, false);
    const onPrem = await validatePromoOrReferralCode(minted, 650, "premium");
    assert.equal(onPrem.valid, false);
    const onStd = await validatePromoOrReferralCode(minted, 250, "standard");
    assert.equal(onStd.valid, true);
    assert.equal(onStd.finalPriceDzd, 0);

    const c1 = await consumePromoCodeAtomic(minted, "standard");
    assert.equal(c1.ok, true);
    const c2 = await consumePromoCodeAtomic(minted, "standard");
    assert.equal(c2.ok, false);
  });

  it("runs complete Semester Credit Pass lifecycle + 5x concurrency on final credit + refund", async () => {
    await saveCommercialOverrides({ semesterPassExpiresAt: "2020-01-01" });

    const stdOrder = await makeOrder({ packageId: "standard", paymentStatus: "paid", priceDzd: 250 });
    assert.equal(await issueCreditPassForOrder(stdOrder), null);

    const waveOrder = await makeOrder({
      packageId: "premium",
      paymentStatus: "paid",
      priceDzd: 650,
      cycle: undefined,
      year: undefined,
      specialtyId: undefined,
    });
    const pass = await issueCreditPassForOrder(waveOrder);
    assert.ok(pass && pass.passCode.startsWith("PASS-"));
    assert.equal(pass.totalCredits, 3);
    assert.equal(pass.usedCredits, 1);
    assert.ok(new Date(pass.expiresAt).getTime() > Date.now());

    const passAgain = await issueCreditPassForOrder((await getOrderById(waveOrder.id))!);
    assert.equal(passAgain?.passCode, pass.passCode);

    const vPass = await validatePromoOrReferralCode(pass.passCode, 3300, "semester");
    assert.equal(vPass.valid, true);
    assert.equal(vPass.kind, "credit_pass");
    assert.equal(vPass.effectivePackageId, "standard");
    assert.equal(vPass.finalPriceDzd, 0);
    assert.equal(vPass.creditPassRemaining, 2);

    const after2 = await consumeOneCredit(pass.passCode, "ord-2");
    assert.equal(after2?.usedCredits, 2);

    const race = await Promise.all(
      ["ord-3a", "ord-3b", "ord-3c", "ord-3d", "ord-3e"].map((oid) =>
        consumeOneCredit(pass.passCode, oid)
      )
    );
    const winners = race.filter(Boolean);
    assert.equal(winners.length, 1);

    const exhaustedCheck = await validateCreditPass(pass.passCode);
    assert.equal(exhaustedCheck.valid, false);
    assert.match(exhaustedCheck.message, /استنفاد/);

    const winningOrderId = winners[0]!.consumedOrderIds[2];
    const refunded = await refundOneCredit(pass.passCode, winningOrderId);
    assert.equal(refunded, true);
    const validAgain = await validateCreditPass(pass.passCode);
    assert.equal(validAgain.valid, true);
    assert.equal(validAgain.remainingCredits, 1);
  });

  it("sanitizes all other Firestore writes (orders, commercial settings, blueprints) with zero undefined values", async () => {
    const order = await makeOrder({
      cycle: undefined,
      year: undefined,
      domain: undefined,
      specialtyId: undefined,
      promoCodeUsed: undefined,
      creditPassUsed: undefined,
      referredByCode: undefined,
    });
    assertNoUndefinedDeep(db.getRawDocument("orders", order.id), "");

    const updated = await updateOrder(order.id, (cur) => ({
      ...cur,
      adminNote: "مراجعة",
      solution: {
        title: "حل تجريبي",
        includeCoverPage: false,
        blocks: [{ id: "b1", type: "paragraph", text: "فقرة تجريبية" }],
        updatedAt: new Date().toISOString(),
      },
    }));
    assert.ok(updated);
    assertNoUndefinedDeep(db.getRawDocument("orders", order.id), "");

    const bp = await saveVerifiedBlueprintFromOrder(updated);
    assert.ok(bp);
    assertNoUndefinedDeep(db.getRawDocument("verified_blueprints", bp.id), "");

    await saveCommercialOverrides({
      currency: "دج",
      packages: [{ id: "standard", priceDzd: 250, badge: undefined }],
    });
    const cfg = await getPublicAppConfigAsync();
    assert.equal(cfg.packages[0].priceDzd, 250);
    assertNoUndefinedDeep(db.getRawDocument("app_settings", "commercial"), "");

    const cleaned = sanitizeForFirestore({
      a: 1,
      b: undefined,
      c: { d: undefined, e: [1, undefined, 2] },
    });
    assert.deepEqual(cleaned, { a: 1, c: { e: [1, 2] } });
  });

  it("executes real Next.js HTTP Route Handlers end-to-end (100% promo -> waived 3-pack -> auto PASS -> credit order)", async () => {
    await upsertPromoCode({
      code: "LAUNCH100",
      discountPercent: 100,
      maxUses: 1,
      active: true,
      source: "admin",
    });

    const valRes = await validateRoutePost(
      new Request("http://localhost:3000/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "launch100", packageId: "premium" }),
      })
    );
    assert.equal(valRes.status, 200);
    const valJson = await valRes.json();
    assert.equal(valJson.valid, true);
    assert.equal(valJson.discountPercent, 100);
    assert.equal(valJson.finalPriceDzd, 0);

    const ordRes = await ordersRoutePost(
      new Request("http://localhost:3000/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: "سارة بن محمد",
          contact: "0551002003",
          university: "جامعة التكوين المتواصل (UFC)",
          cycle: "master",
          year: "M2",
          specialtyId: "m_org_management",
          moduleName: "تحليل المعطيات",
          assignmentTitle: "النشاط الأول",
          exerciseText: "حلل الجدول الإحصائي التالي...",
          packageId: "premium",
          promoCode: "LAUNCH100",
          uploadedFiles: [],
        }),
      })
    );
    assert.equal(ordRes.status, 201);
    const ordJson = await ordRes.json();
    assert.equal(ordJson.priceDzd, 0);
    assert.equal(ordJson.paymentStatus, "waived");
    assert.ok(ordJson.issuedPassCode && ordJson.issuedPassCode.startsWith("PASS-"));

    const reuseRes = await ordersRoutePost(
      new Request("http://localhost:3000/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: "طالب آخر",
          moduleName: "قانون الأعمال",
          assignmentTitle: "النشاط الأول",
          exerciseText: "سؤال تجريبي",
          packageId: "standard",
          promoCode: "LAUNCH100",
          uploadedFiles: [],
        }),
      })
    );
    assert.equal(reuseRes.status, 400);

    const passOrdRes = await ordersRoutePost(
      new Request("http://localhost:3000/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: "سارة بن محمد",
          moduleName: "إدارة الموارد البشرية",
          assignmentTitle: "النشاط الثاني",
          exerciseText: "سؤال ثاني",
          packageId: "semester",
          promoCode: ordJson.issuedPassCode,
          uploadedFiles: [],
        }),
      })
    );
    assert.equal(passOrdRes.status, 201);
    const passOrdJson = await passOrdRes.json();
    assert.equal(passOrdJson.packageId, "standard");
    assert.equal(passOrdJson.priceDzd, 0);
    assert.equal(passOrdJson.paymentStatus, "waived");
    assert.equal(passOrdJson.creditPassUsed, ordJson.issuedPassCode);
    assert.equal(passOrdJson.remainingPassCredits, 1);

    assert.ok(db.writeLog.length >= 6);
    for (const w of db.writeLog) {
      assertNoUndefinedDeep(w.data, `${w.collection}/${w.id}`);
    }
  });
});

describe("2. Isolated Local Filesystem Fallback Mode (ACAD_SOLVER_DATA_DIR)", () => {
  let tmpDir = "";

  beforeEach(async () => {
    __setFirestoreDbForTests(null);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "acad-solver-test-"));
    process.env.ACAD_SOLVER_DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.ACAD_SOLVER_DATA_DIR;
    __setFirestoreDbForTests(undefined);
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("handles 100% promo, concurrent single-use consumption, and credit passes on local disk cleanly", async () => {
    await upsertPromoCode({ code: "LOCAL100", discountPercent: 100, maxUses: 1 });
    const list = await listPromoCodes();
    assert.equal(list.length, 1);
    assert.equal(list[0].code, "LOCAL100");

    const race = await Promise.all(
      Array.from({ length: 6 }, () => consumePromoCodeAtomic("LOCAL100", "standard"))
    );
    assert.equal(race.filter((r) => r.ok).length, 1);

    const ord = await makeOrder({ packageId: "premium", paymentStatus: "paid", priceDzd: 650 });
    const pass = await issueCreditPassForOrder(ord);
    assert.ok(pass);
    const consumed = await consumeOneCredit(pass.passCode, "local-ord-2");
    assert.equal(consumed?.usedCredits, 2);
  });
});
