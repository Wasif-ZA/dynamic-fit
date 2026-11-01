import { resolveAllowedUrl } from './solution.js';

/* Req06: Return to Portal. Resolves the destination the Cancel/Done buttons
 * send the user back to:
 *   1. ?portal=<url> query param (same-origin or loopback only, like ?solution=)
 *   2. data-portal-url on the canvas element
 *   3. '/portal' fallback
 */
function portalDestination( canvas ) {
  const requested = new URLSearchParams( window.location.search ).get( 'portal' );
  const fallback = canvas.dataset.portalUrl || '/portal';
  return resolveAllowedUrl( requested, fallback );
}

function navigateToPortal( canvas, orderId, complete ) {
  const target = new URL( portalDestination( canvas ), window.location.href );
  target.searchParams.set( 'OrderID', orderId ?? '' );
  target.searchParams.set( 'complete', String( complete ) );
  window.location.href = target.href;
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
