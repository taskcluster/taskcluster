import { ClientSecretCredential } from '@azure/identity';
import { ComputeManagementClient, getContinuationToken as getComputeContinuationToken } from '@azure/arm-compute';
import { NetworkManagementClient } from '@azure/arm-network';
import { ResourceManagementClient, getContinuationToken as getResourcesContinuationToken } from '@azure/arm-resources';
import { DeploymentsClient } from '@azure/arm-resourcesdeployments';
import * as msRestJS from '@azure/ms-rest-js';
import { AzureServiceClient } from '@azure/ms-rest-azure-js';

const azureApi = {
  ClientSecretCredential,
  ComputeManagementClient,
  NetworkManagementClient,
  ResourceManagementClient,
  DeploymentsClient,
  // the compute and resources SDKs keep page tokens out of reach, unlike the network SDK
  getComputeContinuationToken,
  getResourcesContinuationToken,
  msRestJS,
  AzureServiceClient,
};

export default azureApi;
