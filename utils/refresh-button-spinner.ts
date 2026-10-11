/** Minimal button surface used by the popup refresh controls. */
export type RefreshButtonSpinnerHost = {
  disabled: boolean;
  querySelector(selectors: string): { remove(): void } | null;
  prepend(node: Node): void;
};

/**
 * Keep the refresh spinner mounted while work is in flight.
 * Rewriting button innerHTML remounts the node and restarts CSS animation —
 * noticeable when AUTH_UPDATED arrives after each marketplace during Refresh all.
 */
export function syncRefreshButtonSpinner(
  button: RefreshButtonSpinnerHost,
  spinning: boolean,
  locked: boolean,
  createSpinner: () => Node,
): void {
  button.disabled = locked;

  const existing = button.querySelector('.spinner');
  if (spinning) {
    if (!existing) {
      button.prepend(createSpinner());
    }
    return;
  }

  existing?.remove();
}

export function createRefreshSpinnerElement(): HTMLSpanElement {
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  spinner.setAttribute('aria-hidden', 'true');
  return spinner;
}
