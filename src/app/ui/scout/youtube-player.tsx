'use client';

import { useEffect, useRef, useCallback } from 'react';
import Script from 'next/script';

interface YouTubePlayerProps {
  videoId: string;
  onTimeUpdate: (time: number) => void;
  onReady?: () => void;
  /** Called once when the player is ready — gives parent a stable seekTo(seconds) function */
  onRegisterSeek?: (seek: (seconds: number) => void) => void;
  /** Called once when the player is ready — gives parent a stable pause() function */
  onRegisterPause?: (pause: () => void) => void;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function YouTubePlayer({ videoId, onTimeUpdate, onReady, onRegisterSeek, onRegisterPause }: YouTubePlayerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep callbacks in refs so initPlayer never needs them in its dependency array,
  // which would destroy and recreate the player on every render.
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onReadyRef = useRef(onReady);
  const onRegisterSeekRef = useRef(onRegisterSeek);
  const onRegisterPauseRef = useRef(onRegisterPause);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; });
  useEffect(() => { onReadyRef.current = onReady; });
  useEffect(() => { onRegisterSeekRef.current = onRegisterSeek; });
  useEffect(() => { onRegisterPauseRef.current = onRegisterPause; });

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      try {
        const t = playerRef.current?.getCurrentTime?.();
        if (typeof t === 'number') onTimeUpdateRef.current(t);
      } catch {}
    }, 250);
  }, []); // stable — no deps needed

  const initPlayer = useCallback(() => {
    if (!window.YT?.Player || !containerRef.current) return;
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
    }
    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId,
      playerVars: { controls: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => {
          if (!mountedRef.current) return;
          // Default to slow motion so scouts can catch precise crossing moments
          try { playerRef.current?.setPlaybackRate(0.25); } catch {}
          onReadyRef.current?.();
          startPolling();
          // Register stable seek and pause functions with the parent
          onRegisterSeekRef.current?.((seconds: number) => {
            try { playerRef.current?.seekTo(seconds, true); } catch {}
          });
          onRegisterPauseRef.current?.(() => {
            try { playerRef.current?.pauseVideo(); } catch {}
          });
        },
      },
    });
  }, [videoId, startPolling]); // only videoId causes player recreation

  useEffect(() => {
    mountedRef.current = true;
    if (window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = () => {
        if (mountedRef.current) initPlayer();
      };
    }
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      try { playerRef.current?.destroy(); } catch {}
    };
  }, [initPlayer]);

  return (
    <>
      <Script src="https://www.youtube.com/iframe_api" strategy="afterInteractive" />
      <div className="relative w-full h-full bg-black rounded-xl overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </>
  );
}
