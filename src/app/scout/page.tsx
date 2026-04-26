'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  PlayIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import YouTubePlayer from '@/app/ui/scout/youtube-player';
import RobotTimingCard from '@/app/ui/scout/robot-timing-card';
import { RobotTiming, AnalyzeVideoResponse, ScoutingRecord } from '@/app/lib/types';

function defaultTiming(teamNumber: number): RobotTiming {
  return { teamNumber, timeToMiddle: null, analysisMethod: 'unset', confidence: null, tbaTowerConfirmed: false };
}

function ScoutPageInner() {
  const params = useSearchParams();

  // Parse URL params
  const videoId = params?.get('videoId') ?? '';
  const matchKey = params?.get('matchKey') ?? '';

  function parseTeams(param: string): number[] {
    const nums = param
      .split(',')
      .map((t) => parseInt(t.replace('frc', ''), 10))
      .filter((n) => !isNaN(n) && n > 0)
      .slice(0, 3);
    while (nums.length < 3) nums.push(0);
    return nums;
  }

  const redTeamsParam  = params?.get('redTeams')  ?? '';
  const blueTeamsParam = params?.get('blueTeams') ?? '';
  const legacyTeams    = params?.get('teams')     ?? '';
  const redTeamNumbers  = redTeamsParam  ? parseTeams(redTeamsParam)  : parseTeams(legacyTeams);
  const blueTeamNumbers = blueTeamsParam ? parseTeams(blueTeamsParam) : parseTeams(legacyTeams);

  const [currentTime, setCurrentTime] = useState(0);
  const [redTimings,  setRedTimings]  = useState<RobotTiming[]>(redTeamNumbers.map(defaultTiming));
  const [blueTimings, setBlueTimings] = useState<RobotTiming[]>(blueTeamNumbers.map(defaultTiming));
  const [notes, setNotes] = useState('');
  const [scoutName, setScoutName] = useState('');
  const [matchStartOffset, setMatchStartOffset] = useState<number | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'fallback'>('idle');
  const [analysisError, setAnalysisError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [knownScouts, setKnownScouts] = useState<string[]>([]);
  const [manualMode, setManualMode] = useState(false);
  const [detectedOffset, setDetectedOffset] = useState<number | null>(null);
  /** True while the initial DB fetch is pending — prevents showing "manual" during load */
  const [dbLoading, setDbLoading] = useState(!!matchKey);
  type DbStatus = 'checking' | 'ok' | 'error';
  const [dbStatus, setDbStatus] = useState<DbStatus>('checking');
  const [dbError,  setDbError]  = useState('');

  const seekFnRef      = useRef<((seconds: number) => void) | null>(null);
  const pauseFnRef     = useRef<(() => void) | null>(null);
  const isDetecting    = useRef(false); // prevents concurrent handleAutoDetect calls
  const saveResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRegisterSeek  = useCallback((fn: (seconds: number) => void) => { seekFnRef.current  = fn; }, []);
  const handleRegisterPause = useCallback((fn: () => void)               => { pauseFnRef.current = fn; }, []);

  const handleSeek = useCallback((videoTime: number) => {
    pauseFnRef.current?.();
    seekFnRef.current?.(videoTime);
  }, []);

  useEffect(() => {
    const name = localStorage.getItem('scoutName') ?? '';
    if (name) setScoutName(name);
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      if (Array.isArray(d.scoutNames)) setKnownScouts(d.scoutNames);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { ok: boolean; error?: string }) => {
        if (d.ok) setDbStatus('ok');
        else { setDbStatus('error'); setDbError(d.error ?? 'Database unavailable'); }
      })
      .catch(() => { setDbStatus('error'); setDbError('Could not reach server'); });
  }, []);

  // Auto-reset save status so user can save again after a successful save
  function setSaved() {
    setSaveStatus('saved');
    if (saveResetTimer.current) clearTimeout(saveResetTimer.current);
    saveResetTimer.current = setTimeout(() => setSaveStatus('idle'), 2500);
  }
  useEffect(() => () => { if (saveResetTimer.current) clearTimeout(saveResetTimer.current); }, []);

  async function setAndSaveScoutName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('scoutName', trimmed);
    setScoutName(trimmed);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scoutName: trimmed }),
    }).catch(() => {});
  }

  const updateRedTiming  = useCallback((i: number, u: Partial<RobotTiming>) =>
    setRedTimings( prev => prev.map((t, idx) => idx === i ? { ...t, ...u } : t)), []);
  const updateBlueTiming = useCallback((i: number, u: Partial<RobotTiming>) =>
    setBlueTimings(prev => prev.map((t, idx) => idx === i ? { ...t, ...u } : t)), []);

  const handleAutoDetect = useCallback(async () => {
    if (!videoId) return;
    // Prevent two concurrent detections (React StrictMode double-invoke, Re-detect spam, etc.)
    if (isDetecting.current) return;
    isDetecting.current = true;
    setAnalysisStatus('loading');
    setAnalysisError('');
    try {
      const teamNumbers = [...redTeamNumbers, ...blueTeamNumbers].filter(n => n > 0);
      const res = await fetch('/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`, teamNumbers }),
      });
      const data: AnalyzeVideoResponse = await res.json();

      if (data.fallbackMode) {
        setAnalysisStatus('fallback');
        setAnalysisError(data.fallbackReason ?? 'yt-dlp unavailable');
        return;
      }
      if (data.matchStartSeconds != null) {
        setMatchStartOffset(data.matchStartSeconds);
        setDetectedOffset(data.matchStartSeconds);
      }
      if (!data.success) {
        // API-side concurrency guard fired (e.g. another browser tab is detecting the same video).
        // Stay in loading — the real detection will complete shortly.
        if (data.error === 'Analysis already in progress') return;
        setAnalysisStatus('error');
        setAnalysisError(data.error ?? 'Detection failed');
        return;
      }
      setAnalysisStatus('done');
      setManualMode(false);
      // Persist offset immediately so re-entry shows it without re-detecting
      if (matchKey && data.matchStartSeconds != null) {
        const eventKey = matchKey.split('_')[0];
        const payload = {
          matchKey,
          eventKey,
          matchStartOffset: data.matchStartSeconds,
          ...(videoId && { youtubeVideoId: videoId }),
        };
        Promise.all([
          fetch('/api/scouting/upsert-offset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, alliance: 'red' }),
          }),
          fetch('/api/scouting/upsert-offset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, alliance: 'blue' }),
          }),
        ]).catch(console.error);
      }
    } catch {
      setAnalysisStatus('error');
      setAnalysisError('Network error');
    } finally {
      isDetecting.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // On mount: load any existing scouting record, pre-populate state,
  // and only auto-detect match start if no saved data exists.
  const hasAutoDetected = useRef(false);
  useEffect(() => {
    if (!matchKey) {
      // No match key — just auto-detect if there's a video
      if (videoId && !hasAutoDetected.current) {
        hasAutoDetected.current = true;
        handleAutoDetect();
      }
      return;
    }

    // Block auto-detect while we check the DB for existing data
    hasAutoDetected.current = true;

    Promise.all([
      fetch(`/api/scouting/get?matchKey=${encodeURIComponent(matchKey)}&alliance=red`)
        .then((r) => r.json()).catch(() => ({ record: null })),
      fetch(`/api/scouting/get?matchKey=${encodeURIComponent(matchKey)}&alliance=blue`)
        .then((r) => r.json()).catch(() => ({ record: null })),
    ]).then(([redData, blueData]) => {
      const redRecord: ScoutingRecord | null = redData.record ?? null;
      const blueRecord: ScoutingRecord | null = blueData.record ?? null;
      let hasExistingData = false;

      // Restore match start offset from the saved record
      const savedOffset = redRecord?.matchStartOffset ?? blueRecord?.matchStartOffset;
      if (savedOffset != null && savedOffset > 0) {
        setMatchStartOffset(savedOffset);
        setDetectedOffset(savedOffset);
        setAnalysisStatus('done');
        hasExistingData = true;
      }

      // Restore robot timings — replace arrays entirely so teamNumbers from DB
      // are used even when the URL had no team params.
      if (redRecord?.robots?.length) {
        setRedTimings(redRecord.robots);
        hasExistingData = true;
      }
      if (blueRecord?.robots?.length) {
        setBlueTimings(blueRecord.robots);
        hasExistingData = true;
      }

      // Restore notes
      const savedNotes = redRecord?.notes || blueRecord?.notes;
      if (savedNotes) setNotes(savedNotes);

      setDbLoading(false);

      // Auto-detect only if no existing data was found
      if (!hasExistingData && videoId) {
        hasAutoDetected.current = false;
        handleAutoDetect();
      }
    }).catch(() => {
      setDbLoading(false);
      // On fetch error, fall back to auto-detect
      if (videoId) {
        hasAutoDetected.current = false;
        handleAutoDetect();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchKey]);

  async function handleSave() {
    if (saveResetTimer.current) clearTimeout(saveResetTimer.current);
    setSaveStatus('saving');
    setSaveError('');
    const eventKey = matchKey.split('_')[0] ?? '';

    // Filter to only robots with valid team numbers before sending
    const validRed  = redTimings.filter(r => r.teamNumber > 0);
    const validBlue = blueTimings.filter(r => r.teamNumber > 0);

    const updateAlliance = async (alliance: 'red' | 'blue', robots: RobotTiming[]) => {
      const r = await fetch('/api/scouting/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchKey, alliance, robots, notes, scoutName,
          matchStartOffset: matchStartOffset ?? 0,
          eventKey, youtubeVideoId: videoId,
        }),
      });
      const body = await r.json().catch(() => ({})) as { error?: string };
      return { status: r.status, error: body.error };
    };

    try {
      const [redResult, blueResult] = await Promise.all([
        validRed.length  > 0 ? updateAlliance('red',  validRed)  : Promise.resolve({ status: 200, error: undefined }),
        validBlue.length > 0 ? updateAlliance('blue', validBlue) : Promise.resolve({ status: 200, error: undefined }),
      ]);
      if (redResult.status < 300 && blueResult.status < 300) {
        setSaved();
      } else {
        const msg = redResult.error ?? blueResult.error ?? 'Unknown error';
        setSaveError(msg);
        setSaveStatus('error');
      }
    } catch {
      setSaveError('Network error');
      setSaveStatus('error');
    }
  }

  const eventKey         = matchKey.split('_')[0];
  const firstTeam        = [...redTeamNumbers, ...blueTeamNumbers].find(n => n > 0) ?? '';
  const scoutedTeamParam = params?.get('scoutedTeam');
  const backTeam         = scoutedTeamParam ? parseInt(scoutedTeamParam, 10) : firstTeam;

  // ── Derived control panel state ──────────────────────────────────────────
  type ControlState = 'detecting' | 'detected' | 'manual' | 'error';
  const controlState: ControlState =
    analysisStatus === 'loading' ? 'detecting' :
    (analysisStatus === 'done' && matchStartOffset !== null && !manualMode) ? 'detected' :
    ((analysisStatus === 'error' || analysisStatus === 'fallback') && !manualMode) ? 'error' :
    'manual';

  return (
    <div className="-mx-4 -my-6 h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden bg-[#0d111b]">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0 min-h-[44px]">
        <div className="flex items-center gap-3">
          {eventKey && (
            <Link href={`/teams/${backTeam}`}
              className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
              <ArrowLeftIcon className="w-4 h-4" />Back
            </Link>
          )}
          <div>
            <span className="text-sm font-bold text-white">{matchKey || 'Scout a Match'}</span>
            {matchKey && <span className="text-xs text-gray-500 ml-2">{eventKey}</span>}
          </div>
        </div>

        {/* DB status dot */}
        <span
          className={`block w-2 h-2 rounded-full transition-colors duration-200 shrink-0 ${
            dbStatus === 'ok' ? 'bg-green-500' : dbStatus === 'error' ? 'bg-red-400' : 'bg-gray-500 animate-pulse'
          }`}
          title={dbStatus === 'error' ? `DB: ${dbError}` : dbStatus === 'ok' ? 'Database connected' : 'Checking database…'}
          aria-label={dbStatus === 'error' ? `Database error: ${dbError}` : dbStatus === 'ok' ? 'Database connected' : 'Checking database connection'}
        />

        {/* Scout name */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Scout:</span>
          {!scoutName && knownScouts.length > 0 ? (
            <div className="flex items-center gap-1">
              {knownScouts.slice(0, 4).map((n) => (
                <button key={n} onClick={() => setAndSaveScoutName(n)}
                  className="text-xs bg-[#1a1f2e] border border-white/10 text-gray-300 hover:text-green-400 hover:border-green-600 px-2 py-0.5 rounded-full transition-colors">
                  {n}
                </button>
              ))}
              <button onClick={async () => { const name = window.prompt('Enter your name:'); if (name) await setAndSaveScoutName(name); }}
                className="text-xs text-gray-500 hover:text-green-400 transition-colors">
                + Other
              </button>
            </div>
          ) : (
            <button onClick={async () => { const name = window.prompt('Enter your name:', scoutName); if (name) await setAndSaveScoutName(name); }}
              className="text-xs text-green-400 hover:text-green-300 font-medium transition-colors">
              {scoutName || 'Set name'}
            </button>
          )}
        </div>
      </div>

      {/* ── Body: video + sidebar ─────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Video — full size */}
        <div className="flex-1 min-w-0 bg-black flex items-stretch">
          {videoId ? (
            <YouTubePlayer videoId={videoId} onTimeUpdate={setCurrentTime}
              onRegisterSeek={handleRegisterSeek} onRegisterPause={handleRegisterPause} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-500 text-sm">No video — launch from a team&apos;s match list</p>
            </div>
          )}
        </div>

        {/* Sidebar: match start → red | blue cards → notes/save */}
        <div className="w-[400px] flex flex-col border-l border-white/10 bg-[#0d111b] shrink-0">

          {/* ── Match Start Control Panel ────────────────────────────────── */}
          <div className="px-3 py-3 border-b border-white/5 shrink-0">

            {/* Loading from DB */}
            {dbLoading && (
              <div className="flex items-center gap-2 py-1" role="status" aria-label="Loading saved data">
                <div className="w-3.5 h-3.5 border-2 border-gray-700 border-t-gray-400 rounded-full animate-spin shrink-0" aria-hidden="true" />
                <span className="text-xs text-gray-500">Loading saved data…</span>
              </div>
            )}

            {/* State A: Detecting (AI video analysis) */}
            {!dbLoading && controlState === 'detecting' && (
              <div className="flex flex-col items-center gap-2 py-2" role="status" aria-label="Detecting match start">
                <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" aria-hidden="true" />
                <span className="text-xs text-gray-400">Detecting match start...</span>
              </div>
            )}

            {/* State B: Detected */}
            {!dbLoading && controlState === 'detected' && (
              <div className="flex items-center gap-2">
                <div className="shrink-0">
                  <div className="text-[9px] font-bold text-gray-600 uppercase tracking-widest leading-none mb-0.5">Match Start</div>
                  <div className="font-mono font-bold text-2xl text-green-400 leading-none">
                    {matchStartOffset!.toFixed(1)}<span className="text-sm text-green-500/70 ml-0.5">s</span>
                  </div>
                </div>
                <div className="flex gap-1.5 ml-auto shrink-0">
                  <button
                    onClick={() => handleSeek(matchStartOffset!)}
                    className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors min-h-[32px] cursor-pointer"
                    aria-label="Preview match start moment in video">
                    <PlayIcon className="w-3.5 h-3.5 shrink-0" />Preview
                  </button>
                  <button
                    onClick={() => setManualMode(true)}
                    className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors min-h-[32px] cursor-pointer"
                    aria-label="Adjust match start time manually">
                    <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 shrink-0" />Adjust
                  </button>
                  <button
                    onClick={handleAutoDetect}
                    className="text-gray-600 hover:text-gray-400 transition-colors p-1.5 min-h-[32px] flex items-center cursor-pointer"
                    aria-label="Re-detect match start from video">
                    <ArrowPathIcon className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>
              </div>
            )}

            {/* State C: Manual */}
            {!dbLoading && controlState === 'manual' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Match Start</span>
                  {matchStartOffset !== null && (
                    <span className="font-mono text-sm font-bold text-green-400">{matchStartOffset.toFixed(1)}s</span>
                  )}
                </div>
                <input
                  type="range" min={0} max={30} step={0.1}
                  disabled={!videoId}
                  value={matchStartOffset ?? currentTime}
                  onChange={(e) => {
                    const t = parseFloat(e.target.value);
                    setMatchStartOffset(t);
                    handleSeek(t);
                  }}
                  className={`w-full cursor-pointer disabled:opacity-40 ${matchStartOffset !== null ? 'accent-green-500' : 'accent-gray-500'}`}
                  style={{ touchAction: 'none' }}
                  aria-label="Set match start time by dragging" />
                <div className="flex justify-between text-xs text-gray-700"><span>0s</span><span>15s</span><span>30s</span></div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMatchStartOffset(currentTime)}
                    disabled={!videoId}
                    className="flex-1 bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 text-white text-xs font-medium py-2 rounded-lg transition-colors min-h-[36px] cursor-pointer"
                    aria-label={`Set match start to current video time ${currentTime.toFixed(1)}s`}>
                    Set at {currentTime.toFixed(1)}s
                  </button>
                  <button
                    onClick={() => { setManualMode(false); handleAutoDetect(); }}
                    disabled={!videoId || analysisStatus === 'loading'}
                    className="flex-1 flex items-center justify-center gap-1 bg-purple-900/30 hover:bg-purple-800/40 disabled:opacity-40 border border-purple-700/30 text-purple-300 text-xs font-medium py-2 rounded-lg transition-colors min-h-[36px] cursor-pointer"
                    aria-label="Re-detect match start from video">
                    <ArrowPathIcon className="w-3.5 h-3.5 shrink-0" />Re-detect
                  </button>
                </div>
                {detectedOffset !== null && analysisStatus === 'done' && (
                  <button
                    onClick={() => { setMatchStartOffset(detectedOffset); setManualMode(false); }}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                    aria-label={`Back to auto-detected value ${detectedOffset.toFixed(1)}s`}>
                    <ArrowLeftIcon className="w-3 h-3 shrink-0" />Back to detected ({detectedOffset.toFixed(1)}s)
                  </button>
                )}
              </div>
            )}

            {/* State D: Error / Fallback */}
            {!dbLoading && controlState === 'error' && (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-xs text-yellow-400 font-medium">Could not detect match start</p>
                    {analysisError && <p className="text-xs text-gray-500 mt-0.5">{analysisError}</p>}
                  </div>
                </div>
                <button
                  onClick={() => setManualMode(true)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-medium py-2 rounded-lg transition-colors min-h-[36px] cursor-pointer"
                  aria-label="Set match start time manually">
                  Set manually
                </button>
                <button
                  onClick={handleAutoDetect}
                  disabled={!videoId}
                  className="w-full flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40 transition-colors py-1 cursor-pointer"
                  aria-label="Try auto-detection again">
                  <ArrowPathIcon className="w-3.5 h-3.5 shrink-0" />Try again
                </button>
              </div>
            )}
          </div>

          {/* ── Robot cards: red | blue columns ─────────────────────────── */}
          <div className="flex flex-1 min-h-0">

            {/* Red column */}
            <div className="flex-1 min-w-0 flex flex-col border-r border-red-900/20 overflow-y-auto">
              <div className="sticky top-0 z-10 px-3 py-1.5 bg-red-950/40 border-b border-red-900/25 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Red</span>
                <span className="ml-auto text-[10px] text-red-600">
                  {redTimings.filter(t => t.teamNumber > 0 && t.timeToMiddle !== null).length}/
                  {redTimings.filter(t => t.teamNumber > 0).length} timed
                </span>
              </div>
              {redTimings.map((timing, i) =>
                timing.teamNumber > 0 && (
                  <RobotTimingCard key={i} index={i} teamNumber={timing.teamNumber} alliance="red"
                    timing={timing} currentVideoTime={currentTime} matchStartOffset={matchStartOffset}
                    tbaTowerConfirmed={timing.tbaTowerConfirmed}
                    onUpdate={(u) => updateRedTiming(i, u)} onSeek={handleSeek} mode="compact" />
                )
              )}
            </div>

            {/* Blue column */}
            <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
              <div className="sticky top-0 z-10 px-3 py-1.5 bg-blue-950/40 border-b border-blue-900/25 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Blue</span>
                <span className="ml-auto text-[10px] text-blue-600">
                  {blueTimings.filter(t => t.teamNumber > 0 && t.timeToMiddle !== null).length}/
                  {blueTimings.filter(t => t.teamNumber > 0).length} timed
                </span>
              </div>
              {blueTimings.map((timing, i) =>
                timing.teamNumber > 0 && (
                  <RobotTimingCard key={i} index={i} teamNumber={timing.teamNumber} alliance="blue"
                    timing={timing} currentVideoTime={currentTime} matchStartOffset={matchStartOffset}
                    tbaTowerConfirmed={timing.tbaTowerConfirmed}
                    onUpdate={(u) => updateBlueTiming(i, u)} onSeek={handleSeek} mode="compact" />
                )
              )}
            </div>

          </div>

          {/* ── Notes + Save ────────────────────────────────────────────── */}
          <div className="px-3 py-2 border-t border-white/10 space-y-1.5 shrink-0">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Match notes…" rows={1} maxLength={500}
              className="w-full bg-[#1a1f2e] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-green-500 focus:outline-none resize-none transition-colors"
              aria-label="Match notes" />
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving' || saveStatus === 'saved'}
              className={`w-full font-bold py-2 rounded-xl transition-all duration-200 text-sm min-h-[40px] flex items-center justify-center gap-1.5 ${
                saveStatus === 'saved'
                  ? 'bg-green-900/60 text-green-300 cursor-default'
                  : saveStatus === 'error' || saveStatus === 'conflict'
                  ? 'bg-red-700 hover:bg-red-600 text-white cursor-pointer'
                  : saveStatus === 'saving'
                  ? 'bg-green-700/60 text-white cursor-not-allowed'
                  : 'bg-green-700 hover:bg-green-600 text-white cursor-pointer'
              }`}
              aria-label="Save scouting record"
              aria-live="polite">
              {saveStatus === 'saving' && (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  Saving…
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <CheckCircleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Saved
                </>
              )}
              {saveStatus === 'conflict' && 'Conflict — try again'}
              {saveStatus === 'error'    && (
                <span title={saveError || undefined}>
                  {saveError ? `Error: ${saveError.slice(0, 35)}…` : 'Save failed — retry'}
                </span>
              )}
              {saveStatus === 'idle'     && 'Save Record'}
            </button>
            {(saveStatus === 'saved' || saveStatus === 'idle') && (
              <Link href="/" className="block text-center text-xs text-gray-500 hover:text-white transition-colors">
                Back to Dashboard
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScoutPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 text-sm p-4">Loading…</div>}>
      <ScoutPageInner />
    </Suspense>
  );
}
