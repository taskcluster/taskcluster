package main

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v116/workers/generic-worker/gwconfig"
)

// testConfig builds a PublicConfig with all three port-using features
// enabled, so AllocatePorts populates every slot.
func testConfig(liveLog, interactive, proxy uint16, capacity uint8) *gwconfig.PublicConfig {
	return &gwconfig.PublicConfig{
		Capacity:               capacity,
		EnableLiveLog:          true,
		EnableInteractive:      true,
		EnableTaskclusterProxy: true,
		LiveLogPortBase:        liveLog,
		InteractivePort:        interactive,
		TaskclusterProxyPort:   proxy,
	}
}

func TestPortManagerAllocatePorts(t *testing.T) {
	pm := NewPortManager(testConfig(60000, 53000, 8080, 3))

	// Allocate ports for first task
	ports1, err := pm.AllocatePorts("task1", 0)
	require.NoError(t, err)
	require.Len(t, ports1, gwconfig.PortsPerTask)
	require.Equal(t, uint16(60000), ports1[PortIndexLiveLogPUT])
	require.Equal(t, uint16(60001), ports1[PortIndexLiveLogGET])
	require.Equal(t, uint16(53000), ports1[PortIndexInteractive])
	require.Equal(t, uint16(8080), ports1[PortIndexTaskclusterProxy])

	// Allocate ports for second task
	ports2, err := pm.AllocatePorts("task2", 0)
	require.NoError(t, err)
	require.Len(t, ports2, gwconfig.PortsPerTask)
	// Ports should be offset by gwconfig.PortsPerTask (4)
	require.Equal(t, uint16(60004), ports2[PortIndexLiveLogPUT])
	require.Equal(t, uint16(60005), ports2[PortIndexLiveLogGET])
	require.Equal(t, uint16(53004), ports2[PortIndexInteractive])
	require.Equal(t, uint16(8084), ports2[PortIndexTaskclusterProxy])

	// Allocate ports for third task
	ports3, err := pm.AllocatePorts("task3", 0)
	require.NoError(t, err)
	require.Len(t, ports3, gwconfig.PortsPerTask)

	// Fourth task should fail (capacity exhausted)
	_, err = pm.AllocatePorts("task4", 0)
	require.Error(t, err)
	require.Contains(t, err.Error(), "no available port slots")
}

func TestPortManagerReleasePorts(t *testing.T) {
	pm := NewPortManager(testConfig(60000, 53000, 8080, 2))

	// Allocate all capacity
	_, err := pm.AllocatePorts("task1", 0)
	require.NoError(t, err)
	_, err = pm.AllocatePorts("task2", 0)
	require.NoError(t, err)

	// Should fail - no capacity
	_, err = pm.AllocatePorts("task3", 0)
	require.Error(t, err)

	// Release one task's ports
	pm.ReleasePorts("task1", 0)

	// Should now succeed
	ports3, err := pm.AllocatePorts("task3", 0)
	require.NoError(t, err)
	// Should reuse slot 0
	require.Equal(t, uint16(60000), ports3[PortIndexLiveLogPUT])
}

func TestPortManagerIdempotentAllocation(t *testing.T) {
	pm := NewPortManager(testConfig(60000, 53000, 8080, 2))

	// First allocation
	ports1, err := pm.AllocatePorts("task1", 0)
	require.NoError(t, err)

	// Second allocation for same task should return same ports
	ports2, err := pm.AllocatePorts("task1", 0)
	require.NoError(t, err)
	require.Equal(t, ports1, ports2)
}

func TestPortManagerSlotReuse(t *testing.T) {
	pm := NewPortManager(testConfig(60000, 53000, 8080, 3))

	// Allocate slots 0, 1, 2
	_, _ = pm.AllocatePorts("task1", 0) // slot 0
	_, _ = pm.AllocatePorts("task2", 0) // slot 1
	_, _ = pm.AllocatePorts("task3", 0) // slot 2

	// Release slot 1
	pm.ReleasePorts("task2", 0)

	// New task should get slot 1
	ports, err := pm.AllocatePorts("task4", 0)
	require.NoError(t, err)
	// Slot 1 means offset of 4 (PortsPerTask)
	require.Equal(t, uint16(60004), ports[PortIndexLiveLogPUT])
}

func TestPortManagerDisabledFeaturesGetZero(t *testing.T) {
	c := &gwconfig.PublicConfig{
		Capacity:             2,
		EnableLiveLog:        false,
		EnableInteractive:    true,
		LiveLogPortBase:      0,
		InteractivePort:      53000,
		TaskclusterProxyPort: 8080,
		// EnableTaskclusterProxy intentionally unset
	}
	pm := NewPortManager(c)
	ports, err := pm.AllocatePorts("task1", 0)
	require.NoError(t, err)
	require.Len(t, ports, gwconfig.PortsPerTask)
	require.Equal(t, uint16(0), ports[PortIndexLiveLogPUT])
	require.Equal(t, uint16(0), ports[PortIndexLiveLogGET])
	require.Equal(t, uint16(53000), ports[PortIndexInteractive])
	require.Equal(t, uint16(0), ports[PortIndexTaskclusterProxy])
}

func TestPortManagerSeparatesRunsOfSameTask(t *testing.T) {
	pm := NewPortManager(testConfig(60000, 53000, 8080, 2))

	ports0, err := pm.AllocatePorts("task1", 0)
	require.NoError(t, err)
	ports1, err := pm.AllocatePorts("task1", 1)
	require.NoError(t, err)
	require.NotEqual(t, ports0, ports1)

	pm.ReleasePorts("task1", 0)

	// Run 1 keeps its slot, so a new task reuses run 0's slot
	ports2, err := pm.AllocatePorts("task2", 0)
	require.NoError(t, err)
	require.Equal(t, ports0, ports2)
	again, err := pm.AllocatePorts("task1", 1)
	require.NoError(t, err)
	require.Equal(t, ports1, again)
}
