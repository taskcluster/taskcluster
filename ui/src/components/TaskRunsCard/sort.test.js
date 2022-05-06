const { sortArtifacts, getPriority } = require('./sort');

it('should define priority based on name', () => {
  expect(getPriority({})).toBe(4);
  expect(getPriority({ node: { name: 'private/file.log' } })).toBe(4);
  expect(getPriority({ node: { name: 'public/file.log' } })).toBe(3);
  expect(getPriority({ node: { name: 'public/live_backing.log' } })).toBe(2);
  expect(getPriority({ node: { name: 'public/live.log' } })).toBe(1);
});

it('should sort by node name with priority', () => {
  const unsortedArtifacts = [
    { node: { name: 'private/b.out' } },
    { node: { name: 'private/a.out' } },
    { node: { name: 'public/live.log' } },
    { node: { name: 'private/coverage.json' } },
    { node: { name: 'public/live_backing.log' } },
  ];
  const sorted = sortArtifacts(unsortedArtifacts);

  expect(sorted).toHaveLength(5);
  expect(sorted[0].node.name).toBe('public/live.log');
  expect(sorted[1].node.name).toBe('public/live_backing.log');
  expect(sorted[2].node.name).toBe('private/a.out');
  expect(sorted[3].node.name).toBe('private/b.out');
  expect(sorted[4].node.name).toBe('private/coverage.json');
});
