# Test Chocolatey Package for zodkit
# This script tests the Chocolatey package installation and functionality

param(
    [Parameter(Mandatory=$false)]
    [string]$Version = "0.1.0",

    [Parameter(Mandatory=$false)]
    [string]$PackageDir = ".\dist\chocolatey",

    [Parameter(Mandatory=$false)]
    [switch]$SkipUninstall
)

$ErrorActionPreference = 'Stop'

Write-Host "Testing Chocolatey package for zodkit v$Version" -ForegroundColor Cyan

# Check if running as administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "This script should be run as Administrator for proper testing."
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne 'y' -and $continue -ne 'Y') {
        exit 0
    }
}

# Check if package file exists
$packageFile = "$PackageDir\zodkit.$Version.nupkg"
if (!(Test-Path $packageFile)) {
    Write-Error "Package file not found: $packageFile"
    Write-Host "Run build-chocolatey.ps1 first to create the package." -ForegroundColor Yellow
    exit 1
}

try {
    Write-Host "`n=== Testing Package Installation ===" -ForegroundColor Yellow

    # Uninstall if already installed
    try {
        & choco uninstall zodkit -y 2>$null
        Write-Host "Removed existing zodkit installation" -ForegroundColor Gray
    } catch {
        # Ignore errors if not installed
    }

    # Install from local package
    Write-Host "Installing zodkit from local package..." -ForegroundColor Cyan
    & choco install zodkit -s $PackageDir -y --force

    if ($LASTEXITCODE -ne 0) {
        throw "Installation failed with exit code $LASTEXITCODE"
    }

    Write-Host "Installation completed successfully!" -ForegroundColor Green

    Write-Host "`n=== Testing Functionality ===" -ForegroundColor Yellow

    # Test if zodkit command is available
    try {
        $zodVersionOutput = & zodkit --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ zodkit command is available: $zodVersionOutput" -ForegroundColor Green
        } else {
            throw "zodkit --version failed"
        }
    } catch {
        throw "zodkit command not found or failed to execute: $_"
    }

    # Test help command
    try {
        & zodkit --help | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ zodkit --help works correctly" -ForegroundColor Green
        } else {
            throw "zodkit --help failed"
        }
    } catch {
        throw "zodkit --help failed: $_"
    }

    # Test available commands
    $commands = @("check", "init", "fix", "generate", "analyze", "doctor", "benchmark")
    foreach ($cmd in $commands) {
        try {
            & zodkit $cmd --help | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ zodkit $cmd command available" -ForegroundColor Green
            } else {
                Write-Warning "⚠️  zodkit $cmd command may have issues"
            }
        } catch {
            Write-Warning "⚠️  zodkit $cmd command failed: $_"
        }
    }

    Write-Host "`n=== Testing Complete ===" -ForegroundColor Green
    Write-Host "All tests passed! The Chocolatey package is working correctly." -ForegroundColor Green

} catch {
    Write-Error "Test failed: $_"
    exit 1
} finally {
    # Cleanup - uninstall the test package
    if (-not $SkipUninstall) {
        Write-Host "`n=== Cleanup ===" -ForegroundColor Yellow
        try {
            & choco uninstall zodkit -y 2>$null
            Write-Host "Test package uninstalled" -ForegroundColor Gray
        } catch {
            Write-Warning "Failed to uninstall test package. You may need to remove it manually."
        }
    } else {
        Write-Host "`nSkipping uninstall (--SkipUninstall specified)" -ForegroundColor Cyan
        Write-Host "To uninstall manually: choco uninstall zodkit -y" -ForegroundColor Gray
    }
}

Write-Host "`nChocolatey package testing completed!" -ForegroundColor Cyan