const { google } = require('googleapis');

const compute = google.compute('v1');
const cloudBilling = google.cloudbilling('v1');
const computeEngineServiceId = '6F81-5844-456A';
const regionNames = {
  'asia-east1': 'Asia Pacific (Taiwan)',
  'asia-east2': 'Asia Pacific (Hong Kong)',
  'asia-northeast1': 'Asia Pacific (Tokyo)',
  'asia-south1': 'Asia Pacific (Mumbai)',
  'asia-southeast1': 'Asia Pacific (Singapore)',
  'australia-southeast1': 'Asia Pacific (Sydney)',
  'europe-north1': 'EU (Finland)',
  'europe-west1': 'EU (Belgium)',
  'europe-west2': 'EU (London)',
  'europe-west3': 'EU (Frankfurt)',
  'europe-west4': 'EU (Netherlands)',
  'northamerica-northeast1': 'Canada (Montréal)',
  'southamerica-east1': 'South America (São Paulo)',
  'us-central1': 'US Central (Iowa)',
  'us-east1': 'US East (South Carolina)',
  'us-east4': 'US East (Northern Virginia)',
  'us-west1': 'US West (Oregon)',
  'us-west2': 'US West (Los Angeles)',
};
const unsupportedInstanceTypes = ['n1-ultramem-40', 'n1-ultramem-80', 'n1-megamem-96', 'n1-ultramem-160'];

async function getSkus(request) {
  let skus = [];
  return new Promise((resolve) => {
    const handlePage = function(err, response) {
      if (err) {
        console.error(err);
        return;
      }

      const itemsPage = response.data.skus;
      if (!itemsPage) {
        return;
      }
      skus = skus.concat(itemsPage);

      if (response.data.nextPageToken) {
        request.pageToken = response.data.nextPageToken;
        cloudBilling.services.skus.list(request, handlePage);
      } else {
        return resolve(skus);
      }
    };
    cloudBilling.services.skus.list(request, handlePage);
  });
}

function priceInUsd(pricingInfos) {
  if (pricingInfos.length !== 1) {
    throw new Error('pricing info not parsable');
  }

  const [pricingInfo] = pricingInfos;
  let priceInUsd = 0;

  for (let tr of pricingInfo.pricingExpression.tieredRates) {
    priceInUsd += parseInt(tr.unitPrice.units) + (tr.unitPrice.nanos * Math.pow(10, -9));
  }

  return priceInUsd;
}

function priceFromSku(price, region, device, priceType, priceInUsd) {
  const pr = price[region][device] || {};

  pr[priceType] = priceInUsd;

  return pr;
}

async function getPrice(request) {
  let price = {};
  const skus = await getSkus({ auth: request.auth, parent: `services/${computeEngineServiceId}` });

  for (let sku of skus) {
    if (sku.category.resourceGroup === 'G1Small' || sku.category.resourceGroup === 'F1Micro') {
      const p = priceInUsd(sku.pricingInfo);

      for (let region of sku.serviceRegions) {
        if (!price[region]) {
          price[region] = {};
        }

        if (sku.category.resourceGroup === 'G1Small') {
          price[region]['g1-small'] = priceFromSku(price, region, 'g1-small', sku.category.usageType, p);
        } else {
          price[region]['f1-micro'] = priceFromSku(price, region, 'f1-micro', sku.category.usageType, p);
        }
      }
    }

    if (sku.category.resourceGroup === 'N1Standard') {
      if (!sku.description.includes('Upgrade Premium')) {
        const p = priceInUsd(sku.pricingInfo);

        for (let region of sku.serviceRegions) {
          if (!price[region]) {
            price[region] = {};
          }

          if (sku.description.includes('Instance Ram')) {
            price[region]['memory'] = priceFromSku(price, region, 'memory', sku.category.usageType, p);
          } else {
            price[region]['cpu'] = priceFromSku(price, region, 'cpu', sku.category.usageType, p);
          }
        }
      }
    }
  }

  return price;
}

async function getRegions(request) {
  const regionIdMap = {};
  return new Promise((resolve) => {
    const handlePage = function(err, response) {
      if (err) {
        console.error(err);
        return;
      }

      const itemsPage = response.data.items;
      if (!itemsPage) {
        return;
      }
      for (let region of itemsPage) {
        const displayName = regionNames[region.name];

        if (displayName) {
          regionIdMap[region.name] = displayName;
        }
      }

      if (response.data.nextPageToken) {
        request.pageToken = response.data.nextPageToken;
        compute.regions.list(request, handlePage);
      } else {
        return resolve(regionIdMap);
      }
    };
    compute.regions.list(request, handlePage);
  });
}

async function getZones(request, region) {
  const zones = [];

  return new Promise((resolve) => {
    const handlePage = function(err, response) {
      if (err) {
        console.error(err);
        return;
      }

      const itemsPage = response.data.items;
      if (!itemsPage) {
        return;
      }
      for (let zone of itemsPage) {
        const s = zone.region.split('/');
        if (s[s.length - 1] === region && zone.name !== '') {
          zones.push(zone.name);
        }
      }

      if (response.data.nextPageToken) {
        request.pageToken = response.data.nextPageToken;
        compute.zones.list(request, handlePage);
      } else {
        return resolve(zones);
      }
    };
    compute.zones.list(request, handlePage);
  });
}

async function getMachineTypes(request) {
  const machineTypes = [];

  return new Promise((resolve) => {
    const handlePage = function(err, response) {
      if (err) {
        console.error(err);
        return;
      }

      const itemsPage = response.data.items;
      if (!itemsPage) {
        return;
      }
      for (let mt of itemsPage) {
        machineTypes.push(mt);
      }

      if (response.data.nextPageToken) {
        request.pageToken = response.data.nextPageToken;
        compute.machineTypes.list(request, handlePage);
      } else {
        return resolve(machineTypes);
      }
    };
    compute.machineTypes.list(request, handlePage);
  });
}

async function estimatePrice(request, gcpRegion, gcpInstanceType) {
  const regions = await getRegions(request);
  const pricePerRegion = await getPrice(request);
  const zonesInRegions = {};
  const allPrices = {};

  for (let r of Object.keys(regions)) {
    const zones = await getZones(request, r);
    const machineTypes = await getMachineTypes({ ...request, zone: zones[0]});

    zonesInRegions[r] = zones;

    for (let [region, price] of Object.entries(pricePerRegion)) {
      for (let mt of machineTypes) {
        if (!unsupportedInstanceTypes.includes(mt.name)) {
          if (!allPrices[region]) {
            allPrices[region] = {};
          }

          const prices = allPrices[region][mt.name] || {};
          if (mt.name === 'f1-micro' || mt.name === 'g1-small') {
            if (price[mt.name]) {
              prices.OnDemandPrice = price[mt.name]['OnDemand'];
            }
          } else {
            const memPriceOnDemand = price['memory'] && price['memory']['OnDemand'] || 0;
            const cpuPriceOnDemand = price['cpu'] && price['cpu']['OnDemand'] || 0;
            prices.OnDemandPrice = cpuPriceOnDemand * mt['guestCpus'] + memPriceOnDemand * mt['memoryMb'] / 1024;
          }

          const spotPrice = {};

          if (zonesInRegions[region]) {
            for (let z of zonesInRegions[region]) {
              if (mt.name === 'f1-micro' || mt.name === 'g1-small') {
                if (price[mt.name]) {
                  spotPrice[z] = price[mt.name]['Preemptible'];
                }
              } else {
                const memPricePreemptible = price['mem'] && price['mem']['Preemptible'] || 0;
                const cpuPricePreemptible = price['cpu'] && price['cpu']['Preemptible'] || 0;
                spotPrice[z] = cpuPricePreemptible * mt.guestCpus + memPricePreemptible * mt['memoryMb'] / 1024;
              }
            }

            prices.spotPrice = spotPrice;
            allPrices[region][mt.name] = prices;
          }
        }
      }
    }
  }

  return allPrices[gcpRegion][gcpInstanceType];
}

const main = async () => {
  const authClient = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const request = {
    project: 'taskcluster-dev',
    auth: authClient,
  };

  // An example of how this would be used
  await estimatePrice(request, 'us-east1', 'n1-standard-4');
};

main().catch(console.error);
