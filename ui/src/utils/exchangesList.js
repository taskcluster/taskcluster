import urls from './urls.js';

const exchanges = [];
const fetchExchanges = async (service, version) => {
  const res = await fetch(urls.exchangeReference(service, version));
  const data = await res.json();

  data.entries?.forEach(entry => {
    exchanges.push(`${data.exchangePrefix}${entry.exchange}`);
  });

  return data;
};

const prefetch = async () => {
  await fetchExchanges('auth', 'v1');
  await fetchExchanges('queue', 'v1');
  await fetchExchanges('github', 'v1');
  await fetchExchanges('hooks', 'v1');
  await fetchExchanges('notify', 'v1');
  await fetchExchanges('worker-manager', 'v1');
};

const prefetchPromise = prefetch();

export default async () => {
  await prefetchPromise;

  return exchanges;
};
