import { describe, expect, it, vi } from 'vitest';
import {
  syncRefreshButtonSpinner,
  type RefreshButtonSpinnerHost,
} from './refresh-button-spinner';

type FakeSpinner = {
  className: string;
  remove: () => void;
};

function createFakeButton(initialSpinner: FakeSpinner | null = null) {
  let spinner = initialSpinner;
  const prepend = vi.fn((node: FakeSpinner) => {
    spinner = node;
  });
  const button: RefreshButtonSpinnerHost = {
    disabled: false,
    querySelector(selector: string) {
      if (selector !== '.spinner') return null;
      return spinner;
    },
    prepend: prepend as unknown as RefreshButtonSpinnerHost['prepend'],
  };

  return {
    button,
    prepend,
    getSpinner: () => spinner,
  };
}

describe('syncRefreshButtonSpinner', () => {
  it('adds a spinner once when spinning starts', () => {
    const { button, prepend } = createFakeButton();
    const createSpinner = vi.fn(
      () =>
        ({
          className: 'spinner',
          remove: vi.fn(),
        }) as unknown as Node,
    );

    syncRefreshButtonSpinner(button, true, true, createSpinner);
    syncRefreshButtonSpinner(button, true, true, createSpinner);

    expect(createSpinner).toHaveBeenCalledTimes(1);
    expect(prepend).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
  });

  it('removes the spinner when spinning stops', () => {
    const remove = vi.fn();
    const existing: FakeSpinner = {
      className: 'spinner',
      remove,
    };
    const { button } = createFakeButton(existing);
    const createSpinner = vi.fn();

    syncRefreshButtonSpinner(button, false, false, createSpinner as () => Node);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(createSpinner).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
  });

  it('does not recreate an existing spinner while still spinning', () => {
    const remove = vi.fn();
    const existing: FakeSpinner = {
      className: 'spinner',
      remove,
    };
    const { button, prepend } = createFakeButton(existing);
    const createSpinner = vi.fn();

    syncRefreshButtonSpinner(button, true, true, createSpinner as () => Node);

    expect(createSpinner).not.toHaveBeenCalled();
    expect(prepend).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
