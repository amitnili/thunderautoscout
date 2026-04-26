import type { NextApiRequest, NextApiResponse } from 'next';
import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { AnalyzeVideoResponse } from '@/app/lib/types';

const anthropic = new Anthropic();

// In-memory concurrency guard: videoId → true
const inProgress = new Map<string, boolean>();

const RequestSchema = z.object({
  youtubeUrl: z.string().url(),
  teamNumbers: z.array(z.number().int().min(1).max(99999)).min(1).max(6),
  alliance: z.enum(['red', 'blue']).optional(),
});

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    return u.searchParams.get('v');
  } catch {
    return null;
  }
}

/**
 * Try several known paths for yt-dlp — Node's spawn uses a stripped PATH so
 * the binary can be missing even when it works fine in the terminal.
 */
function findYtDlp(): string | null {
  const candidates = [
    'yt-dlp',
    '/usr/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/home/nili/.local/bin/yt-dlp',
  ];
  for (const bin of candidates) {
    try {
      const r = spawnSync(bin, ['--version'], { stdio: 'pipe', timeout: 5_000 });
      if (r.status === 0) return bin;
    } catch {}
  }
  return null;
}

/** Async wrapper for child_process.spawn — lets multiple ffmpeg runs run concurrently */
function spawnAsync(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ status: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { try { proc.kill(); } catch {} reject(new Error('timeout')); }, timeoutMs);
    proc.on('close', (code) => { clearTimeout(timer); resolve({ status: code }); });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

/** Remove temp files for this videoId */
function cleanup(videoId: string) {
  for (const ext of ['mp4', 'webm', 'mkv', 'pcm']) {
    const p = `/tmp/${videoId}.${ext}`;
    try { if (existsSync(p)) rmSync(p, { force: true }); } catch {}
  }
  const rawFile = `/tmp/${videoId}_arrows.raw`;
  try { if (existsSync(rawFile)) rmSync(rawFile, { force: true }); } catch {}
  try { rmSync(`/tmp/${videoId}_vframes`, { recursive: true, force: true }); } catch {}
}

/**
 * PRIMARY T=0 detection: use Claude Vision (Haiku) to identify the two solid
 * bright-yellow filled arrow icons (◄ and ►) that appear in the bottom-left
 * and bottom-right corners of the FRC scoring overlay at exactly T=0.
 *
 * Optimized: smaller 320×180 frames, 8s window, 4 concurrent API calls per batch.
 */
async function detectT0WithVision(videoPath: string, videoId: string): Promise<number | null> {
  const framesDir = `/tmp/${videoId}_vframes`;
  const FPS = 2, SEARCH_S = 8;
  const W = 320, H = 180;  // was 640×360 — 4× less data, still enough for Claude

  try {
    mkdirSync(framesDir, { recursive: true });

    await spawnAsync('ffmpeg', [
      '-i', videoPath,
      '-t', String(SEARCH_S),
      '-vf', `fps=${FPS},scale=${W}:${H}`,
      '-q:v', '3',
      `${framesDir}/frame_%03d.jpg`,
      '-y',
    ], 30_000);

    const frameFiles = readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();
    if (frameFiles.length === 0) return null;

    const checkFrame = async (file: string, frameIdx: number): Promise<{ frameIdx: number; isYES: boolean }> => {
      const imageData = readFileSync(`${framesDir}/${file}`).toString('base64');
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageData },
            },
            {
              type: 'text',
              text: 'This is a frame from an FRC robotics competition match video. Look at the very BOTTOM EDGE of the frame — there is a dark scoring overlay bar. When the autonomous period begins (T=0), two small solid bright-yellow filled arrow icons appear in this dark overlay bar: one pointing LEFT (◄) at the bottom-LEFT corner and one pointing RIGHT (►) at the bottom-RIGHT corner. They are compact filled triangle-shaped icons on a black background, absent before match start. Are BOTH yellow arrows currently visible in the bottom overlay bar? Answer YES or NO only.',
            },
          ],
        }],
      });
      const answer = msg.content[0].type === 'text' ? msg.content[0].text.trim().toUpperCase() : '';
      const t = Math.round((frameIdx / FPS) * 10) / 10;
      console.log(`[detectT0WithVision] frame ${frameIdx} t=${t}s → ${answer}`);
      return { frameIdx, isYES: answer.startsWith('YES') };
    };

    // Process 4 frames at a time (concurrent) instead of sequentially
    const BATCH = 4;
    for (let i = 0; i < frameFiles.length; i += BATCH) {
      const batchFiles = frameFiles.slice(i, i + BATCH);
      const results = await Promise.all(
        batchFiles.map((file, j) => checkFrame(file, i + j).catch(() => ({ frameIdx: i + j, isYES: false })))
      );
      const hit = results.find(r => r.isYES);
      if (hit) {
        const t = Math.round((hit.frameIdx / FPS) * 10) / 10;
        console.log(`[detectT0WithVision] T=0 confirmed at ${t}s`);
        return t;
      }
    }

    console.log(`[detectT0WithVision] arrows not found in ${frameFiles.length} frames`);
    return null;
  } catch (e) {
    console.error('[detectT0WithVision] error:', e);
    return null;
  } finally {
    try { rmSync(framesDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * SECONDARY T=0 detection: scan frames for the two yellow arrows via pixel analysis.
 * Async version — uses spawnAsync so it can run concurrently with Vision and audio.
 */
async function detectT0FromArrowsAsync(videoPath: string, videoId: string): Promise<number | null> {
  const rawPath = `/tmp/${videoId}_arrows.raw`;
  const W = 320, H = 180, FPS = 4, SEARCH_S = 8;

  try {
    const r = await spawnAsync('ffmpeg', [
      '-i', videoPath,
      '-t', String(SEARCH_S),
      '-vf', `fps=${FPS},scale=${W}:${H}`,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      rawPath,
      '-y',
    ], 30_000);

    if (r.status !== 0 || !existsSync(rawPath)) return null;

    const data = readFileSync(rawPath);
    const FRAME_BYTES = W * H * 3;
    const numFrames = Math.floor(data.length / FRAME_BYTES);

    const Y_START        = Math.floor(H * 0.90);
    const X_LEFT_END     = Math.floor(W * 0.18);
    const X_RIGHT_START  = Math.floor(W * 0.82);
    const MIN_YELLOW = 6;

    for (let f = 0; f < numFrames; f++) {
      const base = f * FRAME_BYTES;
      let leftYellow = 0, rightYellow = 0;

      for (let y = Y_START; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const p = base + (y * W + x) * 3;
          const R = data[p], G = data[p + 1], B = data[p + 2];
          if (R > 160 && G > 120 && B < 110 && R > B + 60) {
            if (x < X_LEFT_END) leftYellow++;
            else if (x >= X_RIGHT_START) rightYellow++;
          }
        }
      }

      if (leftYellow >= MIN_YELLOW && rightYellow >= MIN_YELLOW) {
        const t = Math.round((f / FPS) * 10) / 10;
        console.log(`[detectT0FromArrows] arrows at frame ${f} = ${t}s (L=${leftYellow} R=${rightYellow})`);
        return t;
      }
    }

    console.log(`[detectT0FromArrows] arrows not found in ${numFrames} frames`);
    return null;
  } catch {
    return null;
  } finally {
    try { if (existsSync(rawPath)) rmSync(rawPath, { force: true }); } catch {}
  }
}

/**
 * Detect match start time via audio silence-valley analysis.
 * Async version — uses spawnAsync so it can run concurrently with Vision and pixel scan.
 */
async function detectBuzzerTimeAsync(videoPath: string, videoId: string): Promise<number | null> {
  const audioPath = `/tmp/${videoId}.pcm`;
  const SAMPLE_RATE = 8000;

  try {
    const r = await spawnAsync('ffmpeg', [
      '-i', videoPath,
      '-t', '8',
      '-vn',
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      '-f', 's16le',
      audioPath,
      '-y',
    ], 30_000);

    if (r.status !== 0 || !existsSync(audioPath)) return null;

    const raw = readFileSync(audioPath);
    if (raw.length < 2) return null;

    const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));

    const FRAME = Math.round(SAMPLE_RATE * 0.05);
    const HOP   = Math.round(SAMPLE_RATE * 0.01);

    const rms: number[] = [];
    for (let i = 0; i + FRAME < samples.length; i += HOP) {
      let e = 0;
      for (let j = i; j < i + FRAME; j++) e += samples[j] * samples[j];
      rms.push(Math.sqrt(e / FRAME));
    }

    const F_START = Math.round(0.5 / 0.01);
    const F_END   = Math.min(Math.round(6.0 / 0.01), rms.length - 1);

    let minRms = Infinity, maxRms = 0;
    for (let i = F_START; i <= F_END; i++) {
      if (rms[i] < minRms) minRms = rms[i];
      if (rms[i] > maxRms) maxRms = rms[i];
    }
    if (maxRms < 1) return null;

    const SILENCE_GATE = Math.max(minRms * 3, 8);
    const ACTIVE_GATE  = maxRms * 0.12;

    let bestSilenceEnd = -1;
    let bestScore = 0;
    let runStart = -1;

    for (let i = F_START; i <= F_END + 1; i++) {
      const inSilence = i <= F_END && rms[i] < SILENCE_GATE;
      if (inSilence) {
        if (runStart === -1) runStart = i;
      } else {
        if (runStart !== -1) {
          const runLen = i - runStart;
          if (runLen >= 8) {
            let activeCount = 0;
            for (let j = i; j < Math.min(i + 100, rms.length); j++) {
              if (rms[j] > ACTIVE_GATE) activeCount++;
            }
            if (activeCount >= 30 && activeCount > bestScore) {
              bestScore = activeCount;
              bestSilenceEnd = i;
            }
          }
          runStart = -1;
        }
      }
    }

    if (bestSilenceEnd !== -1) {
      const seconds = Math.round((bestSilenceEnd * 0.01) * 10) / 10;
      console.log(`[detectBuzzerTime] silence-valley → T=0 at ${seconds}s (post-activity score ${bestScore}/100)`);
      return seconds;
    }

    // Fallback: onset ratio detection
    const BG_FRAMES = Math.round(0.3 / 0.01);
    const bg: number[] = [];
    for (let i = 0; i < rms.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - BG_FRAMES); j < i; j++) { sum += rms[j]; count++; }
      bg.push(count > 0 ? sum / count : rms[i] || 1);
    }
    let maxRatio = 0;
    for (let i = F_START; i <= F_END; i++) {
      const ratio = rms[i] / (bg[i] || 1);
      if (ratio > maxRatio) maxRatio = ratio;
    }
    let buzzerFrame = F_START;
    for (let i = F_START; i <= F_END; i++) {
      if (rms[i] / (bg[i] || 1) >= maxRatio * 0.6) { buzzerFrame = i; break; }
    }
    const seconds = Math.round((buzzerFrame * 0.01) * 10) / 10;
    console.log(`[detectBuzzerTime] onset-fallback → T=0 at ${seconds}s (maxRatio ${maxRatio.toFixed(1)})`);
    return seconds;
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<AnalyzeVideoResponse>) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, results: [], error: 'Invalid request' });
  }

  const { youtubeUrl } = parsed.data;
  const videoId = extractVideoId(youtubeUrl);

  if (!videoId) {
    return res.status(400).json({ success: false, results: [], error: 'Invalid YouTube URL' });
  }

  if (inProgress.get(videoId)) {
    return res.status(409).json({ success: false, results: [], error: 'Analysis already in progress' });
  }

  const ytDlpBin = findYtDlp();
  if (!ytDlpBin) {
    console.error('[analyze-video] yt-dlp not found in any expected path');
    return res.status(200).json({ success: true, results: [], fallbackMode: true, fallbackReason: 'yt-dlp not installed' });
  }

  inProgress.set(videoId, true);

  try {
    // Download first 8 seconds — enough to capture the pre-match + buzzer (was 20s)
    const videoPath = `/tmp/${videoId}`;
    const dlResult = spawnSync(
      ytDlpBin,
      [
        '-f', 'best[height<=480]',
        '--download-sections', '*0-8',
        '--output', `${videoPath}.%(ext)s`,
        '--no-playlist',
        '--no-warnings',
        youtubeUrl,
      ],
      { timeout: 90_000 }
    );

    if (dlResult.status !== 0) {
      const stderr = dlResult.stderr?.toString() ?? '';
      console.error('[analyze-video] yt-dlp failed:', stderr.slice(0, 300));
      const reason = stderr.includes('Private video') ? 'Video is private'
        : stderr.includes('age') ? 'Age-restricted video'
        : stderr.includes('unavailable') ? 'Video unavailable'
        : `Download failed (exit ${dlResult.status})`;
      return res.status(200).json({ success: true, results: [], fallbackMode: true, fallbackReason: reason });
    }

    let actualVideoPath: string | null = null;
    for (const ext of ['mp4', 'webm', 'mkv']) {
      if (existsSync(`${videoPath}.${ext}`)) { actualVideoPath = `${videoPath}.${ext}`; break; }
    }

    if (!actualVideoPath) {
      console.error('[analyze-video] no video file found after download');
      return res.status(200).json({ success: true, results: [], fallbackMode: true, fallbackReason: 'Video file not found after download' });
    }

    // ── Run all three detection stages in parallel ──────────────────────────
    // Vision (primary — semantic, most accurate), Pixel (fast, no API cost),
    // Audio (fallback — catches cases where overlay is absent/different).
    // All three run concurrently; we prefer Vision > Pixel > Audio.
    const [visionR, pixelR, audioR] = await Promise.allSettled([
      detectT0WithVision(actualVideoPath, videoId),
      detectT0FromArrowsAsync(actualVideoPath, videoId),
      detectBuzzerTimeAsync(actualVideoPath, videoId),
    ]);

    const vision = visionR.status === 'fulfilled' ? visionR.value : null;
    const pixel  = pixelR.status  === 'fulfilled' ? pixelR.value  : null;
    const audio  = audioR.status  === 'fulfilled' ? audioR.value  : null;

    const matchStartSeconds = vision ?? pixel ?? audio;
    const detectionMethod   = vision !== null ? 'vision' : pixel !== null ? 'pixel' : audio !== null ? 'audio' : 'none';

    if (matchStartSeconds === null) {
      console.warn('[analyze-video] all detection methods failed for', videoId);
      return res.status(200).json({
        success: true, results: [], fallbackMode: true,
        fallbackReason: 'Could not detect T=0 — use manual Set T=0',
      });
    }

    console.log(`[analyze-video] ${videoId}: T=0=${matchStartSeconds}s via ${detectionMethod}`);

    return res.status(200).json({
      success: true,
      results: [],
      matchStartSeconds,
    });
  } finally {
    cleanup(videoId);
    inProgress.delete(videoId);
  }
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' }, responseLimit: false } };
