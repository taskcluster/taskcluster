export default ({ match: { url }, location: { search, hash } }) => {
  // Switching entry points cannot be handled by react-router-dom
  window.location.href = `${url}${search}${hash}`;

  return null;
};
