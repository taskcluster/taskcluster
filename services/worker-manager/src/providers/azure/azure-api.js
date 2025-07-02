import { ClientSecretCredential } from '@azure/identity';
import { ComputeManagementClient } from '@azure/arm-compute';
import { NetworkManagementClient } from '@azure/arm-network';

const azureApi = {
  ClientSecretCredential,
  ComputeManagementClient,
  NetworkManagementClient,
};

export default azureApi;
