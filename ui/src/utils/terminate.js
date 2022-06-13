export const enableTerminate = state => {
  return ['requested', 'running'].includes(state);
};

export const terminateDisabled = (state, providerId) => {
  return (
    ['stopping', 'stopped'].includes(state) ||
    ['static', 'none'].includes(providerId)
  );
};
