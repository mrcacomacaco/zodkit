#!/bin/bash

# Docker build script for zodkit
# This script builds and optionally publishes Docker images for zodkit

set -e

# Configuration
IMAGE_NAME="zodkit"
REGISTRY=""
VERSION="0.1.0"
PLATFORMS="linux/amd64,linux/arm64"
BUILD_ARGS=""
PUSH=false
LATEST=false
CACHE_FROM=""
TARGET="production"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_color() {
    printf "${1}${2}${NC}\n"
}

# Show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Build Docker images for zodkit

OPTIONS:
    -h, --help          Show this help message
    -v, --version       Set version tag (default: $VERSION)
    -r, --registry      Docker registry (e.g., docker.io/username)
    -p, --push          Push images to registry after building
    -l, --latest        Also tag as 'latest'
    --platforms         Target platforms (default: $PLATFORMS)
    --target            Build target (default: $TARGET)
    --cache-from        Cache from image
    --build-arg         Add build argument (can be used multiple times)

EXAMPLES:
    $0                                      # Basic build
    $0 -v 1.0.0 -l                         # Build version 1.0.0 and tag as latest
    $0 -r docker.io/username -p -l         # Build and push to Docker Hub
    $0 --platforms linux/amd64             # Build for specific platform
    $0 --target builder                     # Build specific target

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -p|--push)
            PUSH=true
            shift
            ;;
        -l|--latest)
            LATEST=true
            shift
            ;;
        --platforms)
            PLATFORMS="$2"
            shift 2
            ;;
        --target)
            TARGET="$2"
            shift 2
            ;;
        --cache-from)
            CACHE_FROM="$2"
            shift 2
            ;;
        --build-arg)
            BUILD_ARGS="$BUILD_ARGS --build-arg $2"
            shift 2
            ;;
        *)
            print_color $RED "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Construct full image name
if [[ -n "$REGISTRY" ]]; then
    FULL_IMAGE_NAME="$REGISTRY/$IMAGE_NAME"
else
    FULL_IMAGE_NAME="$IMAGE_NAME"
fi

# Validate Docker
if ! command -v docker &> /dev/null; then
    print_color $RED "Error: Docker is not installed or not in PATH"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_color $RED "Error: Docker daemon is not running"
    exit 1
fi

print_color $BLUE "Building zodkit Docker image..."
print_color $YELLOW "Configuration:"
echo "  Image: $FULL_IMAGE_NAME"
echo "  Version: $VERSION"
echo "  Target: $TARGET"
echo "  Platforms: $PLATFORMS"
echo "  Push: $PUSH"
echo "  Latest: $LATEST"

# Build command construction
BUILD_CMD="docker buildx build"
BUILD_CMD="$BUILD_CMD --platform $PLATFORMS"
BUILD_CMD="$BUILD_CMD --target $TARGET"
BUILD_CMD="$BUILD_CMD -t $FULL_IMAGE_NAME:$VERSION"

if [[ "$LATEST" == true ]]; then
    BUILD_CMD="$BUILD_CMD -t $FULL_IMAGE_NAME:latest"
fi

if [[ -n "$CACHE_FROM" ]]; then
    BUILD_CMD="$BUILD_CMD --cache-from $CACHE_FROM"
fi

if [[ -n "$BUILD_ARGS" ]]; then
    BUILD_CMD="$BUILD_CMD $BUILD_ARGS"
fi

if [[ "$PUSH" == true ]]; then
    BUILD_CMD="$BUILD_CMD --push"
else
    BUILD_CMD="$BUILD_CMD --load"
fi

BUILD_CMD="$BUILD_CMD ."

# Enable buildx if not already enabled
if ! docker buildx ls | grep -q "default.*running"; then
    print_color $YELLOW "Setting up Docker buildx..."
    docker buildx create --use --name zodkit-builder 2>/dev/null || true
fi

# Run the build
print_color $BLUE "Running build command:"
print_color $YELLOW "$BUILD_CMD"
echo

if eval $BUILD_CMD; then
    print_color $GREEN "✅ Build completed successfully!"

    if [[ "$PUSH" == false ]]; then
        print_color $BLUE "Images built locally:"
        docker images "$FULL_IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

        echo
        print_color $BLUE "To run the image:"
        print_color $YELLOW "docker run --rm -v \$(pwd):/workspace $FULL_IMAGE_NAME:$VERSION"

        echo
        print_color $BLUE "To push the image:"
        print_color $YELLOW "docker push $FULL_IMAGE_NAME:$VERSION"
        if [[ "$LATEST" == true ]]; then
            print_color $YELLOW "docker push $FULL_IMAGE_NAME:latest"
        fi
    else
        print_color $GREEN "✅ Images pushed to registry successfully!"
    fi

    echo
    print_color $BLUE "Usage examples:"
    print_color $YELLOW "# Basic usage"
    print_color $YELLOW "docker run --rm -v \$(pwd):/workspace $FULL_IMAGE_NAME:$VERSION check"
    print_color $YELLOW ""
    print_color $YELLOW "# Interactive shell"
    print_color $YELLOW "docker run --rm -it -v \$(pwd):/workspace --entrypoint /bin/sh $FULL_IMAGE_NAME:$VERSION"
    print_color $YELLOW ""
    print_color $YELLOW "# Using docker-compose"
    print_color $YELLOW "docker-compose --profile cli run zodkit check"

else
    print_color $RED "❌ Build failed!"
    exit 1
fi