// =====================================================================
// movies.ts — what's showing at 🎬 Union Square Pictures (Peter,
// 2026-10-28: "we will play yt videos on a screen").
//
// Each film is a YouTube video id, played in YouTube's own embedded
// player (youtube-nocookie.com), so YouTube handles rights and ads.
// The starting lineup is the Blender Studio open movies (Creative
// Commons). Swap or add ids here; players can also paste any YouTube
// link at the box office.
// =====================================================================

export interface Movie {
  id: string;
  /** The YouTube video id (the part after watch?v=). */
  yt: string;
  title: string;
  emoji: string;
  genre: string;
  minutes: number;
  blurb: string;
}

/** The ticket price for one showing, in cents. */
export const TICKET_PRICE = 1_500;

export const MOVIES: Movie[] = [
  { id: 'bunny', yt: 'aqz-KE-bpKQ', title: 'Big Buck Bunny', emoji: '🐰', genre: 'Comedy', minutes: 10, blurb: 'A big, gentle rabbit takes revenge on three bullies. Family friendly, mostly.' },
  { id: 'sintel', yt: 'eRsGyueVLvQ', title: 'Sintel', emoji: '🐉', genre: 'Fantasy', minutes: 15, blurb: 'A girl searches the world for the baby dragon she raised. Bring tissues.' },
  { id: 'steel', yt: 'R6MlUcmOul8', title: 'Tears of Steel', emoji: '🤖', genre: 'Sci-fi', minutes: 12, blurb: 'Scientists in Amsterdam try to save the world from robots by fixing a breakup.' },
  { id: 'spring', yt: 'WhWc3b3KhnY', title: 'Spring', emoji: '🌱', genre: 'Drama', minutes: 8, blurb: 'A shepherd girl and her dog face ancient spirits to bring back spring.' },
];

/** The video id from a YouTube link or a bare id (null if it isn't one). */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** The embed address for an id (privacy-enhanced mode, plays inline on phones). */
export const embedUrl = (yt: string): string => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
