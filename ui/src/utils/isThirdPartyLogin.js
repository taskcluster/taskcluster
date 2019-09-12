import { parse } from 'qs';

// Returns true if the user is trying to start a third party oauth login flow
export default () => {
  const query = parse(window.location.search.slice(1));

  if (
    query.client_id &&
    query.response_type &&
    query.scope &&
    query.redirect_uri
  ) {
    return true;
  }

  return false;
};
