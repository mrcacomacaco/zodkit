$ErrorActionPreference = 'Stop'

$packageName = 'zodkit'

Write-Host "Uninstalling zodkit..." -ForegroundColor Yellow

try {
  # Check if zodkit is installed
  & zodkit --version 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "zodkit found, proceeding with uninstallation..." -ForegroundColor Green

    # Uninstall zodkit globally using npm
    & npm uninstall -g zodkit

    if ($LASTEXITCODE -ne 0) {
      Write-Warning "npm uninstall returned exit code $LASTEXITCODE, but continuing..."
    }

    # Verify uninstallation
    & zodkit --version 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Warning "zodkit still appears to be installed. You may need to manually remove it."
    } else {
      Write-Host "zodkit has been successfully uninstalled!" -ForegroundColor Green
    }
  } else {
    Write-Host "zodkit was not found in global npm packages." -ForegroundColor Yellow
  }
} catch {
  Write-Warning "Error during uninstallation: $_"
  Write-Host "You may need to manually uninstall zodkit using: npm uninstall -g zodkit" -ForegroundColor Cyan
}