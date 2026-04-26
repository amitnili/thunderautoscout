import Link from 'next/link';
import { TeamStats } from '@/app/lib/types';
import { TrophyIcon } from '@heroicons/react/24/outline';

export default function TopTeamsTable({ teams }: { teams: TeamStats[] }) {
  if (!teams.length) {
    return <p className="text-gray-500 text-sm text-center py-4">No data yet — start scouting!</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" role="grid" aria-label="Top teams by autonomous speed">
        <thead>
          <tr className="text-left text-gray-400 border-b border-white/10">
            <th className="pb-2 pr-4 font-medium w-8">#</th>
            <th className="pb-2 pr-4 font-medium">Team</th>
            <th className="pb-2 pr-4 font-medium text-right">Avg Time</th>
            <th className="pb-2 pr-4 font-medium text-right">Fastest</th>
            <th className="pb-2 font-medium text-right">Matches</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {teams.map((t, i) => (
            <tr key={t.teamNumber} className="hover:bg-white/3 transition-colors">
              <td className="py-2 pr-4 text-gray-500">
                {i === 0 && <TrophyIcon className="w-4 h-4 text-yellow-400 inline" />}
                {i > 0 && i + 1}
              </td>
              <td className="py-2 pr-4">
                <Link href={`/teams/${t.teamNumber}`} className="font-semibold text-white hover:text-green-400 transition-colors">
                  Team {t.teamNumber}
                </Link>
              </td>
              <td className="py-2 pr-4 text-right font-mono text-green-400 font-bold">
                {t.avgTimeToMiddle !== null ? `${t.avgTimeToMiddle.toFixed(2)}s` : '—'}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-gray-300">
                {t.fastestTime !== null ? `${t.fastestTime.toFixed(2)}s` : '—'}
              </td>
              <td className="py-2 text-right text-gray-400">{t.matchesScoutedCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
