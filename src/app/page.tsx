import { getTopTeams, getTeamStatsMap, getFullyScoutedMatchKeys } from '@/app/lib/scouting-db';
import { fetchTeamMatches, fetchTeamEvents, fetchEventMatches } from '@/app/lib/tba';
import { TeamStats } from '@/app/lib/types';
import SearchBar from '@/app/ui/dashboard/search-bar';
import TopTeamsTable from '@/app/ui/dashboard/top-teams-table';
import NextMatchCard from '@/app/ui/dashboard/upcoming-matches';
import EventMatches from '@/app/ui/dashboard/event-matches';

const MY_TEAM = 2630;

export default async function Dashboard() {
  // ── Phase 1: TBA (parallel, no DB dependency) ─────────────────────────
  const [allMatches, events] = await Promise.all([
    fetchTeamMatches(MY_TEAM).catch(() => []),
    fetchTeamEvents(MY_TEAM).catch(() => []),
  ]);

  const newestEvent = events
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null;

  const nowSec = Math.floor(Date.now() / 1000);

  // Next match for 2630 at current event
  const upcomingForTeam = newestEvent
    ? allMatches.filter(
        (m) =>
          m.event_key === newestEvent.key &&
          (m.predicted_time ?? m.time ?? 0) > nowSec
      )
    : [];
  const nextMatch = upcomingForTeam[0] ?? null;

  // A match is "past" if TBA confirmed it OR its scheduled time has already passed
  const isPast = (m: { actual_time: number | null; time: number | null }) =>
    m.actual_time != null || (m.time != null && m.time < nowSec);

  // Last played/past match — prefer current event, fall back to any event
  const lastMatchAtEvent = newestEvent
    ? (allMatches
        .filter((m) => m.event_key === newestEvent.key && isPast(m))
        .at(-1) ?? null)
    : null;
  const lastMatch =
    lastMatchAtEvent ??
    (allMatches.filter(isPast).at(-1) ?? null);

  const featuredMatch = nextMatch ?? lastMatch;
  const isFeaturedNext = !!nextMatch;

  // Use the featured match's event for Event Matches section
  const displayEventKey = featuredMatch?.event_key ?? newestEvent?.key ?? null;

  // Collect team numbers only from the featured match
  const featuredTeamNums = featuredMatch
    ? [
        ...featuredMatch.alliances.red.team_keys,
        ...featuredMatch.alliances.blue.team_keys,
      ]
        .map((k) => parseInt(k.replace('frc', ''), 10))
        .filter((n) => !isNaN(n))
    : [];

  // ── Phase 2: MongoDB + all event matches (parallel) ───────────────────
  const [topTeams, fullyScoutedMatchKeys, statsMap, allEventMatches] = await Promise.all([
    getTopTeams(20).catch((): TeamStats[] => []),
    displayEventKey
      ? getFullyScoutedMatchKeys(displayEventKey).catch((): string[] => [])
      : Promise.resolve<string[]>([]),
    featuredTeamNums.length > 0
      ? getTeamStatsMap(featuredTeamNums).catch((): Map<number, TeamStats> => new Map())
      : Promise.resolve(new Map<number, TeamStats>()),
    displayEventKey
      ? fetchEventMatches(displayEventKey).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Build per-team arrays for NextMatchCard
  const redTeams = featuredMatch
    ? featuredMatch.alliances.red.team_keys.map((k) => {
        const n = parseInt(k.replace('frc', ''), 10);
        return { teamNumber: n, stats: statsMap.get(n) ?? null };
      })
    : [];
  const blueTeams = featuredMatch
    ? featuredMatch.alliances.blue.team_keys.map((k) => {
        const n = parseInt(k.replace('frc', ''), 10);
        return { teamNumber: n, stats: statsMap.get(n) ?? null };
      })
    : [];

  const displayEvent =
    events.find((e) => e.key === displayEventKey) ?? newestEvent ?? null;
  const eventLabel = displayEvent?.short_name ?? displayEvent?.name ?? '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3 pt-1">
        <h1 className="text-base font-bold text-white">FRC Auto Scout
          <span className="ml-2 text-xs font-normal text-gray-500">Autonomous time-to-middle · 2026</span>
        </h1>
        <SearchBar />
      </div>

      {/* Section 1: Next / Last Match — full width */}
      {featuredMatch && (
        <section>
          <NextMatchCard
            match={featuredMatch}
            isNext={isFeaturedNext}
            redTeams={redTeams}
            blueTeams={blueTeams}
            myTeam={MY_TEAM}
          />
        </section>
      )}

      {/* Sections 2 + 3: 2-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Event Matches */}
        <section>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
            Event Matches{eventLabel ? ` · ${eventLabel}` : ''}
          </h2>
          <EventMatches
            matches={allEventMatches}
            fullyScoutedMatchKeys={fullyScoutedMatchKeys}
            myTeam={MY_TEAM}
          />
        </section>

        {/* Leaderboard */}
        <section>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
            Fastest Autonomous · avg
          </h2>
          <TopTeamsTable teams={topTeams} />
        </section>
      </div>
    </div>
  );
}
