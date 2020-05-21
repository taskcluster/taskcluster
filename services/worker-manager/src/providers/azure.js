const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const forge = require('node-forge');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const generator = require('generate-password');
const {WorkerPool} = require('../data');

const auth = require('@azure/ms-rest-nodeauth');
const ComputeManagementClient = require('@azure/arm-compute').ComputeManagementClient;
const NetworkManagementClient = require('@azure/arm-network').NetworkManagementClient;
const msRestJS = require('@azure/ms-rest-js');
const msRestAzure = require('@azure/ms-rest-azure-js');

const {ApiError, Provider} = require('./provider');
const {CloudAPI} = require('./cloudapi');

// Azure provisioning and VM power states
// see here: https://docs.microsoft.com/en-us/azure/virtual-machines/windows/states-lifecycle
// same for linux: https://docs.microsoft.com/en-us/azure/virtual-machines/linux/states-lifecycle
const successPowerStates = new Set(['PowerState/running', 'PowerState/starting']);
const failPowerStates = new Set(['PowerState/stopping', 'PowerState/stopped', 'PowerState/deallocating', 'PowerState/deallocated']);
const successProvisioningStates = new Set(['Succeeded', 'Creating', 'Updating']);
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
  // Windows admin user name cannot be more than 20 characters long, be empty,
  // end with a period(.), or contain the following characters: \\ / \" [ ] : | < > + = ; , ? * @.
  cfg.osProfile.adminUsername = nicerId().slice(0, 20);
  // we have to set a password, but we never want it to be used, so we throw it away
  // a legitimate user who needs access can reset the password
  cfg.osProfile.adminPassword = generateAdminPassword();
  return cfg;
}

class AzureProvider extends Provider {

  constructor({
    providerConfig,
    fakeCloudApis,
    ...conf
  }) {
    super(conf);
    this.configSchema = 'config-azure';
    this.providerConfig = providerConfig;
    this.fakeCloudApis = fakeCloudApis;
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
      errorHandler: ({err, tries}) => {
        if (err.statusCode === 429) { // too many requests
          return {backoff: _backoffDelay * 50, reason: 'rateLimit', level: 'notice'};
        } else if (err.statusCode >= 500) { // For 500s, let's take a shorter backoff
          return {backoff: _backoffDelay * Math.pow(2, tries), reason: 'errors', level: 'warning'};
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

    if (this.fakeCloudApis && this.fakeCloudApis.azure) {
      this.computeClient = this.fakeCloudApis.azure.compute();
      this.networkClient = this.fakeCloudApis.azure.network();
      return;
    }

    let credentials = await auth.loginWithServicePrincipalSecret(clientId, secret, domain);
    this.computeClient = new ComputeManagementClient(credentials, subscriptionId);
    this.networkClient = new NetworkManagementClient(credentials, subscriptionId);
    this.restClient = new msRestAzure.AzureServiceClient(credentials);
  }

  async provision({workerPool, workerInfo}) {
    const {workerPoolId} = workerPool;
    let toSpawn = await this.estimator.simple({
      workerPoolId,
      ...workerPool.config,
      workerInfo,
    });

    if (toSpawn === 0) {
      return; // Nothing to do
    }

    const {terminateAfter, reregistrationTimeout} = Provider.interpretLifecycle(workerPool.config);

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
      const diskName = `disk-${nicerId()}`.slice(0, 24);

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

      const config = {
        ...cfg,
        osProfile: {
          ...cfg.osProfile,
          // adminUsername and adminPassword will be added later
          // because we are saving this config to providerData
          // and they are obfuscated / intended to be secret
          computerName,
          customData,
        },
        storageProfile: {
          ...cfg.storageProfile,
          osDisk: {
            ...(cfg.storageProfile || {}).osDisk,
            name: diskName,
          },
        },
        networkProfile: {
          ...cfg.networkProfile,
          // we add this when we have the NIC provisioned
          networkInterfaces: [],
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
        disk: {
          // created by the VM operation
          name: diskName,
          id: false,
        },
        subnet: {
          id: cfg.subnetId,
        },
      };

      this.monitor.log.workerRequested({
        workerPoolId,
        providerId: this.providerId,
        workerGroup,
        workerId: virtualMachineName,
      });
      const now = new Date();
      await this.Worker.create({
        workerPoolId,
        providerId: this.providerId,
        workerGroup,
        workerId: virtualMachineName,
        created: now,
        lastModified: now,
        lastChecked: now,
        expires: taskcluster.fromNow('1 week'),
        state: this.Worker.states.REQUESTED,
        capacity: cfg.capacityPerInstance,
        providerData: {
          ...providerData,
          terminateAfter,
          reregistrationTimeout,
        },
      });
    }));
  }

  async deprovision({workerPool}) {
    // nothing to do: we just wait for workers to terminate themselves
  }

  _now() {
    return new Date();
  }

  async registerWorker({worker, workerPool, workerIdentityProof}) {
    const {document} = workerIdentityProof;
    const monitor = this.workerMonitor({worker});

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
      this.monitor.log.registrationErrorWarning({message: 'Error extracting PKCS#7 message', error: err.toString()});
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
      this.monitor.log.registrationErrorWarning({message: 'Error extracting PKCS#7 message content', error: err.toString()});
      throw error();
    }

    // verify that the message is properly signed
    try {
      let verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(Buffer.from(content));
      assert(verifier.verify(pem, sig, 'binary'));
    } catch (err) {
      this.monitor.log.registrationErrorWarning({message: 'Error verifying PKCS#7 message signature', error: err.toString()});
      throw error();
    }

    // verify that the embedded certificates have proper chain of trust
    try {
      forge.pki.verifyCertificateChain(this.caStore, [crt]);
    } catch (err) {
      this.monitor.log.registrationErrorWarning({message: 'Error verifying certificate chain', error: err.message});
      throw error();
    }

    let payload;
    try {
      payload = JSON.parse(content);
    } catch (err) {
      this.monitor.log.registrationErrorWarning({message: 'Payload was not valid JSON', error: err.toString()});
      throw error();
    }

    let workerVmId = worker.providerData.vm.vmId;
    if (!workerVmId) {
      const {vmId} = await this.fetchAndUpdateVm(worker);
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
      this.monitor.log.registrationErrorWarning({message: 'Expired message', error: err.toString(), expires: payload.timeStamp.expiresOn});
      throw error();
    }

    if (worker.state !== this.Worker.states.REQUESTED) {
      this.monitor.log.registrationErrorWarning({message: 'Worker was already running.', error: 'Worker was already running.'});
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
    monitor.debug('setting state to RUNNING');
    await worker.modify(w => {
      w.lastModified = new Date();
      w.state = this.Worker.states.RUNNING;
      w.providerData.terminateAfter = expires.getTime();
    });
    const workerConfig = worker.providerData.workerConfig || {};
    return {expires, workerConfig};
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
  async handleOperation({op, errors, monitor}) {
    monitor.debug({message: 'handling operation', op});
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
      monitor.debug({message: 'reading operation failed', op, error: err.message});
      errors.push({
        kind: 'operation-error',
        title: 'Operation Error',
        description: err.message,
        notify: this.notify,
        WorkerPoolError: this.WorkerPoolError,
      });
    }
    // Rest API has different error semantics than the SDK
    if (resp.status === 404) {
      // operation not found because it has either expired or does not exist
      // nothing more to do
      monitor.debug({message: 'operation does not exist', op});
      return false;
    }

    let body = resp.parsedBody;
    if (body) {
      // status is guaranteed to exist if the operation was found
      if (body.status === 'InProgress') {
        monitor.debug({message: 'operation in progress', op});
        return true;
      }
      if (body.error) {
        monitor.debug({message: 'operation failed', op, error: body.error.message});
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
      }
    }

    monitor.debug({message: 'operation complete', op});
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
  async provisionResource({worker, client, resourceType, resourceConfig, modifyFn, monitor}) {
    if (!_.has(worker.providerData, resourceType)) {
      throw new Error(`Error provisioning worker: providerData does not contain resourceType ${resourceType}`);
    }
    let typeData = worker.providerData[resourceType];

    const debug = message => monitor.debug({
      message,
      resourceType,
      resourceId: typeData.id,
      reosurceName: typeData.name,
    });
    debug('provisioning resource');

    // we have no id, so we try to lookup resource by name
    if (!typeData.id) {
      try {
        debug('querying resource by name');
        let resource = await this._enqueue('query', () => client.get(
          worker.providerData.resourceGroupName,
          typeData.name,
        ));
        // we found the resource
        await worker.modify(w => {
          w.providerData[resourceType].id = resource.id;
          modifyFn(w, resource);
        });
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
          });
          if (!op) {
            // if the operation has expired or does not exist
            // chances are our instance has been deleted off band
            await this.removeWorker({worker, reason: 'operation expired'});
          }
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
        {...resourceConfig, tags: worker.providerData.tags},
      ));
      // track operation
      await worker.modify(w => {
        w.providerData[resourceType].operation = resourceRequest.getPollState().azureAsyncOperationHeaderValue;
      });
    }
  }

  /**
   * provisionResources wraps the process of provisioning worker resources
   *
   * This function is expected to be called several times per worker as
   * resources are created.
   */
  async provisionResources({worker, monitor}) {
    try {
      // IP
      let ipConfig = {
        location: worker.providerData.location,
        publicIPAllocationMethod: 'Dynamic',
      };
      await this.provisionResource({
        worker,
        client: this.networkClient.publicIPAddresses,
        resourceType: 'ip',
        resourceConfig: ipConfig,
        modifyFn: () => {},
        monitor,
      });
      if (!worker.providerData.ip.id) {
        return worker.state;
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
      await this.provisionResource({
        worker,
        client: this.networkClient.networkInterfaces,
        resourceType: 'nic',
        resourceConfig: nicConfig,
        modifyFn: nicModifyFunc,
        monitor,
      });
      if (!worker.providerData.nic.id) {
        return worker.state;
      }

      // VM
      // NB: if we ever need disk id for anything, we could get it here
      await this.provisionResource({
        worker,
        client: this.computeClient.virtualMachines,
        resourceType: 'vm',
        resourceConfig: workerConfigWithSecrets(worker.providerData.vm.config),
        modifyFn: () => {},
        monitor,
      });
      if (!worker.providerData.vm.id) {
        return worker.state;
      }
      return this.Worker.states.RUNNING;
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
      return await this.removeWorker({worker, reason: `VM Creation Error: ${err.message}`});
    }
  }

  async fetchAndUpdateVm(worker) {
    const {provisioningState, id, vmId} = await this._enqueue('get', () => this.computeClient.virtualMachines.get(
      worker.providerData.resourceGroupName,
      worker.providerData.vm.name,
    ));
    // vm has successfully provisioned, we need to set id and vmId
    // id is the fully qualified azure resource ID
    // vmId is a uuid, we use it for registering workers
    if (!worker.providerData.vm.id || !worker.providerData.vm.vmId) {
      await worker.modify(w => {
        w.providerData.vm.id = id;
        w.providerData.vm.vmId = vmId;
      });
    }
    return {provisioningState, id, vmId};
  }

  async checkWorker({worker}) {
    const monitor = this.workerMonitor({
      worker,
      extra: {
        resourceGroupName: worker.providerData.resourceGroupName,
        vmName: worker.providerData.vm.name,
      }});

    const states = this.Worker.states;
    this.seen[worker.workerPoolId] = this.seen[worker.workerPoolId] || 0;
    this.errors[worker.workerPoolId] = this.errors[worker.workerPoolId] || [];
    let state = worker.state || states.REQUESTED;
    try {
      const {provisioningState} = await this.fetchAndUpdateVm(worker);
      // lets us get power states for the VM
      const instanceView = await this._enqueue('get', () => this.computeClient.virtualMachines.instanceView(
        worker.providerData.resourceGroupName,
        worker.providerData.vm.name,
      ));
      const powerStates = instanceView.statuses.map(i => i.code);
      monitor.debug({
        message: 'fetched instance states',
        powerStates,
        provisioningState,
      });
      if (successProvisioningStates.has(provisioningState) &&
          // fairly lame check, succeeds if we've ever been starting/running
          _.some(powerStates, v => successPowerStates.has(v))
      ) {
        this.seen[worker.workerPoolId] += worker.capacity || 1;

        // If the worker will be expired soon but it still exists,
        // update it to stick around a while longer. If this doesn't happen,
        // long-lived instances become orphaned from the provider. We don't update
        // this on every loop just to avoid the extra work when not needed
        if (worker.expires < taskcluster.fromNow('1 day')) {
          await worker.modify(w => {
            w.expires = taskcluster.fromNow('1 week');
          });
        }
        if (worker.providerData.terminateAfter && worker.providerData.terminateAfter < Date.now()) {
          state = await this.removeWorker({worker, reason: 'terminateAfter time exceeded'});
        }
      } else if (failProvisioningStates.has(provisioningState) ||
                // if the VM has ever been in a failing power state
                _.some(powerStates, v => failPowerStates.has(v))
      ) {
        state = await this.removeWorker({
          worker,
          reason: `failed state; provisioningState=${provisioningState}, powerStates=${powerStates.join(', ')}`,
        });
      } else {
        const {workerPoolId} = worker;
        const workerPool = await WorkerPool.get(this.db, workerPoolId);
        if (workerPool) {
          await this.reportError({
            workerPool,
            kind: 'creation-error',
            title: 'Encountered unknown VM provisioningState or powerStates',
            description: `Unknown provisioningState ${provisioningState} or powerStates: ${powerStates.join(', ')}`,
          });
        }
      }
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err;
      }
      monitor.debug({message: `vm or state not found, in state ${state}`});
      // we're either provisioning or stopping this worker
      if (state === states.REQUESTED) {
        state = await this.provisionResources({worker, monitor});
      }
      // continuing to stop
      if (state === states.STOPPING) {
        state = await this.removeWorker({worker, reason: 'continuing removal'});
      }
    }

    monitor.debug(`setting state to ${state}`);
    await worker.modify(w => {
      const now = new Date();
      if (w.state !== state) {
        w.lastModified = now;
      }
      w.lastChecked = now;
      w.state = state;
    });
  }

  /*
   * Called after an iteration of the worker scanner
   */
  async scanCleanup() {
    this.monitor.log.scanSeen({providerId: this.providerId, seen: this.seen});
    await Promise.all(Object.entries(this.seen).map(async ([workerPoolId, seen]) => {
      const workerPool = await WorkerPool.get(this.db, workerPoolId);

      if (!workerPool) {
        return; // In this case, the workertype has been deleted so we can just move on
      }

      if (this.errors[workerPoolId].length) {
        await Promise.all(this.errors[workerPoolId].map(error => this.reportError({workerPool, ...error})));
      }
    }));
  }

  /*
   * removeResource attempts to delete a resource and verify deletion
   * if the resource has been verified deleted
   *   * sets providerData[resourceType].id = false, signalling it has been deleted
   *   * returns true
   */
  async removeResource({client, worker, resourceType, monitor}) {
    if (!_.has(worker.providerData, resourceType)) {
      throw new Error(`Error removing worker: providerData does not contain resourceType ${resourceType}`);
    }
    let typeData = worker.providerData[resourceType];

    const debug = message => monitor.debug({
      message,
      resourceType,
      resourceId: typeData.id,
      reosurceName: typeData.name,
    });

    let shouldDelete = false;
    // lookup resource by name
    if (!typeData.id) {
      try {
        debug('looking up state by name');
        let {provisioningState} = await this._enqueue('query', () => client.get(
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
          debug('resource not found; removing its id');
          // if we check for `true` we repeat lots of GET requests
          // resource has been deleted and isn't in the API or never existed
          await worker.modify(w => {
            w.providerData[resourceType].id = false;
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
      await worker.modify(w => {
        w.providerData[resourceType].id = false;
        w.providerData[resourceType].operation = deleteRequest.getPollState().azureAsyncOperationHeaderValue;
      });
    }
    return false;
  }

  /*
   * removeWorker marks a worker for deletion and begins removal
   */
  async removeWorker({worker, reason}) {
    this.monitor.log.workerRemoved({
      workerPoolId: worker.workerPoolId,
      providerId: worker.providerId,
      workerId: worker.workerId,
      reason,
    });

    const monitor = this.workerMonitor({
      worker,
      extra: {
        resourceGroupName: worker.providerData.resourceGroupName,
        vmName: worker.providerData.vm.name,
      }});

    let states = this.Worker.states;
    if (worker.state === states.STOPPED) {
      // we're done
      return states.STOPPED;
    }

    let state = states.STOPPING;
    // After we make the delete request we set id to false
    // some delete operations (i.e. VMs) take a long time though
    // we use the result of removeResource to _ensure_ deletion has completed
    // before moving on to the next step, so that we don't leak resources
    try {
      // VM must be deleted before disk
      // VM must be deleted before NIC
      // NIC must be deleted before IP
      let vmDeleted = await this.removeResource({
        worker,
        client: this.computeClient.virtualMachines,
        resourceType: 'vm',
        monitor,
      });
      if (!vmDeleted || worker.providerData.vm.id) {
        return state;
      }
      let nicDeleted = await this.removeResource({
        worker,
        client: this.networkClient.networkInterfaces,
        resourceType: 'nic',
        monitor,
      });
      if (!nicDeleted || worker.providerData.nic.id) {
        return state;
      }
      let ipDeleted = await this.removeResource({
        worker,
        client: this.networkClient.publicIPAddresses,
        resourceType: 'ip',
        monitor,
      });
      if (!ipDeleted || worker.providerData.ip.id) {
        return state;
      }
      let diskDeleted = await this.removeResource({
        worker,
        client: this.computeClient.disks,
        resourceType: 'disk',
        monitor,
      });
      if (!diskDeleted || worker.providerData.disk.id) {
        return state;
      }

      // change to stopped
      state = states.STOPPED;
      monitor.debug(`setting state to ${state}`);
      await worker.modify(w => {
        const now = new Date();
        w.lastModified = now;
        w.lastChecked = now;
        w.state = state;
      });
    } catch (err) {
      // if this is called directly and not via checkWorker may not exist
      this.errors = this.errors || {};
      this.errors[worker.workerPoolId] = this.errors[worker.workerPoolId] || [];
      monitor.debug({message: 'error removing resources', error: err.message});
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
    return state;
  }
}

module.exports = {
  AzureProvider,
};
