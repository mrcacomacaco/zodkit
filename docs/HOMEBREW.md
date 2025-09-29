# Homebrew Distribution Guide

This guide covers how to distribute zodkit via Homebrew for macOS users.

## Overview

Homebrew is the most popular package manager for macOS. We provide a Homebrew formula that allows users to install zodkit with a simple command:

```bash
brew tap JSONbored/zodkit
brew install zodkit
```

## Formula Structure

Our Homebrew formula is located at `homebrew/zodkit.rb` and includes:

- **Package metadata**: Description, homepage, license
- **Dependencies**: Node.js 18+ requirement
- **Installation instructions**: npm-based installation
- **Shell completions**: Bash and Zsh support
- **Tests**: Basic functionality validation

## Updating the Formula

### Automatic Update (Recommended)

Use the provided script to automatically update the formula:

```bash
# Update for current version in package.json
./scripts/update-homebrew.sh

# Update for specific version
./scripts/update-homebrew.sh 0.2.0
```

The script will:
1. Verify the package exists on npm
2. Download and calculate SHA256 checksum
3. Update the formula file
4. Validate the formula syntax

### Manual Update

If you need to update manually:

1. **Get the package URL and SHA256**:
   ```bash
   VERSION="0.1.0"
   URL="https://registry.npmjs.org/zodkit/-/zodkit-${VERSION}.tgz"
   wget "${URL}" -O "zodkit-${VERSION}.tgz"
   shasum -a 256 "zodkit-${VERSION}.tgz"
   ```

2. **Update the formula** in `homebrew/zodkit.rb`:
   - Change the `url` to the new version
   - Update the `sha256` with the calculated checksum

3. **Test the formula**:
   ```bash
   brew install --build-from-source homebrew/zodkit.rb
   zodkit --version
   brew uninstall zodkit
   ```

## Publishing to Homebrew

### Option 1: Homebrew Tap (Recommended)

Create a custom tap repository for easier distribution:

1. **Create the tap repository**:
   ```bash
   gh repo create homebrew-zodkit --public
   git clone https://github.com/JSONbored/homebrew-zodkit.git
   ```

2. **Set up the tap structure**:
   ```bash
   cd homebrew-zodkit
   mkdir -p Formula
   cp ../zodkit/homebrew/zodkit.rb Formula/
   ```

3. **Publish the tap**:
   ```bash
   git add .
   git commit -m "Add zodkit formula v0.1.0"
   git push origin main
   ```

4. **Users can install with**:
   ```bash
   brew tap JSONbored/zodkit
   brew install zodkit
   ```

### Option 2: Official Homebrew Core

For inclusion in the main Homebrew repository:

1. **Meet the requirements**:
   - Stable, actively maintained project
   - 75+ GitHub stars or 30-day install count
   - No similar tools in core already

2. **Submit a pull request**:
   ```bash
   # Fork homebrew-core
   gh repo fork Homebrew/homebrew-core

   # Add the formula
   cp homebrew/zodkit.rb ~/homebrew-core/Formula/
   cd ~/homebrew-core
   git add Formula/zodkit.rb
   git commit -m "zodkit: new formula"
   git push origin main

   # Create PR to Homebrew/homebrew-core
   gh pr create --title "zodkit: new formula" --body "Add formula for zodkit CLI tool"
   ```

## Formula Testing

### Local Testing

Test the formula before publishing:

```bash
# Test installation
brew install --build-from-source homebrew/zodkit.rb

# Test basic functionality
zodkit --version
zodkit --help
zodkit init

# Test formula
brew test zodkit

# Clean up
brew uninstall zodkit
```

### Automated Testing

The formula includes comprehensive tests:

```ruby
test do
  # Test basic help command
  assert_match "zodkit", shell_output("#{bin}/zodkit --help")

  # Test version command
  assert_match version.to_s, shell_output("#{bin}/zodkit --version")

  # Test init command in a temporary directory
  testpath.cd do
    system bin/"zodkit", "init"
    assert_predicate testpath/"zod.config.js", :exist?
  end
end
```

## Shell Completions

The formula automatically generates shell completions for Bash and Zsh:

```ruby
# Generate completions
generate_completions_from_executable(bin/"zodkit", shells: [:bash, :zsh])
```

Users get tab completion after installation:
- Bash: `/usr/local/etc/bash_completion.d/zodkit`
- Zsh: `/usr/local/share/zsh/site-functions/_zodkit`

## Troubleshooting

### Common Issues

1. **SHA256 mismatch**:
   ```bash
   # Recalculate the checksum
   shasum -a 256 zodkit-0.1.0.tgz
   ```

2. **Node.js dependency issues**:
   ```bash
   # Install Node.js via Homebrew
   brew install node@18
   ```

3. **Formula validation errors**:
   ```bash
   # Check formula syntax
   brew audit --strict homebrew/zodkit.rb
   ```

### Debug Installation

To debug installation issues:

```bash
# Verbose installation
brew install --build-from-source --verbose homebrew/zodkit.rb

# Check installation location
brew --prefix zodkit

# Verify binary
ls -la $(brew --prefix zodkit)/bin/
```

## Maintenance

### Regular Updates

1. **After each release**:
   - Run `./scripts/update-homebrew.sh`
   - Test the updated formula
   - Update the tap repository

2. **Monitor dependencies**:
   - Keep Node.js dependency up to date
   - Watch for Homebrew policy changes

3. **User feedback**:
   - Monitor tap repository issues
   - Check Homebrew analytics for usage

### Version Strategy

- **Patch versions (0.1.1)**: Update formula automatically
- **Minor versions (0.2.0)**: Test thoroughly, update docs
- **Major versions (1.0.0)**: Consider migration guides

## Resources

- [Homebrew Formula Cookbook](https://docs.brew.sh/Formula-Cookbook)
- [Homebrew Acceptable Formulae](https://docs.brew.sh/Acceptable-Formulae)
- [Node.js Formula Examples](https://github.com/Homebrew/homebrew-core/search?q=depends_on+%22node%22&type=code)

## Support

For Homebrew-specific issues:
- Check the [tap repository](https://github.com/JSONbored/homebrew-zodkit)
- File issues with "homebrew" label
- Include formula version and macOS version in reports