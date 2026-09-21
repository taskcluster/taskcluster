const isSafeLogViewerArtifactName = name =>
  name.split('/').every(
    segment =>
      segment.length > 0 &&
      // history decodes %25 before rendering hrefs, which can revive %2e dot
      // segments; backslashes are normalized to slashes by the browser
      !/[%\\]/.test(segment) &&
      segment !== '.' &&
      segment !== '..'
  );

// react-router's history decodes the pathname before populating route params
// which turns '%2526' into '%26' and looses information
// so instead we read browser pathname to get raw artifact name
export const getRawArtifactName = (artifactPath, artifactName) => {
  const artifactPathIndex = window.location.pathname.indexOf(artifactPath);
  const rawArtifactName =
    artifactPathIndex === -1
      ? artifactName
      : window.location.pathname.slice(artifactPathIndex + artifactPath.length);

  return rawArtifactName;
};

export const decodeArtifactName = name => {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

export const buildLogViewerUrl = ({ taskId, runId, name, isLiveLog }) => {
  if (!isSafeLogViewerArtifactName(name)) {
    return null;
  }

  const encodedName = name.split('/').map(encodeURIComponent).join('/');

  return `/tasks/${taskId}/runs/${runId}/logs/${
    isLiveLog ? 'live/' : ''
  }${encodedName}`;
};
