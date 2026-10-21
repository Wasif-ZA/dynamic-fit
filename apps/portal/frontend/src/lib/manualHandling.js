// Site-selected advisory trigger, inclusive at the configured weight.
// Weight alone cannot determine lifting safety:
// https://www.safeworkaustralia.gov.au/doc/model-code-practice-hazardous-manual-tasks
// https://www.safework.nsw.gov.au/hazards-a-z/hazardous-manual-tasks
export function needsHandlingWarning(weightKg, thresholdKg) {
  return Number.isFinite(thresholdKg) && thresholdKg > 0
    && Number.isFinite(weightKg) && weightKg > 0 && weightKg >= thresholdKg;
}

export function packedWeightKg(carton) {
  return (carton.contents_mass + (carton.tare_mass ?? 0)) / 1000;
}
