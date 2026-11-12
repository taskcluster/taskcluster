package main

import (
	"fmt"
	"sync"

	"github.com/taskcluster/taskcluster/v116/workers/generic-worker/gwconfig"
)

// Port allocation indices within a task's port block.
// LiveLog convention: base port = PUT, base+1 = GET.
const (
	PortIndexLiveLogPUT       = 0
	PortIndexLiveLogGET       = 1
	PortIndexInteractive      = 2
	PortIndexTaskclusterProxy = 3
)

// PortManager manages dynamic port allocation for concurrent tasks.
// Each task gets a block of ports based on the configured base ports.
type PortManager struct {
	sync.Mutex
	allocated         map[string][]uint16 // taskRunKey -> allocated ports
	slots             map[string]uint8    // taskRunKey -> slot index
	usedSlots         map[uint8]bool      // slot index -> in use
	liveLogBase       uint16
	interactiveBase   uint16
	proxyBase         uint16
	enableLiveLog     bool
	enableInteractive bool
	enableProxy       bool
	capacity          uint8
}

// NewPortManager creates a new PortManager.
// The base ports and enable* flags must match the worker config; ports
// for disabled features are returned as 0 to match the validator's
// behavior (which also skips overlap checks for disabled features).
func NewPortManager(c *gwconfig.PublicConfig) *PortManager {
	return &PortManager{
		allocated:         make(map[string][]uint16),
		slots:             make(map[string]uint8),
		usedSlots:         make(map[uint8]bool),
		liveLogBase:       c.LiveLogPortBase,
		interactiveBase:   c.InteractivePort,
		proxyBase:         c.TaskclusterProxyPort,
		enableLiveLog:     c.EnableLiveLog,
		enableInteractive: c.EnableInteractive,
		enableProxy:       c.EnableTaskclusterProxy,
		capacity:          c.Capacity,
	}
}

// AllocatePorts allocates a block of ports for a task run.
// Returns the allocated ports or an error if no slots are available.
// Disabled features get 0 in their slot — callers should consult the
// corresponding Enable* config flag before using a port.
func (pm *PortManager) AllocatePorts(taskID string, runID uint) ([]uint16, error) {
	key := taskRunKey(taskID, runID)
	pm.Lock()
	defer pm.Unlock()

	// Check if already allocated
	if ports, exists := pm.allocated[key]; exists {
		return ports, nil
	}

	// Find an available slot
	slot, ok := pm.findAvailableSlot()
	if !ok {
		return nil, fmt.Errorf("no available port slots (capacity=%d, allocated=%d)", pm.capacity, len(pm.allocated))
	}

	offset := uint16(slot) * uint16(gwconfig.PortsPerTask)
	ports := make([]uint16, gwconfig.PortsPerTask)
	if pm.enableLiveLog {
		ports[PortIndexLiveLogPUT] = pm.liveLogBase + offset
		ports[PortIndexLiveLogGET] = pm.liveLogBase + offset + 1
	}
	if pm.enableInteractive {
		ports[PortIndexInteractive] = pm.interactiveBase + offset
	}
	if pm.enableProxy {
		ports[PortIndexTaskclusterProxy] = pm.proxyBase + offset
	}

	pm.allocated[key] = ports
	pm.slots[key] = slot
	pm.usedSlots[slot] = true
	return ports, nil
}

// ReleasePorts releases the ports allocated to a task run.
func (pm *PortManager) ReleasePorts(taskID string, runID uint) {
	key := taskRunKey(taskID, runID)
	pm.Lock()
	defer pm.Unlock()
	if slot, exists := pm.slots[key]; exists {
		delete(pm.usedSlots, slot)
	}
	delete(pm.allocated, key)
	delete(pm.slots, key)
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
