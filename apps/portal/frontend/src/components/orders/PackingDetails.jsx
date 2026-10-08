import React, { useMemo } from 'react';
import { buildBoxGroupLookup, cartonBoxGroups, itemBoxGroups } from '../../lib/boxGroups.js';

export default function PackingDetails({ solution, items }) {
  const cartons = solution?.cartons ?? [];
  const boxGroupLookup = useMemo(() => buildBoxGroupLookup(items), [items]);

  return (
    <details className="mt-5 rounded-sm border border-ink-100 bg-ink-50/40">
      <summary className="cursor-pointer px-4 py-3 font-display font-semibold text-ink-700 hover:text-brand-600">
        Packing Details
        <span className="ml-2 font-sans text-xs font-normal text-ink-400">
          {cartons.length} {cartons.length === 1 ? 'box' : 'boxes'}
        </span>
      </summary>
      <div className="space-y-4 border-t border-ink-100 p-4">
        {cartons.length === 0 ? (
          <p className="text-sm text-ink-400">No boxes were packed.</p>
        ) : cartons.map((carton, index) => (
          <PackedBox
            key={carton.carton_id}
            carton={carton}
            number={index + 1}
            boxGroups={cartonBoxGroups(boxGroupLookup, carton)}
            boxGroupLookup={boxGroupLookup}
          />
        ))}

      </div>
    </details>
  );
}

export function UnpackedItems({ rejects }) {
  const groupedRejects = groupRejects(rejects ?? []);
  if (groupedRejects.length === 0) return null;

  return (
    <section
      className="mt-5 rounded-sm border border-ink-100 bg-white p-4"
      aria-labelledby="unpacked-items-title"
    >
      <h4 id="unpacked-items-title" className="font-display font-semibold text-ink-700">
        Items not packed
      </h4>
      <p className="mt-1 text-sm text-ink-500">
        FitSolver could not place the following items:
      </p>
      <ul className="mt-3 space-y-2 text-sm text-ink-600">
        {groupedRejects.map((reject) => (
          <li key={`${reject.itemRef}-${reject.reason}`}>
            <span className="font-mono font-semibold">{reject.itemRef}</span>
            {' '}× {reject.quantity} — {reject.message}
            <span className="ml-2 font-mono text-xs">({reject.reason})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PackedBox({ carton, number, boxGroups, boxGroupLookup }) {
  const items = groupPlacements(carton.placements ?? []);
  return (
    <article className="rounded-sm border border-ink-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-semibold text-ink-700">
            Box {number} — <span className="font-mono">{carton.sku}</span>
          </h4>
          <p className="mt-1 font-mono text-xs text-ink-300">{carton.carton_id}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs sm:grid-cols-5">
          <BoxFact label="Box group" value={boxGroups.length ? boxGroups.join(', ') : '—'} />
          <BoxFact label="Inner dimensions" value={`${carton.inner_dims.join(' × ')} mm`} />
          <BoxFact label="Items" value={carton.placements.length} />
          <BoxFact label="Contents weight" value={`${formatKg(carton.contents_mass)} kg`} />
          <BoxFact label="Fill rate" value={formatPercent(carton.fill_rate)} />
        </dl>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={`${item.itemRef}-${item.label}`} className="rounded-sm bg-ink-50 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <p>
                <span className="font-mono font-semibold text-ink-700">{item.itemRef}</span>
                {item.label && <span className="ml-2 text-ink-400">{item.label}</span>}
                {itemBoxGroups(boxGroupLookup, item.itemRef, item.label).map((group) => (
                  <span
                    key={group}
                    title="Box group"
                    className="ml-2 inline-block rounded-sm border border-ink-200 bg-white px-1.5 py-0.5 align-middle font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-600"
                  >
                    {group}
                  </span>
                ))}
              </p>
              <span className="font-mono font-semibold text-ink-600">× {item.placements.length}</span>
            </div>
            <details className="mt-2 text-xs text-ink-500">
              <summary className="cursor-pointer font-semibold text-brand-600">
                Placement details
              </summary>
              <ol className="mt-2 space-y-2">
                {item.placements.map((placement, index) => (
                  <li key={placement.placement_id} className="grid gap-1 border-l-2 border-ink-100 pl-3 sm:grid-cols-2">
                    <span>Packing order: {placement.sequence + 1}</span>
                    <span>Position: X {placement.position[0]}, Y {placement.position[1]}, Z {placement.position[2]} mm</span>
                    <span>Packed dimensions: {placement.dims.join(' × ')} mm</span>
                    <span>Orientation index: {placement.orientation}</span>
                    <span>Item weight: {formatKg(placement.mass)} kg</span>
                    <span>Placement {index + 1}</span>
                  </li>
                ))}
              </ol>
            </details>
          </div>
        ))}
      </div>
    </article>
  );
}

function BoxFact({ label, value }) {
  return (
    <div>
      <dt className="text-ink-300">{label}</dt>
      <dd className="font-mono font-semibold text-ink-600">{value}</dd>
    </div>
  );
}

function groupPlacements(placements) {
  const groups = new Map();
  for (const placement of placements) {
    const key = `${placement.item_ref}\u0000${placement.label ?? ''}`;
    const group = groups.get(key) ?? {
      itemRef: placement.item_ref,
      label: placement.label,
      placements: [],
    };
    group.placements.push(placement);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function groupRejects(rejects) {
  const groups = new Map();
  for (const reject of rejects) {
    const key = `${reject.item_ref}\u0000${reject.reason_code}\u0000${reject.message}`;
    const group = groups.get(key) ?? {
      itemRef: reject.item_ref,
      reason: reject.reason_code,
      message: reject.message,
      quantity: 0,
    };
    group.quantity += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

const formatKg = (grams) => Math.round((grams / 1000) * 1000) / 1000;
const formatPercent = (rate) => `${Math.round(rate * 1000) / 10}%`;
