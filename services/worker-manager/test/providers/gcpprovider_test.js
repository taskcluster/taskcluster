'use strict';

const {testProvider} = require('./provider_test');
const {GCPProvider} = require('../../src/providers/gcpprovider');
const {mockRules} = require('../worker-config_test');

suite('GCP Provider', () => {
  let subject = new GCPProvider({
    id: 'gcp-provider',
  });

  let workerConfig = {
    id: 'test-worker-config',
    workerTypes: [{
      workerType: 'worker-type-1',
      providerIds: ['gcp-provider'],
    }],
    rules: mockRules(),
  };

  testProvider(subject, workerConfig);
});
