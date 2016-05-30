package syscall

//sys   CreateProcessWithLogon(username *uint16, domain *uint16, password *uint16, logonFlags uint32, appName *uint16, commandLine *uint16, creationFlags uint32, env *uint16, currentDir *uint16, startupInfo *StartupInfo, outProcInfo *ProcessInformation) (err error) = advapi32.CreateProcessWithLogonW
//sys   CreateProcess(appName *uint16, commandLine *uint16, procSecurity *SecurityAttributes, threadSecurity *SecurityAttributes, inheritHandles bool, creationFlags uint32, env *uint16, currentDir *uint16, startupInfo *StartupInfo, outProcInfo *ProcessInformation) (err error) = CreateProcessW
//sys   CreateProfile(userSID *uint16, username *uint16, profilePath *uint16, profilePathCharSize uint32) (err error) = userenv.CreateProfile
