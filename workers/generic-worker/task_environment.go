package main

import (
	"log"
	"path/filepath"
	"sync"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v96/workers/generic-worker/runtime"
)

// TaskEnvironment bundles everything needed to execute a task:
// the task directory, the OS user, and the platform data for
// process creation.
type TaskEnvironment struct {
	TaskDir      string
	User         *gwruntime.OSUser
	PlatformData *process.PlatformData
}

// TaskEnvironmentProvisioner creates new task environments.
// Implementations are engine-specific (insecure vs multiuser).
type TaskEnvironmentProvisioner interface {
	// Provision creates a new TaskEnvironment. Returns reboot=true
	// if a system reboot is required (multiuser non-headless only).
	// When reboot is true, env may be nil.
	Provision() (env *TaskEnvironment, reboot bool, err error)
}

// TaskEnvironmentPool manages a pool of pre-provisioned task
// environments. Currently size is always 1, matching existing
// behavior, but the design supports N>1 for future parallel
// task execution.
type TaskEnvironmentPool struct {
	mu          sync.Mutex
	ready       []*TaskEnvironment
	inUse       []*TaskEnvironment
	size        int
	provisioner TaskEnvironmentProvisioner
}

// NewTaskEnvironmentPool creates a new pool with the given
// provisioner and target size.
func NewTaskEnvironmentPool(provisioner TaskEnvironmentProvisioner, size int) *TaskEnvironmentPool {
	return &TaskEnvironmentPool{
		ready:       make([]*TaskEnvironment, 0, size),
		inUse:       make([]*TaskEnvironment, 0, size),
		size:        size,
		provisioner: provisioner,
	}
}

// Initialize provisions the initial set of environments.
// Returns true if a reboot is needed.
func (p *TaskEnvironmentPool) Initialize() (reboot bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for len(p.ready) < p.size {
		env, needsReboot, err := p.provisioner.Provision()
		if err != nil {
			panic(err)
		}
		if needsReboot {
			return true
		}
		p.ready = append(p.ready, env)
	}
	return false
}

// Acquire moves one environment from the ready pool to the
// in-use pool and returns it. Panics if no environment is ready.
func (p *TaskEnvironmentPool) Acquire() *TaskEnvironment {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.ready) == 0 {
		panic("TaskEnvironmentPool.Acquire: no ready environments")
	}
	env := p.ready[0]
	p.ready = p.ready[1:]
	p.inUse = append(p.inUse, env)
	return env
}

// Release moves the given environment from in-use back to
// available, discards it, and provisions a replacement.
// Returns true if a reboot is needed for the replacement.
func (p *TaskEnvironmentPool) Release(env *TaskEnvironment) (reboot bool) {
	p.mu.Lock()
	// Remove from in-use
	for i, e := range p.inUse {
		if e == env {
			p.inUse = append(p.inUse[:i], p.inUse[i+1:]...)
			break
		}
	}
	p.mu.Unlock()

	// Provision replacement outside the lock (may be slow)
	newEnv, needsReboot, err := p.provisioner.Provision()
	if err != nil {
		panic(err)
	}
	if needsReboot {
		return true
	}

	p.mu.Lock()
	p.ready = append(p.ready, newEnv)
	p.mu.Unlock()
	return false
}

// Peek returns a ready environment without consuming it.
// Used for pre-claim validation (garbage collection, binary checks)
// and by test helpers to access the current environment.
// Falls back to in-use environments if none are ready (e.g. after
// RunWorker completes without releasing).
func (p *TaskEnvironmentPool) Peek() *TaskEnvironment {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.ready) > 0 {
		return p.ready[0]
	}
	if len(p.inUse) > 0 {
		return p.inUse[0]
	}
	panic("TaskEnvironmentPool.Peek: no environments")
}

// ActiveTaskDirNames returns the base names of all task directories
// (both ready and in-use). Used by purgeOldTasks to know which
// directories to preserve.
func (p *TaskEnvironmentPool) ActiveTaskDirNames() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	names := make([]string, 0, len(p.ready)+len(p.inUse))
	for _, env := range p.ready {
		names = append(names, filepath.Base(env.TaskDir))
	}
	for _, env := range p.inUse {
		names = append(names, filepath.Base(env.TaskDir))
	}
	return names
}

// ActiveUserNames returns all user names from environments
// (both ready and in-use). Used by deleteExistingOSUsers
// and purgeOldTasks to know which users to preserve.
// Environments with nil User are skipped.
func (p *TaskEnvironmentPool) ActiveUserNames() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	names := make([]string, 0, len(p.ready)+len(p.inUse))
	for _, env := range p.ready {
		if env.User != nil {
			names = append(names, env.User.Name)
		}
	}
	for _, env := range p.inUse {
		if env.User != nil {
			names = append(names, env.User.Name)
		}
	}
	return names
}

// SetForTest replaces the pool's ready slice directly (for test setup).
func (p *TaskEnvironmentPool) SetForTest(envs []*TaskEnvironment) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.ready = envs
	p.inUse = nil
}

// StaticProvisioner is a test-only provisioner that always returns
// the same pre-built environment.
type StaticProvisioner struct {
	Env *TaskEnvironment
}

func (s *StaticProvisioner) Provision() (*TaskEnvironment, bool, error) {
	log.Printf("StaticProvisioner.Provision called (returning pre-built env with TaskDir=%q)", s.Env.TaskDir)
	return s.Env, false, nil
}
