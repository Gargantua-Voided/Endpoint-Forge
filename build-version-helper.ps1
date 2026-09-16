# build-version-helper.ps1 - Automate version bumping

function Get-SortifyBuildVersion {
    Write-Host "Enter version (e.g. 1.0.1) [Default: 1.0.0 in 3s]: " -NoNewline
    $version = ""
    $timeout = 3
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    while ($stopwatch.Elapsed.TotalSeconds -lt $timeout) {
        if ([console]::KeyAvailable) {
            $key = [console]::ReadKey($true)
            if ($key.Key -eq 'Enter') {
                break
            }
            if ($key.Key -eq 'Backspace' -and $version.Length -gt 0) {
                $version = $version.Substring(0, $version.Length - 1)
                Write-Host "`b `b" -NoNewline
            }
            elseif ($key.KeyChar -ge 32 -and $key.KeyChar -le 126) {
                $version += $key.KeyChar
                Write-Host $key.KeyChar -NoNewline
            }
            # Once user starts typing, wait indefinitely
            $timeout = [int]::MaxValue
        }
        Start-Sleep -Milliseconds 50
    }
    Write-Host ""
    if ([string]::IsNullOrWhiteSpace($version)) {
        $version = "1.0.0"
    }

    Write-Host "Updating package.json to version $version..."
    $packageJsonPath = Join-Path $PSScriptRoot "package.json"
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    $packageJson.version = $version
    # Format with proper spacing and depth
    $packageJson | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath

    return $version
}
