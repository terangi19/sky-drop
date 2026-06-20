# Watches the repo and runs git-sync every N minutes when there are changes.
# Usage: npm run git:watch
# Stop with Ctrl+C

param(
    [int]$IntervalMinutes = 3
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$intervalSec = $IntervalMinutes * 60
Write-Host "Git watch started — checking every ${IntervalMinutes} minute(s). Ctrl+C to stop."
Write-Host "Repo: $(Get-Location)"
Write-Host ""

while ($true) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $dirty = git status --porcelain

    if ($dirty) {
        Write-Host "[$stamp] Changes detected — syncing..."
        try {
            & "$PSScriptRoot\git-sync.ps1"
        } catch {
            Write-Host "[$stamp] Sync failed: $_"
        }
    } else {
        Write-Host "[$stamp] No changes — skipping."
    }

    Start-Sleep -Seconds $intervalSec
}
