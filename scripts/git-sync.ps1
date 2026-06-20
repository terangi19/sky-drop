# Sync local changes to GitHub (commit + push)
# Usage: npm run git:sync
#        npm run git:sync -- -Message "custom commit message"

param(
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$status = git status --porcelain
if (-not $status) {
    Write-Host "Nothing to commit — working tree clean."
    exit 0
}

# Unstage build artifact if accidentally tracked
git reset HEAD tsconfig.tsbuildinfo 2>$null | Out-Null

git add -A
git reset HEAD tsconfig.tsbuildinfo 2>$null | Out-Null

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "No staged changes after excluding build artifacts."
    exit 0
}

if (-not $Message) {
    $stat = git diff --cached --stat
    $Message = "chore: sync local changes`n`n$stat"
}

git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Error "Commit failed."
    exit 1
}

$branch = git rev-parse --abbrev-ref HEAD
git push origin $branch
if ($LASTEXITCODE -ne 0) {
    Write-Error "Push failed."
    exit 1
}

$hash = git rev-parse --short HEAD
Write-Host "Pushed $branch @ $hash"
