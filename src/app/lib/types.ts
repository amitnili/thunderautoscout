// ── Scouting Records (MongoDB) ────────────────────────────────────────────

export interface RobotTiming {
  teamNumber: number;
  /** Seconds from match start until robot enters center zone. null = didn't reach / not scouted */
  timeToMiddle: number | null;
  analysisMethod: 'auto' | 'manual' | 'unset';
  /** 0–1 confidence from AI detection. null for manual entries. */
  confidence: number | null;
  /** Whether TBA's autoTowerRobot field confirms this robot went to tower */
  tbaTowerConfirmed: boolean;
  /** Scout explicitly confirmed robot did not attempt/reach the center — excludes this match from timing averages */
  didNotArrive?: boolean;
}

export interface ScoutingRecord {
  _id?: string;
  matchKey: string;         // TBA format: "2026cabe_qm14"
  eventKey: string;
  youtubeVideoId: string;   // YouTube video ID from TBA match.videos
  alliance: 'red' | 'blue';
  robots: RobotTiming[];    // exactly 3 entries
  notes: string;
  scoutName: string;
  /** Seconds into the YouTube video where match autonomous actually starts (T=0) */
  matchStartOffset: number;
  scoutedAt: Date;
  updatedAt: Date;
}

// ── TBA API ───────────────────────────────────────────────────────────────

export interface TBAEventSimple {
  key: string;           // "2026cabe"
  name: string;          // "2026 Central Valley Regional"
  short_name: string | null;
  event_type: number;    // 0=regional, 1=district, 2=district champ, 3=cmp division, 4=cmp finals
  start_date: string;    // "2026-03-12"
  end_date: string;      // "2026-03-15"
  city: string | null;
  state_prov: string | null;
  country: string | null;
  week: number | null;
}

export interface TBATeamSimple {
  key: string;         // "frc254"
  team_number: number;
  nickname: string;
  name: string;
  city: string | null;
  state_prov: string | null;
  country: string | null;
}

export interface TBAMatchAlliance {
  score: number;
  team_keys: string[];       // ["frc254", "frc1114", "frc2056"]
  dq_team_keys: string[];
  surrogate_team_keys: string[];
}

export interface TBAMatch {
  key: string;               // "2026cabe_qm14"
  comp_level: 'qm' | 'ef' | 'qf' | 'sf' | 'f';
  set_number: number;
  match_number: number;
  alliances: {
    red: TBAMatchAlliance;
    blue: TBAMatchAlliance;
  };
  winning_alliance: 'red' | 'blue' | '';
  event_key: string;
  time: number | null;           // scheduled unix timestamp
  actual_time: number | null;
  predicted_time: number | null; // TBA predicted time (more accurate for upcoming)
  videos: Array<{ type: 'youtube' | 'tba'; key: string }>;
  score_breakdown: Record<string, Record<string, unknown>> | null;
}

export interface ZebraTeam {
  team_key: string;
  xs: (number | null)[];
  ys: (number | null)[];
}

export interface ZebraData {
  key: string;
  times: number[];
  alliances: {
    red: ZebraTeam[];
    blue: ZebraTeam[];
  };
}

// ── Computed/UI types ─────────────────────────────────────────────────────

export interface TeamStats {
  teamNumber: number;
  avgTimeToMiddle: number | null;
  fastestTime: number | null;
  slowestTime: number | null;
  matchesScoutedCount: number;
  /** Chronological times for sparkline */
  timesSeries: (number | null)[];
}

export interface MatchWithScouting {
  match: TBAMatch;
  scoutingRecord: ScoutingRecord | null;
  youtubeVideoId: string | null;
  /** The scouted team's robot position (1, 2, or 3) in the alliance */
  robotPosition: number | null;
  /** Whether TBA auto breakdown confirms robot went to tower */
  tbaTowerConfirmed: boolean | null;
}

// ── API Response types ────────────────────────────────────────────────────

export interface AnalyzeVideoResponse {
  success: boolean;
  results: Array<{
    robot: number | null;
    timestamp: number;
    confidence: number;
    bumperColor: 'red' | 'blue';
    notes: string;
  }>;
  /** Detected match start offset in seconds from video start (T=0 of autonomous) */
  matchStartSeconds?: number | null;
  error?: string;
  fallbackMode?: boolean;
  /** Human-readable reason why fallback mode was triggered */
  fallbackReason?: string;
}
