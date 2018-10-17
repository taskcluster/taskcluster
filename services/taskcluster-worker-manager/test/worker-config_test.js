
const sinon = require('sinon');
const assume = require('assume');

const {errors} = require('../lib/base');

const {Ruleset} = require('../lib/rules');
const {
  WorkerConfiguration,
  buildWorkerConfiguration,
} = require('../lib/worker-config.js');

// Return a simple worker configuration which has a ruleset which
// we can evaluate
function mockRules() {
  return [{
    id: 'bidding-rule',
    description: 'bidding-rule',
    conditions: {
      workerType: 'worker-type-1',
      biddingStrategyId: 'bidding-strategy-1',
    },
    values: {
      biddingStrategyData: {
        info1: 'bidding-rule-applied',
      },
    },
  }, {
    id: 'docs-rule',
    description: 'docs-rule',
    conditions: {
      workerType: 'worker-type-1',
    },
    values: {
      documentationData: {
        info1: 'docs-rule-applied',
      },
    },
  }, {
    id: 'rule-1',
    description: 'sample-rule-1',
    conditions: {
      workerType: 'worker-type-1',
      providerId: 'provider-1',
    },
    values: {
      providerData: {
        info1: 'rule-1-applied',
      },
    },
  }, {
    id: 'rule-2',
    description: 'sample-rule-2',
    conditions: {
      workerType: 'worker-type-2',
      providerId: 'provider-1',
    },
    values: {
      providerData: {
        info2: 'rule-2-applied',
      },
    },
  }, {
    id: 'rule-3',
    description: 'sample-rule-2',
    conditions: null,
    values: {
      providerData: {
        info3: 'rule-3-applied',
      },
    },
  }];
}

suite('WorkerConfiguration', () => {

  let workerConfiguration;

  setup(() => {
    workerConfiguration = new WorkerConfiguration({
      id: 'worker-config-1',
      rules: new Ruleset({id: 'worker-config-1', rules: mockRules()}),
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

  test('should be able to evaluate a worker configuration for a bidding strategy', () => {
    let outcome = workerConfiguration.evaluate({
      workerType: 'worker-type-1',
      biddingStrategyId: 'bidding-strategy-1',
    });

    assume(outcome).deeply.equals({
      biddingStrategyData: {
        info1: 'bidding-rule-applied',
      },
      documentationData: {
        info1: 'docs-rule-applied',
      },
      providerData: {
        info3: 'rule-3-applied',
      }, 
      workerType: 'worker-type-1',
      schemaData: {
      },
    });
  });

  test('should be able to evaluate a worker configuration for a provider', () => {
    let outcome = workerConfiguration.evaluate({
      workerType: 'worker-type-1',
      providerId: 'provider-1',
    });

    assume(outcome).deeply.equals({
      biddingStrategyData: {
      },
      documentationData: {
        info1: 'docs-rule-applied',
      },
      providerData: {
        info1: 'rule-1-applied',
        info3: 'rule-3-applied',
      }, 
      workerType: 'worker-type-1',
      schemaData: {
      },
    });
  });

  test('should throw when when unexpected provider data results', () => {
    assume(() => {
      workerConfiguration.evaluate({
        biddingStrategyId: 'bidding-strategy-1',
      });
    }).throws(errors.InvalidSatisfiers);
  });

  test('should throw when when unexpected bidding strategy data results', () => {
    assume(() => {
      workerConfiguration.evaluate({
        providerId: 'provider-1',
      });
    }).throws(errors.InvalidSatisfiers);
  });

  test('should throw when all satisfiers are missing', () => {
    assume(() => {
      workerConfiguration.evaluate();
    }).throws(errors.InvalidSatisfiers);
  });

  test('should throw when worker type satisfier is missing', () => {
    assume(() => {
      workerConfiguration.evaluate({
        providerId: 'provider-1',
      });
    }).throws(errors.InvalidSatisfiers);
  });

  test('should throw when missing fields for dynamic worker type', () => {
    assume(() => {
      new WorkerConfiguration({
        id: 'failbad',
        workerTypeConfigurations: [
          new Map([['workerType', 'worker-type-1'], ['providerIds', 'provider-1']]),
        ],
        rules: mockRules(),
      });
    }).throws(errors.InvalidWorkerConfiguration);
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
    }).throws(errors.InvalidWorkerConfiguration);
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
      assume(result.evaluate({
        workerType: 'worker-type-1',
        providerId: 'provider-1',
      })).deeply.equals({
        biddingStrategyData: {
        },
        documentationData: {
          info1: 'docs-rule-applied',
        },
        providerData: {
          info1: 'rule-1-applied',
          info3: 'rule-3-applied',
        }, 
        workerType: 'worker-type-1',
        schemaData: {
        },
      });
      assume(result).instanceof(WorkerConfiguration);
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
      assume(result.evaluate({
        workerType: 'worker-type-1',
        providerId: 'provider-1',
      })).deeply.equals({
        biddingStrategyData: {
        },
        documentationData: {
          info1: 'docs-rule-applied',
        },
        providerData: {
          info1: 'rule-1-applied',
          info3: 'rule-3-applied',
        }, 
        workerType: 'worker-type-1',
        schemaData: {
        },
      });
      assume(result).instanceof(WorkerConfiguration);
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
      assume(result.evaluate({
        workerType: 'worker-type-1',
        providerId: 'provider-1',
      })).deeply.equals({
        biddingStrategyData: {
        },
        documentationData: {
          info1: 'docs-rule-applied',
        },
        providerData: {
          info1: 'rule-1-applied',
          info3: 'rule-3-applied',
        }, 
        workerType: 'worker-type-1',
        schemaData: {
        },
      });
      assume(result).instanceof(WorkerConfiguration);
    });    

    test('should string worker type list', () => {
      let result = buildWorkerConfiguration({
        id: 'worker-configuration-1',
        providerIds: ['provider-1'],
        biddingStrategyId: 'bidding-strategy-1',
        workerTypes: ['worker-type-1'],
        rules: mockRules(),
      });
      assume(result.evaluate({
        workerType: 'worker-type-1',
        providerId: 'provider-1',
      })).deeply.equals({
        biddingStrategyData: {
        },
        documentationData: {
          info1: 'docs-rule-applied',
        },
        providerData: {
          info1: 'rule-1-applied',
          info3: 'rule-3-applied',
        }, 
        workerType: 'worker-type-1',
        schemaData: {
        },
      });
      assume(result).instanceof(WorkerConfiguration);
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
      }).throws(errors.InvalidWorkerConfiguration);
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
      }).throws(errors.InvalidWorkerConfiguration);
    });    
  });
});
