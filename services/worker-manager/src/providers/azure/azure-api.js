import { ComputeManagementClient } from '@azure/arm-compute';
import { NetworkManagementClient } from '@azure/arm-network';
import { ResourceManagementClient } from '@azure/arm-resources';
import { DeploymentsClient } from '@azure/arm-resourcesdeployments';
import { ClientSecretCredential } from '@azure/identity';
import { AzureServiceClient } from '@azure/ms-rest-azure-js';
import * as msRestJS from '@azure/ms-rest-js';

const azureApi = {
  ClientSecretCredential,
  ComputeManagementClient,
  NetworkManagementClient,
  ResourceManagementClient,
  DeploymentsClient,
  msRestJS,
  AzureServiceClient,
};

export default azureApi;
