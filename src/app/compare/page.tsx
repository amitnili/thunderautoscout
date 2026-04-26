'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { TeamStats } from '@/app/lib/types';
import TeamSelector from '@/app/ui/compare/team-selector';
import BarChart from '@/app/ui/compare/bar-chart';

function ComparePageInner() {
  const params = useSearchParams();
  const teamsParam = params?.get('teams') ?? '';
  const selectedTeams = teamsParam
    .split(',')
    .map((t) => parseInt(t, 10))
    .filter((n) => !isNaN(n) && n > 0);

  const [teamStats, setTeamStats] = useState<TeamStats[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedTeams.length) { setTeamStats([]); return; }
    setLoading(true);
    Promise.all(
      selectedTeams.map((n) =>
        fetch(`/api/scouting/get?teamNumber=${n}`)
          .then((r) => r.json())
          .then((d) => d.stats as TeamStats | null)
          .catch(() => null)
      )
    ).then((results) => {
      setTeamStats(results.filter((s): s is TeamStats => s !== null));
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsParam]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
          <ArrowLeftIcon className="w-4 h-4" />
          Dashboard
        </Link>
        <h1 className="text-base font-bold text-white">Compare Teams</h1>
      </div>

      <TeamSelector selectedTeams={selectedTeams} />

      {loading && <p className="text-gray-500 text-sm animate-pulse">Loading stats…</p>}

      {!loading && teamStats.length > 0 && (
        <>
          {/* Bar chart */}
          <section className="bg-[#1a1f2e] border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Avg Time to Middle (seconds)
            </h2>
            <BarChart teams={teamStats} />
          </section>

          {/* Table */}
          <section className="bg-[#1a1f2e] border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Details</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Team comparison table">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-white/10">
                    <th className="pb-2 pr-6 font-medium">Team</th>
                    <th className="pb-2 pr-6 font-medium text-right">Avg Time</th>
                    <th className="pb-2 pr-6 font-medium text-right">Fastest</th>
                    <th className="pb-2 pr-6 font-medium text-right">Slowest</th>
                    <th className="pb-2 font-medium text-right">Matches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[...teamStats]
                    .sort((a, b) => (a.avgTimeToMiddle ?? 99) - (b.avgTimeToMiddle ?? 99))
                    .map((t) => (
                      <tr key={t.teamNumber} className="hover:bg-white/3 transition-colors">
                        <td className="py-2 pr-6">
                          <Link href={`/teams/${t.teamNumber}`} className="font-semibold text-white hover:text-green-400 transition-colors font-mono">
                            {t.teamNumber}
                          </Link>
                        </td>
                        <td className="py-2 pr-6 text-right font-mono text-green-400 font-bold">
                          {t.avgTimeToMiddle !== null ? `${t.avgTimeToMiddle.toFixed(2)}s` : '—'}
                        </td>
                        <td className="py-2 pr-6 text-right font-mono text-gray-300">
                          {t.fastestTime !== null ? `${t.fastestTime.toFixed(2)}s` : '—'}
                        </td>
                        <td className="py-2 pr-6 text-right font-mono text-gray-500">
                          {t.slowestTime !== null ? `${t.slowestTime.toFixed(2)}s` : '—'}
                        </td>
                        <td className="py-2 text-right text-gray-400">{t.matchesScoutedCount}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {!loading && selectedTeams.length > 0 && teamStats.length === 0 && (
        <p className="text-gray-500 text-sm">No scouting data yet for any of these teams.</p>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="text-gray-400 text-sm">Loading…</div>}>
      <ComparePageInner />
    </Suspense>
  );
}
