import React from 'react';

export default function InventoryFeasibilityWarning({ feasibility }) {
  const shortages = (feasibility?.Requirements ?? []).filter(
    (requirement) => !requirement.Sufficient
  );
  if (!feasibility || feasibility.Sufficient || shortages.length === 0) return null;

  return (
    <section
      className="mt-4 rounded-sm border border-red-200 bg-red-50 p-4"
      aria-labelledby="inventory-feasibility-title"
      role="status"
    >
      <h4
        id="inventory-feasibility-title"
        className="font-display font-semibold text-red-700"
      >
        Insufficient box inventory
      </h4>
      <p className="mt-1 text-sm text-red-700">
        This optimisation cannot currently be fulfilled from the available Box
        Inventory.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-red-700">
        {shortages.map((requirement) => (
          <li key={requirement.Reference}>
            <span className="font-mono font-semibold">{requirement.Reference}</span>
            {': '}
            {shortageDetail(requirement)}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-red-700">
        Update Box Inventory, or re-optimise to pack this order using the box
        types currently available, before finalising.
      </p>
    </section>
  );
}

function shortageDetail({ Required, Available, Active, Exists }) {
  const required = `${Required} required`;
  if (!Exists) return `${required} — box type no longer exists in inventory`;
  // Available is null for a box with no quantity limit.
  const available = Available == null ? 'no limit' : `${Available} available`;
  if (!Active) return `${required} / ${available} — box type is inactive`;
  return `${required} / ${available}`;
}
