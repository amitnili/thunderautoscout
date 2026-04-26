'use client';

import { RobotTiming } from '@/app/lib/types';
import { ZONE_LABEL } from '@/app/lib/constants';
import {
  PlayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

interface RobotTimingCardProps {
  index: number;
  teamNumber: number;
  alliance: 'red' | 'blue';
  timing: RobotTiming;
  currentVideoTime: number;
  /** Seconds into the video where match start (T=0) of autonomous starts. null = not set. */
  matchStartOffset: number | null;
  tbaTowerConfirmed: boolean;
  onUpdate: (timing: Partial<RobotTiming>) => void;
  /** Seek the video to the given video-absolute time for validation */
  onSeek?: (videoTime: number) => void;
  /** Compact layout for sidebar (full-width single column) */
  compact?: boolean;
  /** Inline layout: single horizontal row for the robot strip below the video */
  mode?: 'default' | 'compact' | 'inline';
}

export default function RobotTimingCard({
  index,
  teamNumber,
  alliance,
  timing,
  currentVideoTime,
  matchStartOffset,
  tbaTowerConfirmed,
  onUpdate,
  onSeek,
  compact = false,
  mode = 'default',
}: RobotTimingCardProps) {
  const effectiveMode = compact && mode === 'default' ? 'compact' : mode;

  /** Match-relative time: video time minus match start offset, clamped to 0 */
  const matchRelativeTime = matchStartOffset !== null
    ? Math.max(0, Math.round((currentVideoTime - matchStartOffset) * 100) / 100)
    : Math.round(currentVideoTime * 100) / 100;

  function handleSlider(e: React.ChangeEvent<HTMLInputElement>) {
    const t = parseFloat(e.target.value);
    onUpdate({ timeToMiddle: t, analysisMethod: 'manual' });
    if (onSeek !== undefined) {
      const videoTime = matchStartOffset !== null ? matchStartOffset + t : t;
      onSeek(videoTime);
    }
  }

  function handleClear() {
    onUpdate({ timeToMiddle: null, analysisMethod: 'unset', confidence: null, didNotArrive: false });
  }

  function handleDna() {
    onUpdate({ didNotArrive: true, timeToMiddle: null, analysisMethod: 'manual', confidence: null });
  }

  function handlePreview() {
    if (!onSeek || timing.timeToMiddle === null) return;
    const videoTime = matchStartOffset !== null
      ? matchStartOffset + timing.timeToMiddle
      : timing.timeToMiddle;
    onSeek(videoTime);
  }

  const isSet = timing.timeToMiddle !== null;
  const isDna = timing.didNotArrive === true;
  const allianceColor = alliance === 'red' ? 'text-red-400' : 'text-blue-400';
  const cardBg = isDna
    ? 'bg-gray-900/40 border-l-2 border-l-gray-600/50'
    : isSet
    ? 'bg-green-950/25 border-l-2 border-l-green-600/70'
    : alliance === 'red' ? 'bg-red-950/20' : 'bg-blue-950/20';

  // ── Inline mode: single horizontal row ──────────────────────────────────
  if (effectiveMode === 'inline') {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 flex-1 min-w-0 ${cardBg}`}>
        <span className={`font-bold text-xs w-10 shrink-0 ${allianceColor}`}>{teamNumber}</span>
        {isSet
          ? <span className="font-mono text-xs text-green-400 w-[3.5rem] shrink-0 font-bold">
              {timing.timeToMiddle!.toFixed(2)}s
            </span>
          : <span className="w-[3.5rem] shrink-0" />
        }
        <input
          type="range" min={0} max={20} step={0.05}
          value={isSet ? timing.timeToMiddle! : matchRelativeTime}
          onChange={handleSlider}
          className={`flex-1 cursor-pointer ${isSet ? 'accent-green-500' : 'accent-gray-500'}`}
          style={{ touchAction: 'none' }}
          aria-label={`Set time for team ${teamNumber}`}
        />
        {isSet && (
          <button
            onClick={handleClear}
            className="shrink-0 text-gray-600 hover:text-gray-400 transition-colors px-1 min-h-[28px] flex items-center"
            aria-label={`Clear timing for team ${teamNumber}`}
          >
            <XMarkIcon className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  // ── Compact mode: full-width card for sidebar single-column layout ────────
  if (effectiveMode === 'compact') {
    // ── DNA state: robot did not attempt center ───────────────────────────
    if (isDna) {
      return (
        <div className={`px-3 py-2.5 transition-colors ${cardBg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full shrink-0 opacity-40 ${alliance === 'red' ? 'bg-red-500' : 'bg-blue-500'}`} />
              <span className={`font-bold text-sm ${allianceColor} opacity-60`}>{teamNumber}</span>
              <span className="text-[10px] text-gray-500 font-medium tracking-wide">No center</span>
            </div>
            <button
              onClick={handleClear}
              className="text-gray-600 hover:text-gray-400 transition-colors p-1 min-h-[28px] flex items-center rounded cursor-pointer"
              aria-label={`Clear 'did not arrive' for team ${teamNumber}`}
            >
              <XMarkIcon className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      );
    }

    // ── Normal compact card ───────────────────────────────────────────────
    return (
      <div className={`px-3 py-2 transition-colors ${cardBg}`}>

        {/* Row 1: Team identity + time + preview + clear */}
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0 shrink">
            <div className={`w-2 h-2 rounded-full shrink-0 ${alliance === 'red' ? 'bg-red-500' : 'bg-blue-500'}`} />
            <span className={`font-bold text-sm shrink-0 ${allianceColor}`}>{teamNumber}</span>
            {tbaTowerConfirmed && (
              <CheckCircleIcon className="w-3.5 h-3.5 text-green-400 shrink-0" aria-label="TBA confirms robot reached middle in auto" />
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isSet && (
              <>
                <span className="font-mono font-bold text-green-400 text-base tabular-nums leading-none shrink-0">
                  {timing.timeToMiddle!.toFixed(2)}
                  <span className="text-xs text-green-500/70 ml-0.5">s</span>
                </span>
                {onSeek && (
                  <button
                    onClick={handlePreview}
                    className="flex items-center justify-center bg-green-900/40 hover:bg-green-800/60 active:bg-green-900/60 border border-green-800/40 text-green-300 p-1.5 rounded-md transition-colors min-w-[30px] min-h-[30px] cursor-pointer shrink-0"
                    aria-label={`Preview team ${teamNumber} at ${ZONE_LABEL} crossing`}
                  >
                    <PlayIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
                <button
                  onClick={handleClear}
                  className="text-gray-600 hover:text-red-400 transition-colors p-1 min-h-[30px] flex items-center rounded cursor-pointer"
                  aria-label={`Clear timing for team ${teamNumber}`}
                >
                  <XMarkIcon className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Slider */}
        <div className="mb-1.5">
          <input
            type="range" min={0} max={20} step={0.05}
            value={isSet ? timing.timeToMiddle! : matchRelativeTime}
            onChange={handleSlider}
            className={`w-full cursor-pointer ${isSet ? 'accent-green-500' : 'accent-gray-500'}`}
            style={{ touchAction: 'none' }}
            aria-label={`Drag to set time for team ${teamNumber}`}
          />
          <div className="flex justify-between text-[10px] text-gray-700 -mt-1">
            <span>0s</span><span>10s</span><span>20s</span>
          </div>
        </div>

        {/* Row 3: DNA */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleDna}
            className="w-full text-gray-600 hover:text-gray-300 border border-white/8 hover:border-white/20 text-[10px] font-bold px-2 py-1.5 rounded-lg transition-colors min-h-[32px] cursor-pointer tracking-wide"
            aria-label={`Mark team ${teamNumber} as did not arrive at center`}
          >
            DNA
          </button>
        </div>
      </div>
    );
  }

  // ── Default mode: full card ──────────────────────────────────────────────
  return (
    <div className={`px-3 py-2.5 transition-colors ${cardBg}`}>
      {/* Row 1: Team identity + time */}
      <div className="flex items-center justify-between mb-1.5">
        <div className={`flex items-center gap-1 ${allianceColor}`}>
          <span className="font-bold text-white text-sm">{teamNumber}</span>
          <span className="text-xs text-gray-500">#{index + 1}</span>
          <MethodBadge method={timing.analysisMethod} confidence={timing.confidence} />
          {tbaTowerConfirmed && (
            <CheckCircleIcon className="w-3 h-3 text-green-400" aria-label="TBA confirms robot reached middle in auto" />
          )}
        </div>
        {isSet && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-green-400 text-base tabular-nums">
              {timing.timeToMiddle!.toFixed(2)}s
            </span>
            {onSeek && (
              <button
                onClick={handlePreview}
                className="flex items-center justify-center bg-green-900/50 hover:bg-green-800/60 text-green-300 p-1 rounded transition-colors min-w-[28px] min-h-[28px] cursor-pointer"
                aria-label={`Preview team ${teamNumber} at ${ZONE_LABEL} crossing`}
              >
                <PlayIcon className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Slider */}
      <div className="mb-1.5">
        <input
          type="range" min={0} max={20} step={0.05}
          value={isSet ? timing.timeToMiddle! : matchRelativeTime}
          onChange={handleSlider}
          className={`w-full cursor-pointer ${isSet ? 'accent-green-500' : 'accent-gray-500'}`}
          style={{ touchAction: 'none' }}
          aria-label={`Set time for team ${teamNumber}`}
        />
        <div className="flex justify-between text-xs text-gray-700">
          <span>0s</span><span>10s</span><span>20s</span>
        </div>
      </div>

      {/* Actions row */}
      {isSet && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="flex items-center text-xs text-gray-600 hover:text-gray-400 transition-colors px-1 min-h-[32px] cursor-pointer"
            aria-label={`Clear timing for team ${teamNumber}`}
          >
            <XMarkIcon className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function MethodBadge({ method, confidence }: { method: string; confidence: number | null }) {
  if (method === 'auto') {
    return (
      <span className="bg-blue-900/50 text-blue-300 text-[10px] px-1.5 py-0.5 rounded-full leading-none">
        Auto{confidence !== null ? ` ${Math.round(confidence * 100)}%` : ''}
      </span>
    );
  }
  if (method === 'manual') {
    return <span className="bg-green-900/50 text-green-300 text-[10px] px-1.5 py-0.5 rounded-full leading-none">Manual</span>;
  }
  return null;
}
