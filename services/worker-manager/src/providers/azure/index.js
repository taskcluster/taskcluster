import assert from 'assert';
import _ from 'lodash';
import taskcluster from '@taskcluster/client';
import forge from 'node-forge';
import crypto from 'crypto';
import got from 'got';
import { rootCertificates } from 'tls';
import { WorkerPool, Worker } from '../../data.js';
import azureApi from './azure-api.js';
import { ApiError, Provider } from '../provider.js';
import { CloudAPI } from '../cloudapi.js';
import { loadCertificates } from './azure-ca-certs/index.js';
import { nicerId, dnToString, workerConfigWithSecrets, getCertFingerprint, getAuthorityAccessInfo, cloneCaStore, generateAdmin, ArmDeploymentProvisioningState } from './utils.js';

/** @typedef {import('../../data.js').WorkerPoolStats} WorkerPoolStats */
/** @typedef {import('../../data.js').WorkerPoolLaunchConfig} WorkerPoolLaunchConfig */
/** @typedef {import('../provider.js').ProviderConfigOptions} ProviderConfigOptions */

/** @typedef {{
 *    lc: WorkerPoolLaunchConfig,
 *    workerPool: WorkerPool,
 *    terminateAfter: number,
 *    reregistrationTimeout: number,
 *    queueInactivityTimeout: number,
 *    nameSuffix: string,
 *    virtualMachineName: string,
 *    computerName: string,
 *  }} ProvisionOptions
 */

// Azure provisioning and VM power states
// see here: https://docs.microsoft.com/en-us/azure/virtual-machines/states-billing
const failPowerStates = new Set([
  'PowerState/stopping',
  'PowerState/stopped',
  'PowerState/deallocating',
  'PowerState/deallocated',
]);

const InstanceStates = {
  OK: 'ok',
  FAILED: 'failed',
  MISSING: 'missing',
};

// Provisioning states for any resource type.  See, for example,
// https://docs.microsoft.com/en-us/rest/api/virtualnetwork/networkinterfaces/createorupdate#provisioningstate
const failProvisioningStates = new Set(['Failed', 'Deleting', 'Canceled', 'Deallocating']);

const DEPLOYMENT_METHOD_ARM = 'arm-template';

export class AzureProvider extends Provider {

  /**
   * @param {{ providerConfig: { resourceGroupName: string } } & ProviderConfigOptions} opts
   */
  constructor({
    providerConfig,
    ...conf
  }) {
    super(conf);
    this.configSchema = 'config-azure';
    this.providerConfig = providerConfig;
    this.downloadTimeout = 5000; // 5 seconds

    this.seen = {};
    /** @type {Record<string, any>} */
    this.errors = {};
    this.cloudApi = null;
    /** @type {Map<string, boolean>} Cache for verified resource groups */
    this.resourceGroupCache = new Map();
  }

  // Add a PEM-encoded root certificate rootCertPem
  //
  // node-forge doesn't support ECC so it cannot load ECDSA certs (issue #3924).
  // See https://github.com/digitalbazaar/forge/issues/116 (opened April 2014)
  // If failIfNotRSACert == true, then ECDSA certs throw an Error
  //
  // Returns true if the certificate was added.
  addRootCertPem(rootCertPem, failIfNotRSACert = false) {
    let rootCert = null;
    try {
      rootCert = forge.pki.certificateFromPem(rootCertPem);
    } catch (err) {
      const isNotRSACert = (err.message !== 'Cannot read public key. OID is not RSA.');
      if (isNotRSACert || failIfNotRSACert) {
        throw err;
      }
    }
    if (rootCert && !this.caStore.hasCertificate(rootCert)) {
      this.caStore.addCertificate(rootCert);
      return true;
    }
    return false;
  }

  // Add an intermediate certificate
  addIntermediateCert(cert) {
    const issuer = this.caStore.getIssuer(cert);
    if (issuer === null) {
      throw Error(`Issuer "${dnToString(cert.issuer)}"` +
                  ` for "${dnToString(cert.subject)}" is not a known Root CA`);
    }
    this.caStore.addCertificate(cert);
  }

  // Return a response Promise, where .body is the binary file
  // This method is patched for testing
  async downloadBinaryResponse(url) {
    return await got(url, {
      responseType: 'buffer',
      resolveBodyOnly: true,
      timeout: {
        request: this.downloadTimeout,
      },
      followRedirect: false,
    });
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
    this.cloudApi = new CloudAPI({
      types: ['query', 'get', 'list', 'opRead'],
      apiRateLimits,
      intervalDefault: 100 * 1000, // Intervals are enforced every 100 seconds
      intervalCapDefault: 2000, // The calls we make are all limited 20/sec so 20 * 100 are allowed
      timeout: 10 * 60 * 1000, // each cloud call should not take longer than 10 minutes
      throwOnTimeout: true,
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
      collectMetrics: true,
    });
    this._enqueue = this.cloudApi.enqueue.bind(this.cloudApi);

    // Load root certificates from Node, which get them from the Mozilla CA store.
    this.caStore = forge.pki.createCaStore();
    rootCertificates.forEach(pem => this.addRootCertPem(pem));

    // load known microsoft intermediate certs from disk
    loadCertificates().forEach(cert => {
      if (cert.root) {
        this.addRootCertPem(cert.certificate);
      } else {
        const certFromPem = forge.pki.certificateFromPem(cert.certificate);
        this.addIntermediateCert(certFromPem);
      }
    });

    let credentials = new azureApi.ClientSecretCredential(domain, clientId, secret);
    this.computeClient = new azureApi.ComputeManagementClient(credentials, subscriptionId);
    this.networkClient = new azureApi.NetworkManagementClient(credentials, subscriptionId);
    this.resourcesClient = new azureApi.ResourceManagementClient(credentials, subscriptionId);
    this.deploymentsClient = new azureApi.DeploymentsClient(credentials, subscriptionId);
    this.restClient = new azureApi.AzureServiceClient(credentials);
  }

  /**
   * base64 encoded json with some custom data
   * @param {{ workerPoolId: string, workerGroup: string }} opts
   */
  #buildCustomData({ workerPoolId, workerGroup }) {
    return Buffer.from(JSON.stringify({
      workerPoolId,
      workerGroup,
      providerId: this.providerId,
      rootUrl: this.rootUrl,
      workerConfig: {}, // deprecated
    })).toString('base64');
  }

  /**
   * Deployment tags attached to each resource deployed
   * @param {{
   *  workerPoolId: string,
   *  workerGroup: string,
   *  workerPool: WorkerPool,
   *  lc: WorkerPoolLaunchConfig,
   *  }} opts
   */
  #deploymentTags({ workerPoolId, workerGroup, workerPool, lc }) {
    return {
      ...(lc.configuration.tags || {}),
      'created-by': `taskcluster-wm-${this.providerId}`,
      'managed-by': 'taskcluster',
      'provider-id': this.providerId,
      'worker-group': workerGroup,
      'worker-pool-id': workerPoolId,
      'root-url': this.rootUrl,
      'owner': workerPool.owner,
      'launch-config-id': lc.launchConfigId,
    };
  }

  /**
   * @param {{ workerPool: WorkerPool, workerPoolStats: WorkerPoolStats }} opts
   */
  async provision({ workerPool, workerPoolStats }) {
    const { workerPoolId } = workerPool;
    const workerInfo = workerPoolStats?.forProvision() ?? {};
    let toSpawn = await this.estimator.simple({
      workerPoolId,
      ...workerPool.config,
      workerInfo,
    });

    if (toSpawn === 0 || workerPool.config?.launchConfigs?.length === 0) {
      return; // Nothing to do
    }

    const {
      terminateAfter, reregistrationTimeout, queueInactivityTimeout,
    } = Provider.interpretLifecycle(workerPool.config);

    const cfgs = await this.selectLaunchConfigsForSpawn({ workerPool, toSpawn, workerPoolStats });

    await Promise.all(cfgs.map(async lc => {
      // This must be unique to currently existing instances and match [a-z]([-a-z0-9]*[a-z0-9])?
      // 38 chars is workerId limit, and we have a 3-character prefix (`vm-`), so this is 35 characters.
      const nameSuffix = `${nicerId()}${nicerId()}`.slice(0, 35);
      const virtualMachineName = `vm-${nameSuffix}`;
      // Windows computer name cannot be more than 15 characters long, be entirely numeric,
      // or contain the following characters: ` ~ ! @ # $ % ^ & * ( ) = + _ [ ] { } \\ | ; : . " , < > / ?
      // computerName is part of osProfile
      const computerName = nicerId().slice(0, 15);

      /** @type {ProvisionOptions} */
      const provisionArgs = {
        lc, workerPool, terminateAfter, reregistrationTimeout, queueInactivityTimeout,
        nameSuffix, virtualMachineName, computerName,
      };

      const isArmDeployment = !!lc.configuration.armDeployment;
      if (isArmDeployment) {
        await this.#provisionARMTemplateWorker(provisionArgs);
      } else {
        await this.#provisionSequentialWorker(provisionArgs);
      }
    }));
  }

  /**
   * Ensure that a resource group exists, creating it if necessary
   * Uses in-memory cache to avoid redundant API calls
   *
   * @param {string} resourceGroupName
   * @param {string} location
   * @param {string} workerPoolId
   */
  async #ensureResourceGroup(resourceGroupName, location, workerPoolId) {
    if (this.resourceGroupCache.has(resourceGroupName)) {
      return;
    }

    const { body: exists } = await this._enqueue('query', () =>
      this.resourcesClient.resourceGroups.checkExistence(resourceGroupName));

    if (!exists) {
      await this._enqueue('query', () =>
        this.resourcesClient.resourceGroups.createOrUpdate(resourceGroupName, { location }));

      this.monitor.log.azureResourceGroupEnsured({
        workerPoolId, resourceGroupName, location,
      });
    }

    this.resourceGroupCache.set(resourceGroupName, true);
  }

  /** @param {ProvisionOptions} opts */
  async #provisionSequentialWorker({
    lc, workerPool, terminateAfter, reregistrationTimeout, queueInactivityTimeout,
    nameSuffix, virtualMachineName, computerName,
  }) {
    const { workerPoolId } = workerPool;
    const cfg = lc.configuration;

    const ipAddressName = `pip-${nicerId()}`.slice(0, 24);
    const networkInterfaceName = `nic-${nicerId()}`.slice(0, 24);

    // workerGroup is the azure location; this is a required field in the config
    const workerGroup = cfg.location;
    assert(workerGroup, 'cfg.location is not set');

    const customData = this.#buildCustomData({ workerPoolId, workerGroup });

    // make a list of the disk resources, for later deletion
    const disks = [];

    // osDisk is required.  Azure would name it for us, but we give it a name up-front
    // so that we can delete it on de-provisioning
    let osDisk = {
      ...cfg.storageProfile.osDisk,
      name: `disk-${nameSuffix}-os`,
    };
    disks.push({ name: osDisk.name, id: true });

    // dataDisks is optional.  Azure will not generate names for data disks,
    // so we must invent names for them here.  We disallow users from naming
    // disk, since that would try to share the same disk among multiple vms,
    // but give each disk a unique name so that we can find it later to
    // delete it.
    let dataDisks = [];
    if (_.has(cfg, 'storageProfile.dataDisks')) {
      let i = 1;
      for (let disk of cfg.storageProfile.dataDisks) {
        const name = `disk-${nameSuffix}-${i++}`;
        disks.push({ name, id: true });
        dataDisks.push({ ...disk, name });
      }
    }

    const config = {
      ..._.omit(cfg, ['capacityPerInstance', 'workerConfig', 'workerManager']),
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

    // #7257 Public IP will only be provisioned if requested (see #4987)
    const needPublicIp = cfg?.workerManager?.publicIp ?? false;
    const skipPublicIp = !needPublicIp;

    let providerData = {
      location: cfg.location,
      resourceGroupName: this.providerConfig.resourceGroupName,
      workerConfig: cfg.workerConfig,
      skipPublicIp,
      tags: this.#deploymentTags({ workerPoolId, workerGroup, workerPool, lc }),
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
      disks,
      subnet: {
        id: cfg.subnetId,
      },
      ignoreFailedProvisioningStates: cfg?.workerManager?.ignoreFailedProvisioningStates
        ?? cfg.ignoreFailedProvisioningStates,
    };

    const worker = Worker.fromApi({
      workerPoolId,
      providerId: this.providerId,
      workerGroup,
      workerId: virtualMachineName,
      capacity: cfg?.workerManager?.capacityPerInstance ?? cfg.capacityPerInstance ?? 1,
      providerData: {
        ...providerData,
        terminateAfter,
        reregistrationTimeout,
        queueInactivityTimeout,
      },
      launchConfigId: lc.launchConfigId,
    });
    await worker.create(this.db);
    await this.onWorkerRequested({ worker, terminateAfter });

    // Start requesting resources immediately
    await this.checkWorker({ worker });
  }

  /**
   * Create worker for arm template and trigger deployment immediately
   *
   * @param {ProvisionOptions} opts
   */
  async #provisionARMTemplateWorker({
    lc, workerPool, terminateAfter, reregistrationTimeout, queueInactivityTimeout,
    nameSuffix, virtualMachineName, computerName,
  }) {
    const { workerPoolId } = workerPool;
    const cfg = lc.configuration;

    const armDeployment = cfg.armDeployment;
    assert(armDeployment, 'armDeployment is not set');

    const deploymentName = `deploy-${nameSuffix}`;

    // For ARM templates, location must come from parameters
    const location = armDeployment.parameters?.location?.value;
    assert(location, 'armDeployment.parameters.location is not set');
    const workerGroup = location; // same as location

    const keepDeployment = cfg.workerManager?.keepDeployment === true;
    const { adminUsername, adminPassword } = generateAdmin();
    const tags = this.#deploymentTags({ workerPoolId, workerGroup, workerPool, lc });
    const customData = this.#buildCustomData({ workerPoolId, workerGroup });

    // Pass armDeployment as-is to Azure API, only override parameters with generated values
    const deploymentProperties = {
      ...armDeployment,
      parameters: {
        ...armDeployment.parameters,
        // Override with generated/required parameters
        tags: { value: tags },
        vmName: { value: virtualMachineName },
        computerName: { value: computerName },
        adminUsername: { value: adminUsername },
        adminPassword: { value: adminPassword },
        customData: { value: customData },
      },
    };

    const resourceGroupName = cfg.armDeploymentResourceGroup || this.providerConfig.resourceGroupName;

    // Only ensure existence if explicitly specified (providerConfig RG should already exist)
    if (cfg.armDeploymentResourceGroup) {
      await this.#ensureResourceGroup(resourceGroupName, location, workerPoolId);
    }

    const providerData = {
      deploymentMethod: DEPLOYMENT_METHOD_ARM,
      location,
      resourceGroupName,
      workerConfig: cfg.workerConfig,
      armDeployment,
      keepDeployment,
      tags,
      deployment: {
        name: deploymentName,
        operation: false,
        id: false,
      },
      vm: {
        name: virtualMachineName,
        computerName,
        customData,
        id: false,
        vmId: false,
      },
      ip: {
        name: 'will-be-fetched-from-deployment',
        id: false,
        operation: false,
      },
      nic: {
        name: 'will-be-fetched-from-deployment',
        id: false,
        operation: false,
      },
      disks: [],
      terminateAfter,
      reregistrationTimeout,
      queueInactivityTimeout,
    };

    const worker = Worker.fromApi({
      workerPoolId,
      providerId: this.providerId,
      workerGroup,
      workerId: virtualMachineName,
      capacity: cfg?.workerManager?.capacityPerInstance ?? cfg.capacityPerInstance ?? 1,
      providerData,
      launchConfigId: lc.launchConfigId,
    });
    await worker.create(this.db);
    await this.onWorkerRequested({ worker, terminateAfter });

    this.monitor.debug({
      message: 'creating ARM deployment', deploymentName, resourceGroup: providerData.resourceGroupName,
    });

    try {
      // triggering arm deployment right away
      const deploymentRequest = await this._enqueue('query', () =>
        this.deploymentsClient.deployments.beginCreateOrUpdate(
          resourceGroupName,
          deploymentName,
          { properties: deploymentProperties, tags },
        ));

      await worker.update(this.db, worker => {
        worker.providerData.deployment.operation = deploymentRequest.getOperationState()?.config?.operationLocation;
      });
    } catch (err) {
      const workerPool = await WorkerPool.get(this.db, worker.workerPoolId);

      await this.reportError({
        workerPool,
        kind: 'creation-error',
        title: 'Failed to create ARM deployment',
        description: err.message,
        extra: {
          workerId: worker.workerId,
          workerGroup: workerGroup,
          armDeployment,
          params: {
            ...deploymentProperties.parameters,
            adminUsername: '***',
            adminPassword: '***',
          },
        },
        launchConfigId: worker.launchConfigId,
      });
      await this.removeWorker({ worker, reason: `ARM Deployment failure: ${err.message}` });
    }
  }

  /**
   * Check status of deployment, and if it is finished (failed/canceled/succeeded)
   * fetch provisioned resources for later deprovisioning
   *
   * @param {{ worker: Worker, monitor: import('@taskcluster/lib-monitor').Monitor }} opts
   */
  async #checkARMDeployment({ worker, monitor }) {
    if (worker.providerData.provisioningComplete) {
      return true;
    }

    // update worker after successful or failed deployment with resources for later deprovisioning
    const extractDeployedResourcesAndUpdateWorker = async (modifier) => {
      const deployedResources = await this.#extractResourcesFromDeployment(worker, monitor);

      await worker.update(this.db, worker => {
        modifier(worker);
        ['vm', 'nic', 'ip', 'disks'].forEach(resourceType => {
          if (resourceType === 'disks') {
            worker.providerData.disks ??= [];
            worker.providerData.disks.push(...deployedResources.disks);
          } else {
            worker.providerData[resourceType] = {
              ...(worker.providerData[resourceType] || {}),
              ...deployedResources[resourceType],
            };
          }
        });
      });
    };

    try {
      monitor.debug('querying deployment by name');
      const deployment = await this._enqueue('get', () =>
        this.deploymentsClient.deployments.get(
          worker.providerData.resourceGroupName,
          worker.providerData.deployment.name,
        ));

      const provisioningState = deployment.properties?.provisioningState;
      monitor.debug({ message: 'deployment provisioning state', provisioningState });

      // Expected terminal states are Succeeded if all good, and Failed/Cancelled if something goes wrong
      // Deleting/Deleted states can be ignored, handleOperation should clean it up
      const failedProvisioiningStates = [
        ArmDeploymentProvisioningState.Failed,
        ArmDeploymentProvisioningState.Canceled,
      ];
      if (failedProvisioiningStates.includes(provisioningState)) {
        const errorMessage = deployment.properties?.error?.message || 'Deployment failed';

        await extractDeployedResourcesAndUpdateWorker(worker => {
          worker.providerData.deployment.operation = undefined;
        });

        await this.removeWorker({ worker, reason: `deployment ${provisioningState}: ${errorMessage}` });
        return false;
      }

      if (provisioningState === ArmDeploymentProvisioningState.Succeeded) {
        await extractDeployedResourcesAndUpdateWorker(worker => {
          worker.providerData.deployment.id = deployment.id;
          worker.providerData.deployment.operation = undefined;
          worker.providerData.deployment.outputs = deployment.properties?.outputs || {};
          worker.providerData.provisioningComplete = true;
        });

        if (!worker.providerData.keepDeployment) {
          // Clean up deployment to avoid hitting the 800 deployments limit:
          // https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#azure-management-group-limits
          await this.deprovisionResource({
            worker,
            client: this.deploymentsClient.deployments,
            resourceType: 'deployment',
            monitor,
          });
        } else {
          monitor.debug({ message: 'keeping ARM deployment for debugging' });
        }

        return true;
      }
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err;
      }

      // Deployment is likely still in progress - check status or operation might be expired or failed
      if (worker.providerData.deployment.operation) {
        let op = await this.handleOperation({
          op: worker.providerData.deployment.operation,
          errors: this.errors[worker.workerPoolId],
          monitor,
          worker,
        });
        if (!op) {
          await worker.update(this.db, worker => {
            worker.providerData.deployment.operation = undefined;
          });
          // TODO: should it be removed right away?
          await this.removeWorker({ worker, reason: 'deployment operation expired' });
        }
      }
    }

    return false;
  }

  /**
   * Extract resources created by an ARM deployment for cleanup purposes
   * Queries deployment operations and parses resource IDs into format compatible with sequential deprovisioning
   * https://learn.microsoft.com/en-us/javascript/api/%40azure/arm-resourcesdeployments/deploymentoperations?view=azure-node-preview#@azure-arm-resourcesdeployments-deploymentoperations-list
   *
   * Resources that were not extracted would have id: false which would signal deprovisionResource() to skip it
   *
   * @param {Worker} worker
   * @param {import('@taskcluster/lib-monitor').Monitor} monitor
   */
  async #extractResourcesFromDeployment(worker, monitor) {
    const resources = {
      vm: { name: 'nonexistent', id: false, operation: undefined },
      nic: { name: 'nonexistent', id: false, operation: undefined },
      ip: { name: 'nonexistent', id: false, operation: undefined },
      disks: [],
    };

    const operations = [];

    try {
      monitor.debug('querying deployment operations for arm template deployment');
      const deploymentOperations = await this._enqueue('list', () => this.deploymentsClient.deploymentOperations.list(
        worker.providerData.resourceGroupName,
        worker.providerData.deployment.name,
      ));
      for await (const operation of deploymentOperations) {
        monitor.debug('deployment operation', operation);
        const { properties } = operation;
        if (properties?.targetResource?.id) {
          operations.push(operation);
        }
      }
    } catch (error) {
      monitor.error({ message: 'failed to query deployment operations', error });
      return resources;
    }

    monitor.debug({ message: 'found deployment operations', count: operations.length });

    const resourceTypeMap = {
      'Microsoft.Compute/virtualMachines': 'vm',
      'Microsoft.Network/networkInterfaces': 'nic',
      'Microsoft.Network/publicIPAddresses': 'ip',
      'Microsoft.Compute/disks': 'disk',
    };

    // Parse each operation to extract created resources
    for (const op of operations) {
      const targetResource = op.properties?.targetResource;
      const resourceType = targetResource?.resourceType;
      const resourceId = targetResource.id;

      const mappedType = resourceTypeMap[resourceType];
      if (!mappedType) {
        monitor.debug({ message: 'skipping unmapped resource type', resourceType, resourceId });
        continue;
      }

      // Parse resource ID to extract name
      // Format: /subscriptions/{sub}/resourceGroups/{rg}/providers/{provider}/{type}/{name}
      const resourceName = resourceId.split('/')?.pop();

      monitor.debug({ message: 'extracted resource from deployment', resourceType, resourceName, mappedType });

      if (mappedType === 'disk') {
        resources.disks.push({ name: resourceName, id: resourceId, operation: undefined });
      } else {
        resources[mappedType] = { name: resourceName, id: resourceId, operation: undefined };
      }
    }

    monitor.debug({ message: 'extracted resources from failed deployment', resources });
    return resources;
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
    // 2. The embedded public key has a proper certificate chain back to a trusted CA,
    //    and has a subject of "metadata.azure.com" or ends with ".metadata.azure.com"
    // 3. The embedded message contains the vmId that matches the worker making the request

    // signature is base64-encoded DER-format PKCS#7 / CMS message

    // decode base64, load DER, extract PKCS#7 message
    let decodedMessage = Buffer.from(document, 'base64');
    let message;
    try {
      let asn1 = forge.asn1.fromDer(forge.util.createBuffer(decodedMessage));
      message = forge.pkcs7.messageFromAsn1(asn1);
    } catch (err) {
      this.monitor.log.registrationErrorWarning({
        message: 'Error extracting PKCS#7 message',
        error: err.toString(),
        workerPoolId: workerPool.workerPoolId,
        providerId: this.providerId,
        workerId: worker.workerId,
        document,
      });
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
      this.monitor.log.registrationErrorWarning({
        message: 'Error extracting PKCS#7 message content',
        error: err.toString(),
        workerPoolId: workerPool.workerPoolId,
        providerId: this.providerId,
        workerId: worker.workerId,
        document,
      });
      throw error();
    }

    // verify that the message is properly signed
    try {
      let verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(Buffer.from(content));
      assert(verifier.verify(pem, sig, 'binary'));
    } catch (err) {
      this.monitor.log.registrationErrorWarning({
        message: 'Error verifying PKCS#7 message signature',
        error: err.toString(),
        workerPoolId: workerPool.workerPoolId,
        providerId: this.providerId,
        workerId: worker.workerId,
        document,
      });
      throw error();
    }

    // verify the subject of the signing certificate
    const signerCommonName = crt.subject.getField({ name: 'commonName' });
    if (!(signerCommonName &&
          (signerCommonName.value === 'metadata.azure.com' ||
           signerCommonName.value.endsWith('.metadata.azure.com')))) {
      this.monitor.log.registrationErrorWarning({
        message: 'Wrong PKCS#7 message signature subject',
        error: `Expected "/CN=metadata.azure.com", got "${dnToString(crt.subject)}"`,
        workerPoolId: workerPool.workerPoolId,
        providerId: this.providerId,
        workerId: worker.workerId,
        document,
      });
      throw error();
    }

    // download the intermediate certificate if needed
    let issuer = this.caStore.getIssuer(crt);
    if (issuer === null) {
      const authorityAccessInfo = getAuthorityAccessInfo(crt);
      let method, location;
      for (let i = 0; i < authorityAccessInfo.length; i++) {
        method = authorityAccessInfo[i].method;
        location = authorityAccessInfo[i].location;
        if (method === 'CA Issuer' && location.startsWith('http:')) {
          let raw_data = null;
          try {
            raw_data = await this.downloadBinaryResponse(location);
          } catch (err) {
            this.monitor.log.registrationErrorWarning({
              message: 'Error downloading intermediate certificate',
              error: `${err.toString()}; location=${location}`,
              workerPoolId: workerPool.workerPoolId,
              providerId: this.providerId,
              workerId: worker.workerId,
              document,
            });
            // Continue, there may be a further CA Issuer that works
          }
          if (raw_data) {
            try {
              const certAsn1 = forge.asn1.fromDer(forge.util.createBuffer(raw_data));
              issuer = forge.pki.certificateFromAsn1(certAsn1);
            } catch (err) {
              // Could be an issue with external server, or unexpected content
              // RFC 5280, section 4.2.2.1 says it may be a "certs-only" CMS message
              this.monitor.log.registrationErrorWarning({
                message: 'Error reading intermediate certificate',
                error: `${err.toString()}; location=${location}`,
                workerPoolId: workerPool.workerPoolId,
                providerId: this.providerId,
                workerId: worker.workerId,
                document,
              });
              // Continue, there may be a later CA Issuer that works
            }

            if (issuer) {
              break;
            }
          }
        }
      }

      if (issuer) {
        try {
          this.addIntermediateCert(issuer);
        } catch (err) {
          this.monitor.log.registrationErrorWarning({
            message: 'Error verifying new intermediate certificate',
            error: err.message,
            workerPoolId: workerPool.workerPoolId,
            providerId: this.providerId,
            workerId: worker.workerId,
            document,
          });
          throw error();
        }
        this.monitor.log.registrationNewIntermediateCertificate({
          subject: dnToString(issuer.subject),
          issuer: dnToString(issuer.issuer),
          fingerprint: getCertFingerprint(issuer),
          url: location,
        });
      } else {
        this.monitor.log.registrationErrorWarning({
          message: 'Unable to download intermediate certificate',
          error: `Certificate "${dnToString(crt.issuer)}";` +
                 ` AuthorityAccessInfo ${JSON.stringify(authorityAccessInfo)}`,
          workerPoolId: workerPool.workerPoolId,
          providerId: this.providerId,
          workerId: worker.workerId,
          document,
        });
        throw error();
      }
    }

    // verify that the embedded certificates have proper chain of trust
    try {
      // Verification can mutate store certificates when Azure uses
      // multiple certificates with the same hash but different issuer chains
      // (direct-signed vs cross-signed), potentially causing future request failures
      // https://github.com/digitalbazaar/forge/issues/1003
      // https://github.com/taskcluster/taskcluster/issues/7685
      forge.pki.verifyCertificateChain(
        cloneCaStore(this.caStore),
        [crt],
      );
    } catch (err) {
      this.monitor.log.registrationErrorWarning({
        message: 'Error verifying certificate chain',
        error: err.message,
        workerPoolId: workerPool.workerPoolId,
        providerId: this.providerId,
        workerId: worker.workerId,
        document,
      });
      throw error();
    }

    let payload;
    try {
      payload = JSON.parse(content);
    } catch (err) {
      this.monitor.log.registrationErrorWarning({
        message: 'Payload was not valid JSON',
        error: err.toString(),
        workerPoolId: workerPool.workerPoolId,
        providerId: this.providerId,
        workerId: worker.workerId,
        document,
      });
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
        workerPoolId: workerPool.workerPoolId,
        providerId: this.providerId,
        workerId: worker.workerId,
        vmId: payload.vmId,
        expectedVmId: workerVmId,
        document,
      });
      throw error();
    }

    // verify that the message is not expired
    try {
      assert(new Date(payload.timeStamp.expiresOn) > this._now());
    } catch (err) {
      this.monitor.log.registrationErrorWarning({
        message: 'Expired message',
        error: err.toString(),
        workerPoolId: workerPool.workerPoolId,
        providerId: this.providerId,
        workerId: worker.workerId,
        expires: payload.timeStamp.expiresOn,
      });
      throw error();
    }

    if (worker.state !== Worker.states.REQUESTED) {
      this.monitor.log.registrationErrorWarning({
        message: 'Worker was already running.',
        error: 'Worker was already running.',
        workerPoolId: workerPool.workerPoolId,
        providerId: this.providerId,
        workerId: worker.workerId,
        workerState: worker.state,
      });
      throw error();
    }

    let expires = taskcluster.fromNow('96 hours');
    if (worker.providerData.reregistrationTimeout) {
      expires = new Date(Date.now() + worker.providerData.reregistrationTimeout);
    }

    monitor.debug('setting state to RUNNING if currently REQUESTED');
    await worker.update(this.db, worker => {
      worker.lastModified = new Date();
      if (worker.state === Worker.states.REQUESTED) {
        worker.state = Worker.states.RUNNING;
      }
      worker.providerData.terminateAfter = expires.getTime();
    });
    await this.onWorkerRunning({ worker });

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
   *
   * @param {{ monitor: any, errors: Record<string, any>, worker: Worker, op: string }} opts
   */
  async handleOperation({ op, errors, monitor, worker }) {
    monitor.debug({ message: 'handling operation', op });
    let req, resp;
    try {
      // NB: we don't respect azure's Retry-After header, we assume our iteration
      // will wait long enough, and we keep trying
      // see here: https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/async-operations
      req = new azureApi.msRestJS.WebResource(op, 'GET');
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
          launchConfigId: worker?.launchConfigId ?? undefined,
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
            worker,
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
        worker.providerData[resourceType].operation = resourceRequest.getOperationState()?.config?.operationLocation;
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
    // early-out if we've already completed this whole process
    if (worker.providerData.provisioningComplete) {
      return;
    }

    let titleString = "";

    // #4987: workers do not need Public IP unless explicitly requested #7257
    // so we can skip creating those resources
    const skipPublicIp = worker.providerData.skipPublicIp === true;
    if (skipPublicIp) {
      monitor.debug({
        message: 'skipping public IP',
        workerId: worker.workerId,
      });
    }

    try {
      // IP
      let ipConfig = {
        location: worker.providerData.location,
        publicIPAllocationMethod: 'Static',
        sku: { name: 'Standard' },
      };

      titleString = "IP Creation Error";

      if (!skipPublicIp) {
        worker = await this.provisionResource({
          worker,
          client: this.networkClient.publicIPAddresses,
          resourceType: 'ip',
          resourceConfig: ipConfig,
          modifyFn: () => {},
          monitor,
        });

        if (!worker.providerData.ip.id) {
          return;
        }
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
            ...(skipPublicIp ? {} : {
              publicIPAddress: { id: worker.providerData.ip.id },
            }),
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

      titleString = "NIC Creation Error";

      worker = await this.provisionResource({
        worker,
        client: this.networkClient.networkInterfaces,
        resourceType: 'nic',
        resourceConfig: nicConfig,
        modifyFn: nicModifyFunc,
        monitor,
      });

      if (!worker.providerData.nic.id) {
        return;
      }

      // VM
      titleString = "VM Creation Error";

      worker = await this.provisionResource({
        worker,
        client: this.computeClient.virtualMachines,
        resourceType: 'vm',
        resourceConfig: workerConfigWithSecrets(worker.providerData.vm.config),
        modifyFn: () => {},
        monitor,
      });
      if (!worker.providerData.vm.id) {
        return;
      }

      // Here, the worker is full provisioned, but we do not mark it RUNNING until
      // it calls registerWorker.
      await worker.update(this.db, worker => {
        worker.providerData.provisioningComplete = true;
      });
      return;
    } catch (err) {
      const workerPool = await WorkerPool.get(this.db, worker.workerPoolId);
      // we create multiple resources in order to provision a VM
      // if we catch an error we want to deprovision those resources

      if (workerPool) {
        await this.reportError({
          workerPool,
          kind: 'creation-error',
          title: titleString,
          description: err.message,
          extra: {
            workerId: worker.workerId,
            workerGroup: worker.workerGroup,
            config: worker.providerData,
          },
          launchConfigId: worker.launchConfigId,
        });
      }
      await this.removeWorker({ worker, reason: titleString + `: ${err.message}` });
    }
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

  /** @param {{ worker: Worker }} opts */
  async checkWorker({ worker }) {
    const monitor = this.workerMonitor({
      worker,
      extra: {
        resourceGroupName: worker.providerData.resourceGroupName,
        vmName: worker.providerData.vm.name,
      } });

    const states = Worker.states;
    this.seen[worker.workerPoolId] = this.seen[worker.workerPoolId] || 0;
    this.errors[worker.workerPoolId] = this.errors[worker.workerPoolId] || [];

    // always update when the worker was last checked
    await worker.update(this.db, worker => {
      worker.lastChecked = new Date();
    });

    if (worker.state === states.STOPPING) {
      if (worker.providerData.deploymentMethod === DEPLOYMENT_METHOD_ARM) {
        const deploymentSettled = await this.#checkARMDeployment({ worker, monitor });
        if (!deploymentSettled) {
          monitor.debug({ message: 'delaying teardown while ARM deployment is still settling' });
          return;
        }
      }
      await this.deprovisionResources({ worker, monitor });
      return;
    }

    const isARMTemplate = worker.providerData.deploymentMethod === DEPLOYMENT_METHOD_ARM;
    if (isARMTemplate) {
      // Handle ARM deployment creation and checking (before querying instance)
      const deploymentComplete = await this.#checkARMDeployment({ worker, monitor });
      if (!deploymentComplete) {
        return;
      }
    }

    const { instanceState, instanceStateReason } = await this.queryInstance({ worker, monitor });

    switch (instanceState) {
      case InstanceStates.OK: {
        // count this worker as having been seen for later logging
        this.seen[worker.workerPoolId] += worker.capacity || 1;

        // If the worker has not checked in recently enough, we consider it failed regardless of the Azure lifecycle
        if (worker.providerData.terminateAfter && worker.providerData.terminateAfter < Date.now()) {
          // it is possible that scanner loop was taking longer and worker was already updated since last fetch
          // so we need to check if terminateAfter is still in the past
          await worker.reload(this.db);
          if (worker.providerData.terminateAfter < Date.now()) {
            const reason = 'terminateAfter time exceeded';
            await this.removeWorker({ worker, reason });
            return;
          }
        }

        const { isZombie, reason } = Provider.isZombie({ worker });
        if (isZombie) {
          await this.removeWorker({ worker, reason });
          return;
        }

        // Call provisionResources to allow it to finish up gathering data about the
        // vm. This becomes a no-op once all required operations are complete.
        await this.provisionResources({ worker, monitor });
        break;
      }

      case InstanceStates.FAILED: {
        // On failure, call `removeWorker`, which logs and marks the worker as STOPPING
        await this.removeWorker({ worker, reason: instanceStateReason });
        break;
      }

      case InstanceStates.MISSING: {
        // VM has not been found, so it is either...
        if (worker.state === states.REQUESTED && !worker.providerData.provisioningComplete) {
          // ...still being created, in which case we should continue to provision...
          await this.provisionResources({ worker, monitor });
        } else {
          // ...or RUNNING and has been deleted outside our control, in which
          // case we should recognize it as removed and start the
          // deprovisioning process on the next iteration. STOPPED workers are
          // not checked, and STOPPING workers are handled above.
          await this.removeWorker({ worker, reason: instanceStateReason });
        }
        break;
      }

      default: {
        throw new Error(`invalid instanceState ${instanceState}: ${instanceStateReason}`);
      }
    }
  }

  /**
   * Query Azure for this vm.
   *
   * Returns { instanceState, instanceStateReason }, where instanceState is one of
   *  - missing -- Azure returned a 404 on requesting the instance
   *  - failed -- instance exists, but is in one of the failPowerStates, or a failed provisioning power state
   *  - ok -- instance exists and is in a success state
   *
   * See https://docs.microsoft.com/en-us/azure/virtual-machines/states-lifecycle
   * for background on the VM lifecycle.
   */
  async queryInstance({ worker, monitor }) {
    const states = Worker.states;
    try {
      // lets us get power states for the VM
      const instanceView = await this._enqueue('get', () => this.computeClient.virtualMachines.instanceView(
        worker.providerData.resourceGroupName,
        worker.providerData.vm.name,
      ));
      const powerStates = instanceView.statuses.map(i => i.code);
      monitor.debug({ message: 'fetched instance view', powerStates });

      if (_.some(powerStates, state => failPowerStates.has(state))) {
        // A VM can transition to one of failPowerStates through an Azure issue of some sort, by being
        // manually terminated (e.g., in the web UI), or by being halted from within the VM.  In this
        // case, we consider the worker failed.
        return {
          instanceState: InstanceStates.FAILED,
          instanceStateReason: `failed power state; powerStates=${powerStates.join(', ')}`,
        };
      }

      if (worker.state === states.REQUESTED) {
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
          return {
            instanceState: InstanceStates.FAILED,
            instanceStateReason: `failed provisioning power state; powerStates=${powerStates.join(', ')}`,
          };
        }
      }

      return { instanceState: InstanceStates.OK, instanceStateReason: 'instance exists and has not failed' };
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err;
      }
      monitor.debug({ message: `vm instance view not found, in state ${worker.state}` });
      return { instanceState: InstanceStates.MISSING, instanceStateReason: `vm not found in state ${worker.state}` };
    }
  }

  /*
   * Called after an iteration of the worker scanner
   */
  async scanCleanup() {
    this.monitor.log.scanSeen({
      providerId: this.providerId,
      seen: this.seen,
      total: Provider.calcSeenTotal(this.seen),
    });

    this.cloudApi?.logAndResetMetrics();

    await Promise.all(Object.entries(this.errors).filter(([workerPoolId, errors]) => errors.length > 0).map(
      async ([workerPoolId, errors]) => {
        const workerPool = await WorkerPool.get(this.db, workerPoolId);

        if (!workerPool) {
          return; // In this case, the workertype has been deleted so we can just move on
        }

        await Promise.all(errors.map(error => this.reportError({ workerPool, ...error })));
        this.monitor.metric.scanErrors(errors.length, {
          providerId: this.providerId,
          workerPoolId,
        });
      }),
    );

    Object.entries(this.seen).forEach(([workerPoolId, seen]) =>
      this.monitor.metric.scanSeen(seen, {
        providerId: this.providerId,
        workerPoolId,
      }));
  }

  /**
   * This is called at the end of the provision loop
   */
  async cleanup() {
    this.cloudApi?.logAndResetMetrics();
  }

  /*
   * deprovisionResource attempts to delete a resource and verify deletion
   * if the resource has been verified deleted
   *   * sets providerData[resourceType].deleted = true, signalling it has been deleted
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

    if (typeData?.deleted === true) {
      // if resource was already deleted we don't have to query api by name again to make sure it is 404
      // and avoid being queried multiple times during deprovision cycles
      debug(`resource ${typeData.name} already deleted`);
      return true;
    }

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
          debug(`resource ${typeData.name} not found; removing its id and marking as deleted`);
          await worker.update(this.db, worker => {
            if (index !== undefined) {
              worker.providerData[resourceType][index].operation = undefined;
              worker.providerData[resourceType][index].id = false;
              worker.providerData[resourceType][index].deleted = true;
            } else {
              worker.providerData[resourceType].operation = undefined;
              worker.providerData[resourceType].id = false;
              worker.providerData[resourceType].deleted = true;
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
      let deleteRequest;
      try {
        deleteRequest = await this._enqueue('query', () => client.beginDelete(
          worker.providerData.resourceGroupName,
          typeData.name,
        ));
      } catch (err) {
        if (err.statusCode === 409 &&
            /previous deployment.*still active/i.test(err.message ?? '')) {
          debug('deployment still active; will retry deletion later');
          return false;
        }
        throw err;
      }
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
        let pollState = deleteRequest.getOperationState();
        if (pollState?.config?.operationLocation) {
          resource.operation = pollState?.config?.operationLocation;
        }
      });
    }
    return false;
  }

  /*
   * removeWorker marks a worker for deletion and begins removal.
   */
  async removeWorker({ worker, reason }) {
    await this.onWorkerRemoved({ worker, reason });

    // transition from either REQUESTED or RUNNING to STOPPING, and let the
    // worker scanner take it from there.
    await worker.update(this.db, w => {
      const now = new Date();
      if ([Worker.states.REQUESTED, Worker.states.RUNNING].includes(w.state)) {
        w.lastModified = now;
        w.state = Worker.states.STOPPING;
      }
      // additionally store removal reason
      w.providerData.reasonRemoved = reason;
    });
  }

  /*
   * deprovisionResources removes resources corresponding to a VM,
   * while the worker is in the STOPPING state.  Like provisionResources,
   * it is called repeatedly in the worker-scanner until it is complete.
   *
   * For faster resource deletions, resources should ideally cascade with `deleteOption: 'Delete'`
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

      // If this was an ARM deployment, delete the deployment if it still exists at this point
      // it might be deleted after successful deployment by us
      if (worker.providerData.deploymentMethod === DEPLOYMENT_METHOD_ARM && worker.providerData.deployment?.name) {
        if (!worker.providerData.keepDeployment) {
          let deploymentDeleted = await this.deprovisionResource({
            worker,
            client: this.deploymentsClient.deployments,
            resourceType: 'deployment',
            monitor,
          });
          if (!deploymentDeleted || worker.providerData.deployment.id) {
            return;
          }
        } else {
          monitor.debug({ message: 'skipping deployment deletion due to keepDeployment flag' });
        }
      }

      // change to stopped
      monitor.debug(`setting state to STOPPED`);
      await worker.update(this.db, worker => {
        const now = new Date();
        worker.lastModified = now;
        worker.lastChecked = now;
        worker.state = Worker.states.STOPPED;
      });
      await this.onWorkerStopped({ worker });
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
