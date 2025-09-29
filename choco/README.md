# zodkit Chocolatey Package

This directory contains the Chocolatey package configuration for zodkit, a modern CLI tool for static analysis and validation of Zod schemas.

## Package Structure

```
choco/
├── zodkit.nuspec              # Package specification
├── tools/
│   ├── chocolateyinstall.ps1  # Installation script
│   └── chocolateyuninstall.ps1 # Uninstallation script
├── legal/
│   ├── LICENSE.txt            # Package license
│   └── VERIFICATION.txt       # Package verification info
└── README.md                  # This file
```

## Building the Package

### Prerequisites

1. **Chocolatey CLI**: Install from [chocolatey.org](https://chocolatey.org/install)
2. **PowerShell**: Available on Windows, macOS, and Linux
3. **Node.js 18+**: Required for zodkit functionality

### Build Commands

```bash
# Build the Chocolatey package
npm run chocolatey:build

# Test the package locally
npm run chocolatey:test

# Build and show publish instructions
npm run chocolatey:publish
```

### Manual Build

If you prefer to build manually:

```powershell
# Navigate to the choco directory
cd choco

# Build the package
choco pack zodkit.nuspec --outputdirectory ..\dist\chocolatey

# Test locally (requires admin privileges)
choco install zodkit -s ..\dist\chocolatey -y --force

# Verify installation
zodkit --version

# Cleanup
choco uninstall zodkit -y
```

## Publishing

### To Chocolatey Community Repository

1. **Build the package**:
   ```bash
   npm run chocolatey:build
   ```

2. **Test thoroughly**:
   ```bash
   npm run chocolatey:test
   ```

3. **Submit to Chocolatey**:
   ```powershell
   choco push dist\chocolatey\zodkit.0.1.0.nupkg -s https://push.chocolatey.org/
   ```

4. **API Key Setup** (first time only):
   ```powershell
   choco apikey -k [YOUR-API-KEY] -s https://push.chocolatey.org/
   ```

### To Private Repository

You can also host the package on your own Chocolatey repository:

```powershell
# Add your repository
choco source add -n="MyRepo" -s="https://my-repo.example.com/"

# Push to your repository
choco push dist\chocolatey\zodkit.0.1.0.nupkg -s https://my-repo.example.com/
```

## Installation for Users

Once published, users can install zodkit via Chocolatey:

```powershell
# Install zodkit
choco install zodkit

# Upgrade zodkit
choco upgrade zodkit

# Uninstall zodkit
choco uninstall zodkit
```

## Package Features

- **Automatic Dependency Management**: Checks for Node.js 18+ requirement
- **Global npm Installation**: Installs zodkit globally via npm for CLI access
- **Verification**: Includes verification information for package integrity
- **Clean Uninstall**: Proper cleanup when uninstalling

## Troubleshooting

### Installation Issues

1. **Node.js not found**: Install Node.js 18+ from [nodejs.org](https://nodejs.org/)
2. **npm not found**: Ensure npm is included with your Node.js installation
3. **Permission errors**: Run PowerShell as Administrator

### Testing Issues

1. **Package not found**: Ensure you've built the package first with `npm run chocolatey:build`
2. **Installation fails**: Check that you're running as Administrator
3. **Command not found**: Restart your terminal after installation

## Version Management

The package version is automatically synchronized with the npm package version. When updating:

1. Update version in `package.json`
2. Run `npm run chocolatey:build` to update the Chocolatey package
3. The build script automatically updates the nuspec and install script versions

## Security

- All scripts require execution policy bypass for testing
- Package verification information is included
- Installation process validates Node.js version requirements
- No sensitive information is included in the package