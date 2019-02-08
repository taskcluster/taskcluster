#!/bin/bash -exv
go test -v -run TestNoWorkerTypeUserDataGenericWorkerProperty
go test -v -run TestNoPublicConfig
go test -v -run TestNoWorkerTypeSecret
go test -v -run TestSecretServiceError
go test -v -run TestPrivateConfigInUserData
go test -v -run TestPublicConfigInWorkerTypeSecret
go test -v -run TestAdditionalPropertyUnderWorkerTypeDefinitionUserDataGenericWorkerProperty
go test -v -run TestInvalidWorkerTypeDefinitionFiles
go test -v -run TestAdditionalFieldInWorkerTypeSecret
go test -v -run TestWorkerShutdown
go test -v -run TestNoShutdown
go test -v -run TestAWSWorkerTypeMetadata
go test -v -run TestFileExtraction
go test -v -run TestDeploymentIDUpdated
go test -v -run TestDeploymentIDNotUpdated
