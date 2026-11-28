"use client";

import { useState, useEffect, useRef } from "react";
import { api, Notice } from "@/components/live-data";
import { ApiError } from "@/lib/client/api";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import { getAdminSettingsSection } from "@/components/admin-settings-sections";
import AdminNavigation from "@/components/admin-navigation";
import { usePathname, useRouter } from "next/navigation";
import {
  Settings,
  Menu,
  X,
  LogOut,
  ChevronRight,
} from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionRetry, setSessionRetry] = useState(0);
  useEffect(() => {
    const expired = () => router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    window.addEventListener("admissions:session-expired", expired);
    return () => window.removeEventListener("admissions:session-expired", expired);
  }, [pathname, router]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const sidebar = sidebarRef.current;
    const desktop = window.matchMedia("(min-width: 768px)");
    if (!sidebar || desktop.matches) return;
    const focusable = () => Array.from(sidebar.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )).filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setSidebarOpen(false); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      if (!sidebar.contains(document.activeElement)) { event.preventDefault(); items[0].focus(); }
      else if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    const onBreakpointChange = () => { if (desktop.matches) setSidebarOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onBreakpointChange);
    return () => { document.removeEventListener("keydown", onKeyDown); desktop.removeEventListener("change", onBreakpointChange); if (!desktop.matches) menuButtonRef.current?.focus(); };
  }, [sidebarOpen]);

  useEffect(() => {
    const controller = new AbortController();
    setSessionError("");
    api("/api/auth/session", undefined, "GET", controller.signal).then(data => {
      setCurrentUser(data.user); setSessionChecked(true);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
      else setSessionError(error.message);
    });
    return () => controller.abort();
  }, [pathname, sessionRetry, router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await api("/api/auth/logout", {});
      try { localStorage.removeItem("unicom_staff_user"); } catch { }
      router.push("/login");
    } catch (e: any) { setSessionError(`Sign out was not confirmed. ${e.message}`); }
    finally { setLoggingOut(false); }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-rose-500/20 text-rose-300 border-rose-500/30";
      case "admin":
        return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      case "examiner":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "entrance_staff":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      default:
        return "bg-slate-700 text-slate-300 border-slate-600";
    }
  };

  const formatRoleName = (role: string) => {
    switch (role) {
      case "super_admin":
        return "Super Admin";
      case "admin":
        return "Admissions Officer";
      case "examiner":
        return "Examiner";
      case "entrance_staff":
        return "Entrance Desk";
      default:
        return role;
    }
  };

  if (!sessionChecked || !currentUser) return <div className="flex min-h-dvh items-center justify-center p-6"><div className="public-card w-full max-w-sm rounded-2xl p-7 text-sm text-slate-600"><BrandLogo className="mb-5 h-12 w-12" /><Notice error>{sessionError}</Notice>{sessionError ? <button className="mt-4 font-semibold text-blue-700 underline" onClick={() => setSessionRetry(n => n + 1)}>Retry session check</button> : <p role="status">Checking staff session…</p>}</div></div>;
  const settingsSection = getAdminSettingsSection(pathname);
  return (
    <div className="admin-shell flex h-dvh min-h-0 flex-col overflow-hidden md:flex-row">
      <a href="#admin-page-content" className="admin-skip-link">Skip to main content</a>
      {/* Mobile Header */}
      <div className="admin-sidebar md:hidden flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 text-white sticky top-0 z-50">
        <div className="flex items-center space-x-2">
          <BrandLogo className="h-9 w-9" priority />
          <span className="text-sm font-bold tracking-tight">Unicom TIC</span>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={sidebarOpen}
          aria-controls="admin-navigation"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {sidebarOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-[2px] md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`admin-sidebar fixed inset-y-0 left-0 z-40 flex h-dvh min-h-0 w-72 max-w-[85vw] shrink-0 flex-col overflow-hidden text-slate-300 shadow-2xl transition-transform duration-200 ease-in-out md:visible md:relative md:h-full md:translate-x-0 md:shadow-none ${
          sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-5">
          <div className="flex items-center space-x-3">
            <BrandLogo className="h-11 w-11" priority />
            <div>
              <span className="block text-sm font-bold tracking-tight text-white">UNICOM TIC</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[.18em] text-blue-200/80">
                Admissions workspace
              </span>
            </div>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 md:hidden"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>

        {/* Navigation list */}
        <AdminNavigation pathname={pathname} role={currentUser.role} onNavigate={() => setSidebarOpen(false)} />

        {/* Staff Profile Footer */}
        <div className="shrink-0 border-t border-white/10 bg-slate-950/20 p-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="overflow-hidden pr-2">
              <div className="flex items-center space-x-1.5 mb-0.5">
                <p className="font-semibold text-white truncate text-xs">{currentUser.name}</p>
              </div>
              <p className="text-[10px] text-slate-400 truncate">{currentUser.email}</p>
              <span
                className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${getRoleBadge(
                  currentUser.role
                )}`}
              >
                {formatRoleName(currentUser.role)}
              </span>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title="Sign Out / Logout"
              aria-label="Sign out"
              className="flex-shrink-0 rounded-lg p-2.5 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main id="admin-page-content" aria-label="Admin page content" tabIndex={-1} className="admin-content min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="admin-topbar sticky top-0 z-20 hidden h-16 items-center justify-between px-6 lg:flex lg:px-8">
          <div><span className="text-xs font-bold uppercase tracking-[.15em] text-blue-700">Unicom TIC</span><span className="ml-3 text-sm font-medium text-slate-500">Admissions workspace</span></div>
          <div className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /><span className="text-xs font-medium text-slate-600">{formatRoleName(currentUser.role)}</span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800" aria-hidden="true">{currentUser.name?.trim().charAt(0).toUpperCase() || "U"}</span></div>
        </div>
        <div className={/^\/admin\/forms\/[^/]+\/builder$/.test(pathname) ? "admin-page p-3 sm:p-5" : "admin-page px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9"}>
          <Notice error>{sessionError}</Notice>
          {settingsSection && (
            <nav aria-label="Settings breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
              <Link href="/admin/settings" className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline">
                <Settings className="h-4 w-4" aria-hidden="true" />System Settings
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span aria-current="page" className="text-slate-500">{settingsSection.name}</span>
            </nav>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
