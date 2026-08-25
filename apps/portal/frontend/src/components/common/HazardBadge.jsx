import React from 'react';

/**
 * Renders the hazard flag as a small striped tag, matching the diagonal
 * hazard-ribbon motif used on item cards. Two sizes: "tag" (inline, for
 * tables) and "ribbon" (corner overlay, for cards - see index.css).
 */
export default function HazardBadge({ size = 'tag' }) {
  if (size === 'tag') {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-hazard/15 px-1.5 py-0.5 text-[11px] font-mono font-medium uppercase tracking-wide text-hazard-ink">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0"
          style={{
            background:
              'repeating-linear-gradient(45deg, #E8A400, #E8A400 2px, #16232E 2px, #16232E 4px)',
          }}
        />
        Hazard
      </span>
    );
  }
  return <div className="hazard-ribbon" aria-hidden />;
}
