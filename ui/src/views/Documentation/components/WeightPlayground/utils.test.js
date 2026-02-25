import computeWeightDistribution from './utils';

describe('computeWeightDistribution', () => {
  it('default 3-config case: weights [1.0, 0.5, 0.1]', () => {
    const configs = [
      { id: 1, weight: 1.0 },
      { id: 2, weight: 0.5 },
      { id: 3, weight: 0.1 },
    ];
    const result = computeWeightDistribution(configs);

    expect(result[0].share).toBeCloseTo(62.5);
    expect(result[1].share).toBeCloseTo(31.25);
    expect(result[2].share).toBeCloseTo(6.25);
    expect(result[0].workers).toBe(625);
    expect(result[1].workers).toBe(313);
    expect(result[2].workers).toBe(63);
  });

  it('all zeros: all share and workers are null', () => {
    const configs = [
      { id: 1, weight: 0 },
      { id: 2, weight: 0 },
    ];
    const result = computeWeightDistribution(configs);

    expect(result[0].share).toBeNull();
    expect(result[0].workers).toBeNull();
    expect(result[1].share).toBeNull();
    expect(result[1].workers).toBeNull();
  });

  it('single config: 100% share, 1000 workers', () => {
    const configs = [{ id: 1, weight: 1.0 }];
    const result = computeWeightDistribution(configs);

    expect(result[0].share).toBe(100);
    expect(result[0].workers).toBe(1000);
  });

  it('equal weights: both configs get 50% share, 500 workers', () => {
    const configs = [
      { id: 1, weight: 0.5 },
      { id: 2, weight: 0.5 },
    ];
    const result = computeWeightDistribution(configs);

    expect(result[0].share).toBe(50);
    expect(result[1].share).toBe(50);
    expect(result[0].workers).toBe(500);
    expect(result[1].workers).toBe(500);
  });
});
