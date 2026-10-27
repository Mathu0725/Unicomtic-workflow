"use client";

import { useState, useEffect } from "react";
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
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; role: string }>({
    name: "Dr. Admissions Dean",
    email: "admin@unicomtic.org",
    role: "super_admin",
  });
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

  if (!sessionChecked) return <div className="p-12 text-sm text-slate-500"><Notice error>{sessionError}</Notice>{sessionError ? <button className="mt-4 text-blue-700 underline" onClick={() => setSessionRetry(n => n + 1)}>Retry session check</button> : <p role="status">Checking staff session…</p>}</div>;
  const settingsSection = getAdminSettingsSection(pathname);
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-100 md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex shrink-0 items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-2">
          <BrandLogo className="h-9 w-9" priority />
          <span className="font-bold text-base">Unicom TIC Admin</span>
        </div>
        <button
          type="button"
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={sidebarOpen}
          aria-controls="admin-navigation"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-300"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh min-h-0 w-64 shrink-0 flex-col overflow-hidden bg-slate-900 text-slate-300 transition-transform duration-200 ease-in-out md:relative md:h-full md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="p-4 border-b border-slate-800 flex shrink-0 items-center justify-between">
          <div className="flex items-center space-x-3">
            <BrandLogo className="h-11 w-11" priority />
            <div>
              <span className="font-bold text-sm text-white tracking-tight block">UNICOM TIC</span>
              <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider block">
                Lifecycle Admin
              </span>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <AdminNavigation pathname={pathname} role={currentUser.role} onNavigate={() => setSidebarOpen(false)} />

        {/* Staff Profile Footer */}
        <div className="shrink-0 p-3 border-t border-slate-800 text-xs bg-slate-950/60">
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
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition flex-shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main id="admin-page-content" aria-label="Admin page content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
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
