# Build Chocolatey Package for zodkit
# This script creates a Chocolatey package (.nupkg) from the nuspec file

param(
    [Parameter(Mandatory=$false)]
    [string]$Version = "0.1.0",

    [Parameter(Mandatory=$false)]
    [string]$OutputDir = ".\dist\chocolatey",

    [Parameter(Mandatory=$false)]
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

Write-Host "Building Chocolatey package for zodkit v$Version" -ForegroundColor Cyan

# Check if choco is installed
try {
    $chocoVersion = & choco --version 2>$null
    Write-Host "Chocolatey $chocoVersion detected" -ForegroundColor Green
} catch {
    Write-Error "Chocolatey is not installed. Please install Chocolatey first: https://chocolatey.org/install"
    exit 1
}

# Create output directory
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir
    Write-Host "Created output directory: $OutputDir" -ForegroundColor Green
}

# Check if nuspec file exists
$nuspecPath = ".\choco\zodkit.nuspec"
if (!(Test-Path $nuspecPath)) {
    Write-Error "Nuspec file not found at: $nuspecPath"
    exit 1
}

# Update version in nuspec if different
$nuspecContent = Get-Content $nuspecPath -Raw
if ($nuspecContent -match '<version>([^<]+)</version>') {
    $currentVersion = $matches[1]
    if ($currentVersion -ne $Version) {
        Write-Host "Updating version from $currentVersion to $Version" -ForegroundColor Yellow
        $nuspecContent = $nuspecContent -replace '<version>[^<]+</version>', "<version>$Version</version>"
        $nuspecContent | Set-Content $nuspecPath -NoNewline
    }
}

# Update install script version
$installScriptPath = ".\choco\tools\chocolateyinstall.ps1"
if (Test-Path $installScriptPath) {
    $installContent = Get-Content $installScriptPath -Raw
    $installContent = $installContent -replace 'zodkit@[\d\.]+', "zodkit@$Version"
    $installContent | Set-Content $installScriptPath -NoNewline
    Write-Host "Updated install script to version $Version" -ForegroundColor Green
}

try {
    # Build the package
    Write-Host "Building Chocolatey package..." -ForegroundColor Yellow

    Push-Location ".\choco"

    $chocoArgs = @("pack", "zodkit.nuspec", "--outputdirectory", "..\$OutputDir")
    if ($Force) {
        $chocoArgs += "--force"
    }

    & choco @chocoArgs

    if ($LASTEXITCODE -ne 0) {
        throw "Chocolatey pack failed with exit code $LASTEXITCODE"
    }

    Pop-Location

    $packageFile = "$OutputDir\zodkit.$Version.nupkg"
    if (Test-Path $packageFile) {
        Write-Host "Successfully created Chocolatey package: $packageFile" -ForegroundColor Green

        # Show package info
        $packageSize = (Get-Item $packageFile).Length
        Write-Host "Package size: $([math]::Round($packageSize / 1KB, 2)) KB" -ForegroundColor Cyan

        Write-Host "`nNext steps:" -ForegroundColor Cyan
        Write-Host "1. Test the package locally: choco install zodkit -s $OutputDir" -ForegroundColor White
        Write-Host "2. Submit to Chocolatey Community Repository: choco push $packageFile -s https://push.chocolatey.org/" -ForegroundColor White
        Write-Host "3. Or host on your own repository" -ForegroundColor White

    } else {
        throw "Package file was not created: $packageFile"
    }

} catch {
    Write-Error "Failed to build Chocolatey package: $_"
    exit 1
} finally {
    if (Get-Location).Path -like "*\choco") {
        Pop-Location
    }
}

Write-Host "`nChocolatey package build completed successfully!" -ForegroundColor Green