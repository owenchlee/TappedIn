"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { StatusPill } from "@/components/StatusPill";
import { setStage } from "@/actions/applications";
import type { ApplicationView } from "@/lib/data/applications";
import { CHANNEL_LABELS, STAGES_BY_CATEGORY, type Channel, type SavedStatus } from "@/lib/types";
import { termShortLabel } from "@/lib/terms";
import { formatDate } from "@/lib/deadline";

export function ApplicationTable({ apps }: { apps: ApplicationView[] }) {
  const [optimistic, applyMove] = useOptimistic(apps, (state, move: { id: string; status: SavedStatus }) =>
    state.map((a) => (a.id === move.id ? { ...a, status: move.status } : a)),
  );
  const [, startTransition] = useTransition();

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-2">
            <th className="px-4 py-2.5 font-medium">Role</th>
            <th className="px-3 py-2.5 font-medium">Stage</th>
            <th className="px-3 py-2.5 font-medium">Term</th>
            <th className="px-3 py-2.5 font-medium">Via</th>
            <th className="px-3 py-2.5 font-medium">Applied</th>
            <th className="px-3 py-2.5 font-medium">Next step</th>
          </tr>
        </thead>
        <tbody>
          {optimistic.map((app) => (
            <tr key={app.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
              <td className="px-4 py-2.5">
                <Link href={`/applications/${app.id}`} className="flex items-center gap-2.5">
                  <CompanyLogo name={app.entityKind === "coop" ? app.company : app.title} url={app.url} size="sm" />
                  <span className="min-w-0">
                    <span className="block max-w-xs truncate font-medium text-text">{app.title}</span>
                    <span className="block truncate text-xs text-muted">{app.company}</span>
                  </span>
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <StatusPill
                  value={app.status}
                  category={app.category}
                  options={STAGES_BY_CATEGORY[app.category]}
                  onChange={(next) =>
                    startTransition(async () => {
                      applyMove({ id: app.id, status: next as SavedStatus });
                      await setStage(app.id, next);
                    })
                  }
                />
              </td>
              <td className="px-3 py-2.5 text-xs text-muted">{app.term ? termShortLabel(app.term) : "—"}</td>
              <td className="px-3 py-2.5 text-xs text-muted">{app.channel ? CHANNEL_LABELS[app.channel as Channel] : "—"}</td>
              <td className="px-3 py-2.5 text-xs text-muted tabular-nums">{app.appliedAt ? formatDate(app.appliedAt) : "—"}</td>
              <td className="max-w-56 truncate px-3 py-2.5 text-xs text-muted">
                {app.nextStep ? `${app.nextStep}${app.nextStepAt ? ` · ${formatDate(app.nextStepAt)}` : ""}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
