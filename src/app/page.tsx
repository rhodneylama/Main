import Link from "next/link";
import { dashboard } from "@/lib/analytics";
import { ensureSeeded, isSeeded } from "@/lib/seed-demo";
import { isGhlConfigured } from "@/lib/ghl/config";
import { money, number, percent } from "@/lib/format";
import StatTile from "@/components/charts/StatTile";
import ProgressMeter from "@/components/charts/ProgressMeter";
import TrendChart from "@/components/charts/TrendChart";
import StageFunnel from "@/components/charts/StageFunnel";
import Leaderboard from "@/components/Leaderboard";
import CelebrationFeed from "@/components/CelebrationFeed";
import ActivityLogger from "@/components/ActivityLogger";

export const dynamic = "force-dynamic";

export default function FloorPage() {
  ensureSeeded();
  const data = dashboard("month");
  const ghlConnected = isGhlConfigured();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">The floor</h1>
          <p className="mt-1 text-sm text-muted">
            Month to date, across every rep on the board.
          </p>
        </div>
        {!ghlConnected && (
          <Link href="/settings" className="btn-ghost text-xs">
            {isSeeded() ? "Showing demo data — connect GoHighLevel" : "Connect GoHighLevel"}
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Closed revenue"
          value={money(data.wonRevenueCents, { compact: true })}
          sublabel={`${number(data.wonDeals)} deals won this month`}
          accent="text-status-good"
        >
          <div className="mt-3">
            <ProgressMeter
              fraction={data.quotaAttainment}
              label="Team quota"
              caption={
                data.quotaCents > 0
                  ? `${money(data.quotaCents, { compact: true })} target`
                  : "No quotas set yet"
              }
            />
          </div>
        </StatTile>
        <StatTile
          label="Open pipeline"
          value={money(data.openPipelineCents, { compact: true })}
          sublabel={`${number(data.openDeals)} deals in flight`}
        />
        <StatTile
          label="Activity today"
          value={number(data.activitiesToday)}
          sublabel={`${number(data.appointmentsSet)} appointments this month`}
        />
        <StatTile
          label="Win rate"
          value={percent(data.winRate)}
          sublabel={
            data.avgDealCents > 0
              ? `${money(data.avgDealCents, { compact: true })} average deal`
              : "No closed deals yet"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TrendChart data={data.trend} />
          <StageFunnel stages={data.stages} />
        </div>
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-white">Top of the board</h2>
              <Link href="/leaderboard" className="text-xs text-accent hover:underline">
                Full leaderboard
              </Link>
            </div>
            <Leaderboard initialEntries={data.topReps} compact />
          </div>
          <CelebrationFeed celebrations={data.celebrations} />
          <ActivityLogger />
        </div>
      </div>
    </div>
  );
}
