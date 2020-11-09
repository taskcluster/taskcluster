const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const forge = require('node-forge');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const generator = require('generate-password');
const { WorkerPool, Worker } = require('../data');

const auth = require('@azure/ms-rest-nodeauth');
const armCompute = require('@azure/arm-compute');
const armNetwork = require('@azure/arm-network');
const msRestJS = require('@azure/ms-rest-js');
const msRestAzure = require('@azure/ms-rest-azure-js');

const { ApiError, Provider } = require('./provider');
const { CloudAPI } = require('./cloudapi');

// Azure provisioning and VM power states
// see here: https://docs.microsoft.com/en-us/azure/virtual-machines/windows/states-lifecycle
// same for linux: https://docs.microsoft.com/en-us/azure/virtual-machines/linux/states-lifecycle
const failPowerStates = new Set([
  'PowerState/stopping',
  'PowerState/stopped',
  'PowerState/deallocating',
  'PowerState/deallocated',
]);

// Provisioning states for any resource type.  See, for example,
// https://docs.microsoft.com/en-us/rest/api/virtualnetwork/networkinterfaces/createorupdate#provisioningstate
const failProvisioningStates = new Set(['Failed', 'Deleting', 'Canceled', 'Deallocating']);

// only use alphanumeric characters for convenience
function nicerId() {
  return (slugid.nice() + slugid.nice() + slugid.nice()).toLowerCase().replace(/[^A-Za-z0-9]/g, '');
}

// The password must be between 8-72 characters long (Linux max is 72)
// must satisfy >= 3 of password complexity requirements from the following:
//   1) Contains an uppercase character
//   2) Contains a lowercase character
//   3) Contains a numeric digit
//   4) Contains a special character
//   5) Control characters are not allowed
function generateAdminPassword() {
  // using `strict: true` ensures we match requirements
  return generator.generate({
    length: 72,
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true,
    strict: true,
  });
}

function workerConfigWithSecrets(cfg) {
  assert(_.has(cfg, 'osProfile'));
  let newCfg = _.cloneDeep(cfg);
  // Windows admin user name cannot be more than 20 characters long, be empty,
  // end with a period(.), or contain the following characters: \\ / \" [ ] : | < > + = ; , ? * @.
  newCfg.osProfile.adminUsername = nicerId().slice(0, 20);
  // we have to set a password, but we never want it to be used, so we throw it away
  // a legitimate user who needs access can reset the password
  newCfg.osProfile.adminPassword = generateAdminPassword();
  return newCfg;
}

class AzureProvider extends Provider {

  constructor({
    providerConfig,
    ...conf
  }) {
    super(conf);
    this.configSchema = 'config-azure';
    this.providerConfig = providerConfig;
  }

  async setup() {
    let {
      clientId,
      secret,
      domain,
      subscriptionId,
      apiRateLimits = {},
      _backoffDelay = 1000,
    } = this.providerConfig;

    // Azure SDK has builtin retry logic: https://docs.microsoft.com/en-us/azure/architecture/best-practices/retry-service-specific
    // compute rate limiting: https://docs.microsoft.com/en-us/azure/virtual-machines/troubleshooting/troubleshooting-throttling-errors
    const cloud = new CloudAPI({
      types: ['query', 'get', 'list', 'opRead'],
      apiRateLimits,
      intervalDefault: 100 * 1000, // Intervals are enforced every 100 seconds
      intervalCapDefault: 2000, // The calls we make are all limited 20/sec so 20 * 100 are allowed
      monitor: this.monitor,
      providerId: this.providerId,
      errorHandler: ({ err, tries }) => {
        if (err.statusCode === 429) { // too many requests
          return { backoff: _backoffDelay * 50, reason: 'rateLimit', level: 'notice' };
        } else if (err.statusCode >= 500) { // For 500s, let's take a shorter backoff
          return { backoff: _backoffDelay * Math.pow(2, tries), reason: 'errors', level: 'warning' };
        }
        // If we don't want to do anything special here, just throw and let the
        // calling code figure out what to do
        throw err;
      },
    });
    this._enqueue = cloud.enqueue.bind(cloud);

    // load microsoft intermediate certs from disk
    // TODO (bug 1607922) : we should download the intermediate certs,
    //       locations are in the authorityInfoAccess extension
    let intermediateFiles = [1, 2, 4, 5].map(i => fs.readFileSync(path.resolve(__dirname, `azure-ca-certs/microsoft_it_tls_ca_${i}.pem`)));
    let intermediateCerts = intermediateFiles.map(forge.pki.certificateFromPem);
    this.caStore = forge.pki.createCaStore(intermediateCerts);

    let credentials = await auth.loginWithServicePrincipalSecret(clientId, secret, domain);
    this.computeClient = new armCompute.ComputeManagementClient(credentials, subscriptionId);
    this.networkClient = new armNetwork.NetworkManagementClient(credentials, subscriptionId);
    this.restClient = new msRestAzure.AzureServiceClient(credentials);
  }

  async provision({ workerPool, workerInfo }) {
    const { workerPoolId } = workerPool;
    let toSpawn = await this.estimator.simple({
      workerPoolId,
      ...workerPool.config,
      workerInfo,
    });

    if (toSpawn === 0 || workerPool.config.launchConfigs.length === 0) {
      return; // Nothing to do
    }

    const { terminateAfter, reregistrationTimeout } = Provider.interpretLifecycle(workerPool.config);

    const cfgs = [];
    while (toSpawn > 0) {
      const cfg = _.sample(workerPool.config.launchConfigs);
      cfgs.push(cfg);
      toSpawn -= cfg.capacityPerInstance;
    }

    // Create "empty" workers to provision in provisionResources loop
    await Promise.all(cfgs.map(async cfg => {
      // This must be unique to currently existing instances and match [a-z]([-a-z0-9]*[a-z0-9])?
      // 38 chars is workerId limit
      const virtualMachineName = `vm-${nicerId()}-${nicerId()}`.slice(0, 38);
      // Windows computer name cannot be more than 15 characters long, be entirely numeric,
      // or contain the following characters: ` ~ ! @ # $ % ^ & * ( ) = + _ [ ] { } \\ | ; : . " , < > / ?
      const computerName = nicerId().slice(0, 15);
      const ipAddressName = `pip-${nicerId()}`.slice(0, 24);
      const networkInterfaceName = `nic-${nicerId()}`.slice(0, 24);

      // workerGroup is the azure location; this is a required field in the config
      const workerGroup = cfg.location;
      assert(workerGroup, 'cfg.location is not set');

      // Note: worker-runner 1.0.3 and higher ignore customData due to
      // https://github.com/MicrosoftDocs/azure-docs/issues/30370
      const customData = Buffer.from(JSON.stringify({
        workerPoolId,
        providerId: this.providerId,
        workerGroup,
        rootUrl: this.rootUrl,
        // NOTE: workerConfig is deprecated and isn't used after worker-runner v29.0.1
        workerConfig: cfg.workerConfig || {},
      })).toString('base64');

      // Disallow users from naming diss
      // required
      let osDisk = { ..._.omit(cfg.storageProfile.osDisk, ['name']) };
      // optional
      let dataDisks = [];
      if (_.has(cfg, 'storageProfile.dataDisks')) {
        for (let disk of cfg.storageProfile.dataDisks) {
          dataDisks.push({ ..._.omit(disk, 'name') });
        }
      }

      const config = {
        ..._.omit(cfg, ['capacityPerInstance', 'workerConfig']),
        osProfile: {
          ...cfg.osProfile,
          // adminUsername and adminPassword will be added later
          // because we are saving this config to providerData
          // and they are obfuscated / intended to be secret
          computerName,
          customData,
        },
        networkProfile: {
          ...cfg.networkProfile,
          // we add this when we have the NIC provisioned
          networkInterfaces: [],
        },
        storageProfile: {
          ...cfg.storageProfile,
          osDisk,
          dataDisks,
        },
      };

      let providerData = {
        location: cfg.location,
        resourceGroupName: this.providerConfig.resourceGroupName,
        workerConfig: cfg.workerConfig,
        tags: {
          ...cfg.tags || {},
          'created-by': `taskcluster-wm-${this.providerId}`,
          'managed-by': 'taskcluster',
          'provider-id': this.providerId,
          'worker-group': workerGroup,
          'worker-pool-id': workerPoolId,
          'root-url': this.rootUrl,
          'owner': workerPool.owner,
        },
        vm: {
          name: virtualMachineName,
          computerName,
          config,
          operation: false,
          id: false,
          vmId: false,
        },
        ip: {
          name: ipAddressName,
          operation: false,
          id: false,
        },
        nic: {
          name: networkInterfaceName,
          operation: false,
          id: false,
        },
        disks: [
          // gets populated when we lookup the VM
        ],
        subnet: {
          id: cfg.subnetId,
        },
        ignoreFailedProvisioningStates: cfg.ignoreFailedProvisioningStates,
      };

      this.monitor.log.workerRequested({
        workerPoolId,
        providerId: this.providerId,
        workerGroup,
        workerId: virtualMachineName,
      });
      const worker = Worker.fromApi({
        workerPoolId,
        providerId: this.providerId,
        workerGroup,
        workerId: virtualMachineName,
        capacity: cfg.capacityPerInstance,
        providerData: {
          ...providerData,
          terminateAfter,
          reregistrationTimeout,
        },
      });
      await worker.create(this.db);
    }));
  }

  async deprovision({ workerPool }) {
    // nothing to do: we just wait for workers to terminate themselves
  }

  _now() {
    return new Date();
  }

  async registerWorker({ worker, workerPool, workerIdentityProof }) {
    const { document } = workerIdentityProof;
    const monitor = this.workerMonitor({ worker });

    // use the same message for all errors here, so as not to give an attacker
    // extra information.
    const error = () => new ApiError('Signature validation error');

    // workerIdentityProof is a signed message

    // We need to check that:
    // 1. The embedded document was signed with the private key corresponding to the
    //    embedded public key
    // 2. The embedded public key has a proper certificate chain back to a trusted CA
    // 3. The embedded message contains the vmId that matches the worker making the request

    // signature is base64-encoded DER-format PKCS#7 / CMS message

    // decode base64, load DER, extract PKCS#7 message
    let decodedMessage = Buffer.from(document, 'base64');
    let message;
    try {
      let asn1 = forge.asn1.fromDer(forge.util.createBuffer(decodedMessage));
      message = forge.pkcs7.messageFromAsn1(asn1);
    } catch (err) {
      this.monitor.log.registrationErrorWarning({ message: 'Error extracting PKCS#7 message', error: err.toString() });
      throw error();
    }

    let content, crt, pem, sig;
    // get message content, signing certificate, and signature
    try {
      // in testing, message.content is empty, so we access the raw ASN1 structure
      content = message.rawCapture.content.value[0].value;
      // convert to pem for convenience
      assert.equal(message.certificates.length, 1, `Expected one certificate in message, received ${message.certificates.length}`);
      crt = message.certificates[0];
      pem = forge.pki.publicKeyToPem(crt.publicKey);
      sig = message.rawCapture.signature;
    } catch (err) {
      this.monitor.log.registrationErrorWarning({ message: 'Error extracting PKCS#7 message content', error: err.toString() });
      throw error();
    }

    // verify that the message is properly signed
    try {
      let verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(Buffer.from(content));
      assert(verifier.verify(pem, sig, 'binary'));
    } catch (err) {
      this.monitor.log.registrationErrorWarning({ message: 'Error verifying PKCS#7 message signature', error: err.toString() });
      throw error();
    }

    // verify that the embedded certificates have proper chain of trust
    try {
      forge.pki.verifyCertificateChain(this.caStore, [crt]);
    } catch (err) {
      this.monitor.log.registrationErrorWarning({ message: 'Error verifying certificate chain', error: err.message });
      throw error();
    }

    let payload;
    try {
      payload = JSON.parse(content);
    } catch (err) {
      this.monitor.log.registrationErrorWarning({ message: 'Payload was not valid JSON', error: err.toString() });
      throw error();
    }

    let workerVmId = worker.providerData.vm.vmId;
    if (!workerVmId) {
      const { vmId } = await this.fetchVmInfo(worker);
      workerVmId = vmId;
    }

    // verify that the embedded vmId matches what the worker is sending
    try {
      assert.equal(payload.vmId, workerVmId);
    } catch (err) {
      this.monitor.log.registrationErrorWarning({
        message: 'vmId mismatch',
        error: err.toString(),
        vmId: payload.vmId,
        expectedVmId: workerVmId,
        workerId: worker.workerId,
      });
      throw error();
    }

    // verify that the message is not expired
    try {
      assert(new Date(payload.timeStamp.expiresOn) > this._now());
    } catch (err) {
      this.monitor.log.registrationErrorWarning({ message: 'Expired message', error: err.toString(), expires: payload.timeStamp.expiresOn });
      throw error();
    }

    if (worker.state !== Worker.states.REQUESTED) {
      this.monitor.log.registrationErrorWarning({ message: 'Worker was already running.', error: 'Worker was already running.' });
      throw error();
    }

    let expires = taskcluster.fromNow('96 hours');
    if (worker.providerData.reregistrationTimeout) {
      expires = new Date(Date.now() + worker.providerData.reregistrationTimeout);
    }

    this.monitor.log.workerRunning({
      workerPoolId: workerPool.workerPoolId,
      providerId: this.providerId,
      workerId: worker.workerId,
    });

    monitor.debug('setting state to RUNNING if currently REQUESTED');
    await worker.update(this.db, worker => {
      worker.lastModified = new Date();
      if (worker.state === Worker.states.REQUESTED) {
        worker.state = Worker.states.RUNNING;
      }
      worker.providerData.terminateAfter = expires.getTime();
    });
    const workerConfig = worker.providerData.workerConfig || {};
    return {
      expires,
      workerConfig,
    };
  }

  async scanPrepare() {
    this.seen = {};
    this.errors = {};
  }

  /**
   * Checks the status of ongoing Azure operations
   * Returns true if the operation is in progress, false otherwise
   *
   * op: a URL for tracking the ongoing status of an Azure operation
   * errors: a list that will have any errors found for that operation appended to it
   */
  async handleOperation({ op, errors, monitor }) {
    monitor.debug({ message: 'handling operation', op });
    let req, resp;
    try {
      // NB: we don't respect azure's Retry-After header, we assume our iteration
      // will wait long enough, and we keep trying
      // see here: https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/async-operations
      req = new msRestJS.WebResource(op, 'GET');
      // sendLongRunningRequest polls until finished but this is just reading
      // the status of an operation so it shouldn't block long
      // it's ok if we hit an error here, that will trigger resource teardown
      resp = await this._enqueue('opRead', () => this.restClient.sendLongRunningRequest(req));
    } catch (err) {
      monitor.debug({ message: 'reading operation failed', op, error: err.message });
      // this was a connection error of some sort, so we don't really know anything about
      // the status of the operation.  Return true on the assumption that this was a transient
      // connection failure and the operation is probably still running.  We'll come back
      // and poll the operation again on the next checkWorker call.
      return true;
    }
    // Rest API has different error semantics than the SDK
    if (resp.status === 404) {
      // operation not found because it has either expired or does not exist
      // nothing more to do
      monitor.debug({ message: 'operation does not exist', op });
      return false;
    }

    let body = resp.parsedBody;
    if (body) {
      // status is guaranteed to exist if the operation was found
      if (body.status === 'InProgress') {
        monitor.debug({ message: 'operation in progress', op });
        return true;
      }
      if (body.error) {
        monitor.debug({ message: 'operation failed', op, error: body.error.message });
        errors.push({
          kind: 'operation-error',
          title: 'Operation Error',
          description: body.error.message,
          extra: {
            code: body.error.code,
          },
          notify: this.notify,
          WorkerPoolError: this.WorkerPoolError,
        });
        return false;
      }
    }

    monitor.debug({ message: 'operation complete', op });
    return false;
  }

  /**
   * provisionResource generically provisions individual resources
   * Handles cases where:
   *  we have not yet created a resource and need to create one,
   *    * we have no id, get request for name 404s, no operation
   *  we have requested a resource but it is not ready,
   *    * we have no id, get request for name 404s, we have an operation
   *  we have a resource ready to go
   *    * we have an id, we short circuit return
   *    * OR we have no id, get request for name succeeds, we set id
   *
   * worker: the worker for which the resource is being provisioned
   * client: the Azure SDK client for the resource
   * resourceType: the short name used to identify the resource in providerData
   * resourceConfig: configuration to be passed to the SDK for resource creation
   * modifyFn: a function (worker, resource) that takes the worker and the created
   *   resource, allowing the worker to be modified.
   */
  async provisionResource({ worker, client, resourceType, resourceConfig, modifyFn, monitor }) {
    if (!_.has(worker.providerData, resourceType)) {
      throw new Error(`Error provisioning worker: providerData does not contain resourceType ${resourceType}`);
    }
    let typeData = worker.providerData[resourceType];

    const debug = message => monitor.debug({
      message,
      resourceType,
      resourceId: typeData.id,
      resourceName: typeData.name,
    });
    debug(`provisioning resource ${resourceType}`);
    // we have no id, so we try to lookup resource by name
    if (!typeData.id) {
      try {
        debug('querying resource by name');
        let resource = await this._enqueue('query', () => client.get(
          worker.providerData.resourceGroupName,
          typeData.name,
        ));
        if (failProvisioningStates.has(resource.provisioningState)) {
          // the resource was created but not successfully (how Microsoft!), so
          // bail out of the whole provisioning process
          await worker.update(this.db, worker => {
            worker.providerData[resourceType].operation = undefined;
          });
          await this.removeWorker({ worker, reason: `${resourceType} has state ${resource.provisioningState}` });
        } else {
          // we found the resource
          await worker.update(this.db, worker => {
            worker.providerData[resourceType].id = resource.id;
            worker.providerData[resourceType].operation = undefined;
            modifyFn(worker, resource);
          });
        }

        // no need to try to create the resource again, we're done..
        return worker;
      } catch (err) {
        if (err.statusCode !== 404) {
          throw err;
        }
        // if we've made the request
        // we should have an operation, check status
        if (typeData.operation) {
          let op = await this.handleOperation({
            op: typeData.operation,
            errors: this.errors[worker.workerPoolId],
            monitor,
          });
          if (!op) {
            // if the operation has expired or does not exist
            // chances are our instance has been deleted off band
            await worker.update(this.db, worker => {
              worker.providerData[resourceType].operation = undefined;
            });
            await this.removeWorker({ worker, reason: 'operation expired' });
          }
          // operation is still in progress or has failed, so don't try to
          // create the resource
          return worker;
        }
      }
    }

    // failed to lookup resource by name
    if (!typeData.id) {
      debug('creating resource');
      // we need to create the resource
      let resourceRequest = await this._enqueue('query', () => client.beginCreateOrUpdate(
        worker.providerData.resourceGroupName,
        typeData.name,
        { ...resourceConfig, tags: worker.providerData.tags },
      ));
      // track operation
      await worker.update(this.db, worker => {
        worker.providerData[resourceType].operation = resourceRequest.getPollState().azureAsyncOperationHeaderValue;
      });
    }

    return worker;
  }

  /**
   * provisionResources wraps the process of provisioning worker resources
   *
   * This function is expected to be called several times per worker as
   * resources are created.
   */
  async provisionResources({ worker, monitor }) {
      // IP
      let ipConfig = {
        location: worker.providerData.location,
        publicIPAllocationMethod: 'Dynamic',
      };

      try{
        worker = await this.provisionResource({
          worker,
          client: this.networkClient.publicIPAddresses,
          resourceType: 'ip',
          resourceConfig: ipConfig,
          modifyFn: () => {},
          monitor,
        });
      } catch (err) {
          const workerPool = await WorkerPool.get(this.db, worker.workerPoolId);
          // we create multiple resources in order to provision a VM
          // if we catch an error we want to deprovision those resources
          if (workerPool) {
            await this.reportError({
              workerPool,
              kind: 'creation-error',
              title: 'VM Creation Error',
              description: err.message,
            });
          }
          await this.removeWorker({ worker, reason: `VM Creation Error(from IP): ${err.message}` });
      }

      if (!worker.providerData.ip.id) {
        return;
      }


      // NIC
      let nicConfig = {
        location: worker.providerData.location,
        ipConfigurations: [
          {
            name: worker.providerData.nic.name,
            privateIPAllocationMethod: 'Dynamic',
            subnet: {
              id: worker.providerData.subnet.id,
            },
            publicIPAddress: {
              id: worker.providerData.ip.id,
            },
          },
        ],
      };
      // set up the VM network interface config
      let nicModifyFunc = (w, nic) => {
        w.providerData.vm.config.networkProfile.networkInterfaces = [
          {
            id: nic.id,
            primary: true,
          },
        ];
      };

      try{
        worker = await this.provisionResource({
          worker,
          client: this.networkClient.networkInterfaces,
          resourceType: 'nic',
          resourceConfig: nicConfig,
          modifyFn: nicModifyFunc,
          monitor,
        });
      } catch (err) {
          const workerPool = await WorkerPool.get(this.db, worker.workerPoolId);
          // we create multiple resources in order to provision a VM
          // if we catch an error we want to deprovision those resources
          if (workerPool) {
            await this.reportError({
              workerPool,
              kind: 'creation-error',
              title: 'VM Creation Error',
              description: err.message,
            });
          }
          await this.removeWorker({ worker, reason: `VM Creation Error(from NIC): ${err.message}` });
      }

      if (!worker.providerData.nic.id) {
        return;
      }


      // VM
      let vmModifyFunc = (w, vm) => {
        let disks = [];
        disks.push({
          name: vm.storageProfile.osDisk.name,
          id: true,
        });
        for (let disk of vm.storageProfile.dataDisks || []) {
          disks.push(
            {
              name: disk.name,
              id: true,
            },
          );
        }
        w.providerData.disks = disks;
      };
      
      try{
        worker = await this.provisionResource({
          worker,
          client: this.computeClient.virtualMachines,
          resourceType: 'vm',
          resourceConfig: workerConfigWithSecrets(worker.providerData.vm.config),
          modifyFn: vmModifyFunc,
          monitor,
        });
      } catch (err) {
        const workerPool = await WorkerPool.get(this.db, worker.workerPoolId);
        // we create multiple resources in order to provision a VM
        // if we catch an error we want to deprovision those resources
        if (workerPool) {
          await this.reportError({
            workerPool,
            kind: 'creation-error',
            title: 'VM Creation Error',
            description: err.message,
          });
        }
        await this.removeWorker({ worker, reason: `VM Creation Error(from VM): ${err.message}` });
      }

      if (!worker.providerData.vm.id) {
        return;
      }

      // Here, the worker is full provisioned, but we do not mark it RUNNING until
      // it calls registerWorker.
      return;

  }

  async fetchVmInfo(worker) {
    const { provisioningState, vmId } = await this._enqueue('get', () => this.computeClient.virtualMachines.get(
      worker.providerData.resourceGroupName,
      worker.providerData.vm.name,
    ));
    // vm has successfully provisioned
    // vmId is a uuid, we use it for registering workers
    if (!worker.providerData.vm.vmId) {
      await worker.update(this.db, worker => {
        worker.providerData.vm.vmId = vmId;
      });
    }
    return { provisioningState, vmId };
  }

  async checkWorker({ worker }) {
    const monitor = this.workerMonitor({
      worker,
      extra: {
        resourceGroupName: worker.providerData.resourceGroupName,
        vmName: worker.providerData.vm.name,
      } });

    // update providerdata from deprecated disk to disks if applicable
    if (_.has(worker.providerData, 'disk')) {
      await worker.update(this.db, worker => {
        worker.providerData.disks = [worker.providerData.disk];
      });
    }

    const states = Worker.states;
    this.seen[worker.workerPoolId] = this.seen[worker.workerPoolId] || 0;
    this.errors[worker.workerPoolId] = this.errors[worker.workerPoolId] || [];
    try {
      // lets us get power states for the VM
      const instanceView = await this._enqueue('get', () => this.computeClient.virtualMachines.instanceView(
        worker.providerData.resourceGroupName,
        worker.providerData.vm.name,
      ));
      const powerStates = instanceView.statuses.map(i => i.code);
      monitor.debug({
        message: 'fetched instance view',
        powerStates,
      });

      // count this worker as having been seen for later logging
      this.seen[worker.workerPoolId] += worker.capacity || 1;

      // See https://docs.microsoft.com/en-us/azure/virtual-machines/states-lifecycle
      // for background on the VM lifecycle.
      let isFailed = false;
      let reason;

      if (_.some(powerStates, state => failPowerStates.has(state))) {
        // A VM can transition to one of failPowerStates through an Azure issue of some sort, by being
        // manually terminated (e.g., in the web UI), or by being halted from within the VM.  In this
        // case, we consider the worker failed and begin to remove it.
        isFailed = true;
        reason = `failed power state; powerStates=${powerStates.join(', ')}`;
      }

      if (!isFailed && worker.state === states.REQUESTED) {
        // It's possible for a newly-requested VM to be running (PowerState/running), but have failed
        // provisioning.  In this case the VM isn't doing any work, but billing continues.  So, we want
        // to catch this case and also consider it failed.  These state codes have the form
        // `ProvisioningState/failed/<SomeCode>`.  We allow the user to ignore specific codes.
        let ignore = new Set(worker.providerData.ignoreFailedProvisioningStates || []);
        let failedProvisioningCodes = powerStates
          .filter(state => state.startsWith('ProvisioningState/failed/'))
          .map(state => state.split('/')[2])
          .filter(code => !ignore.has(code));

        // any failed-provisioning code is treated as a failure
        if (failedProvisioningCodes.length > 0) {
          isFailed = true;
          reason = `failed provisioning power state; powerStates=${powerStates.join(', ')}`;
        }
      }

      if (!isFailed && worker.providerData.terminateAfter && worker.providerData.terminateAfter < Date.now()) {
        // If the worker has not checked in recently enough, we consider it failed regardless of the Azure lifecycle
        isFailed = true;
        reason = 'terminateAfter time exceeded';
      }

      if (isFailed) {
        // On failure, call `removeWorker`, which logs and marks the worker as STOPPING
        await this.removeWorker({ worker, reason });
      }
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err;
      }
      monitor.debug({ message: `vm instance view not found, in state ${worker.state}` });

      // VM has not been found, so it is either
      // 1. still being created
      // 2. already removed but other resources may need to be deleted
      // 3. deleted outside of provider actions, should start removal
      if (worker.state === states.REQUESTED) {
        // continue to try to provision this worker
        await this.provisionResources({ worker, monitor });
      } else if (worker.state === states.STOPPING) {
        // continuing to try to deprovision this worker
        await this.deprovisionResources({ worker, monitor });
      } else {
        // VM in unknown state not found, or deleted outside provider, so start
        // removing it.
        await this.removeWorker({ worker, reason: `vm not found in state ${worker.state}` });
      }
    }

    await worker.update(this.db, worker => {
      const now = new Date();
      worker.lastChecked = now;
    });
  }

  /*
   * Called after an iteration of the worker scanner
   */
  async scanCleanup() {
    this.monitor.log.scanSeen({ providerId: this.providerId, seen: this.seen });
    await Promise.all(Object.entries(this.seen).map(async ([workerPoolId, seen]) => {
      const workerPool = await WorkerPool.get(this.db, workerPoolId);

      if (!workerPool) {
        return; // In this case, the workertype has been deleted so we can just move on
      }

      if (this.errors[workerPoolId].length) {
        await Promise.all(this.errors[workerPoolId].map(error => this.reportError({ workerPool, ...error })));
      }
    }));
  }

  /*
   * deprovisionResource attempts to delete a resource and verify deletion
   * if the resource has been verified deleted
   *   * sets providerData[resourceType].id = false, signalling it has been deleted
   *   * returns true
   *
   */
  async deprovisionResource({ client, worker, resourceType, monitor, index = undefined }) {
    if (!_.has(worker.providerData, resourceType)) {
      throw new Error(`Error removing worker: providerData does not contain resourceType ${resourceType}`);
    }

    // if we are deleting multiple resources for a type
    let typeData;
    if (index !== undefined) {
      typeData = worker.providerData[resourceType][index];
    } else {
      typeData = worker.providerData[resourceType];
    }

    const debug = message => monitor.debug({
      message,
      resourceType,
      resourceId: typeData.id,
      resourceName: typeData.name,
    });

    debug(`deprovisionResource for ${resourceType} with index ${index}`);

    let shouldDelete = false;
    // lookup resource by name
    if (!typeData.id) {
      try {
        let { provisioningState } = await this._enqueue('query', () => client.get(
          worker.providerData.resourceGroupName,
          typeData.name,
        ));
        // resource could be successful, failed, etc.
        // we have not yet tried to delete the resource
        debug(`found provisioningState ${provisioningState}`);
        if (!(['Deleting', 'Deallocating', 'Deallocated'].includes(provisioningState))) {
          shouldDelete = true;
        }
      } catch (err) {
        if (err.statusCode === 404) {
          debug(`resource ${typeData.name} not found; removing its id`);
          // if we check for `true` we repeat lots of GET requests
          // resource has been deleted and isn't in the API or never existed
          await worker.update(this.db, worker => {
            if (index !== undefined) {
              worker.providerData[resourceType][index].operation = undefined;
              worker.providerData[resourceType][index].id = false;
            } else {
              worker.providerData[resourceType].operation = undefined;
              worker.providerData[resourceType].id = false;
            }
          });

          return true;
        }
        throw err;
      }
    }

    // NB: possible resource leak if we don't require `return true`
    // we don't check operation status: no differentiating between
    // operation => create and operation => delete
    if (typeData.id || shouldDelete) {
      // we need to delete the resource
      debug('deleting resource');
      let deleteRequest = await this._enqueue('query', () => client.beginDeleteMethod(
        worker.providerData.resourceGroupName,
        typeData.name,
      ));
      // record operation (NOTE: this information is never used, as deletion is tracked
      // by name)
      await worker.update(this.db, worker => {
        let resource;
        if (index !== undefined) {
          resource = worker.providerData[resourceType][index];
        } else {
          resource = worker.providerData[resourceType];
        }
        resource.id = false;
        let pollState = deleteRequest.getPollState();
        if (_.has(pollState, 'azureAsyncOperationHeaderValue')) {
          resource.operation = pollState.azureAsyncOperationHeaderValue;
        }
      });
    }
    return false;
  }

  /*
   * removeWorker marks a worker for deletion and begins removal.
   */
  async removeWorker({ worker, reason }) {
    this.monitor.log.workerRemoved({
      workerPoolId: worker.workerPoolId,
      providerId: worker.providerId,
      workerId: worker.workerId,
      reason,
    });

    // transition from either REQUESTED or RUNNING to STOPPING, and let the
    // worker scanner take it from there.
    await worker.update(this.db, worker => {
      const now = new Date();
      if ([Worker.states.REQUESTED, Worker.states.RUNNING].includes(worker.state)) {
        worker.lastModified = now;
        worker.state = Worker.states.STOPPING;
      }
    });
  }

  /*
   * deprovisionResources removes resources corresponding to a VM,
   * while the worker is in the STOPPING state.  Like provisionResources,
   * it is called repeatedly in the worker-scanner until it is complete.
   */
  async deprovisionResources({ worker, monitor }) {
    // After we make the delete request we set id to false
    // some delete operations (i.e. VMs) take a long time though
    // we use the result of deprovisionResource to _ensure_ deletion has completed
    // before moving on to the next step, so that we don't leak resources
    try {
      // VM must be deleted before disk
      // VM must be deleted before NIC
      // NIC must be deleted before IP
      let vmDeleted = await this.deprovisionResource({
        worker,
        client: this.computeClient.virtualMachines,
        resourceType: 'vm',
        monitor,
      });
      if (!vmDeleted || worker.providerData.vm.id) {
        return;
      }
      let nicDeleted = await this.deprovisionResource({
        worker,
        client: this.networkClient.networkInterfaces,
        resourceType: 'nic',
        monitor,
      });
      if (!nicDeleted || worker.providerData.nic.id) {
        return;
      }
      let ipDeleted = await this.deprovisionResource({
        worker,
        client: this.networkClient.publicIPAddresses,
        resourceType: 'ip',
        monitor,
      });
      if (!ipDeleted || worker.providerData.ip.id) {
        return;
      }

      // handles deleting osDisks and dataDisks
      let disksDeleted = true;
      for (let i = 0; i < worker.providerData.disks.length; i++) {
        let success = await this.deprovisionResource({
          worker,
          client: this.computeClient.disks,
          resourceType: 'disks',
          monitor,
          index: i,
        });
        if (!success) {
          disksDeleted = false;
        }
      }
      // check for un-deleted disks
      if (!disksDeleted || _.some(worker.providerData.disks.map(i => i['id']))) {
        return;
      }

      // change to stopped
      monitor.debug(`setting state to STOPPED`);
      await worker.update(this.db, worker => {
        const now = new Date();
        worker.lastModified = now;
        worker.lastChecked = now;
        worker.state = Worker.states.STOPPED;
      });
    } catch (err) {
      // if this is called directly and not via checkWorker may not exist
      this.errors = this.errors || {};
      this.errors[worker.workerPoolId] = this.errors[worker.workerPoolId] || [];
      monitor.debug({ message: 'error removing resources', error: err.message });
      this.errors[worker.workerPoolId].push({
        kind: 'deletion-error',
        title: 'Deletion Error',
        description: err.message,
        extra: {
          code: err.code,
        },
        notify: this.notify,
        WorkerPoolError: this.WorkerPoolError,
      });
    }
  }
}

module.exports = {
  AzureProvider,
};
