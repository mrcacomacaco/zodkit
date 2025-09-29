#!/bin/bash

# Script to update Homebrew formula for zodkit
# Usage: ./scripts/update-homebrew.sh [version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get version from package.json if not provided
if [ -z "$1" ]; then
    VERSION=$(node -p "require('./package.json').version")
else
    VERSION="$1"
fi

print_status "Updating Homebrew formula for zodkit v${VERSION}"

# Check if package exists on npm
NPM_URL="https://registry.npmjs.org/zodkit/-/zodkit-${VERSION}.tgz"
print_status "Checking if package exists on npm: ${NPM_URL}"

if curl --head --silent --fail "${NPM_URL}" > /dev/null; then
    print_success "Package found on npm"
else
    print_error "Package not found on npm. Make sure to publish first:"
    print_error "  npm publish"
    exit 1
fi

# Download the package to get the SHA256
print_status "Downloading package to calculate SHA256..."
TEMP_DIR=$(mktemp -d)
cd "${TEMP_DIR}"

wget -q "${NPM_URL}" -O "zodkit-${VERSION}.tgz"
SHA256=$(shasum -a 256 "zodkit-${VERSION}.tgz" | cut -d' ' -f1)

print_success "SHA256: ${SHA256}"

# Go back to project directory
cd - > /dev/null

# Update the formula
FORMULA_FILE="homebrew/zodkit.rb"
print_status "Updating formula file: ${FORMULA_FILE}"

# Create updated formula
cat > "${FORMULA_FILE}" << EOF
class Zodded < Formula
  desc "A modern CLI tool for static analysis and validation of Zod schemas"
  homepage "https://github.com/JSONbored/zodkit"
  url "https://registry.npmjs.org/zodkit/-/zodkit-${VERSION}.tgz"
  sha256 "${SHA256}"
  license "MIT"

  depends_on "node@18" => :recommended

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]

    # Generate completions
    generate_completions_from_executable(bin/"zodkit", shells: [:bash, :zsh])
  end

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
end
EOF

print_success "Formula updated successfully"

# Clean up
rm -rf "${TEMP_DIR}"

# Validate the formula
print_status "Validating formula syntax..."
if command -v brew &> /dev/null; then
    if brew audit --strict "${FORMULA_FILE}" 2>/dev/null; then
        print_success "Formula validation passed"
    else
        print_warning "Formula validation had warnings (this is normal for local formulas)"
    fi
else
    print_warning "Homebrew not found, skipping validation"
fi

# Instructions for publishing
echo ""
print_success "Homebrew formula updated successfully!"
echo ""
print_status "Next steps:"
echo "1. Test the formula locally:"
echo "   brew install --build-from-source ${FORMULA_FILE}"
echo ""
echo "2. Create a tap repository (one-time setup):"
echo "   gh repo create homebrew-zodkit --public"
echo "   git clone https://github.com/JSONbored/homebrew-zodkit.git"
echo "   cp ${FORMULA_FILE} homebrew-zodkit/Formula/"
echo "   cd homebrew-zodkit && git add . && git commit -m 'Add zodkit formula v${VERSION}' && git push"
echo ""
echo "3. Users can then install with:"
echo "   brew tap JSONbored/zodkit"
echo "   brew install zodkit"
echo ""
print_status "Formula file ready: ${FORMULA_FILE}"