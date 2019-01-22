const assume = require('assume');
const {Bid} = require('../lib/bid');

suite('Bid', () => {
  test('should be able to create a Bid', () => {
    new Bid({
      providerId: 'provider-1',
      workerType: 'worker-type-1',
      workerConfigurationId: 'worker-configuration-1',
      expires: new Date(),
      price: 1,
      capacity: 1,
      utilityFactor: 1,
      firm: false,
      reliability: 7500,
      estimatedDelay: 1000,
      providerData: {a:1},
    });
  });

  test('should calculate bid internal value correctly', () => {
    assume(new Bid({
      providerId: 'provider-1',
      workerType: 'worker-type-1',
      workerConfigurationId: 'worker-configuration-1',
      expires: new Date(),
      price: 10,
      capacity: 5,
      utilityFactor: 2,
      firm: false,
      reliability: 7500,
      estimatedDelay: 1000,
      providerData: {a:1},
    }).valuePerCapacity()).equals(1);
  });
});
