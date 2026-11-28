"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Award, BarChart3, Calendar, CheckSquare, ChevronRight, FileText, Filter,
  FormInput, LayoutDashboard, Mail, Settings, Upload, UserCheck,
  Users, Users2, type LucideIcon,
} from "lucide-react";
import { isAdminSettingsRoute } from "@/components/admin-settings-sections";

type NavigationLink = { name: string; href: string; icon: LucideIcon };
type NavigationGroup = { id: string; name: string; icon: LucideIcon; children: NavigationLink[] };
type NavigationItem = NavigationLink | NavigationGroup;

const navigationItems: NavigationItem[] = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  {
    id: "leads", name: "Leads", icon: Users,
    children: [
      { name: "Registrations", href: "/admin/registrations", icon: Users },
      { name: "Applications", href: "/admin/applications", icon: FileText },
      { name: "Workshop bookings", href: "/admin/workshop-bookings", icon: Calendar },
      { name: "District Analytics", href: "/admin/analytics", icon: BarChart3 },
    ],
  },
  { name: "Forms Studio", href: "/admin/forms", icon: FormInput },
  {
    id: "workshops", name: "Workshops", icon: Calendar,
    children: [
      { name: "Workshops", href: "/admin/workshops", icon: Calendar },
      { name: "Attendance & IDs", href: "/admin/attendance", icon: UserCheck },
    ],
  },
  {
    id: "communications", name: "Communications", icon: Mail,
    children: [
      { name: "Email Center", href: "/admin/email", icon: Mail },
      { name: "Email Templates", href: "/admin/email/templates", icon: FileText },
      { name: "Student Reminders", href: "/admin/reminders", icon: Mail },
    ],
  },
  {
    id: "assessments", name: "Assessments", icon: Award,
    children: [
      { name: "Exams & Marks", href: "/admin/exams", icon: Award },
      { name: "Marks Import", href: "/admin/marks-import", icon: Upload },
      { name: "Eligibility & Shortlists", href: "/admin/eligibility", icon: Filter },
      { name: "Interviews", href: "/admin/interviews", icon: Users2 },
      { name: "Final Results", href: "/admin/final-results", icon: CheckSquare },
    ],
  },
  { name: "System Settings", href: "/admin/settings", icon: Settings },
];

function matchesRoute(pathname: string, href: string) {
  if (href === "/admin/email" && pathname.startsWith("/admin/email/templates")) return false;
  if (href === "/admin/settings") return isAdminSettingsRoute(pathname);
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

function canShowLink(href: string, role: string) {
  if (["admin", "super_admin"].includes(role)) return true;
  if (role === "entrance_staff") return /attendance|workshops/.test(href);
  return role === "examiner" && /exams|marks-import|interviews|eligibility/.test(href);
}

export default function AdminNavigation({ pathname, role, onNavigate }: {
  pathname: string;
  role: string;
  onNavigate: () => void;
}) {
  const activeGroupId = navigationItems.find((item): item is NavigationGroup =>
    "children" in item && item.children.some(child => canShowLink(child.href, role) && matchesRoute(pathname, child.href))
  )?.id ?? null;
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(activeGroupId);

  useEffect(() => {
    setExpandedGroupId(activeGroupId);
  }, [pathname, activeGroupId]);

  const renderLink = (item: NavigationLink) => {
    const Icon = item.icon;
    const active = matchesRoute(pathname, item.href);
    return (
      <Link href={item.href} onClick={onNavigate}
        aria-current={active ? (pathname === item.href ? "page" : "location") : undefined}
        className={`group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300 ${
          active ? "bg-white/[.15] font-semibold text-white shadow-sm ring-1 ring-white/10" : "text-slate-300 hover:bg-white/[.08] hover:text-white"
        }`}
      >
        <Icon aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 ${active ? "text-blue-200" : "text-slate-400 group-hover:text-blue-200"}`} />
        <span className="truncate">{item.name}</span>
      </Link>
    );
  };

  return (
    <nav id="admin-navigation" aria-label="Admin navigation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5">
      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Navigate</p>
      <ul className="space-y-1.5">
        {navigationItems.map(item => {
          if (!("children" in item)) {
            return canShowLink(item.href, role) ? <li key={item.href}>{renderLink(item)}</li> : null;
          }
          const children = item.children.filter(child => canShowLink(child.href, role));
          if (!children.length) return null;
          const Icon = item.icon;
          const expanded = expandedGroupId === item.id;
          const active = activeGroupId === item.id;
          return (
            <li key={item.id}>
              <button type="button" aria-expanded={expanded} aria-controls={`admin-nav-${item.id}`}
                onClick={() => setExpandedGroupId(expanded ? null : item.id)}
                className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300 ${
                  active ? "bg-white/[.08] font-semibold text-white" : "text-slate-300 hover:bg-white/[.08] hover:text-white"
                }`}
              >
                <Icon aria-hidden="true" className={`h-[18px] w-[18px] shrink-0 ${active ? "text-blue-200" : "text-slate-400"}`} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <ChevronRight aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
              </button>
              <ul id={`admin-nav-${item.id}`} hidden={!expanded} className="my-1.5 ml-5 space-y-1 border-l border-white/15 pl-3">
                {children.map(child => <li key={child.href}>{renderLink(child)}</li>)}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
