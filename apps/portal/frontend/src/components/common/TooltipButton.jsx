import React, { useId, useState } from 'react';
import Button from './Button.jsx';
import InfoTooltip from './InfoTooltip.jsx';

export default function TooltipButton({ description, children, className = '', onClick, ...props }) {
  const descriptionId = useId();
  const [closeSignal, setCloseSignal] = useState(0);
  const infoColour = props.variant === 'primary'
    ? 'text-white/80 hover:text-white'
    : props.variant === 'warning'
      ? 'text-amber-700/70 hover:text-amber-900'
      : props.variant === 'danger'
        ? 'text-red-600/70 hover:text-red-700'
        : 'text-ink-400 hover:text-ink-700';

  return (
    <span className="relative inline-flex shrink-0 align-middle">
      <Button
        {...props}
        className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 focus-visible:ring-offset-2`}
        aria-describedby={descriptionId}
        onClick={(event) => { setCloseSignal((value) => value + 1); return onClick?.(event); }}
      >
        {children}
      </Button>
      <InfoTooltip
        description={description} descriptionId={descriptionId} closeSignal={closeSignal}
        label={typeof children === 'string' ? `About ${children}` : 'About this action'}
        iconSize={props.size === 'compact' ? 10 : 12}
        className={`absolute ${props.size === 'compact' ? 'right-0 top-0 h-3.5 w-3.5' : 'right-0.5 top-0.5 h-4 w-4'} ${infoColour}`}
      />
    </span>
  );
}
