. "$PSScriptRoot\build-version-helper.ps1"
$version = Get-BuildVersion

if (Test-Path "release") {
    Remove-Item -Recurse -Force "release"
}

Write-Host "Compiling Vite and TypeScript..."
cmd.exe /c "npm run build"
if ($LASTEXITCODE -ne 0) {
    Read-Host "Compile failed. Press Enter to exit..."
    exit $LASTEXITCODE
}

Write-Host "Building .exe and latest.yml with electron-builder..."
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
cmd.exe /c "npx electron-builder --win --x64 -p never -c.extraMetadata.version=$version"

if ($LASTEXITCODE -ne 0) {
    Read-Host "Build failed. Press Enter to exit..."
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "======================================================"
Write-Host "SUCCESS! Your update is ready in the 'release' folder."
Write-Host "Upload the .exe AND the latest.yml to GitHub Releases."
Write-Host "======================================================"
Read-Host "Press Enter to exit..."
exit 0
