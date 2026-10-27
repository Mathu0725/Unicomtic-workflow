import Link from "next/link";
import { ArrowUpRight, Settings } from "lucide-react";
import { adminSettingsSections } from "@/components/admin-settings-sections";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-8">
      <header className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
          <Settings className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Settings</h1>
          <p className="mt-1 text-sm text-slate-500">Manage portal settings, connections, staff access and system monitoring.</p>
        </div>
      </header>

      {(["Portal", "Connections", "Monitoring"] as const).map(group => (
        <section key={group} aria-labelledby={`settings-${group.toLowerCase()}`}>
          <h2 id={`settings-${group.toLowerCase()}`} className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{group}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {adminSettingsSections.filter(section => section.group === group).map(section => {
              const Icon = section.icon;
              return (
                <Link key={section.href} href={section.href} className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-blue-50 group-hover:text-blue-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">{section.name}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{section.description}</p>
                  </div>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-600" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
