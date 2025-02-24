interface WorkerManagerConfig {
  launchConfigId?: string;
  capacityPerInstance?: number;
  initialWeight?: number;
  maxCapacity?: number;
}

interface WorkerLifecycle {
  registrationTimeout?: number;
  reregistrationTimeout?: number;
  queueInactivityTimeout?: number;
}

interface BaseProviderConfig {
  minCapacity: number;
  maxCapacity: number;
  scalingRatio?: number;
  lifecycle: WorkerLifecycle;
}

interface BaseLaunchConfig {
  workerConfig: Record<string, any>;
  // @deprecated
  capacityPerInstance?: number;
}

export interface AWSLaunchConfig extends BaseLaunchConfig {
  workerManager: WorkerManagerConfig;
  region: string;
  launchConfig: {
    ImageId: string;
    [key: string]: any; // Additional AWS launch properties excluding IamInstanceProfile, UserData, MinCount, MaxCount
  };
  additionalUserData?: {
    [key: string]: any; // Cannot contain rootUrl, workerPoolId, providerId, workerGroup, or workerConfig
  };
}

export interface AWSConfigSchema extends BaseProviderConfig {
  launchConfigs: AWSLaunchConfig[];
}

export interface AzureLaunchConfig extends BaseLaunchConfig {
  workerManager?: WorkerManagerConfig & {
    publicIp?: boolean;
    ignoreFailedProvisioningStates?: string[];
  };
  ignoreFailedProvisioningStates?: string[];
  location: string;
  subnetId: string;
  priority?: string;
  billingProfile?: {
    maxPrice?: number;
    [key: string]: any;
  };
  hardwareProfile: {
    vmSize: string;
    [key: string]: any;
  };
  osProfile?: {
    [key: string]: any; // adminPassword, computerName, and customData are set by provider
  };
  storageProfile: {
    osDisk?: {
      createOption?: string;
      [key: string]: any;
    };
    dataDisks?: Array<{
      [key: string]: any;
    }>;
    imageReference?: {
      id?: string;
      [key: string]: any;
    };
  };
  networkProfile: {
    networkInterfaces: Array<{
      id?: string;
      primary?: boolean;
      [key: string]: any;
    }>;
    [key: string]: any;
  };
  [key: string]: any; // additional properties allowed
}

export interface AzureConfigSchema extends BaseProviderConfig {
  launchConfigs: AzureLaunchConfig[];
}

export interface GoogleLaunchConfig extends BaseLaunchConfig {
  workerManager?: WorkerManagerConfig;
  region: string;
  zone: string;
  machineType: string;
  disks: Array<{
    [key: string]: any;
  }>;
  networkInterfaces: Array<{
    [key: string]: any;
  }>;
  scheduling: {
    [key: string]: any; // automaticRestart is hardcoded by worker manager
  };
  [key: string]: any; // Additional GCP instance creation properties (excluding instanceName and serviceAccounts)
}

export interface GoogleConfigSchema extends BaseProviderConfig {
  launchConfigs: GoogleLaunchConfig[];
}

export type CloudLaunchConfig =
  | AWSLaunchConfig
  | GoogleLaunchConfig
  | AzureLaunchConfig

export type WorkerPoolConfig =
  | AWSConfigSchema
  | AzureConfigSchema
  | GoogleConfigSchema
