export function formatSolveTime(milliseconds) {
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds < 0) {
    return 'Unavailable';
  }

  if (milliseconds < 1) return '<1 ms';

  const roundedMs = Math.round(milliseconds);
  if (roundedMs < 1000) return `${roundedMs} ms`;

  const seconds = Math.round(roundedMs / 10) / 100;
  if (seconds < 60) return `${seconds} s`;

  const wholeSeconds = Math.round(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  if (minutes < 60) return `${minutes} min ${remainingSeconds} s`;

  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ${remainingSeconds} s`;
}
