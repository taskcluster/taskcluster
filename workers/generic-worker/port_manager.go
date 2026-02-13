package main

import (
	"fmt"
	"sync"

	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/gwconfig"
)

// Port allocation indices within a task's port block
const (
	PortIndexLiveLogGET       = 0
	PortIndexLiveLogPUT       = 1
	PortIndexInteractive      = 2
	PortIndexTaskclusterProxy = 3
)

// PortManager manages dynamic port allocation for concurrent tasks.
// Each task gets a block of ports based on the configured base ports.
type PortManager struct {
	sync.Mutex
	allocated       map[string][]uint16 // taskID -> allocated ports
	slots           map[string]uint8    // taskID -> slot index
	usedSlots       map[uint8]bool      // slot index -> in use
	liveLogBase     uint16
	interactiveBase uint16
	proxyBase       uint16
	capacity        uint8
}

// NewPortManager creates a new PortManager.
// basePort is used to calculate dynamic ports for each task slot.
func NewPortManager(liveLogBase, interactiveBase, proxyBase uint16, capacity uint8) *PortManager {
	return &PortManager{
		allocated:       make(map[string][]uint16),
		slots:           make(map[string]uint8),
		usedSlots:       make(map[uint8]bool),
		liveLogBase:     liveLogBase,
		interactiveBase: interactiveBase,
		proxyBase:       proxyBase,
		capacity:        capacity,
	}
}

// AllocatePorts allocates a block of ports for a task.
// Returns the allocated ports or an error if no slots are available.
func (pm *PortManager) AllocatePorts(taskID string) ([]uint16, error) {
	pm.Lock()
	defer pm.Unlock()

	// Check if already allocated
	if ports, exists := pm.allocated[taskID]; exists {
		return ports, nil
	}

	// Find an available slot
	slot, ok := pm.findAvailableSlot()
	if !ok {
		return nil, fmt.Errorf("no available port slots (capacity=%d, allocated=%d)", pm.capacity, len(pm.allocated))
	}

	// Calculate ports for this slot
	offset := uint16(slot) * uint16(gwconfig.PortsPerTask)
	ports := []uint16{
		pm.liveLogBase + offset,     // LiveLog GET
		pm.liveLogBase + offset + 1, // LiveLog PUT
		pm.interactiveBase + offset, // Interactive
		pm.proxyBase + offset,       // TaskclusterProxy
	}

	pm.allocated[taskID] = ports
	pm.slots[taskID] = slot
	pm.usedSlots[slot] = true
	return ports, nil
}

// ReleasePorts releases the ports allocated to a task.
func (pm *PortManager) ReleasePorts(taskID string) {
	pm.Lock()
	defer pm.Unlock()
	if slot, exists := pm.slots[taskID]; exists {
		delete(pm.usedSlots, slot)
	}
	delete(pm.allocated, taskID)
	delete(pm.slots, taskID)
}

// GetPorts returns the ports allocated to a task, or nil if not allocated.
func (pm *PortManager) GetPorts(taskID string) []uint16 {
	pm.Lock()
	defer pm.Unlock()
	return pm.allocated[taskID]
}

// LiveLogPorts returns the LiveLog GET and PUT ports for a task.
func (pm *PortManager) LiveLogPorts(taskID string) (getPort, putPort uint16, ok bool) {
	pm.Lock()
	defer pm.Unlock()
	ports, exists := pm.allocated[taskID]
	if !exists || len(ports) < 2 {
		return 0, 0, false
	}
	return ports[PortIndexLiveLogGET], ports[PortIndexLiveLogPUT], true
}

// InteractivePort returns the Interactive port for a task.
func (pm *PortManager) InteractivePort(taskID string) (uint16, bool) {
	pm.Lock()
	defer pm.Unlock()
	ports, exists := pm.allocated[taskID]
	if !exists || len(ports) <= PortIndexInteractive {
		return 0, false
	}
	return ports[PortIndexInteractive], true
}

// TaskclusterProxyPort returns the TaskclusterProxy port for a task.
func (pm *PortManager) TaskclusterProxyPort(taskID string) (uint16, bool) {
	pm.Lock()
	defer pm.Unlock()
	ports, exists := pm.allocated[taskID]
	if !exists || len(ports) <= PortIndexTaskclusterProxy {
		return 0, false
	}
	return ports[PortIndexTaskclusterProxy], true
}

// findAvailableSlot returns the first available slot index.
// Must be called with the lock held.
func (pm *PortManager) findAvailableSlot() (uint8, bool) {
	for i := uint8(0); i < pm.capacity; i++ {
		if !pm.usedSlots[i] {
			return i, true
		}
	}
	return 0, false
}
