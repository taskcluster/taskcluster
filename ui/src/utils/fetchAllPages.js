/**
 * Walk a paginated Taskcluster list endpoint to the end and return every item.
 *
 * `request` receives the query options for one page (`options` plus a
 * `continuationToken` after the first page) and returns the response.
 * `select` picks the array of items out of one response.
 */
export default async function fetchAllPages(request, select, options = {}) {
  const items = [];
  let continuationToken = null;

  do {
    const response = await request(
      continuationToken ? { ...options, continuationToken } : options
    );

    items.push(...select(response));
    continuationToken = response.continuationToken ?? null;
  } while (continuationToken);

  return items;
}
