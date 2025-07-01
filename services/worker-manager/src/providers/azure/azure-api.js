import { ClientSecretCredential } from '@azure/identity';
import { ComputeManagementClient } from '@azure/arm-compute';
import { NetworkManagementClient } from '@azure/arm-network';
import * as msRestJS from '@azure/ms-rest-js';
import { AzureServiceClient } from '@azure/ms-rest-azure-js';

const azureApi = {
  ClientSecretCredential,
  ComputeManagementClient,
  NetworkManagementClient,
  msRestJS,
  AzureServiceClient,
};

export default azureApi;
