/*
  Aerostat Beam Coder - Node.js native bindings to FFmpeg.
  Copyright (C) 2019  Streampunk Media Ltd.

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.

  https://www.streampunk.media/ mailto:furnace@streampunk.media
  14 Ormiscaig, Aultbea, Achnasheen, IV22 2JJ  U.K.
*/

const os = require('os');
const fs = require('fs');
const util = require('util');
const https = require('https');
const cp = require('child_process');
const path = require('path');
const [ mkdir, access, rename, execFile, exec ] = // eslint-disable-line
  [ fs.mkdir, fs.access, fs.rename, cp.execFile, cp.exec ].map(util.promisify);

// FFmpeg version to use (matching the version used in install_ffmpeg.js)
const FFMPEG_VERSION = '5.1.4';

// GitHub repository with pre-built static libraries
const GITHUB_REPO = 'Lumen5/ffmpeg-static';
const GITHUB_BRANCH = 'main';

// Get the download URL for the repository archive
function getDownloadUrl() {
  return `https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.tar.gz`;
}

async function download(url, destPath, name) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${name} from ${url}...`);
    const file = fs.createWriteStream(destPath);
    let received = 0;
    let totalLength = 0;

    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        // Follow redirect
        return download(res.headers.location, destPath, name).then(resolve).catch(reject);
      }

      totalLength = +res.headers['content-length'] || 0;
      res.pipe(file);

      res.on('data', chunk => {
        received += chunk.length;
        if (totalLength > 0) {
          process.stdout.write(`Downloaded ${Math.floor(received * 100 / totalLength)}% of '${name}'.\r`);
        }
      });

      file.on('finish', () => {
        file.close();
        console.log(`\nDownloaded 100% of '${name}'. Total length ${received} bytes.`);
        resolve();
      });
    }).on('error', err => {
      fs.unlinkSync(destPath);
      reject(err);
    });

    file.on('error', err => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

async function extractTarGz(tarPath, destDir) {
  console.log(`Extracting ${tarPath} to ${destDir}...`);
  await exec(`tar -xzf ${tarPath} -C ${destDir}`);
  console.log('Extraction complete.');
}

async function downloadFFmpegStatic() {
  const ffmpegDir = path.join(__dirname, 'ffmpeg');
  const buildDir = path.join(ffmpegDir, 'ffmpeg-static-build');
  const tarPath = path.join(ffmpegDir, 'ffmpeg-static.tar.gz');
  const extractDir = path.join(ffmpegDir, 'ffmpeg-static-main');

  // Clean up previous installation
  if (fs.existsSync(ffmpegDir)) {
    console.log('Removing previous installation...');
    await exec(`rm -rf ${ffmpegDir}`);
  }

  // Create ffmpeg directory
  await mkdir(ffmpegDir).catch(e => {
    if (e.code === 'EEXIST') return;
    else throw e;
  });

  // Check if already downloaded - verify all required libraries exist
  // Note: Based on https://github.com/Lumen5/ffmpeg-static repo structure
  const requiredLibs = [
    'libavcodec.a',
    'libavdevice.a',
    'libavfilter.a',
    'libavformat.a',
    'libavutil.a',
    'libswresample.a',
    'libswscale.a'
  ];

  // libpostproc.a is optional - check if it exists but don't fail if missing
  const optionalLibs = ['libpostproc.a'];

  try {
    // Check all libraries exist
    for (const lib of requiredLibs) {
      await access(path.join(buildDir, 'lib', lib), fs.constants.R_OK);
    }
    console.log('FFmpeg static libraries already present.');
    return buildDir;
  } catch (err) {
    console.log('Downloading FFmpeg static libraries from GitHub...');
    // Clean up incomplete build directory if it exists
    if (fs.existsSync(buildDir)) {
      console.log('Removing incomplete installation...');
      await exec(`rm -rf ${buildDir}`);
    }
  }

  // Get download URL
  const downloadUrl = getDownloadUrl();
  console.log(`Downloading from: https://github.com/${GITHUB_REPO}`);

  // Download pre-built binaries from GitHub
  try {
    await download(downloadUrl, tarPath, 'ffmpeg-static repository');
  } catch (err) {
    console.error(`Failed to download FFmpeg static binaries from ${downloadUrl}`);
    console.error(`Please ensure https://github.com/${GITHUB_REPO} is accessible.`);
    throw err;
  }

  // Extract the archive
  console.log('Extracting FFmpeg static libraries...');
  await extractTarGz(tarPath, ffmpegDir);

  // Copy output directory contents to ffmpeg-static-build
  // The repo has structure: ffmpeg-static-main/output/{lib,include}
  // We need: ffmpeg-static-build/{lib,include}
  console.log('Setting up library directories...');

  const outputDir = path.join(extractDir, 'output');
  if (!fs.existsSync(outputDir)) {
    throw new Error(`Expected directory not found: ${outputDir}`);
  }

  // Create build directory
  await mkdir(buildDir).catch(e => {
    if (e.code === 'EEXIST') return;
    else throw e;
  });

  // Copy contents of output directory (lib and include) to ffmpeg-static-build
  await exec(`cp -r "${outputDir}"/* "${buildDir}"/`);

  // Verify all required libraries were copied
  try {
    for (const lib of requiredLibs) {
      await access(path.join(buildDir, 'lib', lib), fs.constants.R_OK);
    }
    console.log('FFmpeg static libraries installed successfully.');

    // Check for optional libraries
    for (const lib of optionalLibs) {
      try {
        await access(path.join(buildDir, 'lib', lib), fs.constants.R_OK);
        console.log(`  Optional library found: ${lib}`);
      } catch (err) {
        console.log(`  Optional library not found: ${lib} (skipping)`);
      }
    }
  } catch (err) {
    console.error('Installation failed: Not all required libraries were found.');
    console.error(`Expected libraries in: ${buildDir}/lib/`);
    throw err;
  }

  // Clean up temporary files
  console.log('Cleaning up...');
  if (fs.existsSync(tarPath)) {
    await exec(`rm ${tarPath}`);
  }
  if (fs.existsSync(extractDir)) {
    await exec(`rm -rf ${extractDir}`);
  }

  return buildDir;
}

async function win32() {
  console.log('Building static FFmpeg libraries on Windows is complex.');
  console.log('For Windows, consider using pre-built static libraries or use WSL/MSYS2.');
  console.log('This script focuses on Linux and macOS support.');
  process.exit(1);
}

async function linux() {
  console.log('Installing FFmpeg static libraries for Linux.');
  await downloadFFmpegStatic();
}

async function darwin() {
  console.log('Installing FFmpeg static libraries for macOS.');
  await downloadFFmpegStatic();
}

switch (os.platform()) {
case 'win32':
  if (os.arch() != 'x64') {
    console.error('Only 64-bit platforms are supported.');
    process.exit(1);
  } else {
    win32().catch(console.error);
  }
  break;
case 'linux':
  if (os.arch() != 'x64' && os.arch() != 'arm64') {
    console.error('Only 64-bit platforms are supported.');
    process.exit(1);
  } else {
    linux().catch(console.error);
  }
  break;
case 'darwin':
  if (os.arch() != 'x64' && os.arch() != 'arm64') {
    console.error('Only 64-bit platforms are supported.');
    process.exit(1);
  } else {
    darwin().catch(console.error);
  }
  break;
default:
  console.error(`Platform ${os.platform()} is not supported.`);
  break;
}
