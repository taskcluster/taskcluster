package main

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/gwconfig"
)

func TestPortManagerAllocatePorts(t *testing.T) {
	pm := NewPortManager(60000, 53000, 8080, 3)

	// Allocate ports for first task
	ports1, err := pm.AllocatePorts("task1")
	require.NoError(t, err)
	require.Len(t, ports1, gwconfig.PortsPerTask)
	require.Equal(t, uint16(60000), ports1[PortIndexLiveLogGET])
	require.Equal(t, uint16(60001), ports1[PortIndexLiveLogPUT])
	require.Equal(t, uint16(53000), ports1[PortIndexInteractive])
	require.Equal(t, uint16(8080), ports1[PortIndexTaskclusterProxy])

	// Allocate ports for second task
	ports2, err := pm.AllocatePorts("task2")
	require.NoError(t, err)
	require.Len(t, ports2, gwconfig.PortsPerTask)
	// Ports should be offset by gwconfig.PortsPerTask
	require.Equal(t, uint16(60004), ports2[PortIndexLiveLogGET])
	require.Equal(t, uint16(60005), ports2[PortIndexLiveLogPUT])
	require.Equal(t, uint16(53004), ports2[PortIndexInteractive])
	require.Equal(t, uint16(8084), ports2[PortIndexTaskclusterProxy])

	// Allocate ports for third task
	ports3, err := pm.AllocatePorts("task3")
	require.NoError(t, err)
	require.Len(t, ports3, gwconfig.PortsPerTask)

	// Fourth task should fail (capacity exhausted)
	_, err = pm.AllocatePorts("task4")
	require.Error(t, err)
	require.Contains(t, err.Error(), "no available port slots")
}

func TestPortManagerReleasePorts(t *testing.T) {
	pm := NewPortManager(60000, 53000, 8080, 2)

	// Allocate all capacity
	_, err := pm.AllocatePorts("task1")
	require.NoError(t, err)
	_, err = pm.AllocatePorts("task2")
	require.NoError(t, err)

	// Should fail - no capacity
	_, err = pm.AllocatePorts("task3")
	require.Error(t, err)

	// Release one task's ports
	pm.ReleasePorts("task1")

	// Should now succeed
	ports3, err := pm.AllocatePorts("task3")
	require.NoError(t, err)
	// Should reuse slot 0
	require.Equal(t, uint16(60000), ports3[PortIndexLiveLogGET])
}

func TestPortManagerGetPorts(t *testing.T) {
	pm := NewPortManager(60000, 53000, 8080, 2)

	// Not allocated yet
	require.Nil(t, pm.GetPorts("task1"))

	// Allocate
	ports, err := pm.AllocatePorts("task1")
	require.NoError(t, err)

	// Should return same ports
	require.Equal(t, ports, pm.GetPorts("task1"))

	// Release
	pm.ReleasePorts("task1")
	require.Nil(t, pm.GetPorts("task1"))
}

func TestPortManagerLiveLogPorts(t *testing.T) {
	pm := NewPortManager(60000, 53000, 8080, 2)

	// Not allocated
	_, _, ok := pm.LiveLogPorts("task1")
	require.False(t, ok)

	// Allocate
	_, err := pm.AllocatePorts("task1")
	require.NoError(t, err)

	getPort, putPort, ok := pm.LiveLogPorts("task1")
	require.True(t, ok)
	require.Equal(t, uint16(60000), getPort)
	require.Equal(t, uint16(60001), putPort)
}

func TestPortManagerInteractivePort(t *testing.T) {
	pm := NewPortManager(60000, 53000, 8080, 2)

	// Not allocated
	_, ok := pm.InteractivePort("task1")
	require.False(t, ok)

	// Allocate
	_, err := pm.AllocatePorts("task1")
	require.NoError(t, err)

	port, ok := pm.InteractivePort("task1")
	require.True(t, ok)
	require.Equal(t, uint16(53000), port)
}

func TestPortManagerTaskclusterProxyPort(t *testing.T) {
	pm := NewPortManager(60000, 53000, 8080, 2)

	// Not allocated
	_, ok := pm.TaskclusterProxyPort("task1")
	require.False(t, ok)

	// Allocate
	_, err := pm.AllocatePorts("task1")
	require.NoError(t, err)

	port, ok := pm.TaskclusterProxyPort("task1")
	require.True(t, ok)
	require.Equal(t, uint16(8080), port)
}

func TestPortManagerIdempotentAllocation(t *testing.T) {
	pm := NewPortManager(60000, 53000, 8080, 2)

	// First allocation
	ports1, err := pm.AllocatePorts("task1")
	require.NoError(t, err)

	// Second allocation for same task should return same ports
	ports2, err := pm.AllocatePorts("task1")
	require.NoError(t, err)
	require.Equal(t, ports1, ports2)
}

func TestPortManagerSlotReuse(t *testing.T) {
	pm := NewPortManager(60000, 53000, 8080, 3)

	// Allocate slots 0, 1, 2
	_, _ = pm.AllocatePorts("task1") // slot 0
	_, _ = pm.AllocatePorts("task2") // slot 1
	_, _ = pm.AllocatePorts("task3") // slot 2

	// Release slot 1
	pm.ReleasePorts("task2")

	// New task should get slot 1
	ports, err := pm.AllocatePorts("task4")
	require.NoError(t, err)
	// Slot 1 means offset of 4
	require.Equal(t, uint16(60004), ports[PortIndexLiveLogGET])
}
