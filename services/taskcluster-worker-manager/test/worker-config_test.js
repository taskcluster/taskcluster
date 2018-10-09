
const sinon = require('sinon');
const assume = require('assume');

const {Ruleset} = require('../lib/rules');
const {
  ProvisionedWorkerConfiguration,
  StaticWorkerConfiguration,
  buildWorkerConfiguration,
} = require('../lib/worker-config.js');

const fakeProviders = new Map([['provider-1', {
  id: 'provider-1',
  providedSatisfiers: () => [],
}]]);

// Return a simple worker configuration which has a ruleset which
// we can evaluate
function mockRules() {
  return [{
    ruleId: 'rule-1',
    description: 'sample-rule-1',
    conditions: {
      workerType: 'worker-type-1',
    },
    values: {
      info1: 'rule-1-applied',
    },
  }, {
    ruleId: 'rule-2',
    description: 'sample-rule-2',
    conditions: {
      workerType: 'worker-type-2',
    },
    values: {
      info2: 'rule-2-applied',
    },
  }, {
    ruleId: 'rule-3',
    description: 'sample-rule-2',
    conditions: null,
    values: {
      info3: 'rule-3-applied',
    },
  }];
}

suite('StaticWorkerConfiguration', () => {

  let workerConfiguration;

  setup(() => {
    workerConfiguration = new StaticWorkerConfiguration({
      id: 'worker-config-1',
      workerTypes: ['worker-type-1'],
      configuration: {
        test: true,
      },
    });
  });

  test('should be able to evaluate a worker configuration', () => {
    assume(workerConfiguration.evaluate()).deeply.equals({
      test: true,
    });
  });

  test('should be able to list worker types', () => {
    for (let workerType of workerConfiguration.workerTypes()) {
      assume(workerType).is.a.string;
    }
  });
});

suite('ProvisionedWorkerConfiguration', () => {

  let workerConfiguration;

  setup(() => {
    workerConfiguration = new ProvisionedWorkerConfiguration({
      id: 'worker-config-1',
      rules: new Ruleset({rules: mockRules()}),
      workerTypeConfigurations: [
        new Map([
          ['workerType', 'worker-type-1'],
          ['biddingStrategyId', 'bidding-strategy-1'],
          ['providerIds', ['provider-1']],
        ]),
        new Map([
          ['workerType', 'worker-type-2'],
          ['biddingStrategyId', 'bidding-strategy-2'],
          ['providerIds', ['provider-2']],
        ]),
      ],
    });
  });

  test('should be able to evaluate a worker configuration', () => {
    let outcome = workerConfiguration.evaluate({
      satisfiers: {
        workerType: 'worker-type-1',
        providerId: 'provider-1',
      },
      providers: new Map([['provider-1', {
        id: 'provider-1',
        providedSatisfiers: () => [],
      }]]),
    });

    assume(outcome).deeply.equals({
      info1: 'rule-1-applied',
      info3: 'rule-3-applied',
    });
  });

  test('should throw when all satisfiers are missing', () => {
    assume(() => {
      workerConfiguration.evaluate({
        providers: fakeProviders,
      });
    }).throws(/^invalid satisfiers/);
  });

  test('should throw when one satisfier is missing', () => {
    assume(() => {
      workerConfiguration.evaluate({
        satisfiers: {
          providerId: 'provider-1',
        },
        providers: fakeProviders,
      });
    }).throws(/^missing satisfier/);
  });

  test('should be able to list worker types', () => {
    for (let workerType of workerConfiguration.workerTypes()) {
      assume(workerType).is.a.string;
    }
  });
});

suite('buildWorkerConfiguration', () => {
  test('should throw error when missing config and rules/workerTypeConfigurations', () => {
    assume(() => {
      buildWorkerConfiguration({});
    }).throws(/^Worker Configuration is invalid/);
  });

  test('should build static configuration as appropriate', () => {
    let result = buildWorkerConfiguration({
      id: 'worker-configuration-1',
      workerTypes: ['worker-type-1'],
      configuration: {test: true},
    });
    result.evaluate();
    assume(result).instanceof(StaticWorkerConfiguration);
  });

  suite('provisioned worker configurations', () => {
    test('should allow setting no defaults', () => {
      let result = buildWorkerConfiguration({
        id: 'worker-configuration-1',
        workerTypes: [{
          workerType: 'worker-type-1',
          providerIds: ['provider-1'],
          biddingStrategyId: 'bidding-strategy-1',
        }],
        rules: mockRules(),
      });
      assume(result.evaluate({providers: fakeProviders, satisfiers: {
        workerType: 'worker-type-1',
        providerId: 'provider-1',
      }})).deeply.equals({
        info1: 'rule-1-applied',
        info3: 'rule-3-applied',
      });
      assume(result).instanceof(ProvisionedWorkerConfiguration);
    });
    
    test('should allow setting default provisioner ids', () => {
      let result = buildWorkerConfiguration({
        id: 'worker-configuration-1',
        providerIds: ['provider-1'],
        workerTypes: [{
          workerType: 'worker-type-1',
          biddingStrategyId: 'bidding-strategy-1',
        }],
        rules: mockRules(),
      });
      assume(result.evaluate({providers: fakeProviders, satisfiers: {
        workerType: 'worker-type-1',
        providerId: 'provider-1',
      }})).deeply.equals({
        info1: 'rule-1-applied',
        info3: 'rule-3-applied',
      });
      assume(result).instanceof(ProvisionedWorkerConfiguration);
    });
    
    test('should allow setting default bidding strategy id', () => {
      let result = buildWorkerConfiguration({
        id: 'worker-configuration-1',
        biddingStrategyId: 'bidding-strategy-1',
        workerTypes: [{
          workerType: 'worker-type-1',
          providerIds: ['provider-1'],
        }],
        rules: mockRules(),
      });
      assume(result.evaluate({providers: fakeProviders, satisfiers: {
        workerType: 'worker-type-1',
        providerId: 'provider-1',
      }})).deeply.equals({
        info1: 'rule-1-applied',
        info3: 'rule-3-applied',
      });
      assume(result).instanceof(ProvisionedWorkerConfiguration);
    });    

    test('should string worker type list', () => {
      let result = buildWorkerConfiguration({
        id: 'worker-configuration-1',
        providerIds: ['provider-1'],
        biddingStrategyId: 'bidding-strategy-1',
        workerTypes: ['worker-type-1'],
        rules: mockRules(),
      });
      assume(result.evaluate({providers: fakeProviders, satisfiers: {
        workerType: 'worker-type-1',
        providerId: 'provider-1',
      }})).deeply.equals({
        info1: 'rule-1-applied',
        info3: 'rule-3-applied',
      });
      assume(result).instanceof(ProvisionedWorkerConfiguration);
    }); 

    test('should throw without setting provisioner ids', () => {
      assume(() => {
        let result = buildWorkerConfiguration({
          id: 'worker-configuration-1',
          workerTypes: [{
            workerType: 'worker-type-1',
            biddingStrategyId: 'bidding-strategy-1',
          }],
          rules: mockRules(),
        });
      }).throws(/^acceptable provider ids/);
    });

    test('should throw without setting bidding strategy id', () => {
      assume(() => {
        let result = buildWorkerConfiguration({
          id: 'worker-configuration-1',
          workerTypes: [{
            workerType: 'worker-type-1',
            providerIds: ['provider-1'],
          }],
          rules: mockRules(),
        });
      }).throws(/^acceptable bidding strategy id/);
    });    

    test('should throw with string worker types and no defaults', () => {
      assume(() => {
        let result = buildWorkerConfiguration({
          id: 'worker-configuration-1',
          workerTypes: ['worker-type-1'],
          rules: mockRules(),
        });
      }).throws(/^acceptable provider ids/);
    });
  });
});
