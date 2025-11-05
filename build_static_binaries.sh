#!/bin/bash

# Script to build FFmpeg static libraries for distribution
# Run this script to create the .tar.gz files that will be uploaded to GitHub releases

set -e

FFMPEG_VERSION="5.1.4"
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture names
if [ "$ARCH" = "x86_64" ]; then
    ARCH="x64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    ARCH="arm64"
fi

echo "Building FFmpeg $FFMPEG_VERSION static libraries for $PLATFORM-$ARCH"

# Set up directories
BUILD_DIR="$(pwd)/ffmpeg/ffmpeg-static-build"
SOURCE_DIR="$(pwd)/ffmpeg/ffmpeg-${FFMPEG_VERSION}"
DIST_DIR="$(pwd)/dist"

mkdir -p "$DIST_DIR"

# Download FFmpeg source if not present
if [ ! -f "ffmpeg/ffmpeg-${FFMPEG_VERSION}.tar.bz2" ]; then
    echo "Downloading FFmpeg source..."
    mkdir -p ffmpeg
    curl -L "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.bz2" \
        -o "ffmpeg/ffmpeg-${FFMPEG_VERSION}.tar.bz2"
fi

# Extract source if not present
if [ ! -d "$SOURCE_DIR" ]; then
    echo "Extracting FFmpeg source..."
    tar -xjf "ffmpeg/ffmpeg-${FFMPEG_VERSION}.tar.bz2" -C ffmpeg/
fi

# Clean previous build
rm -rf "$BUILD_DIR"

# Configure FFmpeg
echo "Configuring FFmpeg..."
cd "$SOURCE_DIR"

CONFIGURE_FLAGS=(
    "--prefix=$BUILD_DIR"
    "--enable-gpl"
    "--enable-static"
    "--disable-shared"
    "--enable-pic"
    "--enable-postproc"
    "--enable-swscale"
    "--enable-swresample"
    "--disable-programs"
    "--disable-doc"
    "--disable-htmlpages"
    "--disable-manpages"
    "--disable-podpages"
    "--disable-txtpages"
)

# Platform-specific flags
if [ "$PLATFORM" = "darwin" ]; then
    CONFIGURE_FLAGS+=("--enable-videotoolbox")
fi

# Check for nasm/yasm
if ! command -v nasm &> /dev/null && ! command -v yasm &> /dev/null; then
    echo "Warning: nasm/yasm not found, disabling x86 assembly optimizations"
    CONFIGURE_FLAGS+=("--disable-x86asm")
fi

./configure "${CONFIGURE_FLAGS[@]}"

# Build
echo "Building FFmpeg (this will take a while)..."
make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Install to build directory
echo "Installing to build directory..."
make install

# Verify all libraries were built
REQUIRED_LIBS=(
    "libavcodec.a"
    "libavdevice.a"
    "libavfilter.a"
    "libavformat.a"
    "libavutil.a"
    "libpostproc.a"
    "libswresample.a"
    "libswscale.a"
)

echo "Verifying all required libraries..."
for lib in "${REQUIRED_LIBS[@]}"; do
    if [ ! -f "$BUILD_DIR/lib/$lib" ]; then
        echo "ERROR: $lib was not built!"
        exit 1
    fi
    echo "  ✓ $lib"
done

# Create distribution archive
cd "$(dirname "$BUILD_DIR")"
ARCHIVE_NAME="ffmpeg-static-${PLATFORM}-${ARCH}-${FFMPEG_VERSION}.tar.gz"
echo "Creating distribution archive: $ARCHIVE_NAME"
tar -czf "$DIST_DIR/$ARCHIVE_NAME" ffmpeg-static-build/

echo ""
echo "✓ Build complete!"
echo "Archive created: $DIST_DIR/$ARCHIVE_NAME"
echo ""
echo "Next steps:"
echo "1. Create a GitHub release for tag v${FFMPEG_VERSION} in your beamcoder-ffmpeg-static repo"
echo "2. Upload $DIST_DIR/$ARCHIVE_NAME to the release"
echo "3. Update install_ffmpeg_static.js with the correct GITHUB_REPO if needed"
