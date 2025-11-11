#!/usr/bin/env python3

import re
import os
import glob

# List of FFmpeg symbol prefixes to replace
PREFIXES = [
    "av_",
    "avcodec_",
    "avdevice_",
    "avfilter_",
    "avformat_",
    "avutil_",
    "avio_",
    "avpriv_",
    "avsubtitle_",
    "ff_",
    "postproc_",
    "sws_",
    "swscale_",
    "swr_",
    "swresample_",
    "pp_",
]

def prefix_symbols_in_file(filepath):
    """Add ffmpeg_static_ prefix to all FFmpeg symbols in a file."""
    with open(filepath, 'r') as f:
        content = f.read()

    original_content = content

    # For each prefix, find and replace symbols
    for prefix in PREFIXES:
        # Match the prefix followed by alphanumeric/underscore characters
        # Use word boundaries to avoid replacing parts of larger identifiers
        pattern = r'\b(' + re.escape(prefix) + r'[a-zA-Z0-9_]+)\b'

        def replacer(match):
            symbol = match.group(1)
            # Don't prefix if already prefixed
            if symbol.startswith('ffmpeg_static_'):
                return symbol
            return 'ffmpeg_static_' + symbol

        content = re.sub(pattern, replacer, content)

    # Remove any double prefixes that might have occurred
    content = content.replace('ffmpeg_static_ffmpeg_static_', 'ffmpeg_static_')

    # Only write if content changed
    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

def main():
    print("Prefixing FFmpeg symbols in beamcoder source files...")

    # Find all source and header files
    patterns = ['src/*.cc', 'src/*.h', 'src/*.c', 'src/*.cpp']
    files = []
    for pattern in patterns:
        files.extend(glob.glob(pattern))

    modified_count = 0
    for filepath in files:
        if prefix_symbols_in_file(filepath):
            print(f"Modified: {filepath}")
            modified_count += 1

    print(f"\nSymbol prefixing complete! Modified {modified_count} files.")

if __name__ == '__main__':
    main()
