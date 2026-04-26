/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import {
  formatMatchLabel,
  getYouTubeVideoId,
  getTeamAlliance,
  getRobotPosition,
  getTbaTowerConfirmed,
} from '@/app/lib/tba';
import type { TBAMatch } from '@/app/lib/types';

function makeMatch(overrides: Partial<TBAMatch> = {}): TBAMatch {
  return {
    key: '2026isrtp_qm1',
    comp_level: 'qm',
    set_number: 1,
    match_number: 1,
    time: 1000,
    alliances: {
      red:  { team_keys: ['frc254', 'frc1114', 'frc2630'], score: 42, dq_team_keys: [], surrogate_team_keys: [] },
      blue: { team_keys: ['frc118',  'frc971',  'frc148'],  score: 38, dq_team_keys: [], surrogate_team_keys: [] },
    },
    score_breakdown: null,
    videos: [],
    event_key: '2026isrtp',
    winning_alliance: 'red',
    ...overrides,
  } as unknown as TBAMatch;
}

describe('formatMatchLabel', () => {
  it('formats qual match', () => {
    expect(formatMatchLabel(makeMatch({ comp_level: 'qm', match_number: 14 }))).toBe('Qual 14');
  });
  it('formats semifinal', () => {
    expect(formatMatchLabel(makeMatch({ comp_level: 'sf', set_number: 2, match_number: 1 }))).toBe('SF 2-1');
  });
  it('formats quarterfinal', () => {
    expect(formatMatchLabel(makeMatch({ comp_level: 'qf', set_number: 1, match_number: 3 }))).toBe('QF 1-3');
  });
  it('formats final', () => {
    expect(formatMatchLabel(makeMatch({ comp_level: 'f', set_number: 1, match_number: 2 }))).toBe('Final 1-2');
  });
  it('formats octofinal', () => {
    expect(formatMatchLabel(makeMatch({ comp_level: 'ef', set_number: 4, match_number: 1 }))).toBe('Octo 4-1');
  });
  it('uppercases unknown level', () => {
    expect(formatMatchLabel(makeMatch({ comp_level: 'xyz' as any, set_number: 1, match_number: 1 }))).toBe('XYZ 1-1');
  });
});

describe('getYouTubeVideoId', () => {
  it('returns youtube key when present', () => {
    const match = makeMatch({ videos: [{ type: 'youtube', key: 'abc123' }] } as any);
    expect(getYouTubeVideoId(match)).toBe('abc123');
  });
  it('returns null when no youtube video', () => {
    const match = makeMatch({ videos: [{ type: 'tba', key: 'xyz' }] } as any);
    expect(getYouTubeVideoId(match)).toBeNull();
  });
  it('returns null when videos is empty', () => {
    expect(getYouTubeVideoId(makeMatch())).toBeNull();
  });
  it('ignores non-youtube entries before youtube', () => {
    const match = makeMatch({ videos: [{ type: 'tba', key: 'x' }, { type: 'youtube', key: 'yt99' }] } as any);
    expect(getYouTubeVideoId(match)).toBe('yt99');
  });
});

describe('getTeamAlliance', () => {
  const match = makeMatch();
  it('finds red team', () => expect(getTeamAlliance(match, 2630)).toBe('red'));
  it('finds blue team', () => expect(getTeamAlliance(match, 971)).toBe('blue'));
  it('returns null for absent team', () => expect(getTeamAlliance(match, 9999)).toBeNull());
});

describe('getRobotPosition', () => {
  const match = makeMatch();
  it('returns 0 for first red robot', () => expect(getRobotPosition(match, 254)).toBe(0));
  it('returns 2 for third red robot', () => expect(getRobotPosition(match, 2630)).toBe(2));
  it('returns 1 for second blue robot', () => expect(getRobotPosition(match, 971)).toBe(1));
  it('returns null for absent team', () => expect(getRobotPosition(match, 9999)).toBeNull());
});

describe('getTbaTowerConfirmed', () => {
  it('returns true when field has a non-None value', () => {
    const match = makeMatch({
      score_breakdown: { red: { autoTowerRobot1: 'Yes' }, blue: {} },
    } as any);
    expect(getTbaTowerConfirmed(match, 'red', 0)).toBe(true);
  });
  it('returns false when field is None', () => {
    const match = makeMatch({
      score_breakdown: { red: { autoTowerRobot2: 'None' }, blue: {} },
    } as any);
    expect(getTbaTowerConfirmed(match, 'red', 1)).toBe(false);
  });
  it('returns false when score_breakdown is null', () => {
    expect(getTbaTowerConfirmed(makeMatch({ score_breakdown: null }), 'red', 0)).toBe(false);
  });
  it('returns false when alliance breakdown is missing', () => {
    const match = makeMatch({ score_breakdown: { red: {} } } as any);
    expect(getTbaTowerConfirmed(match, 'blue', 0)).toBe(false);
  });
});
