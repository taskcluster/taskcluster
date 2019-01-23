export default ({ match: { url } }) => {
  // Switching entry points cannot be handled by react-router-dom
  window.location.href = url;

  return null;
};
