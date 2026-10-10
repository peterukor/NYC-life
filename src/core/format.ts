// =====================================================================
// format.ts — turning numbers into friendly text.
// =====================================================================

/** 129050 cents -> "$1,290.50"; whole dollars drop the ".00". */
export function money(cents: number, opts: { compact?: boolean; sign?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  let body: string;
  if (opts.compact && abs >= 100_000_000) body = `$${trim(abs / 100_000_000)}M`;
  else if (opts.compact && abs >= 100_000) body = `$${trim(abs / 100_000)}k`;
  else {
    const dollars = Math.floor(abs / 100);
    const c = abs % 100;
    body = `$${dollars.toLocaleString('en-US')}${c ? '.' + String(c).padStart(2, '0') : ''}`;
  }
  if (negative) return `−${body}`;
  return opts.sign ? `+${body}` : body;
}

function trim(n: number): string {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, '');
}

/** Clamp a value into a range. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Escape text before putting it into HTML (players' names, etc.). */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
