package provider

import (
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/provider/awsprovisioner"
)

func NewAwsProvisioner(cfg *cfg.RunnerConfig) (Provider, error) {
	return awsprovisioner.New(cfg, nil, nil)
}

func AwsProvisionerUsage() string {
	return `
The providerType "aws-provisioner" is intended for workers provisioned with
the legacy aws-provisioner application.  It requires 

	provider:
	    providerType: aws-provisioner
`
}
