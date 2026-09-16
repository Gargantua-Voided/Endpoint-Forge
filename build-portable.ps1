. "$PSScriptRoot\build-version-helper.ps1"
$version = Get-SortifyBuildVersion

if (Test-Path "release") {
    Remove-Item -Recurse -Force "release"
}
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win portable --x64 "-c.extraMetadata.version=$version"
if ($LASTEXITCODE -ne 0) {
    Read-Host "Build failed. Press Enter to exit..."
    exit $LASTEXITCODE
}
exit 0
