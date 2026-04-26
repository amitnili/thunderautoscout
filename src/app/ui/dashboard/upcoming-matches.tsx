import Link from 'next/link';
import { PlayIcon } from '@heroicons/react/24/solid';
import { TBAMatch, TeamStats } from '@/app/lib/types';
import { formatMatchLabel, getYouTubeVideoId, getTeamAlliance } from '@/app/lib/tba';

export interface NextMatchCardProps {
  match: TBAMatch;
  isNext: boolean;
  redTeams: Array<{ teamNumber: number; stats: TeamStats | null }>;
  blueTeams: Array<{ teamNumber: number; stats: TeamStats | null }>;
  myTeam: number;
}

function formatMatchTime(match: TBAMatch): string {
  const ts = match.predicted_time ?? match.time ?? match.actual_time;
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` · ${time}`;
}

function timeColor(t: number | null): string {
  if (t === null) return 'text-gray-600';
  if (t <= 3) return 'text-green-400';
  if (t <= 6) return 'text-yellow-400';
  return 'text-orange-400';
}

function scoutUrl(match: TBAMatch, ytId: string, alliance: 'red' | 'blue'): string {
  const red  = match.alliances.red.team_keys.map(k => k.replace('frc', '')).join(',');
  const blue = match.alliances.blue.team_keys.map(k => k.replace('frc', '')).join(',');
  return `/scout?videoId=${ytId}&matchKey=${match.key}&redTeams=${red}&blueTeams=${blue}&alliance=${alliance}`;
}

function TeamRow({
  teamNumber,
  stats,
  isMyTeam,
}: {
  teamNumber: number;
  stats: TeamStats | null;
  isMyTeam: boolean;
}) {
  const avg = stats?.avgTimeToMiddle ?? null;
  const best = stats?.fastestTime ?? null;

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-3 px-2 sm:px-3 py-2 rounded-lg min-h-[40px] transition-colors ${
        isMyTeam ? 'bg-yellow-900/20 border border-yellow-600/30' : 'hover:bg-white/4'
      }`}
    >
      {/* Team number */}
      <Link
        href={`/teams/${teamNumber}`}
        className={`font-bold text-sm w-10 sm:w-12 shrink-0 hover:underline ${
          isMyTeam ? 'text-yellow-300' : 'text-white hover:text-green-400'
        }`}
      >
        {isMyTeam && <span className="mr-0.5 text-yellow-400">★</span>}
        {teamNumber}
      </Link>

      {/* Avg */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-1">
        <span className="hidden sm:inline text-[9px] text-gray-600 uppercase tracking-wider">avg</span>
        <span className={`font-mono font-bold text-sm ${timeColor(avg)}`}>
          {avg !== null ? `${avg.toFixed(2)}s` : '—'}
        </span>
      </div>

      {/* Best — hidden on small screens */}
      <div className="hidden sm:flex items-center gap-1.5">
        <span className="text-[9px] text-gray-600 uppercase tracking-wider">best</span>
        <span className={`font-mono text-sm ${best !== null ? 'text-green-400 font-semibold' : 'text-gray-700'}`}>
          {best !== null ? `${best.toFixed(2)}s` : '—'}
        </span>
      </div>
    </div>
  );
}

export default function NextMatchCard({ match, isNext, redTeams, blueTeams, myTeam }: NextMatchCardProps) {
  const ytId = getYouTubeVideoId(match);
  const myAlliance = getTeamAlliance(match, myTeam);
  const scoutHref = ytId && myAlliance ? scoutUrl(match, ytId, myAlliance) : null;
  const timeStr = formatMatchTime(match);

  return (
    <div className="bg-[#151a27] border border-white/8 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b border-white/8 bg-white/3">
        {/* Status chip */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${isNext ? 'bg-green-400' : 'bg-gray-600'}`}
            aria-hidden="true"
          />
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isNext ? 'text-green-400' : 'text-gray-500'}`}>
            {isNext ? 'Next Match' : 'Last Match'}
          </span>
        </div>

        {/* Match label */}
        <span className="font-mono font-bold text-white text-sm">
          {formatMatchLabel(match)}
        </span>

        {/* Time — flex-1 spacer, hidden text on small screens */}
        <span className="flex-1 min-w-0 text-xs text-gray-500 truncate hidden sm:block">{timeStr}</span>
        {!timeStr && <span className="flex-1" />}

        {/* Scout button */}
        {scoutHref && (
          <Link
            href={scoutHref}
            className="flex items-center gap-1 px-2.5 py-1 bg-green-800 hover:bg-green-700 text-green-200 rounded text-[11px] font-medium transition-colors shrink-0 min-h-[32px]"
            aria-label="Scout this match"
          >
            <PlayIcon className="w-3 h-3" />
            Scout
          </Link>
        )}
      </div>

      {/* Alliance columns */}
      <div className="grid grid-cols-2 divide-x divide-white/8">
        {/* Red */}
        <div className="p-3 space-y-1">
          <div className="flex items-center gap-1.5 mb-2.5 px-1">
            <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Red</span>
          </div>
          {redTeams.map(({ teamNumber, stats }) => (
            <TeamRow key={teamNumber} teamNumber={teamNumber} stats={stats} isMyTeam={teamNumber === myTeam} />
          ))}
        </div>

        {/* Blue */}
        <div className="p-3 space-y-1">
          <div className="flex items-center gap-1.5 mb-2.5 px-1">
            <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden="true" />
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Blue</span>
          </div>
          {blueTeams.map(({ teamNumber, stats }) => (
            <TeamRow key={teamNumber} teamNumber={teamNumber} stats={stats} isMyTeam={teamNumber === myTeam} />
          ))}
        </div>
      </div>
    </div>
  );
}
