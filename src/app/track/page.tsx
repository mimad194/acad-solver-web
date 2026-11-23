"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  FileCheck2,
  FileUp,
  Gift,
  HelpCircle,
  Lock,
  MessageCircle,
  Search,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import {
  OrderStatus,
  PackageId,
  PaymentStatus,
  PublicAppConfig,
  SolutionDocument,
} from "@/types/order";
import SolutionPreview from "@/components/SolutionPreview";

interface TrackedOrder {
  id: string;
  trackingCode: string;
  studentName: string;
  university: string;
  specialty: string;
  moduleName: string;
  assignmentTitle: string;
  status: OrderStatus;
  adminNote: string;
  packageId?: PackageId;
  priceDzd: number | null;
  paymentStatus: PaymentStatus;
  paymentReceipt: {
    originalName: string;
    uploadedAt: string;
    referenceNote?: string;
  } | null;
  isPaymentUnlocked: boolean;
  totalBlocksCount: number;
  hasStudyGuide: boolean;
  createdAt: string;
  updatedAt: string;
  filesCount: number;
  solution: SolutionDocument | null;
}

interface ReferralStats {
  enabled: boolean;
  referralCode: string;
  targetCount: number;
  friendDiscountPercent: number;
  qualifiedCount: number;
  pendingCount: number;
  remainingForNextReward: number;
  rewardPromoCodes: Array<{ code: string; used: boolean }>;
}

interface CreditPassSummary {
  passCode: string;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  expiresAt: string;
  expired: boolean;
  active: boolean;
}

const STEPS: Array<{ key: OrderStatus; label: string; desc: string }> = [
  { key: "pending", label: "تم استلام الطلب", desc: "الطلب مسجل وبانتظار مراجعة المشرف" },
  { key: "in_review", label: "قيد الإعداد والمراجعة", desc: "يجري حل النشاط وتدقيق المعادلات والجداول" },
  { key: "completed", label: "مكتمل وجاهز للتحميل", desc: "تم اعتماد العمل وتجهيز ملف Word للتحميل" },
];

const PAYMENT_BADGE: Record<PaymentStatus, { label: string; cls: string }> = {
  unpaid: { label: "بانتظار الدفع", cls: "bg-amber-100 text-amber-800" },
  receipt_submitted: {
    label: "تم رفع الوصل — قيد التأكيد",
    cls: "bg-blue-100 text-blue-800",
  },
  paid: { label: "تم تأكيد الدفع ✓", cls: "bg-emerald-100 text-emerald-800" },
  waived: { label: "مفتوح مجانا ✓", cls: "bg-emerald-100 text-emerald-800" },
};

function TrackContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") ?? "";
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [config, setConfig] = useState<PublicAppConfig | null>(null);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [creditPass, setCreditPass] = useState<CreditPassSummary | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [referenceNote, setReferenceNote] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptMsg, setReceiptMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [copiedRip, setCopiedRip] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  const fetchOrder = useCallback(async (targetCode: string) => {
    const clean = targetCode.trim();
    if (!clean) return;
    setLoading(true);
    setError("");
    setReceiptMsg(null);
    try {
      const res = await fetch(`/api/orders/track?code=${encodeURIComponent(clean)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setOrder(null);
        setReferralStats(null);
        throw new Error(data.error || "الطلب غير موجود.");
      }
      setOrder(data.order);
      if (data.config) setConfig(data.config);
      setReferralStats(data.referralStats ?? null);
      setCreditPass(data.creditPass ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر البحث عن الطلب.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialCode) {
      fetchOrder(initialCode);
    }
  }, [initialCode, fetchOrder]);

  const handleReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    if (!receiptFile && !referenceNote.trim()) {
      setReceiptMsg({
        type: "err",
        text: "يرجى إرفاق صورة/ملف وصل BaridiMob أو كتابة رقم مرجع التحويل.",
      });
      return;
    }

    setUploadingReceipt(true);
    setReceiptMsg(null);
    try {
      let res: Response;
      let blobEnabled = false;
      try {
        const cfgRes = await fetch("/api/upload", { cache: "no-store" });
        if (cfgRes.ok) {
          const cfg = (await cfgRes.json()) as { blobEnabled?: boolean };
          blobEnabled = Boolean(cfg.blobEnabled);
        }
      } catch {
        blobEnabled = false;
      }

      if (receiptFile && blobEnabled) {
        const extMatch = receiptFile.name.match(/\.[a-zA-Z0-9]+$/);
        const safeExt = extMatch ? extMatch[0].toLowerCase() : ".jpg";
        const pathname = `acad-solver/uploads/receipt-${order.trackingCode}-${Date.now()}${safeExt}`;
        const blob = await upload(pathname, receiptFile, {
          access: "public",
          handleUploadUrl: "/api/upload",
        });
        res = await fetch("/api/orders/track/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackingCode: order.trackingCode,
            referenceNote: referenceNote.trim(),
            receipt: {
              originalName: receiptFile.name,
              storedName: blob.pathname.split("/").pop() || receiptFile.name,
              blobUrl: blob.url,
              mimeType: receiptFile.type || blob.contentType || "image/jpeg",
              size: receiptFile.size,
            },
          }),
        });
      } else {
        const fd = new FormData();
        fd.append("trackingCode", order.trackingCode);
        fd.append("referenceNote", referenceNote.trim());
        if (receiptFile) fd.append("receiptFile", receiptFile);
        res = await fetch("/api/orders/track/receipt", { method: "POST", body: fd });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر إرسال وصل الدفع.");

      setReceiptFile(null);
      setReferenceNote("");
      setReceiptMsg({
        type: "ok",
        text: "تم استلام وصل الدفع وإشعار المشرف فورا! سيتم تأكيده وفتح التحميل الكامل خلال دقائق.",
      });
      await fetchOrder(order.trackingCode);
    } catch (err) {
      setReceiptMsg({
        type: "err",
        text: err instanceof Error ? err.message : "حدث خطأ أثناء رفع الوصل.",
      });
    } finally {
      setUploadingReceipt(false);
    }
  };

  const activeStepIdx = order
    ? STEPS.findIndex((s) => s.key === order.status)
    : -1;

  const currency = config?.currency || "دج";
  const matchedPkg = config?.packages.find((p) => p.id === order?.packageId);
  const payBadge = order ? PAYMENT_BADGE[order.paymentStatus] : null;
  const showPaymentCard =
    order && (!order.isPaymentUnlocked || order.paymentStatus === "receipt_submitted");

  const whatsappHref =
    order && config?.supportWhatsapp
      ? `https://wa.me/${config.supportWhatsapp}?text=${encodeURIComponent(
          `السلام عليكم، بخصوص طلبي رقم ${order.trackingCode} (${order.moduleName} - ${order.assignmentTitle})`
        )}`
      : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Search Bar Card */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-800">
            متابعة حالة الطلب وتحميل الحل
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            أدخل رمز التتبع الذي حصلت عليه عند إرسال الطلب لمعرفة حالته، معاينة الجزء الأول من الحل، ورفع وصل الدفع لتحميل ملف Word (.docx).
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchOrder(code);
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <input
            type="text"
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ORD-2026-XXXX"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-300 font-mono text-base text-center sm:text-left focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-navy-700 text-white font-bold text-sm hover:bg-navy-600 disabled:opacity-60"
          >
            <Search className="w-4 h-4" />
            {loading ? "جاري البحث..." : "بحث عن الطلب"}
          </button>
        </form>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span>لتجربة المعاينة وتحميل ملف Word فورا:</span>
          <button
            type="button"
            onClick={() => {
              setCode("UFC-2026-1001");
              fetchOrder("UFC-2026-1001");
            }}
            className="font-mono font-bold text-navy-600 hover:underline bg-navy-50 px-2 py-0.5 rounded"
          >
            UFC-2026-1001
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </section>

      {order && (
        <>
          {/* Order Details & Stepper */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span dir="ltr" className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-navy-50 text-navy-700">
                    {order.trackingCode}
                  </span>
                  {payBadge && order.priceDzd !== null && (
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${payBadge.cls}`}>
                      {payBadge.label}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {new Date(order.createdAt).toLocaleDateString("ar-DZ")}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-navy-800 mt-1.5">
                  {order.assignmentTitle}
                </h2>
                <p className="text-sm text-slate-600">
                  {order.moduleName} — {order.studentName}
                  {order.specialty ? ` (${order.specialty})` : ""}
                </p>
                {order.priceDzd !== null && (
                  <p className="text-xs text-slate-500 mt-1">
                    الباقة: <strong className="text-navy-800">{matchedPkg?.name ?? order.packageId}</strong> •{" "}
                    المبلغ: <strong className="text-navy-800">{order.priceDzd.toLocaleString("fr-DZ")} {currency}</strong>
                  </p>
                )}
              </div>

              {order.status === "completed" && order.solution && (
                order.isPaymentUnlocked ? (
                  <a
                    href={`/api/orders/${order.id}/export?code=${encodeURIComponent(order.trackingCode)}`}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-colors shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    تحميل ملف Word (.docx)
                  </a>
                ) : (
                  <a
                    href="#payment-box"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-sm transition-colors shrink-0"
                  >
                    <Lock className="w-4 h-4" />
                    أكمل الدفع لفتح تحميل Word
                  </a>
                )
              )}
            </div>

            {/* Progress Stepper */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {STEPS.map((step, idx) => {
                const done = idx <= activeStepIdx;
                const current = idx === activeStepIdx;
                return (
                  <div
                    key={step.key}
                    className={`rounded-xl p-4 border transition-colors ${
                      current
                        ? "bg-navy-50 border-navy-600"
                        : done
                        ? "bg-emerald-50/70 border-emerald-200"
                        : "bg-slate-50 border-slate-200 opacity-65"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm mb-1">
                      {done ? (
                        <CheckCircle2
                          className={`w-4 h-4 ${
                            current ? "text-navy-700" : "text-emerald-600"
                          }`}
                        />
                      ) : (
                        <Clock className="w-4 h-4 text-slate-400" />
                      )}
                      <span className={done ? "text-navy-800" : "text-slate-500"}>
                        {step.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{step.desc}</p>
                  </div>
                );
              })}
            </div>

            {order.adminNote && (
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-sm text-navy-800">
                <span className="font-bold block mb-1">ملاحظة المشرف:</span>
                {order.adminNote}
              </div>
            )}
          </section>

          {/* Semester Activity Credits Pass Card (PASS-XXXXX) */}
          {creditPass && (
            <section className="bg-gradient-to-l from-navy-800 to-navy-700 text-white rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/15">
                <div>
                  <p className="text-xs font-bold text-amber-300">
                    🎟️ بطاقة رصيد أنشطة السداسي (صالح قبل الامتحانات الحضورية)
                  </p>
                  <h3 className="text-lg font-extrabold mt-0.5">
                    المتبقي لك: {creditPass.remainingCredits} من أصل {creditPass.totalCredits} نشاط
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    dir="ltr"
                    className="font-mono text-sm font-black px-3 py-1.5 rounded-xl bg-white text-navy-900"
                  >
                    {creditPass.passCode}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(creditPass.passCode);
                      setCopiedPass(true);
                      setTimeout(() => setCopiedPass(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedPass ? "نُسخ ✓" : "نسخ الرمز"}
                  </button>
                </div>
              </div>

              <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (creditPass.remainingCredits / Math.max(1, creditPass.totalCredits)) * 100
                    )}%`,
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-slate-200">
                  صالح خلال السداسي الحالي حتى تاريخ:{" "}
                  <strong dir="ltr" className="text-white">
                    {creditPass.expiresAt.slice(0, 10)}
                  </strong>
                  {creditPass.expired && " (منتهي الصلاحية)"}
                </span>

                {!creditPass.expired && creditPass.remainingCredits > 0 && (
                  <Link
                    href={`/?pass=${encodeURIComponent(creditPass.passCode)}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs shadow"
                  >
                    اطلب نشاطك القادم من رصيدك في 10 ثوانٍ ←
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* Viral Referral Progress & 100% Free Reward Card */}
          {referralStats?.enabled && referralStats.referralCode && (
            <section className="bg-gradient-to-l from-emerald-50/80 via-white to-amber-50/70 border border-emerald-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-emerald-100">
                <h3 className="text-base font-extrabold text-emerald-900 flex items-center gap-2">
                  <Gift className="w-5 h-5 text-emerald-600" />
                  برنامج الإحالات: ادعُ {referralStats.targetCount} زملاء = نشاط مجاني 100%
                </h3>
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
                  {referralStats.qualifiedCount} إحالة مؤكدة
                  {referralStats.pendingCount > 0
                    ? ` (+${referralStats.pendingCount} قيد الانتظار)`
                    : ""}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>
                    تقدّمك نحو النشاط المجاني القادم (تبقّت{" "}
                    <strong className="text-emerald-800">
                      {referralStats.remainingForNextReward}
                    </strong>{" "}
                    إحالات مدفوعة)
                  </span>
                  <span className="font-bold text-navy-800">
                    {referralStats.qualifiedCount % referralStats.targetCount} /{" "}
                    {referralStats.targetCount}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        ((referralStats.qualifiedCount % referralStats.targetCount) /
                          referralStats.targetCount) *
                          100
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  كل زميل يسجّل عبر رابطك يستفيد من خصم فوري{" "}
                  <strong>{referralStats.friendDiscountPercent}%</strong>، وفور تأكيد دفع{" "}
                  <strong>{referralStats.targetCount} إحالات</strong> يظهر لك هنا كود مجاني{" "}
                  <strong>100%</strong> تلقائيا!
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  dir="ltr"
                  className="font-mono text-xs font-extrabold px-3 py-2 rounded-xl bg-white border border-emerald-200 text-navy-900"
                >
                  {referralStats.referralCode}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const url = `${window.location.origin}/?ref=${encodeURIComponent(
                      referralStats.referralCode
                    )}`;
                    await navigator.clipboard.writeText(url);
                    setCopiedRef(true);
                    setTimeout(() => setCopiedRef(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-navy-700 hover:bg-navy-600 text-white text-xs font-bold"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedRef ? "تم نسخ رابط الإحالة ✓" : "نسخ رابط الإحالة"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/?ref=${encodeURIComponent(
                      referralStats.referralCode
                    )}`;
                    const msg = `السلام عليكم، أنصحكم بهذه المنصة للمرافقة المنهجية والإخراج الأكاديمي الاحترافي وفق مطبوعات المقياس. استعملوا رابطي للحصول على خصم ${referralStats.friendDiscountPercent}%:\n${url}`;
                    window.open(
                      `https://wa.me/?text=${encodeURIComponent(msg)}`,
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  مشاركة الرابط في مجموعات WhatsApp
                </button>
              </div>

              {referralStats.rewardPromoCodes.length > 0 && (
                <div className="p-4 rounded-xl bg-white border-2 border-emerald-300 space-y-2">
                  <p className="text-xs font-extrabold text-emerald-900">
                    🎉 مكافآتك المجانية (خصم 100% — نشاط كامل مجانا):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {referralStats.rewardPromoCodes.map((rc) => (
                      <div
                        key={rc.code}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
                          rc.used
                            ? "bg-slate-50 border-slate-200 text-slate-400 line-through"
                            : "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold"
                        }`}
                      >
                        <span dir="ltr" className="font-mono font-black">
                          {rc.code}
                        </span>
                        {rc.used ? (
                          <span className="text-[10px]">(مستخدم)</span>
                        ) : (
                          <Link
                            href={`/?promo=${encodeURIComponent(rc.code)}`}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                          >
                            استعمله الآن مجانا ←
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* BaridiMob / CCP Payment & Receipt Upload Box */}
          {showPaymentCard && (
            <section
              id="payment-box"
              className="bg-gradient-to-b from-amber-50/70 to-white border border-amber-200 rounded-2xl p-6 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-amber-100">
                <h3 className="text-base sm:text-lg font-extrabold text-navy-800 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-amber-600" />
                  إتمام الدفع عبر BaridiMob / CCP ورفع الوصل
                </h3>
                {order.priceDzd !== null && (
                  <span className="text-sm font-black px-3 py-1 rounded-full bg-navy-800 text-white">
                    {order.priceDzd.toLocaleString("fr-DZ")} {currency}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Payment Account Info */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5 text-xs">
                  <p className="font-extrabold text-navy-800 text-sm">
                    بيانات التحويل (BaridiMob / بريد الجزائر)
                  </p>
                  {config?.payment.baridimobRip || config?.payment.ccpAccount ? (
                    <div className="space-y-2">
                      {config.payment.baridimobRip && (
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[10px] text-slate-500 block">رقم RIP (BaridiMob)</span>
                            <span dir="ltr" className="font-mono font-extrabold text-sm text-navy-900">
                              {config.payment.baridimobRip}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(config.payment.baridimobRip);
                              setCopiedRip(true);
                              setTimeout(() => setCopiedRip(false), 2000);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-navy-700 text-white text-[11px] font-bold hover:bg-navy-600 shrink-0"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedRip ? "نُسخ" : "نسخ"}
                          </button>
                        </div>
                      )}
                      {config.payment.ccpAccount && (
                        <p className="text-slate-700">
                          <strong>حساب CCP:</strong>{" "}
                          <span dir="ltr" className="font-mono font-bold">{config.payment.ccpAccount}</span>
                        </p>
                      )}
                      {config.payment.accountName && (
                        <p className="text-slate-700">
                          <strong>الاسم:</strong> {config.payment.accountName}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-600 leading-relaxed">
                      يُرسل لك المشرف رقم RIP / BaridiMob عبر التواصل المسجّل في طلبك، ثم ترفع لقطة شاشة وصل التحويل هنا لفتح التحميل الكامل فورا.
                    </p>
                  )}

                  {whatsappHref && (
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs"
                    >
                      <MessageCircle className="w-4 h-4" />
                      تواصل سريع عبر WhatsApp
                    </a>
                  )}
                </div>

                {/* Upload Receipt Form */}
                <form
                  onSubmit={handleReceiptSubmit}
                  className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
                >
                  <p className="font-extrabold text-navy-800 text-sm">
                    رفع وصل الدفع (لقطة شاشة BaridiMob أو PDF)
                  </p>

                  {order.paymentReceipt && (
                    <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
                      <strong>آخر وصل مرفوع:</strong> {order.paymentReceipt.originalName}
                      {order.paymentReceipt.referenceNote && (
                        <span className="block text-[11px] mt-0.5">
                          المرجع: {order.paymentReceipt.referenceNote}
                        </span>
                      )}
                    </div>
                  )}

                  {receiptMsg && (
                    <div
                      className={`p-2.5 rounded-lg text-xs font-medium border ${
                        receiptMsg.type === "ok"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-red-50 border-red-200 text-red-700"
                      }`}
                    >
                      {receiptMsg.text}
                    </div>
                  )}

                  <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-300 hover:border-navy-600 bg-slate-50 cursor-pointer text-xs font-bold text-navy-700">
                    <FileUp className="w-4 h-4" />
                    <span className="truncate">
                      {receiptFile ? receiptFile.name : "اختيار صورة أو ملف وصل الدفع"}
                    </span>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.pdf"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                  </label>

                  <input
                    type="text"
                    value={referenceNote}
                    onChange={(e) => setReferenceNote(e.target.value)}
                    placeholder="رقم مرجع العملية في BaridiMob أو ملاحظة (اختياري)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-navy-600"
                  />

                  <button
                    type="submit"
                    disabled={uploadingReceipt}
                    className="w-full py-2.5 rounded-xl bg-navy-700 hover:bg-navy-600 disabled:opacity-60 text-white font-bold text-xs shadow-sm"
                  >
                    {uploadingReceipt ? "جاري رفع الوصل..." : "إرسال وصل الدفع لتأكيده"}
                  </button>
                </form>
              </div>
            </section>
          )}

          {/* Student Value-Added Study & Oral Defense Guide (unlocked only) */}
          {order.status === "completed" &&
            order.isPaymentUnlocked &&
            order.solution?.qualityMeta?.studyGuide &&
            (order.solution.qualityMeta.studyGuide.summary ||
              order.solution.qualityMeta.studyGuide.keyPoints.length > 0) && (
              <section className="bg-gradient-to-b from-navy-50/70 to-white border border-navy-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-navy-100">
                  <h3 className="text-base sm:text-lg font-extrabold text-navy-800 flex items-center gap-2">
                    <BookOpenCheck className="w-5 h-5 text-navy-700" />
                    دليل الفهم السريع والاستعداد للمناقشة (ميزة حصرية للطالب)
                  </h3>
                  <div className="flex items-center gap-2">
                    {order.solution.qualityMeta.auditPassApplied && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        مُراجع ومدقّق حسابيا ومنهجيا
                      </span>
                    )}
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
                      لا يُطبع داخل ملف Word
                    </span>
                  </div>
                </div>

                {order.solution.qualityMeta.studyGuide.summary && (
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {order.solution.qualityMeta.studyGuide.summary}
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {order.solution.qualityMeta.studyGuide.keyPoints.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                      <h4 className="font-extrabold text-xs text-navy-800">
                        أهم القوانين والمرتكزات المعتمدة في الحل
                      </h4>
                      <ul className="list-disc pr-4 space-y-1.5 text-xs text-slate-700 leading-relaxed">
                        {order.solution.qualityMeta.studyGuide.keyPoints.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {order.solution.qualityMeta.studyGuide.defenseQuestions.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                      <h4 className="font-extrabold text-xs text-navy-800 flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-navy-600" />
                        أسئلة مناقشة متوقعة من الأستاذ وإجاباتها السريعة
                      </h4>
                      <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
                        {order.solution.qualityMeta.studyGuide.defenseQuestions.map((q, i) => (
                          <li
                            key={i}
                            className="p-2.5 rounded-lg bg-slate-50 border border-slate-100"
                          >
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

          {/* Approved Solution Preview (Full or Partial Free Preview Lock) */}
          {order.status === "completed" && order.solution && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-extrabold text-navy-800 flex items-center gap-2">
                  <FileCheck2 className="w-5 h-5 text-emerald-600" />
                  {order.isPaymentUnlocked
                    ? "معاينة الحل المعتمد قبل التحميل"
                    : "معاينة مجانية لأول جزء من الحل (للتحقق من الجودة قبل الدفع)"}
                </h3>
                {order.isPaymentUnlocked && (
                  <a
                    href={`/api/orders/${order.id}/export?code=${encodeURIComponent(order.trackingCode)}`}
                    className="text-sm font-bold text-navy-600 hover:underline flex items-center gap-1"
                  >
                    <Download className="w-4 h-4" />
                    تنزيل نسخة Word الأصلية
                  </a>
                )}
              </div>

              <div className="relative">
                <SolutionPreview solution={order.solution} />

                {!order.isPaymentUnlocked && (
                  <div className="mt-4 bg-gradient-to-l from-navy-800 to-navy-700 text-white rounded-2xl p-6 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="space-y-1 text-center md:text-right">
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
                        <Lock className="w-4 h-4" />
                        تم عرض {order.solution.blocks.length} عناصر فقط من أصل {order.totalBlocksCount} عنصر
                      </div>
                      <h4 className="text-base sm:text-lg font-extrabold">
                        باقي الحل وملف Word الكامل {order.hasStudyGuide ? "+ دليل الفهم والمناقشة" : ""} جاهزان للتنزيل
                      </h4>
                      <p className="text-xs text-slate-200">
                        أرسل وصل التحويل عبر BaridiMob في البطاقة أعلاه، وفور تأكيده من المشرف يُفتح الحل الكامل وزر تحميل ملف Word تلقائيا.
                      </p>
                    </div>
                    <a
                      href="#payment-box"
                      className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm shadow"
                    >
                      <CreditCard className="w-4 h-4" />
                      رفع وصل الدفع الآن
                    </a>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-12 text-center text-slate-500">
          جاري التحميل...
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
