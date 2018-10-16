'use strict';

const fs = require('fs');

/**
 * This program takes a worker type definition from the AwsProvisioner system
 * and converts it into a worker configuration for Worker Manager
 *
 * It takes the following options:
 *   --input <file>: read this file instead of standard input
 *   --output <file>: write to this file instead of standard output
 * 
 * This program can also be imported into other projects through the
 * convert(inputStream, outputStream) option.
 *
 * To make usage of this script easy, no external dependencies are used.
 */

function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}

async function convert(inputStream, outputStream) {
  let data = await new Promise((resolve, reject) => {
    inputStream.on('error', reject);

    let data = [];

    inputStream.on('data', chunk => data.push(chunk));
    inputStream.on('end', () => resolve(Buffer.concat(data)));
  });

  data = JSON.parse(data);

  // Placeholder providerId
  const providerId = 'aws-ec2-spot';
  const biddingStrategyId = 'queue-pending-ratio';

  const config = {
    id: `legacy_${data.workerType}`,
    providerIds: [providerId], // TBD
    biddingStrategyId: biddingStrategyId,
    workerTypes: [data.workerType],
    rules: [],
  };

  config.rules.push({
    id: `rule_${biddingStrategyId}`,
    description: `${data.workerType} Bidding Strategy Rules`,
    conditions: {
      workerType: data.workerType,
      biddingStrategyId: biddingStrategyId,
    },
    values: {
      biddingStrategyData: {
        minCapacity: data.minCapacity,
        maxCapacity: data.maxCapacity,
        scalingRatio: data.scalingRatio,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
      }
    }
  });

  config.rules.push({
    id: `rule_${data.workerType}_metadata`,
    description: `${data.workerType} metadata`,
    conditions: {
      workerType: data.workerType,
    },
    values: {
      documentationData: {},
      schemaData: {},
    }
  });

  function addRule(list, prop) {
    for (let item of list) {
      // Instance type needs to be put into the LaunchSpecification,
      // availability zone placement data as well.
      if (!item[prop]) {
        throw new Error(`prop ${prop} is missing from ${JSON.stringify(item)}`);
      }
      if (prop === 'instanceType') {
        item.launchSpec.InstanceType = item[prop];
      } else if (prop === 'availabilityZone') {
        if (!item.launchSpec.Placement) {
          item.launchSpec.Placement = {
            AvailabilityZone: item[prop],
          };
        } else {
          item.launchSpec.Placement.AvailabilityZone = item[prop];
        }
      } else if (prop === 'region') {
        item.launchSpec.Region = item[prop];
      } else {
        throw new Error('invalid list item: ' + prop);
      }
      if (isEmpty(item.userData) && isEmpty(item.launchSpec)) {
        continue
      }
      let conditions = {};
      conditions[prop] = item[prop];
      config.rules.push({
        id: `rule_${providerId}_${item[prop]}`,
        description: `${data.workerType} ${providerId} ${item[prop]} specialisations`,
        conditions,
        values: {
          providerData: {
            userData: item.userData || {},
            launchSpec: item.launchSpec || {},
          }
        },
      });
    }
  }

  addRule(data.regions, 'region');
  addRule(data.instanceTypes, 'instanceType');
  addRule(data.availabilityZones, 'availabilityZone');

  data = JSON.stringify(config, null, 2);
  outputStream.write(data);
}

async function main(argv) {
  let inputStream = process.stdin;
  let outputStream = process.stdout;

  for (let i = 2; i < argv.length; i++) {
    switch(argv[i]) {
      case '--input':
        if (argv[++i] && fs.existsSync(argv[i])) {
          inputStream = fs.createReadStream(argv[i]);
        }
        break;
      case '--output':
        if (argv[++i] && fs.existsSync(argv[i])) {
          outputStream = fs.createWriteStream(argv[i]);
        }
        break;
      default:
        process.stderr.write('unsupported argument: ' + argv[i] + '\n');
        process.exit(1);
    }
  }

  await convert(inputStream, outputStream);
}

module.exports = {main, convert};

if (!module.parent) {
  main(process.argv).catch(console.error);
}

