# build-version-helper.ps1 - export Get-SortifyBuildVersion
# (idle timeout 3s -> 1.0.0; empty Enter -> 1.0.0; typed value -> as entered)

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
        return "1.0.0"
    }
    return $version
}
