@echo off
setlocal

set "ROOT=%~dp0.."
pushd "%ROOT%"

echo === Inject ===
node "tools\inject_entries.js"
if errorlevel 1 goto :fail

echo === Format ===
node "tools\format_tags.js" --paths story/timeline story/relationships story/newtimeline.md story/newrelationship.md
if errorlevel 1 goto :fail

echo === Sort ===
node "tools\sort_timeline.js"
if errorlevel 1 goto :fail

echo === Done ===
popd
exit /b 0

:fail
echo Pipeline failed.
popd
exit /b 1
