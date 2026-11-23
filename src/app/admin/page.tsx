"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  CheckCircle2,
  Clock,
  FileEdit,
  Gift,
  Inbox,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  OrderStatus,
  PackageId,
  PaymentStatus,
  PromoCodeEntry,
  PublicAppConfig,
  StudentOrder,
} from "@/types/order";
import { copyToClipboard } from "@/lib/clipboard";

const PROMO_SCOPE_LABELS: Record<PackageId, string> = {
  standard: "نشاط واحد فقط",
  premium: "باقة 3 أنشطة",
  semester: "باقة السداسي",
};

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: "قيد الانتظار", cls: "bg-amber-100 text-amber-800" },
  in_review: { label: "قيد المراجعة", cls: "bg-blue-100 text-blue-800" },
  completed: { label: "مكتمل ومسلم", cls: "bg-emerald-100 text-emerald-800" },
};

const PAY_META: Record<PaymentStatus, { label: string; cls: string }> = {
  unpaid: { label: "غير مدفوع", cls: "bg-slate-100 text-slate-600" },
  receipt_submitted: { label: "وصل للمراجعة", cls: "bg-amber-100 text-amber-800" },
  paid: { label: "مدفوع ✓", cls: "bg-emerald-100 text-emerald-800" },
  waived: { label: "مجاني ✓", cls: "bg-emerald-50 text-emerald-700" },
};

export default function AdminDashboardPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [orders, setOrders] = useState<StudentOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [query, setQuery] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [showPromos, setShowPromos] = useState(false);
  const [settingsConfig, setSettingsConfig] = useState<PublicAppConfig | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [promos, setPromos] = useState<PromoCodeEntry[]>([]);
  const [newPromoCode, setNewPromoCode] = useState("");
  const [newPromoPct, setNewPromoPct] = useState("25");
  const [newPromoMaxUses, setNewPromoMaxUses] = useState("0");
  const [newPromoBatchCount, setNewPromoBatchCount] = useState("1");
  const [newPromoScope, setNewPromoScope] = useState<"all" | PackageId>("all");
  const [newPromoNote, setNewPromoNote] = useState("");
  const [lastBatchCodes, setLastBatchCodes] = useState<string[]>([]);
  const [promoMsg, setPromoMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [savingPromo, setSavingPromo] = useState(false);

  const loadPromos = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/promos", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { promos?: PromoCodeEntry[] };
        setPromos(data.promos ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { config?: PublicAppConfig };
        if (data.config) setSettingsConfig(data.config);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/auth")
      .then((r) => r.json())
      .then((d) => {
        setAuthenticated(Boolean(d.authenticated));
        setAuthChecked(true);
        if (d.authenticated) {
          void loadOrders();
          void loadSettings();
          void loadPromos();
        }
      })
      .catch(() => setAuthChecked(true));
  }, [loadOrders, loadSettings, loadPromos]);

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPromo(true);
    setPromoMsg(null);
    setLastBatchCodes([]);
    const batch = Math.max(1, Number(newPromoBatchCount) || 1);
    try {
      const res = await fetch("/api/admin/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newPromoCode,
          discountPercent: Number(newPromoPct),
          maxUses: batch > 1 ? 1 : Number(newPromoMaxUses) || 0,
          batchCount: batch,
          allowedPackageIds: newPromoScope === "all" ? undefined : [newPromoScope],
          note: newPromoNote,
          active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر إنشاء الكود.");
      setNewPromoCode("");
      setNewPromoNote("");
      if (Array.isArray(data.promos) && data.promos.length > 1) {
        const codes = data.promos.map((p: PromoCodeEntry) => p.code);
        setLastBatchCodes(codes);
        setPromoMsg({
          type: "ok",
          text: `تم توليد ${codes.length} أكواد فردية (استخدام واحد لكل كود): ${codes.join(" ، ")}`,
        });
      } else {
        setPromoMsg({ type: "ok", text: `تم إنشاء كود البرومو (${data.promo.code}) بنجاح!` });
      }
      void loadPromos();
    } catch (err) {
      setPromoMsg({
        type: "err",
        text: err instanceof Error ? err.message : "خطأ أثناء إنشاء الكود.",
      });
    } finally {
      setSavingPromo(false);
    }
  };

  const handleTogglePromo = async (code: string, active: boolean) => {
    setPromoMsg(null);
    try {
      const res = await fetch("/api/admin/promos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, active: !active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "تعذر تحديث حالة الكود.");
      }
      void loadPromos();
    } catch (err) {
      setPromoMsg({
        type: "err",
        text: err instanceof Error ? err.message : "تعذر تحديث حالة الكود.",
      });
    }
  };

  const handleDeletePromo = async (code: string) => {
    if (!confirm(`حذف كود البرومو ${code} نهائيا؟`)) return;
    setPromoMsg(null);
    try {
      const res = await fetch(`/api/admin/promos?code=${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "تعذر حذف الكود.");
      }
      void loadPromos();
    } catch (err) {
      setPromoMsg({
        type: "err",
        text: err instanceof Error ? err.message : "تعذر حذف الكود.",
      });
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsConfig) return;
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency: settingsConfig.currency,
          previewLockEnabled: settingsConfig.previewLockEnabled,
          semesterPassExpiresAt: settingsConfig.semesterPassExpiresAt ?? "",
          supportWhatsapp: settingsConfig.supportWhatsapp,
          referral: settingsConfig.referral,
          payment: settingsConfig.payment,
          packages: settingsConfig.packages.map((p) => ({
            id: p.id,
            name: p.name,
            subtitle: p.subtitle,
            badge: p.badge ?? "",
            priceDzd: p.priceDzd,
            creditsCount: p.creditsCount ?? (p.id === "semester" ? 17 : p.id === "premium" ? 3 : 1),
            features: p.features
              .map((f) => f.trim())
              .filter(Boolean),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حفظ الإعدادات.");
      if (data.config) setSettingsConfig(data.config);
      setSettingsMsg({
        type: "ok",
        text: "تم حفظ الأسعار والباقات وبيانات الدفع بنجاح! أصبحت مفعّلة فورا في الصفحة الرئيسية وصفحة التتبع.",
      });
    } catch (err) {
      setSettingsMsg({
        type: "err",
        text: err instanceof Error ? err.message : "حدث خطأ أثناء الحفظ.",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoginError(data.error || "كلمة المرور غير صحيحة.");
      return;
    }
    setAuthenticated(true);
    setPassword("");
    loadOrders();
    loadSettings();
    loadPromos();
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthenticated(false);
    setOrders([]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الطلب نهائيا؟")) return;
    const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
    if (res.ok) {
      setOrders((prev) => prev.filter((o) => o.id !== id));
    }
  };

  if (!authChecked) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center text-slate-500">
        جاري التحقق من الجلسة...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <form
          onSubmit={handleLogin}
          className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm space-y-5"
        >
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-navy-700 text-white flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-extrabold text-navy-800">
              تسجيل دخول المشرف
            </h1>
            <p className="text-xs text-slate-500">
              أدخل كلمة مرور لوحة التحكم لمراجعة طلبات الطلبة وتوليد الحلول واعتمادها.
            </p>
          </div>

          {loginError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              {loginError}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              كلمة المرور
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-navy-700 text-white font-bold text-sm hover:bg-navy-600"
          >
            دخول إلى لوحة الإدارة
          </button>
        </form>
      </div>
    );
  }

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    in_review: orders.filter((o) => o.status === "in_review").length,
    completed: orders.filter((o) => o.status === "completed").length,
    receiptsPending: orders.filter((o) => o.paymentStatus === "receipt_submitted").length,
    revenueDzd: orders
      .filter((o) => o.paymentStatus === "paid")
      .reduce((sum, o) => sum + (o.priceDzd ?? 0), 0),
  };

  const filtered = orders.filter((o) => {
    if (filterStatus === "receipt_submitted") {
      if (o.paymentStatus !== "receipt_submitted") return false;
    } else if (filterStatus !== "all" && o.status !== filterStatus) {
      return false;
    }
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      o.trackingCode.toLowerCase().includes(q) ||
      o.studentName.toLowerCase().includes(q) ||
      o.moduleName.toLowerCase().includes(q) ||
      o.assignmentTitle.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-800">
            لوحة تحكم إدارة الطلبات
          </h1>
          <p className="text-sm text-slate-500">
            راجع طلبات الطلبة الواردة، أكّد وصولات BaridiMob، ولّد الحل وفق المراجع المرفقة واعتمد تسليمه.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowPromos((prev) => !prev);
              void loadPromos();
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              showPromos
                ? "bg-emerald-700 text-white"
                : "bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100"
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            أكواد البرومو ({promos.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSettings((prev) => !prev);
              if (!settingsConfig) void loadSettings();
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              showSettings
                ? "bg-navy-700 text-white"
                : "bg-navy-50 border border-navy-200 text-navy-800 hover:bg-navy-100"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            إعدادات الأسعار والباقات والدفع
          </button>
          <button
            type="button"
            onClick={loadOrders}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-700 text-xs font-bold text-slate-700"
          >
            <LogOut className="w-3.5 h-3.5" />
            خروج
          </button>
        </div>
      </div>

      {/* Live Pricing, Packages & Payment Settings Panel */}
      {showSettings && settingsConfig && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border-2 border-navy-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5"
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-extrabold text-navy-800 flex items-center gap-2">
                <Settings className="w-4 h-4 text-navy-600" />
                تخصيص أسعار الباقات وبيانات الدفع (تُطبَّق فورا على الموقع)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                أي تعديل تحفظه هنا ينعكس مباشرة في الصفحة الرئيسية وصفحة التتبع دون الحاجة لتعديل Vercel أو إعادة النشر.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {settingsMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-bold border ${
                settingsMsg.type === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {settingsMsg.text}
            </div>
          )}

          {/* 3 Packages Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {settingsConfig.packages.map((pkg, idx) => (
              <div
                key={pkg.id}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-navy-100 text-navy-800">
                    {pkg.id}
                  </span>
                  <span className="text-xs font-extrabold text-emerald-700">
                    {pkg.priceDzd.toLocaleString("fr-DZ")} {settingsConfig.currency}
                  </span>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    اسم الباقة
                  </label>
                  <input
                    type="text"
                    value={pkg.name}
                    onChange={(e) => {
                      const next = [...settingsConfig.packages];
                      next[idx] = { ...pkg, name: e.target.value };
                      setSettingsConfig({ ...settingsConfig, packages: next });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      السعر ({settingsConfig.currency})
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={pkg.priceDzd}
                      onChange={(e) => {
                        const next = [...settingsConfig.packages];
                        next[idx] = { ...pkg, priceDzd: Math.max(0, Number(e.target.value) || 0) };
                        setSettingsConfig({ ...settingsConfig, packages: next });
                      }}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-extrabold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      الأنشطة (Credits)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={pkg.creditsCount ?? (pkg.id === "semester" ? 17 : pkg.id === "premium" ? 3 : 1)}
                      onChange={(e) => {
                        const next = [...settingsConfig.packages];
                        next[idx] = {
                          ...pkg,
                          creditsCount: Math.max(1, Number(e.target.value) || 1),
                        };
                        setSettingsConfig({ ...settingsConfig, packages: next });
                      }}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      شارة (اختياري)
                    </label>
                    <input
                      type="text"
                      value={pkg.badge ?? ""}
                      onChange={(e) => {
                        const next = [...settingsConfig.packages];
                        next[idx] = { ...pkg, badge: e.target.value };
                        setSettingsConfig({ ...settingsConfig, packages: next });
                      }}
                      placeholder="الأوفر"
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    وصف مختصر
                  </label>
                  <input
                    type="text"
                    value={pkg.subtitle}
                    onChange={(e) => {
                      const next = [...settingsConfig.packages];
                      next[idx] = { ...pkg, subtitle: e.target.value };
                      setSettingsConfig({ ...settingsConfig, packages: next });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    نقاط البطاقة / المزايا (ميزة واحدة في كل سطر)
                  </label>
                  <textarea
                    rows={4}
                    value={pkg.features.join("\n")}
                    onChange={(e) => {
                      const next = [...settingsConfig.packages];
                      next[idx] = {
                        ...pkg,
                        features: e.target.value.split("\n"),
                      };
                      setSettingsConfig({ ...settingsConfig, packages: next });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs leading-relaxed"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Payment & Support Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                رقم RIP (BaridiMob)
              </label>
              <input
                type="text"
                dir="ltr"
                value={settingsConfig.payment.baridimobRip}
                onChange={(e) =>
                  setSettingsConfig({
                    ...settingsConfig,
                    payment: { ...settingsConfig.payment, baridimobRip: e.target.value },
                  })
                }
                placeholder="0079999900..."
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                حساب CCP والمفتاح (اختياري)
              </label>
              <input
                type="text"
                dir="ltr"
                value={settingsConfig.payment.ccpAccount}
                onChange={(e) =>
                  setSettingsConfig({
                    ...settingsConfig,
                    payment: { ...settingsConfig.payment, ccpAccount: e.target.value },
                  })
                }
                placeholder="12345678 / 99"
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                اسم صاحب الحساب
              </label>
              <input
                type="text"
                value={settingsConfig.payment.accountName}
                onChange={(e) =>
                  setSettingsConfig({
                    ...settingsConfig,
                    payment: { ...settingsConfig.payment, accountName: e.target.value },
                  })
                }
                placeholder="الاسم واللقب"
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                واتساب الدعم (بدون + مثل 21355...)
              </label>
              <input
                type="text"
                dir="ltr"
                value={settingsConfig.supportWhatsapp}
                onChange={(e) =>
                  setSettingsConfig({
                    ...settingsConfig,
                    supportWhatsapp: e.target.value,
                  })
                }
                placeholder="213555000000"
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs font-mono"
              />
            </div>
          </div>

          {/* Viral Referral Settings */}
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold text-emerald-900 flex items-center gap-1.5">
                <Gift className="w-4 h-4 text-emerald-700" />
                إعدادات نظام الإحالات الفيروسي (Referrals)
              </p>
              <label className="inline-flex items-center gap-2 text-xs font-bold text-emerald-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsConfig.referral?.enabled ?? true}
                  onChange={(e) =>
                    setSettingsConfig({
                      ...settingsConfig,
                      referral: {
                        ...(settingsConfig.referral ?? {
                          enabled: true,
                          targetCount: 3,
                          friendDiscountPercent: 10,
                        }),
                        enabled: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 accent-emerald-700"
                />
                تفعيل نظام الإحالات
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  تاريخ انتهاء رصيد السداسي (قبل الامتحانات)
                </label>
                <input
                  type="date"
                  dir="ltr"
                  value={settingsConfig.semesterPassExpiresAt ?? ""}
                  onChange={(e) =>
                    setSettingsConfig({
                      ...settingsConfig,
                      semesterPassExpiresAt: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  عدد الإحالات المدفوعة لنشاط واحد مجاني 100%
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settingsConfig.referral?.targetCount ?? 3}
                  onChange={(e) =>
                    setSettingsConfig({
                      ...settingsConfig,
                      referral: {
                        ...(settingsConfig.referral ?? {
                          enabled: true,
                          targetCount: 3,
                          friendDiscountPercent: 10,
                        }),
                        targetCount: Math.max(1, Number(e.target.value) || 3),
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  نسبة التخفيض الترحيبي للصديق المحال (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settingsConfig.referral?.friendDiscountPercent ?? 10}
                  onChange={(e) =>
                    setSettingsConfig({
                      ...settingsConfig,
                      referral: {
                        ...(settingsConfig.referral ?? {
                          enabled: true,
                          targetCount: 3,
                          friendDiscountPercent: 10,
                        }),
                        friendDiscountPercent: Math.min(
                          100,
                          Math.max(0, Number(e.target.value) || 0)
                        ),
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsConfig.previewLockEnabled}
                onChange={(e) =>
                  setSettingsConfig({
                    ...settingsConfig,
                    previewLockEnabled: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-navy-700"
              />
              تفعيل قفل المعاينة الجزئية قبل تأكيد الدفع
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={savingSettings}
                onClick={async () => {
                  if (!confirm("تطبيق الباقات الحجمية الجديدة (نشاط واحد 250 دج / 3 أنشطة 650 دج / 17 نشاطاً 3300 دج) مع الحفاظ على رقم RIP؟")) return;
                  setSavingSettings(true);
                  setSettingsMsg(null);
                  try {
                    const res = await fetch("/api/admin/settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        currency: settingsConfig.currency,
                        previewLockEnabled: settingsConfig.previewLockEnabled,
                        semesterPassExpiresAt: settingsConfig.semesterPassExpiresAt ?? "",
                        supportWhatsapp: settingsConfig.supportWhatsapp,
                        referral: settingsConfig.referral,
                        payment: settingsConfig.payment,
                        resetPackagesToDefaults: true,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok && data.config) {
                      setSettingsConfig(data.config);
                      setSettingsMsg({
                        type: "ok",
                        text: "تم تحديث البطاقات إلى الباقات الحجمية النظيفة (1 / 3 / 17 نشاطاً) مع الإبقاء على بيانات الدفع!",
                      });
                    }
                  } finally {
                    setSavingSettings(false);
                  }
                }}
                className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-bold text-xs"
              >
                تطبيق نصوص باقات (1 / 3 / 17) الجاهزة
              </button>

              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-sm"
              >
                <Save className="w-4 h-4" />
                {savingSettings ? "جاري الحفظ..." : "حفظ الإعدادات وتطبيقها فورا"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Promo Codes Management Panel (1% to 100% Free) */}
      {showPromos && (
        <section className="bg-white border-2 border-emerald-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-extrabold text-navy-800 flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" />
                إدارة أكواد البرومو (تخفيض من 1% حتى 100% مجاني)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                أنشئ أكواد إطلاق (مثل LAUNCH40) أو أكواد 100% مجانية لمندوبي الدفعات (مثل VIP100)، وتابع أكواد المكافآت الصادرة تلقائيا من الإحالات.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPromos(false)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {promoMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-bold border flex flex-wrap items-center justify-between gap-2 ${
                promoMsg.type === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              <span>{promoMsg.text}</span>
              {lastBatchCodes.length > 0 && (
                <button
                  type="button"
                  onClick={() => void copyToClipboard(lastBatchCodes.join("\n"))}
                  className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold shrink-0"
                >
                  نسخ كل الأكواد
                </button>
              )}
            </div>
          )}

          <form
            onSubmit={handleCreatePromo}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 items-end bg-slate-50 p-4 rounded-xl border border-slate-200"
          >
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {Number(newPromoBatchCount) > 1 ? "بادئة الدفعة (مثل VIP)" : "الكود (مثل LAUNCH30)"}
              </label>
              <input
                required
                type="text"
                dir="ltr"
                value={newPromoCode}
                onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                placeholder={Number(newPromoBatchCount) > 1 ? "VIP" : "LAUNCH30"}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold uppercase"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                نسبة الخصم (1–100%)
              </label>
              <input
                required
                type="number"
                min={1}
                max={100}
                value={newPromoPct}
                onChange={(e) => setNewPromoPct(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                الباقة المسموحة
              </label>
              <select
                value={newPromoScope}
                onChange={(e) => setNewPromoScope(e.target.value as "all" | PackageId)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold"
              >
                <option value="all">كل الباقات</option>
                <option value="standard">نشاط واحد فقط</option>
                <option value="premium">باقة 3 أنشطة فقط</option>
                <option value="semester">باقة السداسي فقط</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                عدد الأكواد المولّدة
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={newPromoBatchCount}
                onChange={(e) => setNewPromoBatchCount(e.target.value)}
                title="1 = كود مشترك واحد، أكثر من 1 = أكواد فردية كل منها استخدام واحد فقط"
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {Number(newPromoBatchCount) > 1 ? "حد الاستخدام (تلقائي 1)" : "حد الاستخدام (0=مفتوح)"}
              </label>
              <input
                type="number"
                min={0}
                disabled={Number(newPromoBatchCount) > 1}
                value={Number(newPromoBatchCount) > 1 ? "1" : newPromoMaxUses}
                onChange={(e) => setNewPromoMaxUses(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                ملاحظة (اختياري)
              </label>
              <input
                type="text"
                value={newPromoNote}
                onChange={(e) => setNewPromoNote(e.target.value)}
                placeholder="مندوبو دفعة M2..."
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={savingPromo}
              className="inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs"
            >
              <Plus className="w-4 h-4" />
              {savingPromo
                ? "جاري الإنشاء..."
                : Number(newPromoBatchCount) > 1
                ? `توليد ${newPromoBatchCount} أكواد فردية`
                : "إنشاء الكود"}
            </button>
          </form>

          {promos.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">
              لا توجد أكواد برومو حاليا. أنشئ أول كود خصم (مثلا UFC40 أو VIP100) من النموذج أعلاه.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table dir="rtl" className="w-full text-xs text-right">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-bold">الكود</th>
                    <th className="px-3 py-2 font-bold text-center">الخصم</th>
                    <th className="px-3 py-2 font-bold text-center">الاستخدام</th>
                    <th className="px-3 py-2 font-bold">المصدر والملاحظة</th>
                    <th className="px-3 py-2 font-bold text-center">الحالة</th>
                    <th className="px-3 py-2 font-bold text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {promos.map((p) => (
                    <tr key={p.code}>
                      <td className="px-3 py-2.5 font-mono font-black text-navy-800">
                        {p.code}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full font-extrabold ${
                            p.discountPercent === 100
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {p.discountPercent}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono">
                        {p.usedCount} / {p.maxUses === 0 ? "∞" : p.maxUses}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        <span className="font-bold ml-1">
                          {p.source === "referral_reward" ? "🎁 مكافأة إحالة:" : "إداري:"}
                        </span>
                        {p.allowedPackageIds && p.allowedPackageIds.length > 0 && (
                          <span className="inline-block ml-1.5 px-1.5 py-0.5 rounded bg-navy-50 text-navy-700 font-bold text-[10px]">
                            {p.allowedPackageIds.map((id) => PROMO_SCOPE_LABELS[id] ?? id).join(" + ")}
                          </span>
                        )}
                        {p.note || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleTogglePromo(p.code, p.active)}
                          className={`px-2.5 py-0.5 rounded-full font-bold ${
                            p.active
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {p.active ? "مفعل" : "متوقف"}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeletePromo(p.code)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                          title="حذف الكود"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "إجمالي الطلبات", val: String(stats.total), icon: Inbox, color: "text-navy-700 bg-navy-50" },
          { label: "قيد الانتظار", val: String(stats.pending), icon: Clock, color: "text-amber-700 bg-amber-50" },
          { label: "قيد المراجعة", val: String(stats.in_review), icon: FileEdit, color: "text-blue-700 bg-blue-50" },
          { label: "مكتملة ومسلمة", val: String(stats.completed), icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50" },
          {
            label: "المداخيل المؤكدة",
            val: `${stats.revenueDzd.toLocaleString("fr-DZ")} دج`,
            icon: Banknote,
            color: "text-emerald-800 bg-emerald-100",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm"
            >
              <div>
                <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                <p className="text-xl sm:text-2xl font-extrabold text-navy-900 mt-1">{card.val}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث برمز الطلب، اسم الطالب، المقياس، أو عنوان النشاط..."
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { k: "all", label: "الكل" },
            { k: "pending", label: "قيد الانتظار" },
            { k: "in_review", label: "قيد المراجعة" },
            { k: "completed", label: "مكتملة" },
            {
              k: "receipt_submitted",
              label: `وصولات للمراجعة (${stats.receiptsPending})`,
            },
          ].map((tab) => (
            <button
              key={tab.k}
              type="button"
              onClick={() => setFilterStatus(tab.k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filterStatus === tab.k
                  ? "bg-navy-700 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table dir="rtl" className="w-full text-sm text-right">
            <thead className="bg-navy-50 text-navy-800 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-bold">الرمز</th>
                <th className="px-4 py-3 font-bold">الطالب</th>
                <th className="px-4 py-3 font-bold">المقياس والنشاط</th>
                <th className="px-4 py-3 font-bold text-center">الدفع والسعر</th>
                <th className="px-4 py-3 font-bold text-center">الحالة</th>
                <th className="px-4 py-3 font-bold text-center">التاريخ</th>
                <th className="px-4 py-3 font-bold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    لا توجد طلبات مطابقة حاليا.
                  </td>
                </tr>
              ) : (
                filtered.map((o) => {
                  const st = STATUS_META[o.status];
                  const pm = o.paymentStatus ? PAY_META[o.paymentStatus] : null;
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 font-mono text-xs font-bold text-navy-700 whitespace-nowrap">
                        {o.trackingCode}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-800">{o.studentName}</div>
                        <div className="text-xs text-slate-500">{o.specialty || o.contact}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-navy-800">{o.assignmentTitle}</div>
                        <div className="text-xs text-slate-500">
                          {o.moduleName} • {o.files.length} ملف
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {typeof o.priceDzd === "number" && (
                          <div className="text-xs font-extrabold text-navy-800 mb-0.5">
                            {o.priceDzd.toLocaleString("fr-DZ")} دج
                          </div>
                        )}
                        {pm ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${pm.cls}`}>
                            {pm.label}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center text-xs text-slate-500 whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleDateString("ar-DZ")}
                      </td>
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="px-3 py-1.5 rounded-lg bg-navy-700 hover:bg-navy-600 text-white text-xs font-bold"
                          >
                            مراجعة وإعداد
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(o.id)}
                            title="حذف الطلب"
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
