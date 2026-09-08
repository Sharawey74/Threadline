import { describe, expect, it, vi } from 'vitest';

import { CONTRACT, CONTRACT_LIMIT, ipc, resetIPC, setIPC } from './index';
import { MockIPC } from './mock';

// The contract is the boundary. These tests hold it to the shape Build-Plan
// §4.1 froze, and hold the mock to behaving like the bridge it stands in for.

describe('the frozen contract', () => {
  it('is 7 queries and 5 commands', () => {
    expect(CONTRACT.queries).toHaveLength(7);
    expect(CONTRACT.commands).toHaveLength(5);
  });

  it('stays under the C2 ceiling', () => {
    const total = CONTRACT.queries.length + CONTRACT.commands.length;
    expect(total).toBe(12);
    // C2 is a tripwire, and a tripwire nobody checks is decoration. Adding a
    // thirteenth command is the moment to ask whether the frontend is reaching
    // for something the backend should be deciding.
    expect(total).toBeLessThan(CONTRACT_LIMIT);
  });

  it('declares exactly the three Go-pushed events', () => {
    expect([...CONTRACT.events]).toEqual([
      'plan:changed',
      'session:tick',
      'reconcile:drift',
    ]);
  });

  it('is implemented in full by the mock', () => {
    const mock = new MockIPC() as unknown as Record<string, unknown>;
    for (const name of [...CONTRACT.queries, ...CONTRACT.commands]) {
      expect(typeof mock[name], `${name} is missing from MockIPC`).toBe('function');
    }
  });
});

describe('installation', () => {
  it('throws when the bridge was never installed', () => {
    resetIPC();
    // A component silently rendering an empty state because the IPC was never
    // installed would hide a startup bug. Failing loudly is the point.
    expect(() => ipc()).toThrow(/not installed/);
  });

  it('throws when something installs undefined', () => {
    // A stricter case than "never installed": the guard must catch a bad
    // install too, not just a missing one.
    setIPC(undefined as never);
    expect(() => ipc()).toThrow(/not installed/);
  });

  it('returns the installed implementation', () => {
    const mock = new MockIPC();
    setIPC(mock);
    expect(ipc()).toBe(mock);
  });
});

describe('the mock behaves like the bridge', () => {
  it('reflects a tick in the next getPlan', async () => {
    const mock = new MockIPC();
    const before = await mock.getPlan();
    const target = before.items.find((i) => !i.checked);
    expect(target).toBeDefined();

    await mock.tickItem(target!.anchor, true);

    const after = await mock.getPlan();
    expect(after.items.find((i) => i.anchor === target!.anchor)?.checked).toBe(true);
  });

  it('rejects an unknown anchor instead of writing anyway', async () => {
    const mock = new MockIPC();
    await expect(mock.tickItem('0000000000000000', true)).rejects.toThrow(/no item/);
  });

  it('emits plan:changed when an item is ticked', async () => {
    const mock = new MockIPC();
    const handler = vi.fn();
    mock.on('plan:changed', handler);

    const plan = await mock.getPlan();
    await mock.tickItem(plan.items[0].anchor, true);

    expect(handler).toHaveBeenCalledOnce();
  });

  it('stops calling a handler after it unsubscribes', async () => {
    const mock = new MockIPC();
    const handler = vi.fn();
    const off = mock.on('plan:changed', handler);
    off();

    const plan = await mock.getPlan();
    await mock.tickItem(plan.items[0].anchor, true);

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not let a caller mutate its state through a returned object', async () => {
    const mock = new MockIPC();
    const first = await mock.getPlan();
    first.items[0].text = 'mutated by the caller';

    const second = await mock.getPlan();
    expect(second.items[0].text).not.toBe('mutated by the caller');
  });

  it('remembers a saved position and reports none before one is saved', async () => {
    const mock = new MockIPC();
    expect((await mock.getPosition(1)).page).toBeNull();

    await mock.savePosition(1, 41);
    expect((await mock.getPosition(1)).page).toBe(41);
  });
});

describe('the fixture carries the awkward cases', () => {
  it('includes an item with no hours, distinct from zero hours', async () => {
    const { items } = await new MockIPC().getPlan();
    const none = items.find((i) => i.hoursConf === 'none');

    expect(none, 'fixture has no item without hours').toBeDefined();
    // "not stated" and "0h" must be distinguishable, or the UI cannot render
    // them differently and the budget silently loses time.
    expect(none!.hours).toBe(0);
    expect(none!.hoursConf).not.toBe('high');
  });

  it('includes a low-confidence figure that must not be shown as fact', async () => {
    const { items } = await new MockIPC().getPlan();
    const low = items.find((i) => i.hoursConf === 'low');

    expect(low, 'fixture has no low-confidence item').toBeDefined();
    expect(low!.notes.length).toBeGreaterThan(0);
  });

  it('includes a failing reconciliation check with an explanation', async () => {
    const checks = await new MockIPC().getReconciliation();
    const failing = checks.find((c) => !c.passed);

    expect(failing, 'fixture has no failing check - drift would never be seen').toBeDefined();
    expect(failing!.detail).not.toBe('');
  });

  it('includes an unmeasured budget period', async () => {
    const budget = await new MockIPC().getBudgetStatus();
    const unmeasured = budget.periods.find((p) => !p.measured);

    expect(unmeasured, 'fixture has no unmeasured period').toBeDefined();
    // Null, not zero. A period nobody recorded is not a period of no work.
    expect(unmeasured!.spentHours).toBeNull();
  });
});
