const aws = require('aws-sdk');

/**
 * An object holding all ec2 clients for each region.
 */
let ec2s = {};

/**
 * Create and initialise an ec2 client for each region.
 */
async function setup() {
  const ec2 = new aws.EC2({
    region: 'us-east-1',
  });
  const regions = (await ec2.describeRegions({}).promise()).Regions;
  regions.forEach(r => {
    ec2s[r.RegionName] = new aws.EC2({
      region: r.RegionName,
    });
  });
}

/**
 * Executes callback (function(err, data)) against each spot price returned by
 * EC2 for any/all of the given instanceTypes in any/all of the given regions.
 */
async function getSpotPrices(regions, instanceTypes, callback) {
  const now = new Date();
  var params = {
   EndTime: now,
   InstanceTypes: instanceTypes,
   // Presumably we always want Linux/UNIX since we are using our own machine images?
   ProductDescriptions: [
     "Linux/UNIX",
   ],
   StartTime: now,
  };
  for (const region of regions) {
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#describeSpotPriceHistory-property
    spotPrice(region, callback, params, '')
  }
}

async function spotPrice(region, callback, params, nextToken) {
  params.NextToken = nextToken;
  ec2s[region].describeSpotPriceHistory(params, (err, data) => {
    callback(err, data.SpotPriceHistory);
    if (data.NextToken) {
      spotPrice(region, callback, params, data.NextToken);
    }
  });
}

/**
 * Entry point into program. Makes an example getSpotPrice call that logs data.
 */
const main = async () => {
  await setup();

  // Example function call to get prices of c4.2xlarge and m3.2xlarge instance
  // types in us-east-1 and us-west-2
  await getSpotPrices(
    [
      'us-east-1',
      'us-west-2',
    ],
    [
      'c4.2xlarge',
      'm3.2xlarge',
    ],
    (err, data) => {
      if (err) {
        console.log(err, err.stack);
      } else {
        console.log(data);
      }
    },
  );
}

main().catch(console.error);
