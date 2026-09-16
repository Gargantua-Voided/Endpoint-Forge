. "$PSScriptRoot\build-version-helper.ps1"
$version = Get-SortifyBuildVersion

if (Test-Path "release") {
    Remove-Item -Recurse -Force "release"
}

Write-Host "Compiling Vite and TypeScript..."
cmd.exe /c "npm run build"
if ($LASTEXITCODE -ne 0) {
    Read-Host "Compile failed. Press Enter to exit..."
    exit $LASTEXITCODE
}

Write-Host "Building Portable .exe with electron-builder..."
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
cmd.exe /c "npx electron-builder --win portable --x64 -c.extraMetadata.version=$version"

if ($LASTEXITCODE -ne 0) {
    Read-Host "Build failed. Press Enter to exit..."
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "SUCCESS! Your portable executable is ready in the 'release' folder."
Read-Host "Press Enter to exit..."
exit 0
