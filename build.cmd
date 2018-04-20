:: main script to build and test generic worker on windows

@echo on

:: cd to dir containing this script
pushd %~dp0

go get github.com/taskcluster/livelog github.com/gordonklaus/ineffassign || exit /b %ERRORLEVEL%
cd gw-codegen
go get -v || exit /b %ERRORLEVEL%
cd ..
echo TEMPORARILY DISABLED GO GENERATE WHILE FIXING jsonschema2go || exit /b %ERRORLEVEL%
go get -v -t ./... || exit /b %ERRORLEVEL%

:: this counts the number of lines returned by git status
:: dump temp file a directory higher, otherwise git status reports the tmp1.txt file!
git status --porcelain | C:\Windows\System32\find.exe /v /c "" > ..\tmp1.txt
set /P lines=<..\tmp1.txt
:: this checks that if more than 0 lines are returned, we fail
if %lines% gtr 0 exit /b 64

git rev-parse HEAD > revision.txt
set /p REVISION=< revision.txt
del revision.txt
set GORACE=history_size=7
go test -ldflags "-X github.com/taskcluster/generic-worker.revision=%REVISION%" ./... || exit /b %ERRORLEVEL%
ineffassign . || exit /b %ERRORLEVEL%
