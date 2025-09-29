$ErrorActionPreference = 'Stop'

$packageName = 'zodkit'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$url = 'https://registry.npmjs.org/zodkit/-/zodkit-0.1.0.tgz'

$packageArgs = @{
  packageName   = $packageName
  unzipLocation = $toolsDir
  fileType      = 'TGZ'
  url           = $url
  softwareName  = 'zodkit*'
  checksum      = ''
  checksumType  = 'sha256'
  validExitCodes= @(0)
}

# Check if Node.js is installed
try {
  $nodeVersion = & node --version 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Node.js not found"
  }

  $versionNumber = $nodeVersion -replace 'v', ''
  $versionParts = $versionNumber.Split('.')
  $majorVersion = [int]$versionParts[0]

  if ($majorVersion -lt 18) {
    throw "Node.js version $nodeVersion is not supported. Please install Node.js 18.0.0 or higher."
  }

  Write-Host "Node.js $nodeVersion detected - OK" -ForegroundColor Green
} catch {
  Write-Error "Node.js 18.0.0 or higher is required but not found. Please install Node.js first: https://nodejs.org/"
  throw
}

# Check if npm is available
try {
  & npm --version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "npm not found"
  }
  Write-Host "npm detected - OK" -ForegroundColor Green
} catch {
  Write-Error "npm is required but not found. Please ensure npm is properly installed with Node.js."
  throw
}

Write-Host "Installing zodkit globally via npm..." -ForegroundColor Yellow

try {
  # Install zodkit globally using npm
  & npm install -g zodkit@0.1.0

  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE"
  }

  # Verify installation
  & zodkit --version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "zodkit installation verification failed"
  }

  Write-Host "zodkit has been successfully installed!" -ForegroundColor Green
  Write-Host "You can now use 'zodkit' command from anywhere in your terminal." -ForegroundColor Green
  Write-Host "Run 'zodkit --help' to get started." -ForegroundColor Cyan

} catch {
  Write-Error "Failed to install zodkit: $_"
  throw
}