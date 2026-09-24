import { sortArtifacts, getPriority } from './sort';

it('should define priority based on name', () => {
  expect(getPriority({})).toBe(4);
  expect(getPriority({ name: 'private/file.log' })).toBe(4);
  expect(getPriority({ name: 'public/file.log' })).toBe(3);
  expect(getPriority({ name: 'public/live_backing.log' })).toBe(2);
  expect(getPriority({ name: 'public/live.log' })).toBe(1);
});

it('should sort by name with priority', () => {
  const unsortedArtifacts = [
    { name: 'private/b.out' },
    { name: 'private/a.out' },
    { name: 'public/live.log' },
    { name: 'private/coverage.json' },
    { name: 'public/live_backing.log' },
  ];
  const sorted = sortArtifacts(unsortedArtifacts);

  expect(sorted.map(({ name }) => name)).toEqual([
    'public/live.log',
    'public/live_backing.log',
    'private/a.out',
    'private/b.out',
    'private/coverage.json',
  ]);
});
