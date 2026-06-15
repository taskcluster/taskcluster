import taskcluster from '@taskcluster/client';
import sinon from 'sinon';
import assert from 'node:assert';
import helper from './helper.js';
import { FakeAzure, FakeHttpHeaders } from './fakes/index.js';
import { AzureProvider, isAllowedAiaLocation } from '../src/providers/azure/index.js';
import { dnToString, getAuthorityAccessInfo, getCertFingerprint, cloneCaStore } from '../src/providers/azure/utils.js';
import testing from '@taskcluster/lib-testing';
import forge from 'node-forge';
import fs from 'node:fs';
import http from 'node:http';
import got from 'got';
import path from 'node:path';
import { WorkerPool, Worker, WorkerPoolStats } from '../src/data.js';
import Debug from 'debug';
import { loadCertificates } from '../src/providers/azure/azure-ca-certs/index.js';

const debug = Debug('provider_azure_test');
const __dirname = new URL('.', import.meta.url).pathname;

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.resetTables(mock, skipping);

  let provider;
  const providerId = 'azure';
  const workerPoolId = 'foo/bar';

  const fake = new FakeAzure();
  fake.forSuite();

  const baseProviderData = {
    location: 'westus',
    resourceGroupName: 'rgrp',
    vm: {
      name: 'some vm',
    },
    disks: [{
      name: 'some disk',
    }],
    nic: {
      name: 'some nic',
    },
    ip: {
      name: 'some ip',
    },
  };

  let monitor;
  suiteSetup(async () => {
    monitor = await helper.load('monitor');
  });

  const assertProvisioningState = async (expectations) => {
    // re-fetch the worker, since it should have been updated
    const workers = await helper.getWorkers();
    assert.equal(workers.length, 1);
    const worker = workers[0];

    for (const resourceType of ['ip', 'vm', 'nic']) {
      const name = worker.providerData[resourceType].name;
      switch (expectations[resourceType]) {
        case 'none':
          assert(!worker.providerData[resourceType].operation);
          assert(!worker.providerData[resourceType].id);
          break;
        case 'inprogress':
          assert.equal(worker.providerData[resourceType].operation, `op/${resourceType}/rgrp/${name}`);
          assert(!worker.providerData[resourceType].id);
          break;
        case 'allocated':
          assert(!worker.providerData[resourceType].operation);
          assert.equal(worker.providerData[resourceType].id, `id/${name}`);
          break;
        case undefined: // caller doesn't care about state of this resource
          break;
        default:
          assert(false, `invalid expectation ${resourceType}: ${expectations[resourceType]}`);
      }
    }
  };

  // This is the intermediate certificate that azure_signature_good.json is signed
  // with; to figure out which this is, print the certificate in
  // `registerWorker`.  It will be one of the certs on on
  // https://www.microsoft.com/pki/mscorp/cps/default.htm
  const intermediateCertFingerprint = 'BE:68:D0:AD:AA:23:45:B4:8E:50:73:20:B6:95:D3:86:08:0E:5B:25';
  const intermediateCertSubject = '/C=US,/O=Microsoft Corporation,/CN=Microsoft Azure RSA TLS Issuing CA 04';
  const intermediateCertIssuer = '/C=US,/O=DigiCert Inc,/OU=www.digicert.com,/CN=DigiCert Global Root G2';
  const intermediateCertPath = path.resolve(
    __dirname, '../src/providers/azure/azure-ca-certs/microsoft_azure_rsa_tls_issuing_ca_04_xsign.pem');
  const intermediateCertUrl = 'http://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2004%20-%20xsign.crt';
  const azureSignatures = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_good.json'), 'utf-8'));
  const allCertificates = loadCertificates();

  const getIntermediateCert = () => {
    const pem = fs.readFileSync(intermediateCertPath, 'utf-8');
    return forge.pki.certificateFromPem(pem);
  };

  const removeAllCertsFromStore = () => {
    allCertificates.forEach((cert) => {
      const intermediate = forge.pki.certificateFromPem(cert.certificate);
      provider.caStore.removeCertificate(intermediate);
    });
  };

  const restoreAllCerts = () => {
    allCertificates.forEach((cert) => {
      const intermediate = forge.pki.certificateFromPem(cert.certificate);
      provider.caStore.addCertificate(intermediate);
    });
  };

  const createWorkerIdentityProofWithAiaUrl = ({ vmId, aiaUrl, expiresOn = '11/19/30 18:53:30 -0000' }) => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date('2024-01-01T00:00:00.000Z');
    cert.validity.notAfter = new Date('2030-01-01T00:00:00.000Z');
    cert.setSubject([{ name: 'commonName', value: 'metadata.azure.com' }]);
    cert.setIssuer([{ name: 'commonName', value: 'Unknown-CA' }]);

    const authorityInfoAccess = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      [forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.SEQUENCE,
        true,
        [
          forge.asn1.create(
            forge.asn1.Class.UNIVERSAL,
            forge.asn1.Type.OID,
            false,
            forge.asn1.oidToDer('1.3.6.1.5.5.7.48.2').getBytes(),
          ),
          forge.asn1.create(
            forge.asn1.Class.CONTEXT_SPECIFIC,
            6,
            false,
            aiaUrl,
          ),
        ],
      )],
    );

    cert.setExtensions([{
      name: 'authorityInfoAccess',
      value: forge.asn1.toDer(authorityInfoAccess).getBytes(),
    }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const payload = JSON.stringify({
      vmId,
      timeStamp: { expiresOn },
    });

    const message = forge.pkcs7.createSignedData();
    message.content = forge.util.createBuffer(payload, 'utf8');
    message.addCertificate(cert);
    message.addSigner({
      key: keys.privateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
    });
    message.sign();

    return Buffer.from(forge.asn1.toDer(message.toAsn1()).getBytes(), 'binary').toString('base64');
  };

  suite('helpers', () => {
    const testCert = forge.pki.certificateFromPem(fs.readFileSync(intermediateCertPath, 'utf-8'));

    test('dnToString of subject', async () => {
      const dn = dnToString(testCert.subject);
      assert.equal(dn, intermediateCertSubject);
    });

    test('dnToString of issuer', async () => {
      const dn = dnToString(testCert.issuer);
      assert.equal(dn, intermediateCertIssuer);
    });

    test('getCertFingerprint', async () => {
      const fingerprint = getCertFingerprint(testCert);
      // this matches the "thumbprint" (?) on https://www.microsoft.com/pki/mscorp/cps/default.htm
      assert.equal(fingerprint, intermediateCertFingerprint);
    });

    test('getAuthorityAccessInfo', async () => {
      const info = getAuthorityAccessInfo(testCert);
      assert.deepEqual(
        info,
        [
          { method: "OSCP", location: "http://ocsp.digicert.com" },
          { method: 'CA Issuer', location: 'http://cacerts.digicert.com/DigiCertGlobalRootG2.crt' },
        ]);
    });

    test('isAllowedAiaLocation allows trusted Azure CA hosts', async () => {
      assert.equal(
        isAllowedAiaLocation('http://www.microsoft.com/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2008.crt'),
        true,
      );
      assert.equal(
        isAllowedAiaLocation('http://WWW.MICROSOFT.COM/pkiops/certs/Microsoft%20Azure%20RSA%20TLS%20Issuing%20CA%2008.crt'),
        true,
      );
      assert.equal(
        isAllowedAiaLocation('http://cacerts.digicert.com/DigiCertGlobalRootG2.crt'),
        true,
      );
      assert.equal(
        isAllowedAiaLocation('https://caissuers.microsoft.com/foo.crt'),
        true,
      );
    });

    test('isAllowedAiaLocation rejects untrusted or malformed URLs', async () => {
      assert.equal(isAllowedAiaLocation('http://169.254.169.254/metadata/attested/document'), false);
      assert.equal(isAllowedAiaLocation('http://[::1]/cert.crt'), false);
      assert.equal(isAllowedAiaLocation('http://localhost/cert.crt'), false);
      assert.equal(isAllowedAiaLocation('http://evil.example/cert.crt'), false);
      assert.equal(isAllowedAiaLocation('http://user:pass@www.microsoft.com/pkiops/certs/cert.crt'), false);
      assert.equal(isAllowedAiaLocation('http://www.microsoft.com:444/cert.crt'), false);
      assert.equal(isAllowedAiaLocation('http://www.microsoft.com/other-path/cert.crt'), false);
      assert.equal(isAllowedAiaLocation('ftp://www.microsoft.com/cert.crt'), false);
      assert.equal(isAllowedAiaLocation('not a url'), false);
    });

    test('cloneCaStore handles invalid inputs', async () => {
      assert.throws(() => cloneCaStore(null), /Invalid input/);
      assert.throws(() => cloneCaStore(undefined), /Invalid input/);
      assert.throws(() => cloneCaStore({}), /Invalid input/);
      assert.throws(() => cloneCaStore({ certs: 'not an object' }), /Invalid input/);
    });

    test('cloneCaStore creates independent store', async () => {
      const originalStore = forge.pki.createCaStore();
      originalStore.addCertificate(testCert);

      const newCert = { ...testCert };
      newCert.subject.attributes[0].value = 'some modified to get new hash';
      originalStore.addCertificate(newCert);
      const clonedStore = cloneCaStore(originalStore);

      assert.notEqual(originalStore, clonedStore);
      assert.deepEqual(Object.keys(originalStore.certs), Object.keys(clonedStore.certs));

      clonedStore.removeCertificate(newCert);
      assert.ok(originalStore.hasCertificate(newCert));
      assert.ok(!clonedStore.hasCertificate(newCert));
    });
  });

  setup(async () => {
    provider = new AzureProvider({
      providerId,
      notify: await helper.load('notify'),
      db: helper.db,
      monitor: (await helper.load('monitor')).childMonitor('azure'),
      estimator: await helper.load('estimator'),
      publisher: await helper.load('publisher'),
      validator: await helper.load('validator'),
      rootUrl: helper.rootUrl,
      WorkerPoolError: helper.WorkerPoolError,
      launchConfigSelector: await helper.load('launchConfigSelector'),
      providerConfig: {
        clientId: 'my client id',
        secret: 'my secret',
        domain: 'some azure domain',
        subscriptionId: 'a subscription id',
        resourceGroupName: 'rgrp',
        storageAccountName: 'storage123',
        _backoffDelay: 1,
      },
    });

    // So that checked-in certs are still valid
    provider._now = () => taskcluster.fromNow('-10 years');

    await helper.db.fns.delete_worker_pool(workerPoolId);

    await provider.setup();
    provider.scanPrepare();
  });

  const makeWorkerPool = async (overrides = {}, launchConfigOverrides = {}) => {
    const workerPool = WorkerPool.fromApi({
      workerPoolId,
      providerId,
      description: 'none',
      previousProviderIds: [],
      created: new Date(),
      lastModified: new Date(),
      config: {
        minCapacity: 1,
        maxCapacity: 1,
        scalingRatio: 1,
        lifecycle: {
          registrationTimeout: 6000,
        },
        launchConfigs: [
          {
            workerManager: {
              capacityPerInstance: 1,
            },
            subnetId: 'some/subnet',
            location: 'westus',
            hardwareProfile: {
              vmSize: 'Basic_A2',
            },
            storageProfile: {
              osDisk: {},
              dataDisks: [{}],
            },
            ...launchConfigOverrides,
          },
        ],
      },
      owner: 'whatever@example.com',
      providerData: {},
      emailOnError: false,
      ...overrides,
    });
    await workerPool.create(helper.db);

    return workerPool;
  };

  const clientForResourceType = resourceType => {
    return {
      ip: fake.networkClient.publicIPAddresses,
      nic: fake.networkClient.networkInterfaces,
      disks: fake.computeClient.disks,
      vm: fake.computeClient.virtualMachines,
    }[resourceType];
  };

  suite('setup', () => {
    test('has all Azure root certificates', async () => {
      // https://docs.microsoft.com/en-us/azure/security/fundamentals/tls-certificate-changes
      const azureRootCAs = new Map([
        ['df3c24f9bfd666761b268073fe06d1cc8d4f82a4', 'DigiCert Global Root G2'],
        ['a8985d3a65e5e5c4b2d7d66d40c6dd2fb19c5436', 'DigiCert Global Root CA'],
        ['58e8abb0361533fb80f79b1b6d29d3ff8d5f00f0', 'D-TRUST Root Class 3 CA 2 2009'],
        ['73a5e64a3bff8316ff0edccc618a906e4eae4d74', 'Microsoft RSA Root Certificate Authority 2017'],
        ['999a64c37ff47d9fab95f14769891460eec4c3c5', 'Microsoft ECC Root Certificate Authority 2017'],
        ['21734d95a2473be25cbfd12a84c6fbc5bc8e2414', 'Microsoft TLS RSA Root G2'],
      ]);
      // node-forge is unable to load these (issue #3923)
      const forgeProblemRootCAs = new Map([
        ['999a64c37ff47d9fab95f14769891460eec4c3c5', 'Microsoft ECC Root Certificate Authority 2017'],
      ]);

      // Calculate the thumbprint of a certificate
      // Microsoft's thumbprint is OpenSSL's fingerprint in lowercase, no colons
      function getThumbprint(cert) {
        const fingerprint = getCertFingerprint(cert);
        const thumbprint = fingerprint.replace(/:/g, '').toLowerCase();
        return thumbprint;
      }

      // Find matching thumbprints in provider.caStore
      const caCerts = provider.caStore.listAllCertificates();
      caCerts.forEach(cert => {
        const thumbprint = getThumbprint(cert);
        azureRootCAs.delete(thumbprint);
      });

      assert.deepEqual(azureRootCAs, forgeProblemRootCAs);
      assert.equal(azureRootCAs.size, 1);
    });
  });

  suite('provisioning', () => {
    const provisionWorkerPool = async (launchConfig, overrides) => {
      const workerPool = await makeWorkerPool({
        config: {
          minCapacity: 1,
          maxCapacity: 1,
          scalingRatio: 1,
          launchConfigs: [{
            workerManager: {
              capacityPerInstance: 1,
            },
            subnetId: 'some/subnet',
            location: 'westus',
            hardwareProfile: { vmSize: 'Basic_A2' },
            storageProfile: {
              osDisk: {},
            },
            ...launchConfig,
          }],
          ...overrides,
        },
        owner: 'whatever@example.com',
        providerData: {},
        emailOnError: false,
      });
      const workerPoolStats = new WorkerPoolStats('wpid');
      await provider.provision({ workerPool, workerPoolStats });
      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      const worker = workers[0];

      // check that the VM config is correct since this suite does not
      // go all the way to creating the VM
      // (only for sequential provisioning workers, not ARM templates)
      if (worker.providerData.vm.config) {
        const config = {
          ...worker.providerData.vm.config,
          osProfile: {
            ...worker.providerData.vm.config.osProfile,
            adminUsername: 'user',
            adminPassword: 'pass',
          },
          tags: worker.providerData.tags,
        };
        fake.validate(config, 'azure-vm.yml');
      }

      return worker;
    };

    test('provision with no launch configs', async () => {
      const workerPool = await makeWorkerPool({
        config: {
          minCapacity: 1,
          maxCapacity: 1,
          scalingRatio: 1,
        },
        owner: 'whatever@example.com',
        providerData: {},
        emailOnError: false,
      });
      const workerPoolStats = new WorkerPoolStats('wpid');
      await provider.provision({ workerPool, workerPoolStats });
      const workers = await helper.getWorkers();
      assert.equal(workers.length, 0);
    });

    test('provision a simple worker', async () => {
      const worker = await provisionWorkerPool({});

      assert.equal(worker.workerPoolId, workerPoolId);
      assert.equal(worker.providerId, 'azure');
      assert.equal(worker.workerGroup, 'westus');
      assert.equal(worker.state, 'requested');
      assert.equal(worker.capacity, 1);

      const providerData = worker.providerData;

      // Check that this is setting default times correctly to within a second
      // or so to allow for some time for the provisioning loop
      assert(providerData.terminateAfter - Date.now() - 345600000 < 5000);
      assert.equal(providerData.reregistrationTimeout, 345600000);

      assert.equal(providerData.location, 'westus');
      assert.equal(providerData.resourceGroupName, 'rgrp');
      assert.equal(providerData.workerConfig, undefined);
      assert.equal(providerData.tags['created-by'], `taskcluster-wm-${providerId}`);
      assert.equal(providerData.tags['managed-by'], 'taskcluster');
      assert.equal(providerData.tags['provider-id'], providerId);
      assert.equal(providerData.tags['worker-group'], 'westus');
      assert.equal(providerData.tags['worker-pool-id'], workerPoolId);
      assert.equal(providerData.tags['root-url'], helper.rootUrl);
      assert.equal(providerData.tags.owner, 'whatever@example.com');

      const customData = JSON.parse(Buffer.from(providerData.vm.config.osProfile.customData, 'base64'));
      assert.equal(customData.workerPoolId, workerPoolId);
      assert.equal(customData.providerId, providerId);
      assert.equal(customData.workerGroup, 'westus');
      assert.equal(customData.rootUrl, helper.rootUrl);
      assert.deepEqual(customData.workerConfig, {});
      helper.assertPulseMessage('worker-requested', m => m.payload.workerId === worker.workerId);
      helper.assertPulseMessage('worker-requested', m => m.payload.launchConfigId === worker.launchConfigId);
    });

    test('provision with custom tags', async () => {
      const worker = await provisionWorkerPool({
        tags: { mytag: 'myvalue' },
      });
      assert.equal(worker.providerData.tags.mytag, 'myvalue');
      helper.assertPulseMessage('worker-requested', m => m.payload.workerId === worker.workerId);
    });

    test('provision with lifecycle', async () => {
      const worker = await provisionWorkerPool({}, {
        lifecycle: {
          registrationTimeout: 6,
          reregistrationTimeout: 6,
        },
      });
      assert(worker.providerData.terminateAfter - Date.now() - 6000 < 5000);
      assert.equal(worker.providerData.reregistrationTimeout, 6000);
      helper.assertPulseMessage('worker-requested', m => m.payload.workerId === worker.workerId);
    });

    test('provision with custom tags named after built-in tags', async () => {
      const worker = await provisionWorkerPool({
        tags: { 'created-by': 'me!' },
      });
      assert.equal(worker.providerData.tags['created-by'], `taskcluster-wm-${providerId}`);
      helper.assertPulseMessage('worker-requested', m => m.payload.workerId === worker.workerId);
    });

    test('provision with workerConfig', async () => {
      const worker = await provisionWorkerPool({
        workerConfig: { runTasksFaster: true },
      });
      assert.equal(worker.providerData.workerConfig.runTasksFaster, true);
    });

    test('provision with named disks ignores names', async () => {
      const worker = await provisionWorkerPool({
        storageProfile: {
          osDisk: {
            name: 'my_os_disk',
            testProperty: 1,
          },
          dataDisks: [{
            name: 'my_data_disk',
            testProperty: 2,
          }],
        },
      });
      const vmConfig = worker.providerData.vm.config;
      assert.notEqual(vmConfig.storageProfile.osDisk.name, 'my_os_disk');
      assert.equal(vmConfig.storageProfile.osDisk.testProperty, 1);
      assert.notEqual(vmConfig.storageProfile.dataDisks[0].name, 'my_os_disk');
      assert.equal(vmConfig.storageProfile.dataDisks[0].testProperty, 2);
    });

    test('provision with several osDisks', async () => {
      const worker = await provisionWorkerPool({
        storageProfile: {
          osDisk: {
            testProperty: 1,
          },
          dataDisks: [
            {
              testProperty: 2,
            },
            {
              testProperty: 3,
            },
            {
              testProperty: 4,
            },
            {
              testProperty: 5,
            },
          ],
        },
      });
      const vmConfig = worker.providerData.vm.config;
      assert.equal(vmConfig.storageProfile.osDisk.testProperty, 1);
      assert.equal(vmConfig.storageProfile.dataDisks[0].testProperty, 2);
      assert.equal(vmConfig.storageProfile.dataDisks[1].testProperty, 3);
      assert.equal(vmConfig.storageProfile.dataDisks[2].testProperty, 4);
      assert.equal(vmConfig.storageProfile.dataDisks[3].testProperty, 5);
    });

    test('provision with extra azure profiles', async () => {
      const worker = await provisionWorkerPool({
        billingProfile: {
          maxPrice: 10,
        },
        osProfile: {
          testProperty: 1,
        },
        storageProfile: {
          testProperty: 2,
          osDisk: {
            testProperty: 3,
          },
          dataDisks: [],
        },
        networkProfile: {
          testProperty: 4,
        },
      });
      const vmConfig = worker.providerData.vm.config;
      assert.equal(vmConfig.billingProfile.maxPrice, 10);
      assert.equal(vmConfig.osProfile.testProperty, 1);
      assert(vmConfig.osProfile.computerName); // still set..
      assert.equal(vmConfig.storageProfile.testProperty, 2);
      assert.equal(vmConfig.storageProfile.osDisk.testProperty, 3);
      assert.equal(vmConfig.networkProfile.testProperty, 4);
      assert(vmConfig.networkProfile.networkInterfaces); // still set..
    });

    test('provision with ARM template config creates deployment worker', async () => {
      await provisionWorkerPool({
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: {
              value: 'east',
            },
          },
        },
      });

      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      const worker = workers[0];

      assert.equal(worker.providerData.deploymentMethod, 'arm-template');
      assert.ok(worker.providerData.deployment);
      assert.ok(worker.providerData.deployment.name);
      assert.ok(worker.providerData.armDeployment);
      assert.equal(worker.providerData.armDeployment.mode, 'Incremental');
    });

    test('records metric when ARM deployment creation fails', async () => {
      const recordedMetrics = [];
      const originalMetric = provider.monitor._metric.azureArmDeploymentError;
      const originalBeginCreateOrUpdate = fake.deploymentsClient.deployments.beginCreateOrUpdate;
      provider.monitor._metric.azureArmDeploymentError = (value, labels) => {
        recordedMetrics.push({ value, labels });
      };
      fake.deploymentsClient.deployments.beginCreateOrUpdate = async () => {
        const err = new Error('Task timed out after 180000ms (queue has 4 running, 0 waiting)');
        err.name = 'TimeoutError';
        throw err;
      };

      try {
        const workerPool = await makeWorkerPool({
          config: {
            minCapacity: 1,
            maxCapacity: 1,
            scalingRatio: 1,
            launchConfigs: [{
              workerManager: {
                capacityPerInstance: 1,
              },
              armDeployment: {
                mode: 'Incremental',
                templateLink: {
                  id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
                },
                parameters: {
                  location: { value: 'east' },
                  vmSize: { value: 'Standard_F8s_v2' },
                  priority: { value: 'Spot' },
                  imageId: {
                    value: '/subscriptions/fake/resourceGroups/images/providers/Microsoft.Compute/galleries/g/images/i/versions/1.0.3',
                  },
                },
              },
            }],
          },
        });
        const workerPoolStats = new WorkerPoolStats('wpid');

        await provider.provision({ workerPool, workerPoolStats });

        assert.deepEqual(recordedMetrics, [{
          value: 1,
          labels: {
            providerId,
            workerPoolId,
            workerGroup: 'east',
            errorKind: 'creation-error',
            errorCode: 'TimeoutError',
            statusCode: 'unknown',
            provisioningState: 'unknown',
            provisioningOperation: 'Create',
            targetResourceType: 'unknown',
            vmSize: 'Standard_F8s_v2',
            priority: 'Spot',
          },
        }]);
      } finally {
        provider.monitor._metric.azureArmDeploymentError = originalMetric;
        fake.deploymentsClient.deployments.beginCreateOrUpdate = originalBeginCreateOrUpdate;
      }
    });

    test('ARM deployment is cleaned up after successful provisioning', async () => {
      await provisionWorkerPool({
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: {
              value: 'east',
            },
          },
        },
      });

      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      const worker = workers[0];

      const deploymentName = worker.providerData.deployment.name;
      const resourceGroupName = worker.providerData.resourceGroupName;

      assert.ok(fake.deploymentsClient.deployments.deploymentExists(resourceGroupName, deploymentName),
        'deployment should exist before checkWorker');

      // Scan prepare and check worker to trigger deployment completion check
      await provider.scanPrepare();
      await provider.checkWorker({ worker });

      await worker.reload(helper.db);

      // Verify deployment was cleaned up
      assert.ok(!fake.deploymentsClient.deployments.deploymentExists(resourceGroupName, deploymentName),
        'deployment should be deleted after successful provisioning');
      assert.ok(worker.providerData.provisioningComplete,
        'worker should be marked as provisioning complete');
      assert.ok(worker.providerData.deployment.operation,
        'deployment operation should have started at this point');
    });

    test('keeps ARM deployment when keepDeployment is true', async () => {
      await provisionWorkerPool({
        workerManager: {
          capacityPerInstance: 1,
          keepDeployment: true,
        },
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: {
              value: 'east',
            },
          },
        },
      });

      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      const worker = workers[0];

      const deploymentName = worker.providerData.deployment.name;
      const resourceGroupName = worker.providerData.resourceGroupName;

      await provider.scanPrepare();
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);

      assert.equal(worker.providerData.keepDeployment, true, 'keepDeployment flag should be stored on provider data');
      assert.ok(fake.deploymentsClient.deployments.deploymentExists(resourceGroupName, deploymentName),
        'deployment should remain when keepDeployment is true');
      assert.equal(worker.providerData.deployment.id, `id/${deploymentName}`);
    });

    test('handles 409 conflict when deleting active ARM deployment', async () => {
      await provisionWorkerPool({
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: {
              value: 'east',
            },
          },
        },
      });

      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      const worker = workers[0];

      const deploymentName = worker.providerData.deployment.name;
      const resourceGroupName = worker.providerData.resourceGroupName;

      fake.deploymentsClient.deployments.setFakeShouldConflictOnDelete(
        resourceGroupName, deploymentName, true);

      await provider.scanPrepare();
      provider.errors[workerPoolId] = [];
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);

      // Deployment should still exist (delete failed with 409)
      assert.ok(fake.deploymentsClient.deployments.deploymentExists(resourceGroupName, deploymentName),
        'deployment should still exist after 409 conflict');

      // No error should be reported
      assert.equal(provider.errors[workerPoolId].length, 0,
        'no errors should be reported for 409 conflict');

      // Second checkWorker call - should succeed in deleting
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);

      assert.ok(!fake.deploymentsClient.deployments.deploymentExists(resourceGroupName, deploymentName),
        'deployment should be deleted on retry');
    });

    test('failed ARM deployment resources are cleaned up', async () => {
      await provisionWorkerPool({
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: {
              value: 'east',
            },
          },
        },
      });

      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      const worker = workers[0];

      const deploymentName = worker.providerData.deployment.name;
      const resourceGroupName = worker.providerData.resourceGroupName;
      const vmName = worker.providerData.vm.name;

      // simulate partial deployment failure
      fake.deploymentsClient.deploymentOperations.setFakeDeploymentOperations(
        resourceGroupName,
        deploymentName,
        [
          {
            properties: {
              provisioningState: 'Succeeded',
              targetResource: {
                resourceType: 'Microsoft.Network/publicIPAddresses',
                id: `/subscriptions/test/resourceGroups/${resourceGroupName}/providers/Microsoft.Network/publicIPAddresses/fake-ip`,
              },
            },
          },
          {
            properties: {
              provisioningState: 'Succeeded',
              targetResource: {
                resourceType: 'Microsoft.Network/networkInterfaces',
                id: `/subscriptions/test/resourceGroups/${resourceGroupName}/providers/Microsoft.Network/networkInterfaces/fake-nic`,
              },
            },
          },
          {
            properties: {
              provisioningState: 'Failed',
              targetResource: {
                resourceType: 'Microsoft.Compute/virtualMachines',
                id: `/subscriptions/test/resourceGroups/${resourceGroupName}/providers/Microsoft.Compute/virtualMachines/${vmName}`,
              },
            },
          },
        ],
      );

      fake.deploymentsClient.deployments.setFakeDeploymentState(resourceGroupName, deploymentName, 'Failed', 'VM provisioning failed');

      // Trigger deployment check - should extract resources and mark for removal
      await provider.scanPrepare();
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);

      assert.equal(worker.state, 'stopping', 'worker should be marked as stopping');
      assert.ok(worker.providerData.ip?.name, 'should have extracted IP');
      assert.ok(worker.providerData.nic?.name, 'should have extracted NIC');

      // Create fake resources for cleanup testing
      fake.computeClient.virtualMachines.makeFakeResource(resourceGroupName, vmName);
      fake.networkClient.publicIPAddresses.makeFakeResource(resourceGroupName, 'fake-ip');
      fake.networkClient.networkInterfaces.makeFakeResource(resourceGroupName, 'fake-nic');

      // Delete the failed deployment from fake so deprovisionResource can mark it as deleted
      await fake.deploymentsClient.deployments.beginDelete(resourceGroupName, deploymentName);

      // Call deprovisionResources - should merge resources
      await provider.deprovisionResources({ worker, monitor });
      await worker.reload(helper.db);

      assert.ok(worker.providerData.ip, 'IP should be in providerData');
      assert.ok(worker.providerData.nic, 'NIC should be in providerData');
      assert.equal(worker.providerData.ip.name, 'fake-ip', 'IP name should match');
      assert.equal(worker.providerData.nic.name, 'fake-nic', 'NIC name should match');

      // Second call - starts deleting VM
      await provider.deprovisionResources({ worker, monitor });
      await worker.reload(helper.db);

      // Finish VM deletion
      fake.computeClient.virtualMachines.fakeFinishRequest(resourceGroupName, vmName);

      // Third call - VM done, starts deleting NIC
      await provider.deprovisionResources({ worker, monitor });
      await worker.reload(helper.db);

      // Finish NIC deletion
      fake.networkClient.networkInterfaces.fakeFinishRequest(resourceGroupName, 'fake-nic');

      // Fourth call - NIC done, starts deleting IP
      await provider.deprovisionResources({ worker, monitor });
      await worker.reload(helper.db);

      // Finish IP deletion
      fake.networkClient.publicIPAddresses.fakeFinishRequest(resourceGroupName, 'fake-ip');

      // Fifth call - IP done, no disks, deletes deployment and finalizes
      await provider.deprovisionResources({ worker, monitor });
      await worker.reload(helper.db);

      // Worker should now be STOPPED and failedDeploymentResources should be cleaned up
      assert.equal(worker.state, 'stopped', 'worker should be stopped');
      assert.ok(!worker.providerData.failedDeploymentResources, 'failedDeploymentResources should be cleaned up');

      // Deployment should be deleted
      assert.ok(!fake.deploymentsClient.deployments.deploymentExists(resourceGroupName, deploymentName),
        'failed deployment should be deleted');
    });

    test('failed ARM deployment stops re-removing workers once stopping', async () => {
      await provisionWorkerPool({
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: {
              value: 'east',
            },
          },
        },
      });

      const [worker] = await helper.getWorkers();
      const deploymentName = worker.providerData.deployment.name;
      const resourceGroupName = worker.providerData.resourceGroupName;
      const vmName = worker.providerData.vm.name;

      fake.deploymentsClient.deploymentOperations.setFakeDeploymentOperations(
        resourceGroupName,
        deploymentName,
        [
          {
            properties: {
              provisioningState: 'Succeeded',
              targetResource: {
                resourceType: 'Microsoft.Network/publicIPAddresses',
                id: `/subscriptions/test/resourceGroups/${resourceGroupName}/providers/Microsoft.Network/publicIPAddresses/fake-ip`,
              },
            },
          },
          {
            properties: {
              provisioningState: 'Failed',
              targetResource: {
                resourceType: 'Microsoft.Compute/virtualMachines',
                id: `/subscriptions/test/resourceGroups/${resourceGroupName}/providers/Microsoft.Compute/virtualMachines/${vmName}`,
              },
            },
          },
        ],
      );

      fake.deploymentsClient.deployments.setFakeDeploymentState(resourceGroupName, deploymentName, 'Failed', 'VM provisioning failed');

      await provider.scanPrepare();

      const sandbox = sinon.createSandbox({});
      const removeSpy = sandbox.spy(provider, 'removeWorker');
      const removedEventSpy = sandbox.spy(provider, 'onWorkerRemoved');
      const deprovisionStub = sandbox.stub(provider, 'deprovisionResources').resolves();
      const queryInstanceStub = sandbox.stub(provider, 'queryInstance');

      try {
        await provider.checkWorker({ worker });
        await worker.reload(helper.db);

        assert.equal(worker.state, 'stopping', 'worker should transition to stopping');
        assert.equal(removeSpy.callCount, 1, 'removeWorker called once after failure');
        assert.equal(removedEventSpy.callCount, 1, 'worker-removed event emitted once');
        assert.equal(worker.providerData.provisioningComplete, true, 'worker should be marked provisioned after failure');

        await provider.checkWorker({ worker });
        await worker.reload(helper.db);

        assert.equal(removeSpy.callCount, 1, 'removeWorker not re-invoked for stopping worker');
        assert.equal(removedEventSpy.callCount, 1, 'worker-removed event not re-emitted');
        assert(deprovisionStub.calledOnce, 'deprovisioning should proceed once deployment is settled');
        assert.equal(queryInstanceStub.callCount, 0, 'instance query skipped when worker already stopping');
      } finally {
        sandbox.restore();
      }
    });

    test('deployment operation expired does not remove RUNNING worker', async () => {
      await provisionWorkerPool({
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: { value: 'east' },
          },
        },
      });

      const [worker] = await helper.getWorkers();
      const deploymentName = worker.providerData.deployment.name;
      const resourceGroupName = worker.providerData.resourceGroupName;

      // Transition worker to RUNNING (simulating successful registration)
      await worker.update(helper.db, w => {
        w.state = 'running';
      });

      // Delete the deployment from the fake to simulate Azure cleaning it up (404 on get)
      await fake.deploymentsClient.deployments.beginDelete(resourceGroupName, deploymentName);
      // Also clear the operation request so handleOperation returns false (operation expired)
      fake.deploymentsClient._requests.delete(`${resourceGroupName}/${deploymentName}`);

      await provider.scanPrepare();

      const sandbox = sinon.createSandbox({});
      const removeSpy = sandbox.spy(provider, 'removeWorker');
      sandbox.stub(provider, 'queryInstance').resolves({
        instanceState: 'ok',
        instanceStateReason: 'ProvisioningState/succeeded',
      });
      sandbox.stub(provider, 'provisionResources').resolves();

      try {
        await provider.checkWorker({ worker });
        await worker.reload(helper.db);

        assert.equal(removeSpy.callCount, 0, 'removeWorker should not be called for RUNNING worker');
        assert.equal(worker.state, 'running', 'worker should remain running');
        assert.equal(worker.providerData.provisioningComplete, true,
          'provisioningComplete should be set even without removal');
      } finally {
        sandbox.restore();
      }
    });

    test('deployment operation expired removes REQUESTED worker', async () => {
      await provisionWorkerPool({
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: { value: 'east' },
          },
        },
      });

      const [worker] = await helper.getWorkers();
      const deploymentName = worker.providerData.deployment.name;
      const resourceGroupName = worker.providerData.resourceGroupName;

      // Worker stays in REQUESTED state (never registered)

      // Delete the deployment and clear the operation to simulate expiry
      await fake.deploymentsClient.deployments.beginDelete(resourceGroupName, deploymentName);
      fake.deploymentsClient._requests.delete(`${resourceGroupName}/${deploymentName}`);

      await provider.scanPrepare();

      const sandbox = sinon.createSandbox({});
      const removeSpy = sandbox.spy(provider, 'removeWorker');

      try {
        await provider.checkWorker({ worker });
        await worker.reload(helper.db);

        assert.equal(removeSpy.callCount, 1, 'removeWorker should be called for REQUESTED worker');
        assert.equal(worker.state, 'stopping', 'REQUESTED worker should transition to stopping');
      } finally {
        sandbox.restore();
      }
    });

    test('failed ARM deployment does not remove RUNNING worker', async () => {
      await provisionWorkerPool({
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: { value: 'east' },
          },
        },
      });

      const [worker] = await helper.getWorkers();
      const deploymentName = worker.providerData.deployment.name;
      const resourceGroupName = worker.providerData.resourceGroupName;

      // Transition worker to RUNNING
      await worker.update(helper.db, w => {
        w.state = 'running';
      });

      // Set deployment to Failed state
      fake.deploymentsClient.deployments.setFakeDeploymentState(
        resourceGroupName, deploymentName, 'Failed', 'some extension failed');

      fake.deploymentsClient.deploymentOperations.setFakeDeploymentOperations(
        resourceGroupName, deploymentName, []);

      await provider.scanPrepare();

      const sandbox = sinon.createSandbox({});
      const removeSpy = sandbox.spy(provider, 'removeWorker');
      sandbox.stub(provider, 'queryInstance').resolves({
        instanceState: 'ok',
        instanceStateReason: 'ProvisioningState/succeeded',
      });
      sandbox.stub(provider, 'provisionResources').resolves();

      try {
        await provider.checkWorker({ worker });
        await worker.reload(helper.db);

        assert.equal(removeSpy.callCount, 0, 'removeWorker should not be called for RUNNING worker');
        assert.equal(worker.state, 'running', 'worker should remain running');
        assert.equal(worker.providerData.provisioningComplete, true,
          'provisioningComplete should still be set');
      } finally {
        sandbox.restore();
      }
    });

    test('checkWorker continues after completed ARM deployment', async () => {
      await provisionWorkerPool({
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: { value: 'eastus' },
          },
        },
      });

      const [worker] = await helper.getWorkers();

      await worker.update(helper.db, w => {
        w.providerData.provisioningComplete = true;
        // mimic a finished deployment record kept for deprovision
        w.providerData.deployment.id = 'fake-deployment-id';
      });

      const provisionSpy = sinon.spy(provider, 'provisionResources');
      const queryInstanceStub = sinon.stub(provider, 'queryInstance').resolves({
        instanceState: 'ok',
        instanceStateReason: 'ProvisioningState/succeeded',
      });

      try {
        await provider.checkWorker({ worker });

        assert.ok(queryInstanceStub.calledOnce, 'should still query instance after deployment succeeds');
        assert.ok(provisionSpy.calledOnce, 'should continue into post-provision logic');
      } finally {
        queryInstanceStub.restore();
        provisionSpy.restore();
      }
    });

  });

  suite('ARM deployment resource group management', () => {
    const provisionWorkerPool = async (launchConfig, overrides) => {
      const workerPool = await makeWorkerPool({
        config: {
          minCapacity: 1,
          maxCapacity: 1,
          scalingRatio: 1,
          launchConfigs: [{
            workerManager: {
              capacityPerInstance: 1,
            },
            subnetId: 'some/subnet',
            location: 'westus',
            hardwareProfile: { vmSize: 'Basic_A2' },
            storageProfile: {
              osDisk: {},
            },
            ...launchConfig,
          }],
          ...overrides,
        },
        owner: 'whatever@example.com',
        providerData: {},
        emailOnError: false,
      });
      const workerPoolStats = new WorkerPoolStats('wpid');
      await provider.provision({ workerPool, workerPoolStats });
    };

    test('creates resource group if it does not exist', async () => {
      const customRgName = 'test-custom-rg';
      assert.ok(!fake.resourcesClient.resourceGroups.hasFakeResourceGroup(customRgName),
        'custom RG should not exist before provisioning');

      await provisionWorkerPool({
        armDeploymentResourceGroup: customRgName,
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: {
              value: 'eastus',
            },
          },
        },
      });

      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      const worker = workers[0];

      assert.equal(worker.providerData.resourceGroupName, customRgName);
      assert.ok(fake.resourcesClient.resourceGroups.hasFakeResourceGroup(customRgName),
        'custom RG should be created');

      const rg = await fake.resourcesClient.resourceGroups.get(customRgName);
      assert.equal(rg.location, 'eastus', 'RG should be created with correct location');
    });

    test('does not create resource group if using fallback from provider config', async () => {
      const checkExistenceSpy = sinon.spy(fake.resourcesClient.resourceGroups, 'checkExistence');
      const createOrUpdateSpy = sinon.spy(fake.resourcesClient.resourceGroups, 'createOrUpdate');

      await provisionWorkerPool({
        // No armDeploymentResourceGroup specified, should use fallback
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: {
              value: 'eastus',
            },
          },
        },
      });

      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      const worker = workers[0];

      assert.equal(worker.providerData.resourceGroupName, 'rgrp', 'should use fallback RG');
      assert.ok(!checkExistenceSpy.called, 'should not check existence for fallback RG');
      assert.ok(!createOrUpdateSpy.called, 'should not create fallback RG');

      checkExistenceSpy.restore();
      createOrUpdateSpy.restore();
    });

    test('does not check resource group if it already exists', async () => {
      const customRgName = 'test-existing-rg';

      // Pre-create the resource group
      fake.resourcesClient.resourceGroups.makeFakeResourceGroup(customRgName, 'northeurope');

      const checkExistenceSpy = sinon.spy(fake.resourcesClient.resourceGroups, 'checkExistence');
      const createOrUpdateSpy = sinon.spy(fake.resourcesClient.resourceGroups, 'createOrUpdate');

      await provisionWorkerPool({
        armDeploymentResourceGroup: customRgName,
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: {
            location: {
              value: 'westus',
            },
          },
        },
      });

      assert.equal(checkExistenceSpy.callCount, 1, 'should check existence once');
      assert.equal(createOrUpdateSpy.callCount, 0, 'should not create RG if it already exists');

      const rg = await fake.resourcesClient.resourceGroups.get(customRgName);
      assert.equal(rg.location, 'northeurope', 'existing RG location should not change');

      checkExistenceSpy.restore();
      createOrUpdateSpy.restore();
    });

    test('evicts cache and retries after checkExistence failure', async () => {
      const customRgName = 'test-failing-rg';
      const launchConfig = {
        armDeploymentResourceGroup: customRgName,
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: { location: { value: 'eastus' } },
        },
      };

      // Create the pool once; call provision() separately each time
      const workerPool = await makeWorkerPool({
        config: {
          minCapacity: 1,
          maxCapacity: 1,
          scalingRatio: 1,
          launchConfigs: [{
            workerManager: { capacityPerInstance: 1 },
            subnetId: 'some/subnet',
            location: 'westus',
            hardwareProfile: { vmSize: 'Basic_A2' },
            storageProfile: { osDisk: {} },
            ...launchConfig,
          }],
        },
      });

      const checkStub = sinon.stub(fake.resourcesClient.resourceGroups, 'checkExistence');
      checkStub.onFirstCall().rejects(new Error('Azure transient failure'));
      checkStub.onSecondCall().resolves({ body: false });

      const createSpy = sinon.spy(fake.resourcesClient.resourceGroups, 'createOrUpdate');

      // First attempt should fail
      await assert.rejects(
        () => provider.provision({ workerPool, workerPoolStats: new WorkerPoolStats('wpid') }),
        /Azure transient failure/,
      );
      assert.ok(!provider.resourceGroupCache.has(customRgName),
        'cache entry should be evicted after failure');

      // Second attempt should succeed (cache was cleared)
      await provider.provision({ workerPool, workerPoolStats: new WorkerPoolStats('wpid') });

      assert.equal(checkStub.callCount, 2, 'should retry checkExistence after cache eviction');
      assert.equal(createSpy.callCount, 1, 'should create RG on successful retry');

      checkStub.restore();
      createSpy.restore();
    });

    test('second provision reuses cached promise without new API calls', async () => {
      const customRgName = 'test-cached-rg';
      const launchConfig = {
        armDeploymentResourceGroup: customRgName,
        armDeployment: {
          mode: 'Incremental',
          templateLink: {
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Resources/templateSpecs/test/versions/1.0.0',
          },
          parameters: { location: { value: 'eastus' } },
        },
      };

      const workerPool = await makeWorkerPool({
        config: {
          minCapacity: 1,
          maxCapacity: 1,
          scalingRatio: 1,
          launchConfigs: [{
            workerManager: { capacityPerInstance: 1 },
            subnetId: 'some/subnet',
            location: 'westus',
            hardwareProfile: { vmSize: 'Basic_A2' },
            storageProfile: { osDisk: {} },
            ...launchConfig,
          }],
        },
      });

      await provider.provision({ workerPool, workerPoolStats: new WorkerPoolStats('wpid') });

      // Cache should now hold a resolved promise
      assert.ok(provider.resourceGroupCache.has(customRgName),
        'cache should have entry after successful provisioning');
      assert.ok(provider.resourceGroupCache.get(customRgName) instanceof Promise,
        'cache entry should be a promise');

      // Spy after the first call so we can verify the second makes no API calls
      const checkSpy = sinon.spy(fake.resourcesClient.resourceGroups, 'checkExistence');
      const createSpy = sinon.spy(fake.resourcesClient.resourceGroups, 'createOrUpdate');

      await provider.provision({ workerPool, workerPoolStats: new WorkerPoolStats('wpid') });

      assert.equal(checkSpy.callCount, 0, 'should not call checkExistence when promise is cached');
      assert.equal(createSpy.callCount, 0, 'should not call createOrUpdate when promise is cached');

      checkSpy.restore();
      createSpy.restore();
    });
  });

  suite('provisionResources', () => {
    let worker, ipName, nicName, vmName;
    const sandbox = sinon.createSandbox({});

    setup('create un-provisioned worker', async () => {
      const workerPool = await makeWorkerPool({}, {
        workerManager: {
          publicIp: true,
          capacityPerInstance: 1,
        },
      });
      const workerPoolStats = new WorkerPoolStats('wpid');
      await provider.provision({ workerPool, workerPoolStats });
      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      worker = workers[0];

      ipName = worker.providerData.ip.name;
      nicName = worker.providerData.nic.name;
      vmName = worker.providerData.vm.name;

      // stub for removeWorker, for failure cases
      sandbox.stub(provider, 'removeWorker').returns('stopped');

      // reset the state of the provisioner such that we can call its
      // scanning-related methods
      await provider.scanPrepare();
      provider.errors[workerPoolId] = [];
    });

    teardown(() => {
      sandbox.restore();
    });

    test('successful provisioning process', async () => {
      // Ip provisioning should have already started inside the provision() call
      await assertProvisioningState({ ip: 'inprogress' });
      const ipName = worker.providerData.ip.name;
      const nicName = worker.providerData.nic.name;
      const vmName = worker.providerData.vm.name;

      debug('first call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'inprogress' });
      const ipParams = fake.networkClient.publicIPAddresses.getFakeRequestParameters('rgrp', ipName);
      assert.equal(ipParams.location, 'westus');
      assert.equal(ipParams.publicIPAllocationMethod, 'Static');

      debug('second call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'inprogress' });

      debug('IP creation finishes');
      fake.networkClient.publicIPAddresses.fakeFinishRequest('rgrp', ipName);

      debug('third call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'allocated', nic: 'inprogress' });
      const nicParams = fake.networkClient.networkInterfaces.getFakeRequestParameters('rgrp', nicName);
      assert.equal(nicParams.location, 'westus');
      assert.deepEqual(nicParams.ipConfigurations, [
        {
          name: nicName,
          privateIPAllocationMethod: 'Dynamic',
          subnet: { id: 'some/subnet' },
          publicIPAddress: { id: worker.providerData.ip.id },
        },
      ]);

      debug('fourth call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'allocated', nic: 'inprogress' });

      debug('NIC creation finishes');
      fake.networkClient.networkInterfaces.fakeFinishRequest('rgrp', nicName);

      debug('fifth call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ nic: 'allocated', vm: 'inprogress' });
      const vmParams = fake.computeClient.virtualMachines.getFakeRequestParameters('rgrp', vmName);
      assert(!vmParams.capacityPerInstance);
      assert.equal(vmParams.location, 'westus');
      assert.deepEqual(vmParams.hardwareProfile, { vmSize: 'Basic_A2' });
      // these must be set, but we don't care to what..
      assert(vmParams.osProfile.computerName);
      assert(vmParams.osProfile.adminUsername);
      assert(vmParams.osProfile.adminPassword);

      const customData = JSON.parse(Buffer.from(vmParams.osProfile.customData, 'base64'));
      assert.equal(customData.workerPoolId, workerPoolId);
      assert.equal(customData.providerId, providerId);
      assert.equal(customData.workerGroup, 'westus');
      assert.equal(customData.rootUrl, helper.rootUrl);
      assert.deepEqual(customData.workerConfig, {});

      assert.deepEqual(vmParams.networkProfile.networkInterfaces, [
        {
          id: worker.providerData.nic.id,
          primary: true,
        },
      ]);
      assert.equal(vmParams.tags['created-by'], `taskcluster-wm-${providerId}`);
      assert.equal(vmParams.tags['managed-by'], 'taskcluster');
      assert.equal(vmParams.tags['provider-id'], providerId);
      assert.equal(vmParams.tags['worker-group'], 'westus');
      assert.equal(vmParams.tags['worker-pool-id'], workerPoolId);
      assert.equal(vmParams.tags['root-url'], helper.rootUrl);
      assert.equal(vmParams.tags.owner, 'whatever@example.com');

      debug('sixth call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ nic: 'allocated', vm: 'inprogress' });

      debug('VM creation finishes');
      fake.computeClient.virtualMachines.fakeFinishRequest('rgrp', vmName);

      debug('seventh call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ nic: 'allocated', vm: 'allocated' });

      assert(!provider.removeWorker.called);
    });

    test('provisioning process fails creating IP', async () => {
      debug('first call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'inprogress' });

      debug('IP creation fails');
      fake.networkClient.publicIPAddresses.fakeFailRequest('rgrp', ipName, 'uhoh');

      debug('second call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'none', nic: 'none' });
      assert(provider.removeWorker.called);
    });

    test('provisioning process fails creating IP with provisioningState=Failed', async () => {
      debug('first call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'inprogress' });

      debug('IP creation fails');
      fake.networkClient.publicIPAddresses.fakeFinishRequest('rgrp', ipName);
      fake.networkClient.publicIPAddresses.modifyFakeResource('rgrp', ipName, res => {
        res.provisioningState = 'Failed';
      });

      debug('second call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'none', nic: 'none' });
      assert(provider.removeWorker.called);
    });

    test('provisioning process fails creating NIC', async () => {
      debug('first call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'inprogress' });

      debug('IP creation succeeds');
      fake.networkClient.publicIPAddresses.fakeFinishRequest('rgrp', ipName);

      debug('second call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'allocated', nic: 'inprogress' });

      debug('NIC creation fails');
      fake.networkClient.networkInterfaces.fakeFailRequest('rgrp', nicName, 'uhoh');

      debug('third call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'allocated', nic: 'none' });
      assert(provider.removeWorker.called);
    });

    test('provisioning process fails creating VM', async () => {
      debug('first call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'inprogress' });

      debug('IP creation succeeds');
      fake.networkClient.publicIPAddresses.fakeFinishRequest('rgrp', ipName);

      debug('second call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'allocated', nic: 'inprogress' });

      debug('NIC creation succeeds');
      fake.networkClient.networkInterfaces.fakeFinishRequest('rgrp', nicName);

      debug('third call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'allocated', nic: 'allocated', vm: 'inprogress' });

      debug('VM creation fails');
      fake.computeClient.virtualMachines.fakeFailRequest('rgrp', vmName, 'uhoh');

      debug('fourth call');
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'allocated', nic: 'allocated', vm: 'none' });
      assert(provider.removeWorker.called);
    });
  });

  suite('provisionResources with or without public IP', () => {
    let worker, nicName, vmName, ipName;
    const sandbox = sinon.createSandbox({});

    const prepareProvision = async (cfg) => {
      const workerPool = await makeWorkerPool({}, cfg);
      const workerPoolStats = new WorkerPoolStats('wpid');
      await provider.provision({ workerPool, workerPoolStats });
      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      worker = workers[0];

      nicName = worker.providerData.nic.name;
      vmName = worker.providerData.vm.name;
      ipName = worker.providerData.ip.name;

      // stub for removeWorker, for failure cases
      sandbox.stub(provider, 'removeWorker').returns('stopped');

      // reset the state of the provisioner such that we can call its
      // scanning-related methods
      await provider.scanPrepare();
      provider.errors[workerPoolId] = [];
    };

    teardown(() => {
      sandbox.restore();
    });

    test('successful provisioning of VM without public ip', async () => {
      await prepareProvision({
        workerConfig: {
          workerManager: {
            publicIp: false,
          },
        },
      });
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ nic: 'inprogress' });

      debug('NIC creation succeeds');
      fake.networkClient.networkInterfaces.fakeFinishRequest('rgrp', nicName);
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ nic: 'allocated' });

      fake.computeClient.virtualMachines.fakeFinishRequest('rgrp', vmName);
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ vm: 'allocated', ip: 'none', nic: 'allocated' });

      assert(!provider.removeWorker.called);
    });

    test('successful provision of VM with public ip', async () => {
      await prepareProvision({
        workerConfig: {
          genericWorker: {
            description: 'this should not skip IP provisioning',
          },
        },
        workerManager: {
          publicIp: true, // override
        },
      });
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'inprogress' });

      fake.networkClient.publicIPAddresses.fakeFinishRequest('rgrp', ipName);
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ ip: 'allocated' });

      fake.networkClient.networkInterfaces.fakeFinishRequest('rgrp', nicName);
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ nic: 'allocated' });

      fake.computeClient.virtualMachines.fakeFinishRequest('rgrp', vmName);
      await provider.provisionResources({ worker, monitor });
      await assertProvisioningState({ vm: 'allocated', ip: 'allocated', nic: 'allocated' });

      assert(!provider.removeWorker.called);
    });
  });

  suite('removeWorker', () => {
    let worker, ipName, nicName, vmName;
    const sandbox = sinon.createSandbox({});

    // The inline beginDelete added in #8574 is fire-and-forget (the promise
    // returned by `_enqueue` is not awaited inside `removeWorker`). Yielding
    // once via setImmediate lets any p-queue-scheduled work run before the
    // test asserts on its effects, so assertions don't depend on p-queue's
    // scheduling internals.
    const flushInlineBeginDelete = () => new Promise(resolve => setImmediate(resolve));

    setup('create un-provisioned worker', async () => {
      const workerPool = await makeWorkerPool();
      const workerPoolStats = new WorkerPoolStats('wpid');

      // prevent the worker from being immediately provisioned
      sandbox.stub(provider, 'checkWorker').returns('ok');

      await provider.provision({ workerPool, workerPoolStats });

      sandbox.restore();

      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      worker = workers[0];

      ipName = worker.providerData.ip.name;
      nicName = worker.providerData.nic.name;
      vmName = worker.providerData.vm.name;
    });

    const assertRemovalState = async (expectations) => {
      // re-fetch the worker, since it should have been updated
      const workers = await helper.getWorkers();
      assert.equal(workers.length, 1);
      worker = workers[0];

      const checkResourceExpectation = (expectation, resourceType, typeData, index) => {
        const client = clientForResourceType(resourceType);
        switch (expectation) {
          case 'none':
            assert(!typeData.id);
            assert.deepEqual(client.getFakeResource('rgrp', typeData.name), undefined);
            break;
          case 'deleting':
            assert(!typeData.id);
            assert.equal(client.getFakeResource('rgrp', typeData.name).provisioningState, 'Deleting');
            break;
          case 'allocated':
            assert.equal(typeData.id, `id/${typeData.name}`);
            assert.equal(client.getFakeResource('rgrp', typeData.name).provisioningState, 'Succeeded');
            break;
          case undefined: // caller doesn't care about state of this resource
            break;
          default:
            if (index !== undefined) {
              assert(false, `invalid expectation ${resourceType} ${index}: ${expectation}`);
            } else {
              assert(false, `invalid expectation ${resourceType}: ${expectation}`);
            }
        }
      };
      for (const resourceType of ['ip', 'vm', 'nic', 'disks']) {
        // multiple of a resource type
        if (Array.isArray(worker.providerData[resourceType])) {
          for (let i = 0; i < worker.providerData[resourceType].length; i++) {
            checkResourceExpectation(
              expectations[resourceType][i],
              resourceType,
              worker.providerData[resourceType][i],
              i,
            );
          }
        } else {
          checkResourceExpectation(
            expectations[resourceType],
            resourceType,
            worker.providerData[resourceType],
          );
        }
      }
    };

    const makeResource = async (resourceType, gotId, index = undefined) => {
      let name;
      if (index !== undefined) {
        // default name for unnamed multiple resources in arrays
        name = `${resourceType}${index}`;
      } else {
        name = worker.providerData[resourceType].name;
      }
      const client = clientForResourceType(resourceType);
      const res = client.makeFakeResource('rgrp', name);
      // disks start out as [] in providerData
      // mock getting disk info back from azure on VM GET
      if (index !== undefined) {
        await worker.update(helper.db, worker => {
          while (worker.providerData[resourceType].length <= index) {
            worker.providerData[resourceType].push({});
          }
          worker.providerData[resourceType][index].name = name;
        });
      }
      if (gotId) {
        if (index !== undefined) {
          await worker.update(helper.db, worker => {
            worker.providerData[resourceType][index].id = res.id;
          });
        } else {
          await worker.update(helper.db, worker => {
            worker.providerData[resourceType].id = res.id;
          });
        }
      }
    };

    test('full removeWorker process', async () => {
      await makeResource('ip', true);
      await makeResource('nic', true);
      await makeResource('disks', true, 0); // creates disks0
      await makeResource('disks', true, 1); // creates disks1
      await makeResource('vm', true);
      await worker.update(helper.db, worker => {
        worker.state = 'running';
      });

      debug('removeWorker');
      await provider.removeWorker({ worker, reason: 'test' });
      // removeWorker now submits VM beginDelete inline, so by the time
      // deprovisionResources runs the VM is already in Deleting and id has
      // been cleared. flushInlineBeginDelete drains the fire-and-forget
      // queue before we check state.
      await flushInlineBeginDelete();
      await assertRemovalState({ ip: 'allocated', nic: 'allocated', disks: ['allocated', 'allocated'], vm: 'deleting' });
      helper.assertPulseMessage('worker-removed', m => m.payload.workerId === worker.workerId);
      helper.assertNoPulseMessage('worker-stopped');

      debug('first call');
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'allocated', nic: 'allocated', disks: ['allocated', 'allocated'], vm: 'deleting' });

      debug('second call');
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'allocated', nic: 'allocated', disks: ['allocated', 'allocated'], vm: 'deleting' });

      debug('VM deleted');
      await fake.computeClient.virtualMachines.fakeFinishRequest('rgrp', vmName);

      debug('third call');
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'allocated', nic: 'deleting', disks: ['allocated', 'allocated'], vm: 'none' });

      debug('fourth call');
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'allocated', nic: 'deleting', disks: ['allocated', 'allocated'], vm: 'none' });

      debug('NIC deleted');
      await fake.networkClient.networkInterfaces.fakeFinishRequest('rgrp', nicName);

      debug('fifth call');
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'deleting', nic: 'none', disks: ['allocated', 'allocated'], vm: 'none' });

      debug('sixth call');
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'deleting', nic: 'none', disks: ['allocated', 'allocated'], vm: 'none' });

      debug('IP deleted');
      await fake.networkClient.publicIPAddresses.fakeFinishRequest('rgrp', ipName);

      debug('seventh call');
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'none', nic: 'none', disks: ['deleting', 'deleting'], vm: 'none' });

      debug('eighth call');
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'none', nic: 'none', disks: ['deleting', 'deleting'], vm: 'none' });

      debug('disks0 deleted');
      await fake.computeClient.disks.fakeFinishRequest('rgrp', 'disks0');

      debug('ninth call');
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'none', nic: 'none', disks: ['none', 'deleting'], vm: 'none' });

      debug('disks1 deleted');
      await fake.computeClient.disks.fakeFinishRequest('rgrp', 'disks1');

      debug('tenth call');
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'none', nic: 'none', disks: ['none', 'none'], vm: 'none' });
      assert.equal(worker.state, 'stopped');
      helper.assertPulseMessage('worker-stopped', m => m.payload.workerId === worker.workerId);
    });

    test('vm removal fails (keeps waiting)', async () => {
      await makeResource('ip', true);
      await makeResource('nic', true);
      await makeResource('disks', true, 0);
      await makeResource('vm', true);
      await worker.update(helper.db, worker => {
        worker.state = 'running';
      });

      debug('removeWorker');
      await provider.removeWorker({ worker, reason: 'test' });

      debug('first call');
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'allocated', nic: 'allocated', disks: ['allocated'], vm: 'deleting' });

      debug('removal fails');
      await fake.computeClient.virtualMachines.fakeFailRequest('rgrp', vmName, 'uhoh');

      debug('second call');
      await provider.deprovisionResources({ worker, monitor });
      // removeWorker doesn't care, keeps waiting
      await assertRemovalState({ ip: 'allocated', nic: 'allocated', disks: ['allocated'], vm: 'deleting' });
    });

    test('deletes VM by name if id is missing', async () => {
      await makeResource('ip', true);
      await makeResource('nic', true);
      await makeResource('disks', true, 0);
      await makeResource('vm', false);
      await worker.update(helper.db, worker => {
        worker.state = 'running';
      });

      await provider.removeWorker({ worker, reason: 'test' });
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ ip: 'allocated', nic: 'allocated', disks: ['allocated'], vm: 'deleting' });

      // check that there's a request to delete the VM (by name)
      assert.deepEqual(await fake.computeClient.virtualMachines.getFakeRequestParameters('rgrp', vmName), {});
    });

    test('deletes disk by name if no VM/IP/NIC and disk id is missing', async () => {
      await makeResource('disks', false, 0);
      const diskName = worker.providerData.disks[0].name;

      await worker.update(helper.db, worker => {
        worker.providerData.disks[0].id = undefined;
        worker.state = 'running';
      });

      await provider.removeWorker({ worker, reason: 'test' });
      await provider.deprovisionResources({ worker, monitor });
      await assertRemovalState({ disks: ['deleting'] });

      // check that there's a request to delete the disk (by name)
      assert.deepEqual(await fake.computeClient.disks.getFakeRequestParameters('rgrp', diskName), {});
    });

    test('beginDelete 404 race between pre-flight GET and DELETE is handled', async () => {
      // Defense-in-depth for the narrow race where the pre-flight GET sees
      // the resource but it is deleted by another actor before our DELETE
      // lands. Azure's REST contract uses 204 (not 404) for an idempotent
      // DELETE of a missing resource, but keep the 404 handler so a race,
      // proxy difference, or SDK quirk still lets the worker progress.
      await makeResource('ip', true);
      await makeResource('nic', true);
      await makeResource('disks', true, 0);
      await makeResource('disks', true, 1);
      await makeResource('vm', true);
      // Skip removeWorker so we exercise deprovisionResource's pre-flight
      // GET + beginDelete-404 fallback path in isolation. (removeWorker now
      // also submits an inline beginDelete; that is covered by its own
      // tests below.)
      await worker.update(helper.db, worker => {
        worker.state = 'stopping';
      });

      // Resources still exist (GET succeeds) but every beginDelete throws 404
      // as if the resource disappeared between our GET and DELETE.
      const localSandbox = sinon.createSandbox({});
      const throw404 = async () => {
        const err = new Error('not found');
        err.statusCode = 404;
        throw err;
      };
      localSandbox.stub(fake.computeClient.virtualMachines, 'beginDelete').callsFake(throw404);
      localSandbox.stub(fake.networkClient.networkInterfaces, 'beginDelete').callsFake(throw404);
      localSandbox.stub(fake.networkClient.publicIPAddresses, 'beginDelete').callsFake(throw404);
      localSandbox.stub(fake.computeClient.disks, 'beginDelete').callsFake(throw404);

      provider.errors = provider.errors || {};
      provider.errors[workerPoolId] = [];

      try {
        await provider.deprovisionResources({ worker, monitor });
      } finally {
        localSandbox.restore();
      }

      const [reloaded] = await helper.getWorkers();
      assert.equal(reloaded.state, 'stopped', 'worker should reach stopped via the beginDelete-404 fallback');
      assert.equal(reloaded.providerData.vm.deleted, true);
      assert.equal(reloaded.providerData.nic.deleted, true);
      assert.equal(reloaded.providerData.ip.deleted, true);
      assert.equal(reloaded.providerData.disks[0].deleted, true);
      assert.equal(reloaded.providerData.disks[1].deleted, true);
      assert.equal(reloaded.providerData.vm.id, false);
      assert.equal(reloaded.providerData.nic.id, false);
      assert.equal(reloaded.providerData.ip.id, false);
      assert.equal(reloaded.providerData.disks[0].id, false);
      assert.equal(reloaded.providerData.disks[1].id, false);
      assert.deepEqual(provider.errors[workerPoolId], [],
        'no deletion-error should be recorded for out-of-band deletions');
      helper.assertPulseMessage('worker-stopped', m => m.payload.workerId === reloaded.workerId);
    });

    test('pre-flight GET 404 reaps ghost resources in a single cycle (issue #8526)', async () => {
      // Seed the worker with ids so typeData.id is truthy for each resource -
      // this is the state produced by a normal provision/run. Then simulate
      // ARM cascade-delete (deleteOption: 'Delete' on the VM) having already
      // removed every child resource before the scanner arrives.
      await makeResource('ip', true);
      await makeResource('nic', true);
      await makeResource('disks', true, 0);
      await makeResource('disks', true, 1);
      await makeResource('vm', true);
      await worker.update(helper.db, worker => {
        worker.state = 'running';
      });

      await provider.removeWorker({ worker, reason: 'test' });

      fake.computeClient.virtualMachines.removeFakeResource('rgrp', vmName);
      fake.networkClient.networkInterfaces.removeFakeResource('rgrp', nicName);
      fake.networkClient.publicIPAddresses.removeFakeResource('rgrp', ipName);
      fake.computeClient.disks.removeFakeResource('rgrp', 'disks0');
      fake.computeClient.disks.removeFakeResource('rgrp', 'disks1');

      // Simulate production Azure DELETE semantics (per Microsoft API
      // guidelines: DELETE of a missing resource returns 204, not 404). The
      // test fake throws 404 from beginDelete, which masks the bug; override
      // it with a silent-success poller so beginDelete looks idempotent the
      // way real ARM does. If the pre-flight GET is skipped, deprovision will
      // call beginDelete, set id=false, and stall - only marking the resource
      // deleted on the next cycle.
      const localSandbox = sinon.createSandbox({});
      const silentDelete = async () => ({
        getOperationState: () => ({ status: 'Complete', config: {} }),
      });
      const beginDeleteStubs = [
        localSandbox.stub(fake.computeClient.virtualMachines, 'beginDelete').callsFake(silentDelete),
        localSandbox.stub(fake.networkClient.networkInterfaces, 'beginDelete').callsFake(silentDelete),
        localSandbox.stub(fake.networkClient.publicIPAddresses, 'beginDelete').callsFake(silentDelete),
        localSandbox.stub(fake.computeClient.disks, 'beginDelete').callsFake(silentDelete),
      ];

      provider.errors = provider.errors || {};
      provider.errors[workerPoolId] = [];

      try {
        await provider.deprovisionResources({ worker, monitor });
      } finally {
        localSandbox.restore();
      }

      const [reloaded] = await helper.getWorkers();
      assert.equal(reloaded.state, 'stopped',
        'ghost worker should stop in a single deprovisionResources call');
      assert.equal(reloaded.providerData.vm.deleted, true);
      assert.equal(reloaded.providerData.nic.deleted, true);
      assert.equal(reloaded.providerData.ip.deleted, true);
      assert.equal(reloaded.providerData.disks[0].deleted, true);
      assert.equal(reloaded.providerData.disks[1].deleted, true);
      for (const stub of beginDeleteStubs) {
        assert.equal(stub.callCount, 0,
          'beginDelete must not fire when the pre-flight GET already returns 404');
      }
      assert.deepEqual(provider.errors[workerPoolId], []);
      helper.assertPulseMessage('worker-stopped', m => m.payload.workerId === reloaded.workerId);
    });

    for (const midDeleteState of ['Deleting', 'Deallocating', 'Deallocated']) {
      test(`pre-flight GET finds ${midDeleteState}; beginDelete is not re-fired even when typeData.id is truthy`, async () => {
        // When the VM is already in one of the mid-delete states, the old
        // code's `if (typeData.id || shouldDelete)` gate would re-fire
        // beginDelete against it. The fix gates solely on shouldDelete, so
        // we should sit tight and wait for the delete that is already in
        // flight.
        await makeResource('ip', true);
        await makeResource('nic', true);
        await makeResource('disks', true, 0);
        await makeResource('vm', true);
        fake.computeClient.virtualMachines.modifyFakeResource('rgrp', vmName, res => {
          res.provisioningState = midDeleteState;
        });
        // Skip removeWorker; we are testing deprovisionResource's pre-flight
        // GET behavior in isolation. The worker is already in STOPPING and
        // someone else has put the VM into a mid-delete state.
        await worker.update(helper.db, worker => {
          worker.state = 'stopping';
        });

        const localSandbox = sinon.createSandbox({});
        const beginDeleteStub = localSandbox.stub(fake.computeClient.virtualMachines, 'beginDelete');

        try {
          await provider.deprovisionResources({ worker, monitor });
        } finally {
          localSandbox.restore();
        }

        assert.equal(beginDeleteStub.callCount, 0,
          `beginDelete must not fire while the VM is in ${midDeleteState} state`);

        const [reloaded] = await helper.getWorkers();
        assert.equal(reloaded.state, 'stopping',
          'worker should remain in STOPPING while the VM is still mid-delete');
        assert.equal(reloaded.providerData.vm.id, `id/${vmName}`,
          'typeData.id should be preserved; we have not fired our own delete');
        assert.notEqual(reloaded.providerData.vm.deleted, true,
          'vm should not be marked deleted until a subsequent GET sees 404');
      });
    }

    // Tests for the inline beginDelete behaviour added in removeWorker (#8574).
    // Each test uses a fresh sinon spy on the fake's beginDelete so we can
    // assert exactly when the inline call fires.
    suite('inline beginDelete', () => {
      test('RUNNING worker with vm.id set: fires inline beginDelete and clears vm.id', async () => {
        await makeResource('vm', true);
        await worker.update(helper.db, w => {
          w.state = 'running';
          w.providerData.provisioningComplete = true;
        });

        const beginDeleteSpy = sandbox.spy(fake.computeClient.virtualMachines, 'beginDelete');
        await provider.removeWorker({ worker, reason: 'test' });
        await flushInlineBeginDelete();

        assert.equal(beginDeleteSpy.callCount, 1, 'inline beginDelete should fire exactly once');
        assert.deepEqual(beginDeleteSpy.firstCall.args, ['rgrp', vmName]);
        const [reloaded] = await helper.getWorkers();
        assert.equal(reloaded.state, 'stopping');
        assert.equal(reloaded.providerData.vm.id, false,
          'vm.id should be cleared when inline beginDelete is submitted');
        assert.equal(fake.computeClient.virtualMachines.getFakeResource('rgrp', vmName).provisioningState, 'Deleting');
      });

      test('REQUESTED worker without provisioningComplete: skips inline beginDelete', async () => {
        await makeResource('vm', true);
        // worker stays in REQUESTED, provisioningComplete is unset / falsy
        const beginDeleteSpy = sandbox.spy(fake.computeClient.virtualMachines, 'beginDelete');
        await provider.removeWorker({ worker, reason: 'test' });
        await flushInlineBeginDelete();

        assert.equal(beginDeleteSpy.callCount, 0,
          'inline beginDelete must not fire while ARM resource extraction may still be in flight');
        const [reloaded] = await helper.getWorkers();
        assert.equal(reloaded.state, 'stopping');
        assert.equal(reloaded.providerData.vm.id, `id/${vmName}`, 'vm.id should be untouched');
        assert.equal(fake.computeClient.virtualMachines.getFakeResource('rgrp', vmName).provisioningState, 'Succeeded');
      });

      test('REQUESTED worker with provisioningComplete=true and vm.id set: fires inline beginDelete', async () => {
        await makeResource('vm', true);
        await worker.update(helper.db, w => {
          // worker is still REQUESTED but provisioningComplete has been
          // recorded (e.g. ARM deployment finished but VM never reached
          // RUNNING due to a registration failure).
          w.providerData.provisioningComplete = true;
        });

        const beginDeleteSpy = sandbox.spy(fake.computeClient.virtualMachines, 'beginDelete');
        await provider.removeWorker({ worker, reason: 'test' });
        await flushInlineBeginDelete();

        assert.equal(beginDeleteSpy.callCount, 1);
        const [reloaded] = await helper.getWorkers();
        assert.equal(reloaded.providerData.vm.id, false);
      });

      test('RUNNING worker with vm.id falsy (already requested): skips inline beginDelete', async () => {
        // simulate the resource record produced by deprovisionResource
        // submitting beginDelete: id has been cleared, deleted not yet set
        await makeResource('vm', false);
        await worker.update(helper.db, w => {
          w.state = 'running';
          w.providerData.provisioningComplete = true;
        });

        const beginDeleteSpy = sandbox.spy(fake.computeClient.virtualMachines, 'beginDelete');
        await provider.removeWorker({ worker, reason: 'test' });
        await flushInlineBeginDelete();

        assert.equal(beginDeleteSpy.callCount, 0,
          'must not fire when vm.id is falsy: nothing to delete or delete already in flight');
      });

      test('RUNNING worker with vm.deleted=true: skips inline beginDelete', async () => {
        await makeResource('vm', true);
        await worker.update(helper.db, w => {
          w.state = 'running';
          w.providerData.provisioningComplete = true;
          w.providerData.vm.deleted = true;
        });

        const beginDeleteSpy = sandbox.spy(fake.computeClient.virtualMachines, 'beginDelete');
        await provider.removeWorker({ worker, reason: 'test' });
        await flushInlineBeginDelete();

        assert.equal(beginDeleteSpy.callCount, 0,
          'must not re-fire delete on a resource already marked deleted');
      });

      test('inline beginDelete failure does not break removeWorker', async () => {
        await makeResource('vm', true);
        await worker.update(helper.db, w => {
          w.state = 'running';
          w.providerData.provisioningComplete = true;
        });

        const localSandbox = sinon.createSandbox({});
        localSandbox.stub(fake.computeClient.virtualMachines, 'beginDelete').rejects(
          Object.assign(new Error('boom'), { statusCode: 503 }),
        );

        try {
          await provider.removeWorker({ worker, reason: 'test' });
          await flushInlineBeginDelete();
        } finally {
          localSandbox.restore();
        }

        // removeWorker resolves cleanly; the worker still transitions to
        // STOPPING so the scanner-driven fallback can pick up cleanup.
        const [reloaded] = await helper.getWorkers();
        assert.equal(reloaded.state, 'stopping');
        // vm.id was cleared when we submitted the request (whether or not
        // Azure ultimately accepted it), matching deprovisionResource's
        // convention. The scanner uses vm.name to retry.
        assert.equal(reloaded.providerData.vm.id, false);
      });

      test('idempotent: second removeWorker call does not re-fire inline beginDelete', async () => {
        await makeResource('vm', true);
        await worker.update(helper.db, w => {
          w.state = 'running';
          w.providerData.provisioningComplete = true;
        });

        const beginDeleteSpy = sandbox.spy(fake.computeClient.virtualMachines, 'beginDelete');
        await provider.removeWorker({ worker, reason: 'test' });
        await flushInlineBeginDelete();
        assert.equal(beginDeleteSpy.callCount, 1);

        // re-fetch worker to capture the post-first-call state, then call again
        const [afterFirst] = await helper.getWorkers();
        await provider.removeWorker({ worker: afterFirst, reason: 'test' });
        await flushInlineBeginDelete();
        assert.equal(beginDeleteSpy.callCount, 1,
          'second removeWorker should not fire another beginDelete');
      });
    });
  });

  suite('deprovision', () => {
    test('de-provisioning loop', async () => {
      const workerPool = await makeWorkerPool({
        // simulate previous provisionig and deleting the workerpool
        providerId: 'null-provider',
        previousProviderIds: ['azure'],
      });
      await provider.deprovision({ workerPool });
      // nothing has changed..
      assert(workerPool.previousProviderIds.includes('azure'));
    });
  });

  suite('checkWorker', () => {
    let worker;
    const sandbox = sinon.createSandbox({});
    setup('set up for checkWorker', async () => {
      await provider.scanPrepare();

      worker = Worker.fromApi({
        workerPoolId,
        workerGroup: 'westus',
        workerId: 'whatever',
        providerId,
        created: taskcluster.fromNow('0 seconds'),
        lastModified: taskcluster.fromNow('0 seconds'),
        lastChecked: taskcluster.fromNow('0 seconds'),
        expires: taskcluster.fromNow('90 seconds'),
        capacity: 1,
        state: 'running',
        providerData: baseProviderData,
      });
      await worker.create(helper.db);

      // stubs for removeWorker and provisionResources
      sandbox.stub(provider, 'removeWorker').returns('stopped');
      sandbox.stub(provider, 'provisionResources').returns('requested');
      sandbox.stub(provider, 'deprovisionResources').returns('requested');
    });

    teardown(() => {
      sandbox.restore();
    });

    const setState = async ({ state, powerStates }) => {
      await worker.update(helper.db, worker => {
        worker.state = state;
      });
      if (powerStates) {
        fake.computeClient.virtualMachines.setFakeInstanceView('rgrp', baseProviderData.vm.name, {
          statuses: powerStates.map(code=>({ code })),
        });
      }
    };

    test('calls provisionResources for still-running workers', async () => {
      await setState({ state: 'running', powerStates: ['ProvisioningState/succeeded', 'PowerState/running'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert.equal(worker.state, 'running');
      assert(!provider.removeWorker.called);
      assert(provider.provisionResources.called);
    });

    test('calls provisionResources for requested workers that have no instanceView', async () => {
      await setState({ state: 'requested', powerStates: null });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert.equal(worker.state, 'requested'); // registerWorker changes this, not checkWorker
      assert(!provider.removeWorker.called);
      assert(provider.provisionResources.called);
    });

    test('calls removeWorker after repeated instanceView 404s, even if vm get succeeds', async () => {
      await setState({ state: 'running', powerStates: null });
      fake.computeClient.virtualMachines.makeFakeResource('rgrp', baseProviderData.vm.name, {
        provisioningState: 'Succeeded',
        vmId: 'vmid/repeated-404',
      });

      await provider.checkWorker({ worker });
      await provider.checkWorker({ worker });
      assert(!provider.removeWorker.called);
      assert.equal(provider.provisionResources.callCount, 2);

      await provider.checkWorker({ worker });
      assert(provider.removeWorker.calledOnce);
      assert.equal(provider.provisionResources.callCount, 2);
    });

    test('calls provisionResources for requested workers that are fully started', async () => {
      await setState({ state: 'requested', powerStates: ['ProvisioningState/succeeded', 'PowerState/running'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert.equal(worker.state, 'requested'); // registerWorker changes this, not checkWorker
      assert(!provider.removeWorker.called);
      assert(provider.provisionResources.called);
    });

    test('calls removeWorker() for a running worker that is stopping', async () => {
      await setState({ state: 'running', powerStates: ['PowerState/stopping'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(provider.removeWorker.called);
      assert(!provider.provisionResources.called);
    });

    test('calls removeWorker() for a running worker that is stopped', async () => {
      await setState({ state: 'running', powerStates: ['PowerState/stopped'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(provider.removeWorker.called);
      assert(!provider.provisionResources.called);
    });

    test('calls removeWorker() for a running worker that is deallocating', async () => {
      await setState({ state: 'running', powerStates: ['PowerState/deallocating'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(provider.removeWorker.called);
      assert(!provider.provisionResources.called);
    });

    test('calls removeWorker() for a running worker that is deallocated', async () => {
      await setState({ state: 'running', powerStates: ['PowerState/deallocated'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(provider.removeWorker.called);
      assert(!provider.provisionResources.called);
    });

    test('calls removeWorker() for a requested worker that has failed OS Provisioning', async () => {
      await setState({ state: 'requested', powerStates: ['ProvisioningState/failed/OSProvisioningTimedOut'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(provider.removeWorker.called);
      assert(!provider.provisionResources.called);
    });

    test('does not call removeWorker() for a requested worker with failed provisioning but PowerState/running', async () => {
      await setState({ state: 'requested', powerStates: ['ProvisioningState/failed/OSProvisioningClientError', 'PowerState/running'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(!provider.removeWorker.called);
      assert(provider.provisionResources.called);
    });

    test('calls removeWorker() for a requested worker with failed provisioning and no PowerState/running', async () => {
      await setState({ state: 'requested', powerStates: ['ProvisioningState/failed/OSProvisioningClientError', 'PowerState/stopped'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(provider.removeWorker.called);
      assert(!provider.provisionResources.called);
    });

    test('removes worker with failed provisioning + PowerState/running after terminateAfter expires', async () => {
      await setState({ state: 'requested', powerStates: ['ProvisioningState/failed/OSProvisioningClientError', 'PowerState/running'] });
      await worker.update(helper.db, worker => {
        worker.providerData.terminateAfter = Date.now() - 1000;
      });
      await provider.checkWorker({ worker });
      assert(provider.removeWorker.called);
      assert(!provider.provisionResources.called);
    });

    test('calls provisionResources for a requested worker that is present but has failed OS Provisioning, if ignoring that', async () => {
      await worker.update(helper.db, worker => {
        worker.providerData.ignoreFailedProvisioningStates = ['OSProvisioningTimedOut', 'SomethingElse'];
      });
      await setState({ state: 'requested', powerStates: ['ProvisioningState/failed/OSProvisioningTimedOut'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(!provider.removeWorker.called);
      assert(provider.provisionResources.called);
    });

    test('calls removeWorker() for a requested worker that has failed with an internal error that is not ignored', async () => {
      await worker.update(helper.db, worker => {
        worker.providerData.ignoreFailedProvisioningStates = ['OSProvisioningTimedOut', 'SomethingElse'];
      });
      await setState({ state: 'requested', powerStates: ['ProvisioningState/failed/InternalOperationError'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(provider.removeWorker.called);
      assert(!provider.provisionResources.called);
    });

    test('calls deprovisionResources() for a stopping worker that is running', async () => {
      // this is the state of a worker after a `removeWorker` API call, for example
      await setState({ state: 'stopping', powerStates: ['PowerState/running'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(!provider.removeWorker.called);
      assert(!provider.provisionResources.called);
      assert(provider.deprovisionResources.called);
    });

    test('calls deprovisionResources() for a stopping worker that is stopped', async () => {
      await setState({ state: 'stopping', powerStates: ['PowerState/stopped'] });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(!provider.removeWorker.called);
      assert(!provider.provisionResources.called);
      assert(provider.deprovisionResources.called);
    });

    test('remove unregistered workers after terminateAfter', async () => {
      await setState({ state: 'requested', powerStates: ['ProvisioningState/succeeded', 'PowerState/running'] });
      await worker.update(helper.db, worker => {
        worker.providerData.terminateAfter = Date.now() - 1000;
      });
      await provider.checkWorker({ worker });
      assert(provider.removeWorker.called);
      assert(!provider.provisionResources.called);
    });

    test('do not remove unregistered workers before terminateAfter', async () => {
      await setState({ state: 'requested', powerStates: ['ProvisioningState/succeeded', 'PowerState/running'] });
      await worker.update(helper.db, worker => {
        worker.providerData.terminateAfter = Date.now() + 1000;
      });
      await provider.checkWorker({ worker });
      await worker.reload(helper.db);
      assert(worker.state === 'requested');
      assert(!provider.removeWorker.called);
      assert(provider.provisionResources.called);
    });

    test('do not remove registered workers with stale terminateAfter', async () => {
      await setState({ state: 'requested', powerStates: ['ProvisioningState/succeeded', 'PowerState/running'] });
      // simulate situation where worker scanner was running slow and in-memory worker was already updated in db
      await worker.update(helper.db, worker => {
        worker.providerData.terminateAfter = Date.now() - 1000;
      });

      const reloadSandbox = sinon.createSandbox({});
      reloadSandbox.stub(worker, 'reload').callsFake(function reloadWorker() {
        this.providerData.terminateAfter = Date.now() + 1000;
      });
      await provider.checkWorker({ worker });

      assert(worker.reload.called);
      reloadSandbox.restore();

      await worker.reload(helper.db);
      assert(worker.state === 'requested');
      assert(!provider.removeWorker.called);
      assert(provider.provisionResources.called);
    });

    test('remove zombie worker with no queue activity', async () => {
      await setState({ state: 'running', powerStates: ['ProvisioningState/succeeded', 'PowerState/running'] });
      await worker.update(helper.db, worker => {
        worker.providerData.queueInactivityTimeout = 1;
      });
      worker.firstClaim = null;
      worker.lastDateActive = null;
      await provider.checkWorker({ worker });
      assert(provider.removeWorker.called);
    });
    test('remove zombie worker that was active long ago', async () => {
      await setState({ state: 'running', powerStates: ['ProvisioningState/succeeded', 'PowerState/running'] });
      await worker.update(helper.db, worker => {
        worker.created = taskcluster.fromNow('-120 minutes');
        worker.providerData.queueInactivityTimeout = 120;
      });
      worker.firstClaim = taskcluster.fromNow('-110 minutes');
      worker.lastDateActive = taskcluster.fromNow('-100 minutes');
      await provider.checkWorker({ worker });
      assert(provider.removeWorker.called);
    });
    test('doesn\'t remove zombie worker that was recently active', async () => {
      await setState({ state: 'running', powerStates: ['ProvisioningState/succeeded', 'PowerState/running'] });
      await worker.update(helper.db, worker => {
        worker.created = taskcluster.fromNow('-120 minutes');
        worker.providerData.queueInactivityTimeout = 60 * 60 * 4 * 1000;
      });
      worker.firstClaim = taskcluster.fromNow('-110 minutes');
      worker.lastDateActive = taskcluster.fromNow('-100 minutes');
      await provider.checkWorker({ worker });
      assert(!provider.removeWorker.called);
    });

    test('reports worker-pool error when ARM deployment fails', async () => {
      const reportErrorStub = sandbox.stub(provider, 'reportError').resolves();
      const recordedMetrics = [];
      const originalMetric = provider.monitor._metric.azureArmDeploymentError;
      provider.monitor._metric.azureArmDeploymentError = (value, labels) => {
        recordedMetrics.push({ value, labels });
      };
      const existingWorkerPool = await WorkerPool.get(helper.db, workerPoolId);
      if (!existingWorkerPool) {
        await makeWorkerPool();
      }

      try {
        const deploymentName = 'deploy-failure';
        await worker.update(helper.db, worker => {
          worker.providerData = {
            ...worker.providerData,
            deploymentMethod: 'arm-template',
            armDeployment: {
              parameters: {
                vmSize: { value: 'Standard_D32ads_v6' },
                priority: { value: 'Spot' },
                imageId: {
                  value: '/subscriptions/fake-sub/resourceGroups/images/providers/Microsoft.Compute/galleries/images/versions/1.2.3',
                },
              },
            },
            deployment: {
              name: deploymentName,
              operation: 'op/deployment',
              id: false,
            },
            provisioningComplete: false,
          };
        });

        await fake.deploymentsClient.deployments.beginCreateOrUpdate('rgrp', deploymentName, {
          parameters: {
            vmName: { value: worker.providerData.vm.name },
          },
        });
        fake.deploymentsClient.deployments.setFakeDeploymentState(
          'rgrp',
          deploymentName,
          'Failed',
          'At least one resource deployment operation failed.',
        );

        const operation = {
          id: '/fake-operation/1',
          properties: {
            provisioningState: 'Failed',
            provisioningOperation: 'Create',
            statusCode: 'Conflict',
            statusMessage: {
              status: 'Failed',
              error: {
                code: 'DeploymentFailed',
                message: 'At least one resource deployment operation failed.',
                details: [{
                  code: 'NotSupported',
                  message: 'Ephemeral OS disk is not supported for VM size Standard_D32ads_v6.',
                }, {
                  code: 'AnotherNestedError',
                  message: 'Second nested detail should not create another metric sample.',
                }],
              },
            },
            targetResource: {
              id: `/subscriptions/fake-sub/resourceGroups/rgrp/providers/Microsoft.Compute/virtualMachines/${worker.providerData.vm.name}`,
              resourceType: 'Microsoft.Compute/virtualMachines',
              resourceName: worker.providerData.vm.name,
            },
            timestamp: '2025-11-12T18:25:38.128Z',
            trackingId: 'tracking-id',
          },
        };
        fake.deploymentsClient.deploymentOperations.setFakeDeploymentOperations('rgrp', deploymentName, [operation]);

        await setState({ state: 'requested' });

        await provider.checkWorker({ worker });

        sandbox.assert.calledOnce(reportErrorStub);
        const reportedError = reportErrorStub.firstCall.args[0];
        assert.equal(reportedError.kind, 'arm-deployment-error');
        assert.equal(reportedError.title, 'ARM Deployment Error');
        assert(reportedError.description.includes('At least one resource deployment operation failed'));
        assert.equal(reportedError.workerPool.workerPoolId, workerPoolId);
        assert.equal(reportedError.extra.operations.length, 1);
        assert.equal(reportedError.extra.operations[0].statusMessage.error.code, 'DeploymentFailed');
        assert.equal(reportedError.extra.operations[0].statusMessage.error.details[0].code, 'NotSupported');
        assert.equal(reportedError.extra.operations[0].statusMessage.error.details[1].code, 'AnotherNestedError');
        assert.equal(reportedError.extra.operations[0].targetResource.resourceType, 'Microsoft.Compute/virtualMachines');
        assert.deepEqual(recordedMetrics, [{
          value: 1,
          labels: {
            providerId,
            workerPoolId,
            workerGroup: 'westus',
            errorKind: 'arm-deployment-error',
            errorCode: 'NotSupported',
            statusCode: 'Conflict',
            provisioningState: 'Failed',
            provisioningOperation: 'Create',
            targetResourceType: 'Microsoft.Compute/virtualMachines',
            vmSize: 'Standard_D32ads_v6',
            priority: 'Spot',
          },
        }]);
      } finally {
        provider.monitor._metric.azureArmDeploymentError = originalMetric;
      }
    });
  });

  suite('registerWorker', () => {
    const workerGroup = 'westus';
    const vmId = azureSignatures[0].vmId;
    const baseWorker = {
      workerPoolId,
      workerGroup,
      workerId: 'some-vm',
      providerId,
      created: taskcluster.fromNow('0 seconds'),
      lastModified: taskcluster.fromNow('0 seconds'),
      lastChecked: taskcluster.fromNow('0 seconds'),
      capacity: 1,
      expires: taskcluster.fromNow('90 seconds'),
      state: 'requested',
      providerData: {
        ...baseProviderData,
        vm: {
          name: 'some-vm',
          vmId: vmId,
        },
      },
    };

    setup('create vm', () => {
      fake.computeClient.virtualMachines.makeFakeResource('rgrp', 'some-vm', {
        vmId,
      });
    });

    for (const { name, defaultWorker } of [
      { name: 'pre-IDd', defaultWorker: baseWorker },
      {
        name: 'fetch-in-register',
        defaultWorker: {
          ...baseWorker,
          providerData: {
            ...baseProviderData,
            vm: {
              name: 'some-vm',
            },
          },
        },
      },
    ]) {
      suite(name, () => {
        test('Test same certificate multiple times', async () => {
          // https://github.com/taskcluster/taskcluster/issues/7685
          // verification can fail if same cert is present twice in CA Store but with different parents
          // if we check same cert few times, it would start failing
          const workerPool = await makeWorkerPool();
          const [{ vmId, document }] = azureSignatures;
          for (let i = 0; i < 5; i++) {
            const worker = Worker.fromApi({
              ...defaultWorker,
              workerId: vmId,
              providerData: { ...baseProviderData, vm: { vmId, name: 'some-vm' } },
            });
            await worker.create(helper.db);
            const workerIdentityProof = { document };
            await provider.registerWorker({ workerPool, worker, workerIdentityProof });
            helper.assertPulseMessage('worker-running');
            await helper.db.fns.delete_worker(worker.workerPoolId, worker.workerGroup, worker.workerId);
          }
        });
        test('document is not a valid PKCS#7 message', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
          });
          await worker.create(helper.db);
          const document = 'this is not a valid PKCS#7 message';
          const workerIdentityProof = { document };
          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.error.includes('Too few bytes to read ASN.1 value.'));
          assert.equal(monitor.manager.messages[0].Fields.document, document);
          helper.assertNoPulseMessage('worker-running');
        });

        test('document is empty', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
          });
          await worker.create(helper.db);
          const document = '';
          const workerIdentityProof = { document };
          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.error.includes('Too few bytes to parse DER.'));
          helper.assertNoPulseMessage('worker-running');
        });

        test('message does not match signature', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
          });
          await worker.create(helper.db);
          // this file is a version of azure_signature_good.json where vmId has been edited in the message
          const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_message_bad')).toString();
          const workerIdentityProof = { document };
          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.message.includes('Error extracting PKCS#7 message'));
          helper.assertNoPulseMessage('worker-running');
        });

        test('malformed signature', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
          });
          await worker.create(helper.db);
          // this file is a version of azure_signature_good.json where the message signature has been edited
          const document = fs.readFileSync(path.resolve(__dirname, 'fixtures/azure_signature_bad')).toString();
          const workerIdentityProof = { document };
          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.message.includes('Error verifying PKCS#7 message signature'));
          helper.assertNoPulseMessage('worker-running');
        });

        test('wrong signer subject', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
          });
          await worker.create(helper.db);
          // A message signed by a cert with the wrong subject
          // "/CN=metadata.azure.org" (instead of .com)
          const message = fs.readFileSync(
            path.resolve(__dirname, 'fixtures/azure_wrong_subject.pkcs7')).toString();
          const content = message.split('\n').slice(1, -1).join();
          const workerIdentityProof = { document: content };
          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          const log = monitor.manager.messages[0].Fields;
          assert.equal(log.message, 'Error extracting PKCS#7 message');
          assert.equal(
            log.error,
            'Error: Unparsed DER bytes remain after ASN.1 parsing.');
        });

        test('expired message', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
          });
          await worker.create(helper.db);

          // see services/worker-manager/README.md#Testing on how this file was obtained
          const workerIdentityProof = { document: azureSignatures[0].document };
          provider._now = () => new Date(new Date().getFullYear() + 1, 1, 1); // in the future for this fixture
          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          assert(monitor.manager.messages.filter(
            row => row.Type === 'registration-error-warning',
          )[0].Fields.message.includes('Expired message'));
        });

        test('fail to download cert', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
          });
          await worker.create(helper.db);
          const workerIdentityProof = { document: azureSignatures[0].document };

          const oldDownloadBinaryResponse = provider.downloadBinaryResponse;

          // to force download we should drop intermediate certs
          removeAllCertsFromStore();
          const intermediateCert = getIntermediateCert();

          // Disable downloads
          provider.downloadBinaryResponse = (url) => {
            return new Promise((resolve, reject) => {
              reject(Error('Mocked downloadBinaryResponse'));
            });
          };

          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          const log0 = monitor.manager.messages[0].Fields;
          assert.equal(log0.message, 'Error downloading intermediate certificate');
          assert.equal(
            log0.error,
            `Error: Mocked downloadBinaryResponse; location=${intermediateCertUrl}`);
          const expectedSubject = dnToString(intermediateCert.subject);
          const expectedAIA = JSON.stringify([
            { method: 'CA Issuer', location: intermediateCertUrl },
            { method: "OSCP", location: "http://oneocsp.microsoft.com/ocsp" },
          ]);
          const log1 = monitor.manager.messages[1].Fields;
          assert.equal(log1.message, 'Unable to download intermediate certificate');
          assert.equal(
            log1.error,
            `Certificate "${expectedSubject}"; AuthorityAccessInfo ${expectedAIA}`);

          // Restore test fixture
          restoreAllCerts();
          provider.downloadBinaryResponse = oldDownloadBinaryResponse;
        });

        test('certificate download timeout', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
          });
          await worker.create(helper.db);
          const workerIdentityProof = { document: azureSignatures[0].document };

          const slowServer = http.createServer(() => {});
          await new Promise(resolve => slowServer.listen(0, '127.0.0.1', resolve));
          const slowUrl = `http://127.0.0.1:${slowServer.address().port}`;

          const oldDownloadBinaryResponse = provider.downloadBinaryResponse;
          provider.downloadBinaryResponse = async () => got(slowUrl, {
            responseType: 'buffer',
            resolveBodyOnly: true,
            timeout: { request: 1 },
            retry: { limit: 0 },
          });

          removeAllCertsFromStore();
          const intermediateCert = getIntermediateCert();

          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          const log0 = monitor.manager.messages[0].Fields;
          assert.equal(log0.message, 'Error downloading intermediate certificate');
          assert.equal(log0.error, `TimeoutError: Timeout awaiting 'request' for 1ms; location=${intermediateCertUrl}`);
          const expectedSubject = dnToString(intermediateCert.subject);
          const expectedAIA = JSON.stringify([
            { method: 'CA Issuer', location: intermediateCertUrl },
            { method: "OSCP", location: "http://oneocsp.microsoft.com/ocsp" },
          ]);
          const log1 = monitor.manager.messages[1].Fields;
          assert.equal(log1.message, 'Unable to download intermediate certificate');
          assert.equal(
            log1.error,
            `Certificate "${expectedSubject}"; AuthorityAccessInfo ${expectedAIA}`);

          // Restore test fixture
          await new Promise(resolve => slowServer.close(resolve));
          restoreAllCerts();
          provider.downloadBinaryResponse = oldDownloadBinaryResponse;
          helper.assertNoPulseMessage('worker-running');
        });

        test('download is not binary cert', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
          });
          await worker.create(helper.db);
          const workerIdentityProof = { document: azureSignatures[0].document };

          const oldDownloadBinaryResponse = provider.downloadBinaryResponse;

          // to force download we should drop intermediate certs
          removeAllCertsFromStore();
          const intermediateCert = getIntermediateCert();

          // Download is not a binary certificate
          provider.downloadBinaryResponse = async url =>
            '<html><body><h1>Apache2 Default Page</h1></body></html>';

          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          const log0 = monitor.manager.messages[0].Fields;
          assert.equal(log0.message, 'Error reading intermediate certificate');
          assert.equal(
            log0.error,
            `Error: Too few bytes to read ASN.1 value.; location=${intermediateCertUrl}`);
          const expectedSubject = dnToString(intermediateCert.subject);
          const expectedAIA = JSON.stringify([
            { method: 'CA Issuer', location: intermediateCertUrl },
            { method: "OSCP", location: "http://oneocsp.microsoft.com/ocsp" },
          ]);
          const log1 = monitor.manager.messages[1].Fields;
          assert.equal(log1.message, 'Unable to download intermediate certificate');
          assert.equal(
            log1.error,
            `Certificate "${expectedSubject}"; AuthorityAccessInfo ${expectedAIA}`);

          // Restore test fixture
          restoreAllCerts();
          provider.downloadBinaryResponse = oldDownloadBinaryResponse;
        });

        test('logs rejected intermediate certificate URL', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
          });
          await worker.create(helper.db);

          removeAllCertsFromStore();
          const rejectedUrl = 'http://evil.example/cert.crt';
          const workerIdentityProof = {
            document: createWorkerIdentityProofWithAiaUrl({ vmId, aiaUrl: rejectedUrl }),
          };

          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);

          const log0 = monitor.manager.messages[0];
          assert.equal(log0.Type, 'registration-rejected-intermediate-certificate-url');
          assert.equal(log0.Fields.url, rejectedUrl);
          assert.equal(log0.Fields.workerPoolId, workerPool.workerPoolId);
          assert.equal(log0.Fields.providerId, providerId);
          assert.equal(log0.Fields.workerId, worker.workerId);

          restoreAllCerts();
        });

        test('bad cert', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
          });
          await worker.create(helper.db);
          const workerIdentityProof = { document: azureSignatures[0].document };

          // to force download we should drop intermediate certs
          removeAllCertsFromStore();
          const intermediateCert = getIntermediateCert();

          // Remove the Baltimore CyberTrust Root CA
          const rootCert = provider.caStore.getIssuer(intermediateCert);
          const deletedRoot = provider.caStore.removeCertificate(rootCert);
          assert(deletedRoot);

          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          const log0 = monitor.manager.messages[0].Fields;
          assert.equal(log0.message, 'Error verifying new intermediate certificate');
          assert.equal(
            log0.error,
            `Issuer "${dnToString(rootCert.subject)}"` +
            ` for "${dnToString(intermediateCert.subject)}" is not a known Root CA`);

          // Restore test fixture
          provider.caStore.addCertificate(deletedRoot);
          restoreAllCerts();
          helper.assertNoPulseMessage('worker-running');
        });

        test('wrong worker state (duplicate call to registerWorker)', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
            state: 'running',
          });
          await worker.create(helper.db);
          const workerIdentityProof = { document: azureSignatures[0].document };
          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.error.includes('already running'));
        });

        test('wrong vmID', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
            providerData: {
              ...baseProviderData,
              vm: {
                name: baseProviderData.vm.name,
                vmId: 'wrongeba3-807b-46dd-aef5-78aaf9193f71',
              },
            },
          });
          await worker.create(helper.db);
          const workerIdentityProof = { document: azureSignatures[0].document };
          await assert.rejects(() =>
            provider.registerWorker({ workerPool, worker, workerIdentityProof }),
          /Signature validation error/);
          assert(monitor.manager.messages[0].Fields.message.includes('vmId mismatch'));
          assert.equal(monitor.manager.messages[0].Fields.vmId, vmId);
          assert.equal(monitor.manager.messages[0].Fields.expectedVmId, 'wrongeba3-807b-46dd-aef5-78aaf9193f71');
          assert.equal(monitor.manager.messages[0].Fields.workerId, 'some-vm');
          helper.assertNoPulseMessage('worker-running');
        });

        test('sweet success', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
            providerData: {
              ...defaultWorker.providerData,
              workerConfig: {
                "someKey": "someValue",
              },
            },
          });
          await worker.create(helper.db);
          const workerIdentityProof = { document: azureSignatures[0].document };
          const res = await provider.registerWorker({ workerPool, worker, workerIdentityProof });
          // allow +- 10 seconds since time passes while the test executes
          assert(res.expires - Date.now() + 10000 > 96 * 3600 * 1000, res.expires);
          assert(res.expires - Date.now() - 10000 < 96 * 3600 * 1000, res.expires);
          assert.equal(res.workerConfig.someKey, 'someValue');
        });

        test('sweet success (different reregister)', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
            providerData: {
              ...defaultWorker.providerData,
              workerConfig: {
                "someKey": "someValue",
              },
            },
          });
          await worker.create(helper.db);

          await worker.update(helper.db, worker => {
            worker.providerData.reregistrationTimeout = 10 * 3600 * 1000;
          });
          const workerIdentityProof = { document: azureSignatures[0].document };
          const res = await provider.registerWorker({ workerPool, worker, workerIdentityProof });
          // allow +- 10 seconds since time passes while the test executes
          assert(res.expires - Date.now() + 10000 > 10 * 3600 * 1000, res.expires);
          assert(res.expires - Date.now() - 10000 < 10 * 3600 * 1000, res.expires);
          assert.equal(res.workerConfig.someKey, 'someValue');
          helper.assertPulseMessage('worker-running', m => m.payload.workerId === worker.workerId);
          helper.assertPulseMessage('worker-running', m => m.payload.launchConfigId === worker.launchConfigId);
        });

        test('success after downloading missing intermediate', async () => {
          const workerPool = await makeWorkerPool();
          const worker = Worker.fromApi({
            ...defaultWorker,
            providerData: {
              ...defaultWorker.providerData,
              workerConfig: {
                "someKey": "someValue",
              },
            },
          });
          await worker.create(helper.db);
          const workerIdentityProof = { document: azureSignatures[0].document };

          removeAllCertsFromStore();

          const res = await provider.registerWorker({ workerPool, worker, workerIdentityProof });
          // allow +- 10 seconds since time passes while the test executes
          assert(res.expires - Date.now() + 10000 > 96 * 3600 * 1000, res.expires);
          assert(res.expires - Date.now() - 10000 < 96 * 3600 * 1000, res.expires);
          assert.equal(res.workerConfig.someKey, 'someValue');

          const log0 = monitor.manager.messages[0];
          assert.equal(log0.Type, 'registration-new-intermediate-certificate');
          assert.equal(
            log0.Fields.fingerprint,
            intermediateCertFingerprint);
          assert.equal(log0.Fields.issuer, intermediateCertIssuer);
          assert.equal(log0.Fields.subject, intermediateCertSubject);
          assert.equal(log0.Fields.url, intermediateCertUrl);
          helper.assertPulseMessage('worker-running', m => m.payload.workerId === worker.workerId);
        });
      });
    }
  });

  suite('FakeRestClient throttle / header support', () => {
    let worker;
    setup(async () => {
      await makeWorkerPool();
      worker = Worker.fromApi({
        workerPoolId,
        workerGroup: 'westus',
        workerId: 'throttle-test',
        providerId,
        created: taskcluster.fromNow('0 seconds'),
        lastModified: taskcluster.fromNow('0 seconds'),
        lastChecked: taskcluster.fromNow('0 seconds'),
        expires: taskcluster.fromNow('90 seconds'),
        capacity: 1,
        state: 'requested',
        providerData: {
          ...baseProviderData,
          vm: { name: 'throttle-vm', operation: 'op/vm/rgrp/throttle-vm' },
        },
      });
      await worker.create(helper.db);
    });

    test('setThrottle causes 429 error through CloudAPI.enqueue', async () => {
      // Configure the fake to throw 429 on the next request.
      // Use a small retry-after (1s) so the dynamic backoff doesn't
      // cause the test to time out — this test verifies the error path,
      // not the backoff duration.
      fake.restClient.setThrottle(1, {
        'retry-after': '1',
        'x-ms-ratelimit-remaining-subscription-reads': '0',
      });

      // The provider's handleOperation path uses _enqueue('opRead', ...)
      // which goes through CloudAPI.enqueue. The 429 triggers the error
      // handler which retries. After the throttle count is exhausted (1),
      // the next attempt succeeds normally (returns 404 since there's no
      // real operation — but that's fine, we're testing the error path).
      const errors = [];
      const result = await provider.handleOperation({
        op: 'op/vm/rgrp/throttle-vm',
        errors,
        monitor: provider.monitor,
        worker,
      });

      // handleOperation returns false for 404 (operation not found)
      assert.equal(result, false);

      // Verify that CloudAPI logged the pause from the 429
      const pauseMsg = monitor.manager.messages.find(
        msg => msg.Type === 'cloud-api-paused' && msg.Fields.reason === 'rateLimit',
      );
      assert.ok(pauseMsg, 'expected a cloud-api-paused log for rateLimit');
      assert.equal(pauseMsg.Fields.queueName, 'opRead');
    });

    test('setThrottle error carries statusCode and response headers', async () => {
      fake.restClient.setThrottle(1, {
        'retry-after': '45',
        'x-ms-ratelimit-remaining-subscription-reads': '10',
        'x-ms-ratelimit-remaining-subscription-writes': '200',
      });

      // Call sendLongRunningRequest directly to inspect the thrown error
      try {
        await fake.restClient.sendLongRunningRequest({ url: 'op/vm/rgrp/throttle-vm' });
        assert.fail('should have thrown');
      } catch (err) {
        assert.equal(err.statusCode, 429);
        assert.equal(err.message, 'Too Many Requests');
        assert.ok(err.response, 'error should have a response property');
        assert.ok(err.response.headers instanceof FakeHttpHeaders);
        assert.equal(err.response.headers.get('retry-after'), '45');
        assert.equal(err.response.headers.get('x-ms-ratelimit-remaining-subscription-reads'), '10');
        assert.equal(err.response.headers.get('x-ms-ratelimit-remaining-subscription-writes'), '200');
      }
    });

    test('successful response includes rate-limit headers when setResponseHeaders is used', async () => {
      fake.restClient.setResponseHeaders({
        'x-ms-ratelimit-remaining-subscription-reads': '150',
        'x-ms-ratelimit-remaining-subscription-writes': '450',
        'x-ms-ratelimit-remaining-subscription-deletes': '300',
      });

      const resp = await fake.restClient.sendLongRunningRequest({ url: 'op/vm/rgrp/throttle-vm' });
      // Even a 404 response carries the headers
      assert.equal(resp.status, 404);
      assert.ok(resp.headers instanceof FakeHttpHeaders);
      assert.equal(resp.headers.get('x-ms-ratelimit-remaining-subscription-reads'), '150');
      assert.equal(resp.headers.get('x-ms-ratelimit-remaining-subscription-writes'), '450');
      assert.equal(resp.headers.get('x-ms-ratelimit-remaining-subscription-deletes'), '300');
    });

    test('successful 200 response includes rate-limit headers', async () => {
      // Set up a pending operation so the fake returns 200
      await fake.computeClient.virtualMachines.beginCreateOrUpdate('rgrp', 'throttle-vm', {
        subnetId: 'some/subnet',
        location: 'westus',
        hardwareProfile: { vmSize: 'Basic_A2' },
        storageProfile: { osDisk: {}, dataDisks: [] },
        osProfile: { adminUsername: 'user', adminPassword: 'pass', computerName: 'throttle-vm', customData: 'dGVzdA==' },
        networkProfile: { networkInterfaces: [{ id: 'nic-id', primary: true }] },
        tags: {},
      });

      fake.restClient.setResponseHeaders({
        'x-ms-ratelimit-remaining-subscription-reads': '99',
      });

      const resp = await fake.restClient.sendLongRunningRequest({ url: 'op/vm/rgrp/throttle-vm' });
      assert.equal(resp.status, 200);
      assert.ok(resp.headers instanceof FakeHttpHeaders);
      assert.equal(resp.headers.get('x-ms-ratelimit-remaining-subscription-reads'), '99');
      assert.equal(resp.parsedBody.status, 'InProgress');
    });

    test('response has null headers when setResponseHeaders is not used', async () => {
      const resp = await fake.restClient.sendLongRunningRequest({ url: 'op/vm/rgrp/throttle-vm' });
      assert.equal(resp.status, 404);
      assert.strictEqual(resp.headers, null);
    });

    test('throttle counter decrements and subsequent requests succeed', async () => {
      fake.restClient.setThrottle(2, { 'retry-after': '10' });

      // First two calls throw 429
      for (let i = 0; i < 2; i++) {
        try {
          await fake.restClient.sendLongRunningRequest({ url: 'op/vm/rgrp/throttle-vm' });
          assert.fail('should have thrown');
        } catch (err) {
          assert.equal(err.statusCode, 429);
        }
      }

      // Third call succeeds (no more throttle)
      const resp = await fake.restClient.sendLongRunningRequest({ url: 'op/vm/rgrp/throttle-vm' });
      assert.equal(resp.status, 404); // no matching request, but no throw
    });

    test('FakeHttpHeaders.get is case-insensitive', () => {
      const headers = new FakeHttpHeaders({
        'X-Ms-RateLimit-Remaining-Subscription-Reads': '42',
        'Retry-After': '30',
      });
      assert.equal(headers.get('x-ms-ratelimit-remaining-subscription-reads'), '42');
      assert.equal(headers.get('X-MS-RATELIMIT-REMAINING-SUBSCRIPTION-READS'), '42');
      assert.equal(headers.get('retry-after'), '30');
      assert.equal(headers.get('Retry-After'), '30');
      assert.equal(headers.get('nonexistent'), undefined);
    });
  });

  suite('_recordRateLimitHeaders', () => {
    test('emits azureThrottled log on 429 with all headers', () => {
      const headers = new FakeHttpHeaders({
        'x-ms-ratelimit-remaining-subscription-reads': '100',
        'x-ms-ratelimit-remaining-subscription-writes': '200',
        'x-ms-ratelimit-remaining-subscription-deletes': '50',
        'x-ms-ratelimit-remaining-resource': 'Microsoft.Compute/GetOperation3Min;99',
        'retry-after': '30',
      });

      provider._recordRateLimitHeaders({
        headers,
        statusCode: 429,
        operationType: 'read',
      });

      const throttleMsg = monitor.manager.messages.find(
        msg => msg.Type === 'azure-throttled',
      );
      assert.ok(throttleMsg, 'expected an azure-throttled log');
      assert.equal(throttleMsg.Fields.providerId, providerId);
      assert.equal(throttleMsg.Fields.operationType, 'read');
      assert.equal(throttleMsg.Fields.retryAfterSeconds, 30);
      assert.equal(throttleMsg.Fields.remainingReads, 100);
      assert.equal(throttleMsg.Fields.remainingWrites, 200);
      assert.equal(throttleMsg.Fields.remainingDeletes, 50);
      assert.equal(throttleMsg.Fields.remainingResource, 'Microsoft.Compute/GetOperation3Min;99');
    });

    test('does not emit azureThrottled log on non-429 response', () => {
      const headers = new FakeHttpHeaders({
        'x-ms-ratelimit-remaining-subscription-reads': '500',
      });

      provider._recordRateLimitHeaders({
        headers,
        statusCode: 200,
        operationType: 'read',
      });

      const throttleMsg = monitor.manager.messages.find(
        msg => msg.Type === 'azure-throttled',
      );
      assert.ok(!throttleMsg, 'should not emit azure-throttled for 200 response');
    });

    test('handles partial headers gracefully', () => {
      const headers = new FakeHttpHeaders({
        'x-ms-ratelimit-remaining-subscription-reads': '42',
      });

      provider._recordRateLimitHeaders({
        headers,
        statusCode: 429,
        operationType: 'write',
      });

      const throttleMsg = monitor.manager.messages.find(
        msg => msg.Type === 'azure-throttled',
      );
      assert.ok(throttleMsg, 'expected an azure-throttled log');
      assert.equal(throttleMsg.Fields.remainingReads, 42);
      assert.equal(throttleMsg.Fields.remainingWrites, null);
      assert.equal(throttleMsg.Fields.remainingDeletes, null);
      assert.equal(throttleMsg.Fields.remainingResource, null);
      assert.equal(throttleMsg.Fields.retryAfterSeconds, null);
    });

    test('handles malformed header values', () => {
      const headers = new FakeHttpHeaders({
        'x-ms-ratelimit-remaining-subscription-reads': 'not-a-number',
        'x-ms-ratelimit-remaining-subscription-writes': '',
        'x-ms-ratelimit-remaining-subscription-deletes': '-5',
        'retry-after': 'abc',
      });

      // Should not throw
      provider._recordRateLimitHeaders({
        headers,
        statusCode: 429,
        operationType: 'read',
      });

      const throttleMsg = monitor.manager.messages.find(
        msg => msg.Type === 'azure-throttled',
      );
      assert.ok(throttleMsg, 'expected an azure-throttled log even with malformed headers');
      assert.equal(throttleMsg.Fields.remainingReads, null);
      assert.equal(throttleMsg.Fields.remainingWrites, null);
      // -5 is parsed as -5, then clamped to 0 by Math.max(n, 0)
      assert.equal(throttleMsg.Fields.remainingDeletes, 0);
      assert.equal(throttleMsg.Fields.retryAfterSeconds, null);
    });

    test('is a no-op when headers is null', () => {
      // Should not throw
      provider._recordRateLimitHeaders({
        headers: null,
        statusCode: 429,
        operationType: 'read',
      });

      const throttleMsg = monitor.manager.messages.find(
        msg => msg.Type === 'azure-throttled',
      );
      assert.ok(!throttleMsg, 'should not emit log with null headers');
    });

    test('is a no-op when headers lacks .get() method', () => {
      provider._recordRateLimitHeaders({
        headers: { 'retry-after': '30' },
        statusCode: 429,
        operationType: 'read',
      });

      const throttleMsg = monitor.manager.messages.find(
        msg => msg.Type === 'azure-throttled',
      );
      assert.ok(!throttleMsg, 'should not emit log without .get() method');
    });

    test('calls gauge metrics for remaining-* headers', () => {
      const recorded = [];
      const origMetric = provider.monitor._metric.azureRateLimitRemaining;
      provider.monitor._metric.azureRateLimitRemaining = (value, labels) => {
        recorded.push({ value, labels });
      };

      try {
        const headers = new FakeHttpHeaders({
          'x-ms-ratelimit-remaining-subscription-reads': '150',
          'x-ms-ratelimit-remaining-subscription-writes': '400',
        });

        provider._recordRateLimitHeaders({
          headers,
          statusCode: 200,
          operationType: 'read',
        });

        assert.equal(recorded.length, 2);
        assert.deepEqual(recorded[0], { value: 150, labels: { providerId, limitType: 'reads' } });
        assert.deepEqual(recorded[1], { value: 400, labels: { providerId, limitType: 'writes' } });
      } finally {
        provider.monitor._metric.azureRateLimitRemaining = origMetric;
      }
    });

    test('calls counter metric on 429', () => {
      const recorded = [];
      const origMetric = provider.monitor._metric.azureThrottleCount;
      provider.monitor._metric.azureThrottleCount = (value, labels) => {
        recorded.push({ value, labels });
      };

      try {
        const headers = new FakeHttpHeaders({
          'retry-after': '10',
        });

        provider._recordRateLimitHeaders({
          headers,
          statusCode: 429,
          operationType: 'delete',
        });

        assert.equal(recorded.length, 1);
        assert.deepEqual(recorded[0], { value: 1, labels: { providerId, operationType: 'delete' } });
      } finally {
        provider.monitor._metric.azureThrottleCount = origMetric;
      }
    });
  });

  suite('handleOperation observability', () => {
    let worker;
    setup(async () => {
      await makeWorkerPool();
      worker = Worker.fromApi({
        workerPoolId,
        workerGroup: 'westus',
        workerId: 'obs-test',
        providerId,
        created: taskcluster.fromNow('0 seconds'),
        lastModified: taskcluster.fromNow('0 seconds'),
        lastChecked: taskcluster.fromNow('0 seconds'),
        expires: taskcluster.fromNow('90 seconds'),
        capacity: 1,
        state: 'requested',
        providerData: {
          ...baseProviderData,
          vm: { name: 'obs-vm', operation: 'op/vm/rgrp/obs-vm' },
        },
      });
      await worker.create(helper.db);
    });

    test('records rate-limit headers from successful handleOperation response', async () => {
      // Set up a pending operation so the fake returns 200 with parsedBody
      await fake.computeClient.virtualMachines.beginCreateOrUpdate('rgrp', 'obs-vm', {
        subnetId: 'some/subnet',
        location: 'westus',
        hardwareProfile: { vmSize: 'Basic_A2' },
        storageProfile: { osDisk: {}, dataDisks: [] },
        osProfile: { adminUsername: 'user', adminPassword: 'pass', computerName: 'obs-vm', customData: 'dGVzdA==' },
        networkProfile: { networkInterfaces: [{ id: 'nic-id', primary: true }] },
        tags: {},
      });

      fake.restClient.setResponseHeaders({
        'x-ms-ratelimit-remaining-subscription-reads': '250',
        'x-ms-ratelimit-remaining-subscription-writes': '800',
      });

      const gaugeRecords = [];
      const origMetric = provider.monitor._metric.azureRateLimitRemaining;
      provider.monitor._metric.azureRateLimitRemaining = (value, labels) => {
        gaugeRecords.push({ value, labels });
      };

      try {
        const errors = [];
        await provider.handleOperation({
          op: 'op/vm/rgrp/obs-vm',
          errors,
          monitor: provider.monitor,
          worker,
        });

        // Verify gauge was called with header values
        const readsGauge = gaugeRecords.find(r => r.labels.limitType === 'reads');
        assert.ok(readsGauge, 'expected reads gauge to be set');
        assert.equal(readsGauge.value, 250);

        const writesGauge = gaugeRecords.find(r => r.labels.limitType === 'writes');
        assert.ok(writesGauge, 'expected writes gauge to be set');
        assert.equal(writesGauge.value, 800);

        // Non-429 should not produce azureThrottled log
        const throttleMsg = monitor.manager.messages.find(
          msg => msg.Type === 'azure-throttled',
        );
        assert.ok(!throttleMsg, 'should not emit azure-throttled for 200 response');
      } finally {
        provider.monitor._metric.azureRateLimitRemaining = origMetric;
      }
    });

    test('transient restClient 429 does not emit azureThrottled (handled by CloudAPI backoff only)', async () => {
      // setThrottle(1): first call throws 429, CloudAPI retries, second call succeeds.
      // errorHandler no longer records headers (to avoid double-counting SDK clients),
      // so transient restClient 429s only show up in the generic cloudApiPaused log.
      fake.restClient.setThrottle(1, {
        'retry-after': '1',
        'x-ms-ratelimit-remaining-subscription-reads': '0',
      });

      const errors = [];
      await provider.handleOperation({
        op: 'op/vm/rgrp/obs-vm',
        errors,
        monitor: provider.monitor,
        worker,
      });

      // CloudAPI still logs the queue pause
      const pauseMsg = monitor.manager.messages.find(
        msg => msg.Type === 'cloud-api-paused' && msg.Fields.reason === 'rateLimit',
      );
      assert.ok(pauseMsg, 'expected cloudApiPaused log for the transient 429');

      // But no azureThrottled log — errorHandler no longer records
      const throttleMsg = monitor.manager.messages.find(
        msg => msg.Type === 'azure-throttled',
      );
      assert.ok(!throttleMsg, 'transient restClient 429 should not produce azureThrottled');
    });

    test('persistent restClient 429 emits azureThrottled once from handleOperation catch', async () => {
      // setThrottle(6): exceeds CloudAPI's 5 retries (tries > 4), so the error
      // propagates to handleOperation's catch which records it exactly once.
      fake.restClient.setThrottle(6, {
        'retry-after': '1',
        'x-ms-ratelimit-remaining-subscription-reads': '0',
        'x-ms-ratelimit-remaining-resource': 'Microsoft.Compute/LowPriority;0',
      });

      const counterRecords = [];
      const origCounter = provider.monitor._metric.azureThrottleCount;
      provider.monitor._metric.azureThrottleCount = (value, labels) => {
        counterRecords.push({ value, labels });
      };

      try {
        const errors = [];
        // handleOperation catches the exhausted-retry error and returns true
        const result = await provider.handleOperation({
          op: 'op/vm/rgrp/obs-vm',
          errors,
          monitor: provider.monitor,
          worker,
        });
        assert.equal(result, true, 'handleOperation returns true on error (come back later)');

        // Exactly one azureThrottled log from handleOperation's catch
        const throttleMsgs = monitor.manager.messages.filter(
          msg => msg.Type === 'azure-throttled',
        );
        assert.equal(throttleMsgs.length, 1, 'expected exactly one azure-throttled log');
        assert.equal(throttleMsgs[0].Fields.providerId, providerId);
        assert.equal(throttleMsgs[0].Fields.operationType, 'read');
        assert.equal(throttleMsgs[0].Fields.retryAfterSeconds, 1);
        assert.equal(throttleMsgs[0].Fields.remainingReads, 0);
        assert.equal(throttleMsgs[0].Fields.remainingResource, 'Microsoft.Compute/LowPriority;0');

        // Counter incremented exactly once
        assert.equal(counterRecords.length, 1, 'expected exactly one counter increment');
        assert.equal(counterRecords[0].labels.operationType, 'read');
      } finally {
        provider.monitor._metric.azureThrottleCount = origCounter;
      }
    });
  });

  suite('errorHandler dynamic backoff', () => {
    // Test the error handler directly via provider.cloudApi.errorHandler
    // to verify Retry-After parsing and cap logic without waiting for
    // actual queue pauses.

    const make429Error = (retryAfter) => {
      const err = new Error('Too Many Requests');
      err.statusCode = 429;
      const headers = {};
      if (retryAfter !== undefined) {
        headers['retry-after'] = String(retryAfter);
      }
      err.response = { headers: new FakeHttpHeaders(headers) };
      return err;
    };

    test('uses Retry-After header value for backoff', () => {
      const result = provider.cloudApi.errorHandler({
        err: make429Error(60),
        tries: 0,
      });
      // min(60, 120) * 1000 = 60000ms
      assert.equal(result.backoff, 60000);
      assert.equal(result.reason, 'rateLimit');
      assert.equal(result.level, 'notice');
    });

    test('caps Retry-After at 120 seconds', () => {
      const result = provider.cloudApi.errorHandler({
        err: make429Error(300),
        tries: 0,
      });
      // min(300, 120) * 1000 = 120000ms
      assert.equal(result.backoff, 120000);
    });

    test('falls back to default backoff when Retry-After is absent', () => {
      const err = new Error('Too Many Requests');
      err.statusCode = 429;
      err.response = { headers: new FakeHttpHeaders({}) };
      const result = provider.cloudApi.errorHandler({ err, tries: 0 });
      // _backoffDelay is 1 in test config, so default = 1 * 50 = 50ms
      assert.equal(result.backoff, 50);
    });

    test('falls back to default backoff when Retry-After is non-numeric', () => {
      const result = provider.cloudApi.errorHandler({
        err: make429Error('not-a-number'),
        tries: 0,
      });
      assert.equal(result.backoff, 50);
    });

    test('falls back to default backoff when Retry-After is zero', () => {
      const result = provider.cloudApi.errorHandler({
        err: make429Error(0),
        tries: 0,
      });
      // 0 is not > 0, so falls back to default
      assert.equal(result.backoff, 50);
    });

    test('falls back to default backoff when Retry-After is negative', () => {
      const result = provider.cloudApi.errorHandler({
        err: make429Error(-5),
        tries: 0,
      });
      assert.equal(result.backoff, 50);
    });

    test('integration: dynamic backoff observed in cloud-api-paused log', async () => {
      await makeWorkerPool();
      const worker = Worker.fromApi({
        workerPoolId,
        workerGroup: 'westus',
        workerId: 'backoff-test',
        providerId,
        created: taskcluster.fromNow('0 seconds'),
        lastModified: taskcluster.fromNow('0 seconds'),
        lastChecked: taskcluster.fromNow('0 seconds'),
        expires: taskcluster.fromNow('90 seconds'),
        capacity: 1,
        state: 'requested',
        providerData: {
          ...baseProviderData,
          vm: { name: 'backoff-vm', operation: 'op/vm/rgrp/backoff-vm' },
        },
      });
      await worker.create(helper.db);

      // Use a small retry-after (2s) to keep the test fast while still
      // being distinguishable from the default backoff (50ms)
      fake.restClient.setThrottle(1, {
        'retry-after': '2',
        'x-ms-ratelimit-remaining-subscription-reads': '0',
      });

      const errors = [];
      await provider.handleOperation({
        op: 'op/vm/rgrp/backoff-vm',
        errors,
        monitor: provider.monitor,
        worker,
      });

      const pauseMsg = monitor.manager.messages.find(
        msg => msg.Type === 'cloud-api-paused' && msg.Fields.reason === 'rateLimit',
      );
      assert.ok(pauseMsg, 'expected a cloud-api-paused log');
      // Retry-After: 2 → min(2, 120) * 1000 = 2000ms
      assert.equal(pauseMsg.Fields.duration, 2000);
    });
  });

  suite('Track 2 pipeline policy', () => {
    let policy;

    setup(() => {
      // provider.setup() registers the policy on every Track 2 client's pipeline
      policy = fake.computeClient.pipeline.getPolicy('rateLimitObservabilityPolicy');
      assert.ok(policy, 'expected rateLimitObservabilityPolicy on computeClient pipeline');
    });

    test('policy is registered with afterPhase: Retry', () => {
      const options = fake.computeClient.pipeline.getPolicyOptions('rateLimitObservabilityPolicy');
      assert.ok(options, 'expected addPolicy options');
      assert.equal(options.afterPhase, 'Retry');
    });

    test('policy is registered on all Track 2 clients', () => {
      for (const client of [fake.computeClient, fake.networkClient, fake.resourcesClient, fake.deploymentsClient]) {
        const p = client.pipeline.getPolicy('rateLimitObservabilityPolicy');
        assert.ok(p, 'expected policy on every Track 2 client');
      }
    });

    test('records rate-limit gauge from 200 response', async () => {
      const gaugeRecords = [];
      const origMetric = provider.monitor._metric.azureRateLimitRemaining;
      provider.monitor._metric.azureRateLimitRemaining = (value, labels) => {
        gaugeRecords.push({ value, labels });
      };

      try {
        const mockRequest = { method: 'GET' };
        const mockResponse = {
          status: 200,
          headers: new FakeHttpHeaders({
            'x-ms-ratelimit-remaining-subscription-reads': '500',
          }),
        };

        const result = await policy.sendRequest(mockRequest, async () => mockResponse);
        assert.equal(result, mockResponse);

        assert.equal(gaugeRecords.length, 1);
        assert.deepEqual(gaugeRecords[0], {
          value: 500,
          labels: { providerId, limitType: 'reads' },
        });

        // No throttle log on 200
        const throttleMsg = monitor.manager.messages.find(m => m.Type === 'azure-throttled');
        assert.ok(!throttleMsg, 'should not emit azure-throttled for 200');
      } finally {
        provider.monitor._metric.azureRateLimitRemaining = origMetric;
      }
    });

    test('emits azureThrottled log and counter on 429 response', async () => {
      const counterRecords = [];
      const origCounter = provider.monitor._metric.azureThrottleCount;
      provider.monitor._metric.azureThrottleCount = (value, labels) => {
        counterRecords.push({ value, labels });
      };

      try {
        const mockRequest = { method: 'GET' };
        const mockResponse = {
          status: 429,
          headers: new FakeHttpHeaders({
            'retry-after': '30',
            'x-ms-ratelimit-remaining-subscription-reads': '0',
          }),
        };

        await policy.sendRequest(mockRequest, async () => mockResponse);

        const throttleMsg = monitor.manager.messages.find(m => m.Type === 'azure-throttled');
        assert.ok(throttleMsg, 'expected azure-throttled log');
        assert.equal(throttleMsg.Fields.retryAfterSeconds, 30);
        assert.equal(throttleMsg.Fields.remainingReads, 0);
        assert.equal(throttleMsg.Fields.operationType, 'read');

        assert.equal(counterRecords.length, 1);
        assert.equal(counterRecords[0].labels.operationType, 'read');
      } finally {
        provider.monitor._metric.azureThrottleCount = origCounter;
      }
    });

    test('derives operationType from HTTP method', async () => {
      const methods = {
        'GET': 'read',
        'PUT': 'write',
        'POST': 'write',
        'PATCH': 'write',
        'DELETE': 'delete',
      };

      for (const [method, expectedOpType] of Object.entries(methods)) {
        monitor.manager.reset();
        const mockResponse = {
          status: 429,
          headers: new FakeHttpHeaders({ 'retry-after': '1' }),
        };

        await policy.sendRequest({ method }, async () => mockResponse);

        const throttleMsg = monitor.manager.messages.find(m => m.Type === 'azure-throttled');
        assert.ok(throttleMsg, `expected azure-throttled for ${method}`);
        assert.equal(throttleMsg.Fields.operationType, expectedOpType,
          `${method} should map to ${expectedOpType}`);
      }
    });

    test('passes response through unmodified', async () => {
      const mockResponse = {
        status: 200,
        headers: new FakeHttpHeaders({}),
        body: { data: 'test' },
      };

      const result = await policy.sendRequest({ method: 'GET' }, async () => mockResponse);
      assert.strictEqual(result, mockResponse);
    });
  });

  suite('scanCleanup', () => {
    const sandbox = sinon.createSandbox({});
    let reportedErrors = [];

    setup(() => {
      reportedErrors = [];
    });

    teardown(() => {
      sandbox.restore();
    });

    test('iterates all seen workers', async () => {
      sandbox.stub(provider, 'reportError');
      const workerPool1 = await makeWorkerPool({ workerPoolId: 'foo/bar1' });
      const workerPool2 = await makeWorkerPool({ workerPoolId: 'foo/bar2' });

      provider.scanPrepare();
      provider.seen[workerPool1.workerPoolId] = 3;
      provider.seen[workerPool2.workerPoolId] = 1;
      provider.errors[workerPool1.workerPoolId] = [];
      provider.errors[workerPool2.workerPoolId] = [];

      await provider.scanCleanup();
      assert.equal(4, monitor.manager.messages[0].Fields.total);
      sandbox.assert.notCalled(provider.reportError);
      assert.equal(0, reportedErrors.length);
    });

    test('iterates and reports errors', async () => {
      sandbox.replace(provider, 'reportError', (error) => {
        reportedErrors.push(error);
      });

      const workerPool1 = await makeWorkerPool({ workerPoolId: 'foo/bar1' });
      const workerPool2 = await makeWorkerPool({ workerPoolId: 'foo/bar2' });

      provider.scanPrepare();
      provider.seen[workerPool1.workerPoolId] = 3;
      provider.seen[workerPool2.workerPoolId] = 1;
      provider.seen['non/existing'] = 0;
      provider.errors[workerPool1.workerPoolId] = [{ error: 'error1' }, { error: 'error2' }];
      provider.errors[workerPool2.workerPoolId] = [];
      provider.errors['non/existing'] = [{ error: 'will not be reported' }];

      await provider.scanCleanup();
      assert.equal(4, monitor.manager.messages[0].Fields.total);
      assert.equal(2, reportedErrors.length);
      assert.equal(workerPool1.workerPoolId, reportedErrors[0].workerPool.workerPoolId);
      assert.equal('error1', reportedErrors[0].error);
      assert.equal(workerPool1.workerPoolId, reportedErrors[1].workerPool.workerPoolId);
      assert.equal('error2', reportedErrors[1].error);
    });
  });
});
