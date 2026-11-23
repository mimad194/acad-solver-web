"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  CheckCircle2,
  Clock,
  FileEdit,
  Inbox,
  Lock,
  LogOut,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import {
  OrderStatus,
  PaymentStatus,
  PublicAppConfig,
  StudentOrder,
} from "@/types/order";

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
  const [settingsConfig, setSettingsConfig] = useState<PublicAppConfig | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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
        }
      })
      .catch(() => setAuthChecked(true));
  }, [loadOrders, loadSettings]);

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
          supportWhatsapp: settingsConfig.supportWhatsapp,
          payment: settingsConfig.payment,
          packages: settingsConfig.packages.map((p) => ({
            id: p.id,
            name: p.name,
            subtitle: p.subtitle,
            badge: p.badge ?? "",
            priceDzd: p.priceDzd,
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
                <div className="grid grid-cols-2 gap-2">
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
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-extrabold"
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
                      placeholder="الأكثر طلبا"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
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
              تفعيل قفل المعاينة الجزئية قبل تأكيد الدفع (أوقفها للفترات المجانية)
            </label>

            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-sm"
            >
              <Save className="w-4 h-4" />
              {savingSettings ? "جاري الحفظ..." : "حفظ الإعدادات وتطبيقها فورا"}
            </button>
          </div>
        </form>
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
