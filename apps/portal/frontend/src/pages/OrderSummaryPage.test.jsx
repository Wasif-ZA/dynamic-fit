import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import * as api from '../api/client.js';
import OrderSummaryPage from './OrderSummaryPage.jsx';
import OrderEditPage from './OrderEditPage.jsx';

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: vi.fn(),
  useNavigate: () => vi.fn(),
}));
vi.mock('../context/AppContext.jsx', () => ({ useApp: vi.fn() }));
vi.mock('../api/client.js', () => ({
  getOrder: vi.fn(),
  getSolution: vi.fn(),
  getSolutionSummary: vi.fn(),
  getVisualizerHandoff: vi.fn(),
  finaliseOrder: vi.fn(),
  solveOrder: vi.fn(),
  submitOrder: vi.fn(),
  archiveOrder: vi.fn(),
  holdOrder: vi.fn(),
  resumeOrder: vi.fn(),
  deleteOrder: vi.fn(),
  visualiserUrl: vi.fn(),
}));

const ITEM = {
  ItemCode: 'SMALL', ItemReference: 'Small test',
  Width: 100, Length: 100, Depth: 100, Weight: 1, Quantity: 1,
};
const rejectedItem = {
  item_ref: 'TOO-BIG', reason_code: 'NO_FITTING_CARTON', message: 'Too large for any box',
};
const order = (status = 'OPTIMISED', rejectedCount = 3, id = 'ORD-001') => ({
  OrderId: id, Reference: `Test ${id}`, Status: status, RejectedCount: rejectedCount,
  CreatedAt: '2026-10-20T00:00:00Z', Items: [ITEM],
});
const solution = (rejectedCount = 3) => ({
  solution_id: `solution-${rejectedCount}`,
  solver: { elapsed_ms: 1250 },
  metrics: { fill_rate: 0.5 },
  rejects: Array.from({ length: rejectedCount }, () => ({ ...rejectedItem })),
  cartons: [{
    carton_id: 'c1', sku: 'CUBE', inner_dims: [200, 200, 200],
    contents_mass: 1000, fill_rate: 0.5,
    placements: [{
      placement_id: 'p1', item_ref: 'SMALL', label: 'Small test',
      dims: [100, 100, 100], position: [0, 0, 0], mass: 1000, sequence: 0, orientation: 0,
    }],
  }],
});
const summary = (rejectedCount = 3) => ({
  BoxCount: 1, ItemsPacked: 1, FillRate: 0.5,
  SolveTimeMs: 1250,
  Rejected: Array.from({ length: rejectedCount }, () => ({
    ItemCode: 'TOO-BIG', Reason: 'NO_FITTING_CARTON', Detail: rejectedItem.message,
  })),
  InventoryFeasibility: { Sufficient: true, Requirements: [] },
});

let page;
let focusListeners;
let refreshOrders;

function text(node) {
  return node.children.map((child) => typeof child === 'string' ? child : text(child)).join('');
}

function buttons(label) {
  return page.root.findAllByType('button').filter((button) => text(button) === label);
}

function executionTime() {
  const label = page.root.findAllByType('p').find((node) => text(node) === 'Execution time');
  return label ? text(label.parent.findAllByType('p')[1]) : null;
}

function expectStatus(label) {
  const badge = page.root.findAllByType('span').find((span) => text(span) === label);
  expect(badge).toBeDefined();
  if (label === 'Rejected') expect(badge.props.className).toContain('text-red-700');
  else expect(badge.props.className).not.toContain('red');
}

async function mount() {
  await act(async () => { page = create(<OrderSummaryPage />); });
}

async function reoptimise() {
  await act(async () => { buttons('Re-optimise')[0].props.onClick(); });
  await act(async () => { buttons('Re-optimise').at(-1).props.onClick(); });
}

async function focus() {
  await act(async () => {
    await Promise.all([...focusListeners].map((listener) => listener()));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  focusListeners = new Set();
  vi.stubGlobal('window', {
    addEventListener: (event, listener) => { if (event === 'focus') focusListeners.add(listener); },
    removeEventListener: (event, listener) => { if (event === 'focus') focusListeners.delete(listener); },
  });
  refreshOrders = vi.fn().mockResolvedValue(undefined);
  useApp.mockReturnValue({ identity: { role: 'ADMINISTRATOR' }, refreshOrders });
  useParams.mockReturnValue({ id: 'ORD-001' });
  api.getOrder.mockResolvedValue(order());
  api.getSolution.mockResolvedValue(solution());
  api.getSolutionSummary.mockResolvedValue(summary());
});

afterEach(() => {
  if (page) act(() => page.unmount());
  page = null;
  vi.unstubAllGlobals();
});

describe('order rejection display and recovery', () => {
  it('shows handling warnings for a heavy packed box without rejecting or blocking the order', async () => {
    useApp.mockReturnValue({ identity: { role: 'SUPERVISOR' }, refreshOrders, handlingSettings: { WarningThresholdKg: 20 } });
    api.getOrder.mockResolvedValue({ ...order('OPTIMISED', 0), Items: [{ ...ITEM, Weight: 19.8 }] });
    const packed = solution(0);
    packed.cartons[0].contents_mass = 19800;
    packed.cartons[0].tare_mass = 200;
    api.getSolution.mockResolvedValue(packed);
    api.getSolutionSummary.mockResolvedValue(summary(0));
    await mount();
    expectStatus('Optimised');
    expect(text(page.root.findByProps({ 'aria-label': 'Heavy order' }))).toContain('Weight threshold reached.');
    expect(text(page.root.findByProps({ 'aria-label': 'Packed box handling warnings' }))).toContain('20 kg');
    expect(buttons('Finalise Order')[0].props.disabled).toBe(false);
    useApp.mockReturnValue({ identity: { role: 'SUPERVISOR' }, refreshOrders, handlingSettings: { WarningThresholdKg: 25 } });
    act(() => page.update(<OrderSummaryPage />));
    expect(page.root.findAllByProps({ 'aria-label': 'Packed box handling warnings' })).toHaveLength(0);
    expect(page.root.findAllByProps({ 'aria-label': 'Heavy order' })).toHaveLength(0);
  });

  it.each(['USER', 'SUPERVISOR', 'ADMINISTRATOR'])('shows rejection status to a %s', async (role) => {
    useApp.mockReturnValue({ identity: { role }, refreshOrders });
    await mount();

    expectStatus('Rejected');
    expect(buttons('Re-optimise')).toHaveLength(role === 'USER' ? 0 : 1);
  });

  it.each([1, 3])('shows red Rejected and blocks finalisation for %i rejected units', async (count) => {
    api.getOrder.mockResolvedValue(order('OPTIMISED', count));
    api.getSolution.mockResolvedValue(solution(count));
    api.getSolutionSummary.mockResolvedValue(summary(count));
    await mount();

    expectStatus('Rejected');
    expect(buttons('Finalise Order')[0].props.disabled).toBe(true);
    expect(text(page.root)).toContain(`${count} ${count === 1 ? 'item was' : 'items were'} not packed`);
    expect(text(page.root)).toContain('Items not packed');
  });

  it('keeps ordinary successful orders Optimised and eligible for finalisation', async () => {
    api.getOrder.mockResolvedValue(order('OPTIMISED', 0));
    api.getSolution.mockResolvedValue(solution(0));
    api.getSolutionSummary.mockResolvedValue(summary(0));
    await mount();

    expectStatus('Optimised');
    expect(buttons('Finalise Order')[0].props.disabled).toBe(false);
    expect(text(page.root)).not.toContain('Items not packed');
  });

  it.each(['summary', 'solution', 'both'])('keeps the saved rejection status if %s details cannot load', async (failed) => {
    if (failed !== 'solution') api.getSolutionSummary.mockRejectedValue(new Error('Summary unavailable'));
    if (failed !== 'summary') api.getSolution.mockRejectedValue(new Error('Solution unavailable'));
    await mount();

    expectStatus('Rejected');
    expect(buttons('Finalise Order')[0].props.disabled).toBe(true);
    expect(text(page.root)).toContain('Some optimisation details could not be loaded');
  });

  it('uses the saved solve response even when the follow-up summary request fails', async () => {
    api.getOrder.mockResolvedValue(order('AWAITING_OPTIMISATION', 0));
    api.solveOrder.mockResolvedValue(solution());
    api.getSolutionSummary.mockRejectedValue(new Error('Summary unavailable'));
    await mount();

    await act(async () => { await buttons('Run Optimisation')[0].props.onClick(); });

    expectStatus('Rejected');
    expect(buttons('Finalise Order')[0].props.disabled).toBe(true);
    expect(text(page.root)).toContain('Items not packed');
    expect(text(page.root)).toContain('Summary unavailable');
    expect(refreshOrders).toHaveBeenCalled();
  });

  it('clears rejection indicators after a successful re-optimisation', async () => {
    await mount();
    api.solveOrder.mockResolvedValue(solution(0));
    api.getSolutionSummary.mockResolvedValue(summary(0));

    await reoptimise();

    expectStatus('Optimised');
    expect(buttons('Finalise Order')[0].props.disabled).toBe(false);
    expect(text(page.root)).not.toContain('Items not packed');
    expect(text(page.root)).toContain('Re-optimisation completed');
  });

  it('changes a previously successful order to Rejected without a success banner', async () => {
    api.getOrder.mockResolvedValue(order('OPTIMISED', 0));
    api.getSolution.mockResolvedValue(solution(0));
    api.getSolutionSummary.mockResolvedValue(summary(0));
    await mount();
    api.solveOrder.mockResolvedValue(solution(2));
    api.getSolutionSummary.mockResolvedValue(summary(2));

    await reoptimise();

    expectStatus('Rejected');
    expect(buttons('Finalise Order')[0].props.disabled).toBe(true);
    expect(text(page.root)).not.toContain('Re-optimisation completed');
  });

  it('keeps the last saved rejection result if re-optimisation fails', async () => {
    await mount();
    api.solveOrder.mockRejectedValue(new Error('Solver unavailable'));

    await reoptimise();

    expectStatus('Rejected');
    expect(text(page.root)).toContain('Solver unavailable');
    expect(text(page.root)).toContain('Items not packed');
  });

  it('refreshes the badge and rejection details together on returning to the tab', async () => {
    await mount();
    api.getOrder.mockResolvedValue(order('OPTIMISED', 0));
    api.getSolution.mockResolvedValue(solution(0));
    api.getSolutionSummary.mockResolvedValue(summary(0));

    await focus();

    expectStatus('Optimised');
    expect(text(page.root)).not.toContain('Items not packed');
    expect(refreshOrders).toHaveBeenCalled();
  });

  it('removes old rejection details if another session edits the order back to Draft', async () => {
    await mount();
    api.getOrder.mockResolvedValue(order('DRAFT', 0));

    await focus();

    expectStatus('Draft');
    expect(text(page.root)).not.toContain('Items not packed');
    expect(text(page.root)).not.toContain('Optimisation result');
  });

  it('does not replace the current order with a late response for a previous order', async () => {
    let finishOldLoad;
    api.getOrder.mockImplementation((id) => id === 'ORD-001'
      ? new Promise((resolve) => { finishOldLoad = resolve; })
      : Promise.resolve(order('DRAFT', 0, id)));
    await mount();
    useParams.mockReturnValue({ id: 'ORD-002' });
    await act(async () => { page.update(<OrderSummaryPage />); });

    await act(async () => { finishOldLoad(order()); });

    expectStatus('Draft');
    expect(text(page.root)).toContain('Test ORD-002');
    expect(text(page.root)).not.toContain('Test ORD-001');
  });

  it('does not apply an old optimisation response after navigating to a different order', async () => {
    await mount();
    let finishSolve;
    api.solveOrder.mockReturnValue(new Promise((resolve) => { finishSolve = resolve; }));
    await reoptimise();
    useParams.mockReturnValue({ id: 'ORD-002' });
    api.getOrder.mockResolvedValue(order('DRAFT', 0, 'ORD-002'));
    await act(async () => { page.update(<OrderSummaryPage />); });

    await act(async () => { finishSolve(solution(2)); });

    expectStatus('Draft');
    expect(text(page.root)).toContain('Test ORD-002');
    expect(text(page.root)).not.toContain('Items not packed');
    expect(text(page.root)).not.toContain('Optimisation result');
    expect(buttons('Run Optimisation')[0].props.disabled).toBe(false);
  });
});

describe('direct draft optimisation', () => {
  it.each(['SUPERVISOR', 'ADMINISTRATOR'])('lets a %s optimise a draft without submitting it', async (role) => {
    useApp.mockReturnValue({ identity: { role }, refreshOrders });
    api.getOrder.mockResolvedValue(order('DRAFT', 0));
    api.solveOrder.mockResolvedValue(solution(0));
    api.getSolutionSummary.mockResolvedValue(summary(0));
    await mount();

    expectStatus('Draft');
    expect(buttons('Submit for Optimisation')).toHaveLength(0);
    expect(buttons('Finalise Order')).toHaveLength(0);
    await act(async () => { await buttons('Run Optimisation')[0].props.onClick(); });

    expect(api.solveOrder).toHaveBeenCalledTimes(1);
    expect(api.solveOrder).toHaveBeenCalledWith('ORD-001');
    expect(api.submitOrder).not.toHaveBeenCalled();
    expect(api.finaliseOrder).not.toHaveBeenCalled();
    expectStatus('Optimised');
    expect(buttons('Re-optimise')).toHaveLength(1);
    expect(buttons('Finalise Order')[0].props.disabled).toBe(false);
  });

  it('keeps the Submit for Optimisation workflow for a regular User', async () => {
    useApp.mockReturnValue({ identity: { role: 'USER' }, refreshOrders });
    api.getOrder.mockResolvedValue(order('DRAFT', 0));
    api.submitOrder.mockResolvedValue(order('AWAITING_OPTIMISATION', 0));
    await mount();

    expect(buttons('Run Optimisation')).toHaveLength(0);
    await act(async () => { await buttons('Submit for Optimisation')[0].props.onClick(); });

    expect(api.submitOrder).toHaveBeenCalledTimes(1);
    expect(api.submitOrder).toHaveBeenCalledWith('ORD-001');
    expect(api.solveOrder).not.toHaveBeenCalled();
    expectStatus('Awaiting Optimisation');
    expect(buttons('Run Optimisation')).toHaveLength(0);
    expect(text(page.root)).toContain('waiting for a Supervisor');
  });

  it.each(['SUPERVISOR', 'ADMINISTRATOR'])('preserves the draft and offers retry if a %s optimisation fails', async (role) => {
    useApp.mockReturnValue({ identity: { role }, refreshOrders });
    api.getOrder.mockResolvedValue(order('DRAFT', 0));
    api.solveOrder.mockRejectedValue(new Error('Solver unavailable'));
    await mount();

    await act(async () => { await buttons('Run Optimisation')[0].props.onClick(); });

    expectStatus('Draft');
    expect(text(page.root)).toContain('Solver unavailable');
    expect(buttons('Run Optimisation')[0].props.disabled).toBe(false);
    expect(buttons('Finalise Order')).toHaveLength(0);
    expect(api.submitOrder).not.toHaveBeenCalled();
    expect(api.finaliseOrder).not.toHaveBeenCalled();
  });

  it('disables draft actions while optimisation is pending', async () => {
    api.getOrder.mockResolvedValue(order('DRAFT', 0));
    let finishSolve;
    api.solveOrder.mockReturnValue(new Promise((resolve) => { finishSolve = resolve; }));
    api.getSolutionSummary.mockResolvedValue(summary(0));
    await mount();

    await act(async () => { buttons('Run Optimisation')[0].props.onClick(); });

    expect(buttons('Running...')[0].props.disabled).toBe(true);
    expect(buttons('Edit order')[0].props.disabled).toBe(true);
    expectStatus('Draft');
    await act(async () => { finishSolve(solution(0)); });
    expectStatus('Optimised');
  });

  it('shows Rejected if direct draft optimisation cannot pack every item', async () => {
    api.getOrder.mockResolvedValue(order('DRAFT', 0));
    api.solveOrder.mockResolvedValue(solution(2));
    api.getSolutionSummary.mockResolvedValue(summary(2));
    await mount();

    await act(async () => { await buttons('Run Optimisation')[0].props.onClick(); });

    expectStatus('Rejected');
    expect(buttons('Finalise Order')[0].props.disabled).toBe(true);
    expect(text(page.root)).toContain('2 items were not packed');
  });
});

describe('optimisation execution time', () => {
  it.each(['USER', 'SUPERVISOR', 'ADMINISTRATOR'])('shows saved Solver time for a %s', async (role) => {
    useApp.mockReturnValue({ identity: { role }, refreshOrders });
    await mount();

    expect(executionTime()).toBe('1.25 s');
  });

  it('updates the execution time after re-optimisation', async () => {
    await mount();
    expect(executionTime()).toBe('1.25 s');
    api.solveOrder.mockResolvedValue({ ...solution(0), solver: { elapsed_ms: 65400 } });
    api.getSolutionSummary.mockResolvedValue({ ...summary(0), SolveTimeMs: 65400 });

    await reoptimise();

    expect(executionTime()).toBe('1 min 5 s');
  });

  it('uses the latest Solver time when the follow-up summary cannot load', async () => {
    await mount();
    api.solveOrder.mockResolvedValue({ ...solution(0), solver: { elapsed_ms: 42 } });
    api.getSolutionSummary.mockRejectedValue(new Error('Summary unavailable'));

    await reoptimise();

    expect(executionTime()).toBe('42 ms');
  });

  it('uses the summary time if the solution document cannot load', async () => {
    api.getSolution.mockRejectedValue(new Error('Solution unavailable'));
    api.getSolutionSummary.mockResolvedValue({ ...summary(), SolveTimeMs: 2300 });

    await mount();

    expect(executionTime()).toBe('2.3 s');
  });

  it('keeps the last saved time if re-optimisation fails', async () => {
    await mount();
    api.solveOrder.mockRejectedValue(new Error('Solver unavailable'));

    await reoptimise();

    expect(executionTime()).toBe('1.25 s');
  });

  it('preserves a valid zero duration instead of replacing it with summary data', async () => {
    api.getSolution.mockResolvedValue({ ...solution(), solver: { elapsed_ms: 0 } });

    await mount();

    expect(executionTime()).toBe('<1 ms');
  });

  it('does not invent an execution time for older results without timing data', async () => {
    const savedSolution = solution();
    const savedSummary = summary();
    delete savedSolution.solver;
    delete savedSummary.SolveTimeMs;
    api.getSolution.mockResolvedValue(savedSolution);
    api.getSolutionSummary.mockResolvedValue(savedSummary);

    await mount();

    expect(executionTime()).toBe('Unavailable');
  });

  it('does not show a result time on an unsolved draft', async () => {
    api.getOrder.mockResolvedValue(order('DRAFT', 0));

    await mount();

    expect(executionTime()).toBeNull();
  });

  it('keeps execution time visible after finalisation', async () => {
    api.getOrder.mockResolvedValue(order('FINAL', 0));
    api.getSolution.mockResolvedValue(solution(0));
    api.getSolutionSummary.mockResolvedValue(summary(0));

    await mount();

    expectStatus('Finalised');
    expect(executionTime()).toBe('1.25 s');
  });
});

describe('backlog and archived order details', () => {
  it.each(['DRAFT', 'AWAITING_OPTIMISATION', 'OPTIMISED'])('keeps an on-hold %s order paused while preserving its progress', async (status) => {
    api.getOrder.mockResolvedValue({ ...order(status, status === 'OPTIMISED' ? 3 : 0), HeldAt: '2026-10-20T00:00:00Z' });
    await mount();

    expect(text(page.root)).toContain('Order on hold');
    for (const label of ['Edit order', 'Run Optimisation', 'Submit for Optimisation', 'Re-optimise', 'Finalise Order']) {
      expect(buttons(label)).toHaveLength(0);
    }
    expect(buttons('Resume')).toHaveLength(1);
    expect(buttons('Resume')[0].props.className).toContain('bg-brand-500');
    expect(page.root.findByProps({ 'aria-label': 'Actions for ORD-001' }).findAllByType('details')).toHaveLength(0);
    expect(buttons('Delete')[0].props.disabled).toBe(false);
    if (status === 'OPTIMISED') expect(executionTime()).toBe('1.25 s');
  });

  it('moves an order to backlog and resumes it with its original actions', async () => {
    api.getOrder.mockResolvedValue(order('DRAFT', 0));
    await mount();
    api.holdOrder.mockResolvedValue({ ...order('DRAFT', 0), HeldAt: '2026-10-20T00:00:00Z' });
    api.getOrder.mockResolvedValue({ ...order('DRAFT', 0), HeldAt: '2026-10-20T00:00:00Z' });

    await act(async () => { await buttons('Hold')[0].props.onClick(); });

    expect(text(page.root)).toContain('Order on hold');
    expect(buttons('Run Optimisation')).toHaveLength(0);
    api.resumeOrder.mockResolvedValue(order('DRAFT', 0));
    api.getOrder.mockResolvedValue(order('DRAFT', 0));

    await act(async () => { await buttons('Resume')[0].props.onClick(); });

    expect(buttons('Run Optimisation')[0].props.disabled).toBe(false);
    expect(refreshOrders).toHaveBeenCalled();
  });

  it('prevents editing an order on hold through its direct edit URL', async () => {
    api.getOrder.mockResolvedValue({ ...order('DRAFT', 0), HeldAt: '2026-10-20T00:00:00Z' });
    await act(async () => { page = create(<OrderEditPage />); });
    expect(text(page.root)).toContain('Resume it before editing');
    expect(page.root.findAllByType('input')).toHaveLength(0);
  });

  it('keeps archived finalised results readable with no management actions', async () => {
    api.getOrder.mockResolvedValue({ ...order('FINAL', 0), ArchivedAt: '2026-10-20T00:00:00Z' });
    await mount();
    expect(text(page.root)).toContain('archived and read-only');
    expect(executionTime()).toBe('1.25 s');
    expect(buttons('Resume')).toHaveLength(0);
    expect(buttons('Delete')).toHaveLength(0);
    expect(buttons('Archive')).toHaveLength(0);
  });
});
