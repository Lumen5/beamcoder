#!/bin/bash

set -e

echo "Prefixing FFmpeg symbols in beamcoder source files..."

# List of FFmpeg symbol prefixes to replace
# These are the common prefixes used by FFmpeg libraries
PREFIXES=(
  "av_"
  "avcodec_"
  "avdevice_"
  "avfilter_"
  "avformat_"
  "avutil_"
  "avio_"
  "avpriv_"
  "avsubtitle_"
  "ff_"
  "postproc_"
  "sws_"
  "swscale_"
  "swr_"
  "swresample_"
  "pp_"
)

# Find all source and header files
SOURCE_FILES=$(find src -type f \( -name "*.cc" -o -name "*.h" -o -name "*.c" -o -name "*.cpp" \))

# For each prefix, replace it in all source files
for prefix in "${PREFIXES[@]}"; do
  echo "Processing prefix: ${prefix}"

  for file in $SOURCE_FILES; do
    # Use sed to replace symbols
    # Match word boundaries to avoid replacing parts of words
    # Skip symbols that are already prefixed
    # Note: macOS sed requires '' after -i for in-place editing
    sed -i '' -E "s/\b(${prefix}[a-zA-Z0-9_]+)\b/ffmpeg_static_\1/g" "$file"

    # Remove symbols that got double-prefixed (already had ffmpeg_static_)
    sed -i '' -E "s/ffmpeg_static_ffmpeg_static_/ffmpeg_static_/g" "$file"
  done
done

echo "Symbol prefixing complete!"
echo "Modified files:"
echo "$SOURCE_FILES"
