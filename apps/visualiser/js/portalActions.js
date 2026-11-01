import { PORTAL_ORIGIN, resolveAllowedUrl } from './solution.js';

/* Req06: Return to Portal. Done and Cancel only appear when the page is opened with
 * ?portal=<url>, which the Portal adds for finalised orders. The destination is:
 *   1. ?portal=<url> (same origin, loopback, or the hosted Portal website)
 *   2. data-portal-url on the canvas element
 *   3. '/portal' fallback
 */
function requestedPortal() {
  return new URLSearchParams( window.location.search ).get( 'portal' );
}

function portalDestination( canvas ) {
  const fallback = canvas.dataset.portalUrl || '/portal';
  return resolveAllowedUrl( requestedPortal(), fallback, [ PORTAL_ORIGIN ] );
}

/* Inside the Portal the Visualiser is an embedded frame, so return the whole tab. */
function navigateToPortal( canvas, orderId, complete ) {
  const target = new URL( portalDestination( canvas ), window.location.href );
  target.searchParams.set( 'OrderID', orderId ?? '' );
  target.searchParams.set( 'complete', String( complete ) );
  try {
    window.top.location.href = target.href;
  } catch {
    window.location.href = target.href;
  }
}

const CONFIRM_COPY = {
  cancel: {
    title: 'Cancel this order?',
    message: 'This will mark the order as incomplete. The packing process will not be recorded as finished.',
    confirmLabel: 'Yes, cancel',
  },
  done: {
    title: 'Mark packing as done?',
    message: 'This will mark the order as complete. Make sure every item has actually been packed before continuing.',
    confirmLabel: 'Yes, done',
  },
};

export function initPortalActions( { canvas, getOrderId } ) {
  const cancelButton = document.getElementById( 'cancel-button' );
  const doneButton = document.getElementById( 'done-button' );
  const overlay = document.getElementById( 'confirm-dialog' );
  const titleEl = document.getElementById( 'confirm-title' );
  const messageEl = document.getElementById( 'confirm-message' );
  const backButton = document.getElementById( 'confirm-back' );
  const proceedButton = document.getElementById( 'confirm-proceed' );

  if ( !cancelButton || !doneButton || !overlay || !titleEl || !messageEl || !backButton || !proceedButton ) {
    return;
  }

  // Without ?portal= there is nowhere to return to, so hide Done and Cancel.
  if ( !requestedPortal() ) {
    const group = document.getElementById( 'portal-actions' );
    if ( group ) group.hidden = true;
    cancelButton.hidden = true;
    doneButton.hidden = true;
    return { setEnabled() {} };
  }

  let lastFocusedElement = null;
  let pendingComplete = null;

  function closeDialog() {
    overlay.hidden = true;
    pendingComplete = null;
    lastFocusedElement?.focus?.();
  }

  function openDialog( kind, complete ) {
    const copy = CONFIRM_COPY[ kind ];
    titleEl.textContent = copy.title;
    messageEl.textContent = copy.message;
    proceedButton.textContent = copy.confirmLabel;
    pendingComplete = complete;
    lastFocusedElement = document.activeElement;
    overlay.hidden = false;
    proceedButton.focus();
  }

  cancelButton.addEventListener( 'click', () => openDialog( 'cancel', false ) );
  doneButton.addEventListener( 'click', () => openDialog( 'done', true ) );

  backButton.addEventListener( 'click', closeDialog );

  overlay.addEventListener( 'click', ( event ) => {
    if ( event.target === overlay ) {
      closeDialog();
    }
  } );

  overlay.addEventListener( 'keydown', ( event ) => {
    if ( event.key === 'Escape' ) {
      closeDialog();
    }
  } );

  proceedButton.addEventListener( 'click', () => {
    if ( pendingComplete === null ) {
      return;
    }
    navigateToPortal( canvas, getOrderId(), pendingComplete );
  } );

  return {
    setEnabled( enabled ) {
      cancelButton.disabled = !enabled;
      doneButton.disabled = !enabled;
      if ( !enabled ) {
        closeDialog();
      }
    },
  };
}
