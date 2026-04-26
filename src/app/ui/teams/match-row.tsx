import Link from 'next/link';
import { TBAMatch, ScoutingRecord } from '@/app/lib/types';
import { formatMatchLabel, getYouTubeVideoId, getTbaTowerConfirmed } from '@/app/lib/tba';
import { CheckCircleIcon, MinusCircleIcon, VideoCameraIcon } from '@heroicons/react/24/outline';

function AlliancePill({ teams, color }: { teams: string[]; color: 'red' | 'blue' }) {
  return (
    <span className={`flex gap-1 flex-wrap ${color === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
      {teams.map((t) => (
        <Link
          key={t}
          href={`/teams/${t.replace('frc', '')}`}
          className="text-xs hover:underline font-mono"
        >
          {t.replace('frc', '')}
        </Link>
      ))}
    </span>
  );
}

export default function MatchRow({
  match,
  scoutingRecord,
  teamNumber,
  eventName,
}: {
  match: TBAMatch;
  scoutingRecord: ScoutingRecord | null;
  teamNumber: number;
  eventName?: string;
}) {
  const videoId = getYouTubeVideoId(match);
  const teamKey = `frc${teamNumber}`;
  const alliance = match.alliances.red.team_keys.includes(teamKey) ? 'red' : 'blue';
  const allianceTeams = match.alliances[alliance].team_keys;
  const opponentAlliance = alliance === 'red' ? 'blue' : 'red';
  const robotPos = allianceTeams.indexOf(teamKey);

  // TBA tower confirmation from score breakdown
  const tbaTower = robotPos >= 0 ? getTbaTowerConfirmed(match, alliance, robotPos) : false;

  // Scouted robot data for this team
  const scoutedRobot = scoutingRecord?.robots.find((r) => r.teamNumber === teamNumber) ?? null;

  // Scout URL — include both alliances so the scout page can switch between them
  const redTeams = match.alliances.red.team_keys.join(',');
  const blueTeams = match.alliances.blue.team_keys.join(',');
  const scoutUrl = videoId
    ? `/scout?matchKey=${match.key}&videoId=${videoId}&redTeams=${redTeams}&blueTeams=${blueTeams}&alliance=${alliance}&scoutedTeam=${teamNumber}`
    : null;

  return (
    <div className="flex items-center gap-3 p-3 bg-[#1a1f2e] border border-white/5 rounded-lg hover:border-white/10 transition-colors flex-wrap sm:flex-nowrap">
      {/* Match label + event */}
      <div className="flex flex-col shrink-0 w-32">
        <span className="text-sm font-semibold text-white">{formatMatchLabel(match)}</span>
        {eventName && (
          <span className="text-[10px] text-gray-500 truncate">{eventName}</span>
        )}
      </div>

      {/* Score */}
      <div className="flex items-center gap-1.5 text-xs font-mono shrink-0">
        <span className={`px-1.5 py-0.5 rounded ${alliance === 'red' ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>
          {match.alliances[alliance].score < 0 ? '—' : match.alliances[alliance].score}
        </span>
        <span className="text-gray-600">vs</span>
        <span className={`px-1.5 py-0.5 rounded ${opponentAlliance === 'red' ? 'bg-red-900/30 text-red-500' : 'bg-blue-900/30 text-blue-500'}`}>
          {match.alliances[opponentAlliance].score < 0 ? '—' : match.alliances[opponentAlliance].score}
        </span>
      </div>

      {/* Alliance partners */}
      <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
        <AlliancePill teams={allianceTeams} color={alliance} />
        <span className="text-gray-700 text-xs">vs</span>
        <AlliancePill teams={match.alliances[opponentAlliance].team_keys} color={opponentAlliance} />
      </div>

      {/* TBA tower confirmed */}
      <div className="shrink-0" title={tbaTower ? 'TBA confirms: robot reached middle in auto' : 'No middle data'}>
        {tbaTower
          ? <CheckCircleIcon className="w-4 h-4 text-green-500" aria-label="Middle confirmed" />
          : <MinusCircleIcon className="w-4 h-4 text-gray-700" aria-label="No middle data" />
        }
      </div>

      {/* Scouted timing */}
      <div className="shrink-0 w-20 text-right">
        {scoutedRobot?.timeToMiddle !== null && scoutedRobot?.timeToMiddle !== undefined ? (
          <span className="text-green-400 font-mono text-sm font-bold">
            {scoutedRobot.timeToMiddle.toFixed(2)}s
          </span>
        ) : scoutingRecord ? (
          <span className="text-gray-600 text-xs">no time</span>
        ) : null}
      </div>

      {/* Scout button or no-video badge */}
      <div className="shrink-0">
        {scoutUrl ? (
          <Link
            href={scoutUrl}
            className="inline-flex items-center gap-1 bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors min-h-[32px]"
            aria-label={`Scout ${formatMatchLabel(match)}`}
          >
            <VideoCameraIcon className="w-3.5 h-3.5" />
            Scout
          </Link>
        ) : (
          <span className="text-xs text-gray-700 px-2">No video</span>
        )}
      </div>
    </div>
  );
}
