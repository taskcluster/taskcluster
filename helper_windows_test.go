package main

func helloGoodbye() []string {
	return []string{
		"echo hello world!",
		"echo goodbye world!",
	}
}

func checkSHASums() []string {
	return []string{
		"powershell -file preloaded\\check-shasums.ps1",
	}
}

func failCommand() []string {
	return []string{
		"exit 1",
	}
}

func incrementCounterInCache() []string {
	command := `
		setlocal EnableDelayedExpansion
		if exist my-task-caches\test-modifications\counter (
		  set /p counter=<my-task-caches\test-modifications\counter
		  set /a counter=counter+1
		  echo !counter! > my-task-caches\test-modifications\counter
		) else (
		  echo 1 > my-task-caches\test-modifications\counter
		)
`
	return []string(command)
}
