package main

func d2gConfig() string {
	return `
          d2gConfig                         D2G-specific (Docker Worker to Generic Worker payload
                                            transformation) configuration. This allows finer tuning
                                            of the internal D2G payload translation. Available
                                            config with provided defaults:
                                              * enableD2G - Enables D2G. [default: false]
                                              * allowChainOfTrust - Allows Chain of Trust. [default: true]
                                              * allowDisableSeccomp - Allows disabling Seccomp. [default: true]
                                              * allowGPUs - Allows the use of NVIDIA GPUs. [default: false]
                                              * allowHostSharedMemory - Allows Host Shared Memory. [default: true]
                                              * allowInteractive - Allows Interactive. [default: true]
                                              * allowKVM - Allows KVM. [default: true]
                                              * allowLoopbackAudio - Allows Loopback Audio. [default: true]
                                              * allowLoopbackVideo - Allows Loopback Video. [default: true]
                                              * allowPrivileged - Allows Privileged. [default: true]
                                              * allowPtrace - Allows Ptrace. [default: true]
                                              * allowTaskclusterProxy - Allows Taskcluster Proxy. [default: true]
                                              * containerEngine - The default container engine to use for translated
                                                Docker Worker tasks when not specified in the Docker Worker task payload
                                                (property capabilities.containerEngine). Accepted values: "docker" or "podman".
                                                [default: "docker"]
                                              * gpus - The NVIDIA GPUs to make available to the running container.
                                                Only used if allowGPUs is true. [default: "all"]`
}

func enableTaskFeatures() string {
	return `
          enableInteractive                 Enables the Interactive feature to be used in the
                                            task payload. [default: true]
          enableLoopbackAudio               Enables the Loopback Audio feature to be used in the
                                            task payload. [default: true]
          enableLoopbackVideo               Enables the Loopback Video feature to be used in the
                                            task payload. [default: true]`
}

func loopbackDeviceNumbers() string {
	return `
          loopbackAudioDeviceNumber         The audio loopback device number. The resulting devices inside /dev/snd
                                            will take the form controlC<DEVICE_NUMBER>, pcmC<DEVICE_NUMBER>D0c,
                                            pcmC<DEVICE_NUMBER>D0p, pcmC<DEVICE_NUMBER>D1c, pcmC<DEVICE_NUMBER>D1p
                                            where <DEVICE_NUMBER> is an integer between 0 and 31.
                                            [default: 16]
          loopbackVideoDeviceNumber         The video loopback device number. Its value will take the form
                                            /dev/video<DEVICE_NUMBER> where <DEVICE_NUMBER> is an integer
                                            between 0 and 255. This setting may be used to change it.
                                            [default: 0]`
}
