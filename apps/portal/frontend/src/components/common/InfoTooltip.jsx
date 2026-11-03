import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function InfoTooltip({ description, label, className = '', iconSize = 10, icon, descriptionId: providedId, closeSignal, onOpen, onClick, align = 'start', compact = false }) {
  const generatedId = useId();
  const descriptionId = providedId ?? generatedId;
  const tooltip = useRef(null);
  const anchor = useRef(null);
  const focused = useRef(false);
  const hovered = useRef(false);
  const [position, setPosition] = useState(null);

  const show = (target) => {
    anchor.current = target;
    onOpen?.();
    const bounds = target.getBoundingClientRect();
    const above = bounds.top >= 110;
    setPosition({
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - 264)),
      top: above ? bounds.top : bounds.bottom,
      above,
    });
  };

  useLayoutEffect(() => {
    if (!position || !tooltip.current?.getBoundingClientRect || !window.innerHeight) return;
    const { width, height } = tooltip.current.getBoundingClientRect();
    const bounds = anchor.current.getBoundingClientRect();
    const desiredLeft = align === 'center' ? bounds.left + bounds.width / 2 - width / 2 : bounds.left;
    const left = Math.max(8, Math.min(desiredLeft, window.innerWidth - width - 8));
    const above = bounds.top >= height + 8 || bounds.top > window.innerHeight - bounds.bottom;
    const top = above
      ? Math.max(height + 8, bounds.top)
      : Math.min(bounds.bottom, window.innerHeight - height - 8);
    if (position.left !== left || position.top !== top || position.above !== above) setPosition({ left, top, above });
  }, [position, description, align]);

  useEffect(() => {
    if (!position) return undefined;
    const close = () => setPosition(null);
    const escape = (event) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', escape);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [position]);

  useEffect(() => { setPosition(null); }, [closeSignal]);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-describedby={descriptionId}
        className={`flex items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 ${className}`}
        onMouseEnter={(event) => { hovered.current = true; show(event.currentTarget); }}
        onMouseLeave={(event) => {
          hovered.current = false;
          const enteringTooltip = event.relatedTarget?.nodeType && tooltip.current?.contains(event.relatedTarget);
          if (!focused.current && !enteringTooltip) setPosition(null);
        }}
        onFocus={(event) => { focused.current = true; show(event.currentTarget); }}
        onBlur={() => { focused.current = false; if (!hovered.current) setPosition(null); }}
        onClick={(event) => {
          event.stopPropagation();
          if (onClick) onClick(event);
          else show(event.currentTarget);
        }}
      >
        {icon ?? <svg aria-hidden="true" width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 9v5m0-8v.5" strokeLinecap="round" />
        </svg>}
      </button>
      {position ? createPortal(
        <div
          ref={tooltip}
          className={`fixed z-[100] ${compact ? 'w-max' : 'w-64'} ${position.above ? '-translate-y-full pb-2' : 'pt-2'}`}
          style={{ left: position.left, top: position.top, maxWidth: 'calc(100vw - 16px)' }}
          onClick={(event) => event.stopPropagation()}
          onMouseLeave={() => { if (!focused.current) setPosition(null); }}
        >
          <div id={descriptionId} role="tooltip" className={`max-h-[calc(100vh-2rem)] overflow-y-auto rounded-sm bg-ink-700 px-3 py-2 ${align === 'center' ? 'text-center' : 'text-left'} text-xs font-normal leading-relaxed text-white shadow-lg`}>
            {description}
          </div>
        </div>, document.body
      ) : <span id={descriptionId} className="sr-only">{description}</span>}
    </>
  );
}
