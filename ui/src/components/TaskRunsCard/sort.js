export const getPriority = a => {
  if (a?.node?.name?.includes('live.log')) {
    return 1;
  }

  if (a?.node?.name?.includes('live_backing.log')) {
    return 2;
  }

  return a?.node?.name?.startsWith('public/') ? 3 : 4;
};

export const sortArtifacts = artifacts => {
  return artifacts
    .map(a => ({ ...a, priority: getPriority(a) }))
    .sort((a, b) => {
      if (a.priority === b.priority) {
        return a.node?.name?.localeCompare(b.node?.name);
      }

      return a.priority - b.priority;
    });
};
