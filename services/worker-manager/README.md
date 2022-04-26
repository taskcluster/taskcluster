# Worker Manager Service

The worker manager service manages workers, including interacting with cloud services to create new workers on demand.

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-worker-manager test` to run the tests.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-worker-manager)`, then run the tests again.

## Implementing Providers

See [docs/providers.md](docs/providers.md) for details on implementing providers.

## Testing

Azure tests rely on valid `test/fixtures/azure_signature_good` file that can be obtained by running a VM inside Azure cloud to fetch [attested metadata](https://docs.microsoft.com/en-us/azure/virtual-machines/windows/instance-metadata-service?tabs=linux#attested-data):

```sh
curl -H Metadata:true --noproxy "*" "http://169.254.169.254/metadata/attested/document?api-version=2021-05-01" | jq -r .signature
```

Note: new signature might be signed by one of the two intermediate certificates (`azure/azure-ca-certs/microsoft_rsa_tls_ca_[12].pem`). This is important for `test/provider_azure_test.js` as it relies on the intermediate cert to do proper tests.

<details>
<summary>Steps to find out which intermediate certificate is used</summary>
To find out which intermediate cert is used:

```sh
# Decode the signature
base64 -d azure_signature_good > decodedsignature
# Get PKCS7 format
openssl pkcs7 -in decodedsignature -inform DER -out sign.pk7
# Get Public key out of pkc7
openssl pkcs7 -in decodedsignature -inform DER  -print_certs -out signer.pem
# Get the intermediate certificate
curl -s -o intermediate.cer "$(openssl x509 -in signer.pem -text -noout | grep " CA Issuers -" | awk -FURI: '{print $2}')"
openssl x509 -inform der -in intermediate.cer -out intermediate.pem
# Verify the contents
openssl smime -verify -in sign.pk7 -inform pem -noverify

# Verify the subject name for the main certificate
openssl x509 -noout -subject -in signer.pem
# Verify the issuer for the main certificate
openssl x509 -noout -issuer -in signer.pem

#Validate the subject name for intermediate certificate
openssl x509 -noout -subject -in intermediate.pem
#Validate the fingerprint for intermediate certificate
openssl x509 -noout -fingerprint -in intermediate.pem
# Verify the issuer for the intermediate certificate
openssl x509 -noout -issuer -in intermediate.pem
```

Last three lines would contain the values that should match `intermediateCertFingerprint`, `intermediateCertSubject`, `intermediateCertIssuer`, `intermediateCertPath` variables in `test/provider_azure_test.js`.
</details>

## Worker Manager lifecycle

Worker manager consists of two running processes - provisioner and scanner.

### Worker states

```mermaid
stateDiagram
  [*] --> Requested : Provisioner requests new instance
  Requested --> Running : Provision resources
  Running --> Stopping : Mark for removal
  Requested --> Stopping : Provisioning error
  Stopping --> Stopped : Deprovision resources
  Stopped --> [*]
```

### Worker manager provisioning loop

Provisioner checks all available providers and queue capacity in order to make a decision if new workers are needed for each worker pool.

```mermaid
graph TD;
  initiateProviders[Initiate providers] -.-> prepareProviders

subgraph provision loop
  prepareProviders[Prepare providers] --> queryWorkers

  queryWorkers[(Get all non stopped workers)] --> calcCapacity
  calcCapacity[Calculate existing and requested capacity] --> queryWorkerPools
  queryWorkerPools[(Get all worker pools)] --> poolIterateStart

  subgraph worker pool provision loop
    poolIterateStart[Iterate worker pools] --> takeWorkerPool
    takeWorkerPool[Get next worker pool] --> estimator
    estimator[Estimate number of workers to spawn] --> hasToSpawn{To spawn > 0 ?}
    hasToSpawn -- Yes, Azure --> requestAzure[Request azure: create DB record]
    requestAzure --> checkWorker[(Create worker with config <br>state: Requested)]
    checkWorker --> requestWorker([Start provisioning<br>See Azure checkWorker below])
    hasToSpawn -- Yes, Google --> requestGoogle([Create instance: compute.instances.insert])
    requestGoogle --> createWorker1[(new workers)]
    hasToSpawn -- Yes, AWS --> requestAWS([Create instance: ec2.runInstances])
    requestAWS --> createWorker2[(new workers)]

    hasToSpawn -- No --> takeWorkerPool

    requestWorker --> hasPreviousProviderIds{Provider Id changed ?}
    createWorker1 --> hasPreviousProviderIds{Provider Id changed ?}
    createWorker2 --> hasPreviousProviderIds{Provider Id changed ?}

    hasPreviousProviderIds -- yes --> deprovisionPool[Deprovision worker pool<br> * if provider supports]
    hasPreviousProviderIds -- no --> takeWorkerPool
    deprovisionPool --> poolIterateStop[End iteration]
  end

  poolIterateStop -.-> cleanupProviders[Cleanup providers]
end
```

### Worker manager scanning loop

Scanner iterates through all non-stopped workers to check and update their statuses.

```mermaid
graph TD;
  initiateProviders[Initiate providers] -.-> prepareProviders

subgraph scan loop
  prepareProviders[Prepare providers] --> queryWorkers

  queryWorkers[(Get all non stopped workers)] --> iterateWorkers[Iterate each worker]
  iterateWorkers --> providerSpecificProvisioning[Provider specific checks]

  providerSpecificProvisioning --> updateExpires
end

  updateExpires -.-> cleanupProviders[Cleanup providers]
```

#### Sequence of calls

```mermaid
sequenceDiagram
  participant WMP as W-M Provisioner
  participant DB
  participant Estimator
  participant Queue as Queue Service

  WMP-->>DB: get worker pool capacity
  DB-->>WMP: worker pool A capacity
  WMP-->>Estimator: How many to start for pool A?
  Estimator-->>Queue: Get pending tasks count for pool A?
  Queue-->>Estimator: pendingTasks: 5
  Estimator-->>WMP: Please spawn: 5 more

  WMP-->>DB: Create new worker with config (x5)
```

#### Azure specific checks

```mermaid
graph TD;

  subgraph azureCheckWorker [Azure checkWorker]
    azureCheckStates --> isStopping{state == Stopping ?}
    isStopping -- Yes --> deprovisionResources[Deprovision resources]
    isStopping -- No --> queryInstance([Cloud API: get instance info])

    queryInstance -- VM exists --> checkTerminateAfter{terminateAfter < now ?}
    checkTerminateAfter -- Yes --> removeWorker[(Remove worker)]
    checkTerminateAfter -- No --> provisionResources([Provision resources])

    queryInstance -- VM stopped or failed ? ----> removeWorker

    queryInstance -- VM not found --> isRequestedAndNotProvisioned{Requested but <br>not yet provisioned ?}
    isRequestedAndNotProvisioned -- Yes ----> provisionResources
    isRequestedAndNotProvisioned -- No ----> removeWorker

    subgraph Deprovisioning
      deprovisionResources --> deprovisionVm([Deprovision VM])
      deprovisionVm --> deprovisionNic([Deprovision NIC])
      deprovisionNic --> deprovisionIp([Deprovision IP])
      deprovisionIp --> deprovisionDisks([Deprovision all disks])
      deprovisionDisks --> markStopped[(state = Stopped)]
    end
    markStopped --> azureCheckEnd

    subgraph Provisioning
      provisionResources -- if public IP needed --> provisionIp[/Provision IP async/]
      provisionResources -- if public ip not needed --> provisionNic
      provisionIp -- if ip ready --> provisionNic[/Provision NIC/]
      provisionNic -- if nic ready --> provisionVm[/Provision VM/]
      provisionVm -- success --> provisionComplete[(provisioningComplete = true)]
    end
    provisionVm -- failure --> removeWorker
    provisionVm --> azureCheckEnd

    removeWorker --> azureCheckEnd[end of check]
  end
```

#### Sequence of provisioning

```mermaid
sequenceDiagram
  participant DB
  participant WMS as W-M Scanner
  participant Azure

  loop Loop all workers
    WMS-->>DB: get worker state
    DB-->>WMS: state: 'requested'

    Note over WMS,Azure: Res is one of: <br> IP, NIC, VM

    WMS-->>Azure: Query state of Res
    Azure-->>WMS: Res state

    WMS-->>DB: Update Res ID if changed,<br> remove operation id

    Note over WMS,Azure: Request one per loop

    WMS-->>Azure: provision Res
    Azure-->>WMS: operation ID
    WMS-->>DB: update worker: set Res operation ID
  end
```

#### AWS specific checks

```mermaid
graph TD;
  subgraph awsCheckWorker [AWS checkWorker]
    awsCheck --> describeInstance([Describe Instance])
    describeInstance -- running state --> markSeen[mark seen]
    describeInstance -- stopped state --> markStopped2[(state = Stopped)]
    markSeen --> checkTerminateAfter2{terminateAfter < now ?}
    markStopped2 --> checkTerminateAfter2
    checkTerminateAfter2 -- Yes --> removeWorker2[(Remove worker)]

    describeInstance -- Not found or error --> markStopped2
    describeInstance --> awsUpdateInstance[(state = newstate<br>lastModified = now)]
  end
```

#### GCP specific checks

```mermaid
graph TD;
  subgraph gcpCheckWorker [GCP checkWorker]
    gcpCheck --> getInstanceInfo([Get instance info])
    getInstanceInfo -- running state --> markSeen3[mark seen]
    getInstanceInfo -- stopped state --> markStopped3[(state = Stopped)]
    markSeen3 --> checkTerminateAfter3{terminateAfter < now ?}
    checkTerminateAfter3 -- Yes --> removeWorker3[(Remove worker)]
    getInstanceInfo --> gcpUpdateInstance[(state = newstate<br>lastModified = now)]
  end
```
