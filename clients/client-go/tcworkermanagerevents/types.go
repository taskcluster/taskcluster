// This source code file is AUTO-GENERATED by github.com/taskcluster/jsonschema2go

package tcworkermanagerevents

import (
	tcclient "github.com/taskcluster/taskcluster/v80/clients/client-go"
)

type (
	// The message that is emitted when workers requested/running/stopped.
	WorkerPulseMessage struct {

		// Number of tasks this worker can handle at once
		//
		// Mininum:    1
		Capacity int64 `json:"capacity"`

		// The provider responsible for managing this worker pool.
		//
		// If this value is `"null-provider"`, then the worker pool is pending deletion
		// once all existing workers have terminated.
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 38
		ProviderID string `json:"providerId"`

		// Date and time when this event occurred
		Timestamp tcclient.Time `json:"timestamp"`

		// Worker group to which this worker belongs
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 38
		WorkerGroup string `json:"workerGroup"`

		// Worker ID
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 38
		WorkerID string `json:"workerId"`

		// The ID of this worker pool (of the form `providerId/workerType` for compatibility)
		//
		// Syntax:     ^[a-zA-Z0-9-_]{1,38}/[a-z]([-a-z0-9]{0,36}[a-z0-9])?$
		WorkerPoolID string `json:"workerPoolId"`
	}

	// The message that is emitted when workers are being removed.
	WorkerRemovedPulseMessage struct {

		// Number of tasks this worker can handle at once
		//
		// Mininum:    1
		Capacity int64 `json:"capacity"`

		// The provider responsible for managing this worker pool.
		//
		// If this value is `"null-provider"`, then the worker pool is pending deletion
		// once all existing workers have terminated.
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 38
		ProviderID string `json:"providerId"`

		// The reason the worker was removed. It can be one of the following:
		//
		// - workerManager.removeWorker API call
		// - terminateAfter time exceeded
		// - operation expired
		// - any other error encountered
		Reason string `json:"reason"`

		// Date and time when this event occurred
		Timestamp tcclient.Time `json:"timestamp"`

		// Worker group to which this worker belongs
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 38
		WorkerGroup string `json:"workerGroup"`

		// Worker ID
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 38
		WorkerID string `json:"workerId"`

		// The ID of this worker pool (of the form `providerId/workerType` for compatibility)
		//
		// Syntax:     ^[a-zA-Z0-9-_]{1,38}/[a-z]([-a-z0-9]{0,36}[a-z0-9])?$
		WorkerPoolID string `json:"workerPoolId"`
	}

	// The message that is emitted when worker pools are created/changed/deleted.
	WorkerTypePulseMessage struct {

		// If this is defined, it was the provider that handled this worker pool in the
		// configuration before the current one. This will be used by providers to clean
		// up any resources created for this workerType when they are no longer responsible
		// for it.
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 38
		PreviousProviderID string `json:"previousProviderId,omitempty"`

		// The provider responsible for managing this worker pool.
		//
		// If this value is `"null-provider"`, then the worker pool is pending deletion
		// once all existing workers have terminated.
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 38
		ProviderID string `json:"providerId"`

		// The ID of this worker pool (of the form `providerId/workerType` for compatibility)
		//
		// Syntax:     ^[a-zA-Z0-9-_]{1,38}/[a-z]([-a-z0-9]{0,36}[a-z0-9])?$
		WorkerPoolID string `json:"workerPoolId"`
	}

	// The message that is emitted when worker pools are created/changed/deleted.
	WorkerTypePulseMessage1 struct {

		// An arbitary unique identifier for this error
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		ErrorID string `json:"errorId"`

		// A general machine-readable way to identify this sort of error.
		//
		// Syntax:     [-a-z0-9]+
		// Max length: 128
		Kind string `json:"kind"`

		// The provider responsible for managing this worker pool.
		//
		// If this value is `"null-provider"`, then the worker pool is pending deletion
		// once all existing workers have terminated.
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 38
		ProviderID string `json:"providerId"`

		// Date and time when this event occurred
		Timestamp tcclient.Time `json:"timestamp"`

		// A human-readable version of `kind`.
		//
		// Max length: 128
		Title string `json:"title"`

		// Worker group to which this worker belongs
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 38
		WorkerGroup string `json:"workerGroup,omitempty"`

		// Worker ID
		//
		// Syntax:     ^([a-zA-Z0-9-_]*)$
		// Min length: 1
		// Max length: 38
		WorkerID string `json:"workerId,omitempty"`

		// The ID of this worker pool (of the form `providerId/workerType` for compatibility)
		//
		// Syntax:     ^[a-zA-Z0-9-_]{1,38}/[a-z]([-a-z0-9]{0,36}[a-z0-9])?$
		WorkerPoolID string `json:"workerPoolId"`
	}
)
