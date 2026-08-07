const isSafeLogViewerArtifactName = name =>
  name.split('/').every(
    segment =>
      segment.length > 0 &&
      // history decodes %25 before rendering hrefs, which can revive %2e dot segments
      !/[%?#\\]/.test(segment) &&
      segment !== '.' &&
      segment !== '..'
  );

export const buildLogViewerUrl = ({ taskId, runId, name, isLiveLog }) => {
  if (!isSafeLogViewerArtifactName(name)) {
    return null;
  }

  const encodedName = name.split('/').map(encodeURIComponent).join('/');

  return `/tasks/${taskId}/runs/${runId}/logs/${
    isLiveLog ? 'live/' : ''
  }${encodedName}`;
};
