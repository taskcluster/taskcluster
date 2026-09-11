/**
 * Compute weight distribution for an array of configs.
 * Formula matches WeightedRandomConfig in
 *  services/worker-manager/src/launch-config-selector.js.
 *
 * @param {Array<{ id: number, weight: number }>} configs
 * @returns {Array<{
 *  id: number, weight: number, share: number|null, workers: number|null
 * }>}
 */
export default function computeWeightDistribution(configs) {
  const totalWeight = configs.reduce((sum, c) => sum + c.weight, 0);

  return configs.map(c => {
    if (totalWeight === 0) {
      return { ...c, share: null, workers: null };
    }

    const share = (c.weight / totalWeight) * 100;
    const workers = Math.round((share / 100) * 1000);

    return { ...c, share, workers };
  });
}
