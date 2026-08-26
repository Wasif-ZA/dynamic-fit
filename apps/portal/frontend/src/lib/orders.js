export function orderTotals(items = []) {
  const units = items.reduce((sum, item) => sum + (item.Quantity || 1), 0);
  const weight = items.reduce(
    (sum, item) => sum + item.Weight * (item.Quantity || 1),
    0
  );
  const hazardCount = items.filter((item) => item.Hazardous).length;

  return { units, weight: Math.round(weight * 100) / 100, hazardCount };
}

export function formatCreated(createdAt) {
  return createdAt ? String(createdAt).slice(0, 10) : '';
}
