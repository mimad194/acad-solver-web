"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  FileEdit,
  Inbox,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { OrderStatus, StudentOrder } from "@/types/order";

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: "قيد الانتظار", cls: "bg-amber-100 text-amber-800" },
  in_review: { label: "قيد المراجعة", cls: "bg-blue-100 text-blue-800" },
  completed: { label: "مكتمل ومسلم", cls: "bg-emerald-100 text-emerald-800" },
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

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders");
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
        if (d.authenticated) loadOrders();
      })
      .catch(() => setAuthChecked(true));
  }, [loadOrders]);

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
            <p className="text-[11px] text-slate-400 mt-1.5">
              القيمة الافتراضية المحلية: <code className="font-mono">admin2026</code> (قابلة للتغيير في <code className="font-mono">.env.local</code>)
            </p>
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
  };

  const filtered = orders.filter((o) => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
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
            راجع طلبات الطلبة الواردة، ولّد الحل وفق المراجع المرفقة، عدّله واعتمد تسليمه.
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الطلبات", val: stats.total, icon: Inbox, color: "text-navy-700 bg-navy-50" },
          { label: "قيد الانتظار", val: stats.pending, icon: Clock, color: "text-amber-700 bg-amber-50" },
          { label: "قيد المراجعة", val: stats.in_review, icon: FileEdit, color: "text-blue-700 bg-blue-50" },
          { label: "مكتملة ومسلمة", val: stats.completed, icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50" },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm"
            >
              <div>
                <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                <p className="text-2xl font-extrabold text-navy-900 mt-1">{card.val}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color}`}>
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
                <th className="px-4 py-3 font-bold text-center">المرفقات</th>
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
                        <div className="text-xs text-slate-500">{o.moduleName}</div>
                      </td>
                      <td className="px-4 py-3.5 text-center text-xs text-slate-600">
                        {o.files.length} ملف
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
