// Box groups shown against a packing solution.
//
// Solver placements carry only item_ref (ItemCode) and label (ItemReference),
// so groups are looked up from the order's items. Items without a group can
// share a box with any group.

const itemKey = (code, reference) => `${code ?? ''}\u0000${reference ?? ''}`;

export function buildBoxGroupLookup(items = []) {
  const lookup = new Map();
  for (const item of items) {
    const key = itemKey(item.ItemCode, item.ItemReference);
    const groups = lookup.get(key) ?? new Set();
    if (typeof item.BoxGroup === 'string' && item.BoxGroup.trim()) {
      groups.add(item.BoxGroup.trim());
    }
    lookup.set(key, groups);
  }
  return lookup;
}

/** Sorted box groups for one packed item; empty when it has no group. */
export function itemBoxGroups(lookup, itemRef, label) {
  return [...(lookup.get(itemKey(itemRef, label)) ?? [])].sort();
}

/** Sorted box groups of the items packed in one box; empty when none have a group. */
export function cartonBoxGroups(lookup, carton) {
  const groups = new Set();
  for (const placement of carton.placements ?? []) {
    itemBoxGroups(lookup, placement.item_ref, placement.label)
      .forEach((group) => groups.add(group));
  }
  return [...groups].sort();
}
