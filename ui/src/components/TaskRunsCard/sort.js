export const getPriority = artifact => {
  if (artifact?.name?.includes('live.log')) {
    return 1;
  }

  if (artifact?.name?.includes('live_backing.log')) {
    return 2;
  }

  return artifact?.name?.startsWith('public/') ? 3 : 4;
};

export const sortArtifacts = artifacts => {
  return artifacts
    .map(artifact => ({ artifact, priority: getPriority(artifact) }))
    .sort((a, b) => {
      if (a.priority === b.priority) {
        return a.artifact.name?.localeCompare(b.artifact.name);
      }

      return a.priority - b.priority;
    })
    .map(({ artifact }) => artifact);
};
