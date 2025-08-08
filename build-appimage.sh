#!/bin/bash

# Voice Chord AppImage build script
set -e

APPDIR="VoiceChord.AppDir"
VERSION="1.0.0"

echo "Building Voice Chord AppImage v${VERSION}..."

# Clean previous builds
rm -rf "${APPDIR}"
rm -f VoiceChord-*.AppImage

# Create AppImage directory structure
mkdir -p "${APPDIR}/usr/bin"
mkdir -p "${APPDIR}/usr/share/voice-chord"
mkdir -p "${APPDIR}/usr/share/applications"
mkdir -p "${APPDIR}/usr/share/icons/hicolor/scalable/apps"
mkdir -p "${APPDIR}/usr/lib"

# Copy application files
cp main.js "${APPDIR}/usr/share/voice-chord/"
cp audioProcessor.js "${APPDIR}/usr/share/voice-chord/"
cp chordDetector.js "${APPDIR}/usr/share/voice-chord/"
cp midiController.js "${APPDIR}/usr/share/voice-chord/"
cp sequencer.js "${APPDIR}/usr/share/voice-chord/"
cp fluidsynthController.js "${APPDIR}/usr/share/voice-chord/"
cp enhancedAudioProcessor.js "${APPDIR}/usr/share/voice-chord/"
cp enhancedDetector.js "${APPDIR}/usr/share/voice-chord/"
cp enhancedSequencer.js "${APPDIR}/usr/share/voice-chord/"
cp style.css "${APPDIR}/usr/share/voice-chord/"
cp "Yamaha XG Sound Set.sf2" "${APPDIR}/usr/share/voice-chord/"

# Create AppRun script
cat > "${APPDIR}/AppRun" << 'EOF'
#!/bin/bash
HERE="$(dirname "$(readlink -f "${0}")")"
export PATH="${HERE}/usr/bin:${PATH}"
export LD_LIBRARY_PATH="${HERE}/usr/lib:${LD_LIBRARY_PATH}"
export XDG_DATA_DIRS="${HERE}/usr/share:${XDG_DATA_DIRS}"

cd "${HERE}/usr/share/voice-chord"
exec gjs main.js "$@"
EOF
chmod +x "${APPDIR}/AppRun"

# Create launcher script
cat > "${APPDIR}/usr/bin/voice-chord" << 'EOF'
#!/bin/bash
HERE="$(dirname "$(readlink -f "${0}")")"
cd "${HERE}/../share/voice-chord"
exec gjs main.js "$@"
EOF
chmod +x "${APPDIR}/usr/bin/voice-chord"

# Copy desktop file and icon
cp org.voicechord.VoiceChord.desktop "${APPDIR}/usr/share/applications/"
cp org.voicechord.VoiceChord.desktop "${APPDIR}/"

# Copy the actual icon
cp icon.svg "${APPDIR}/org.voicechord.VoiceChord.svg"
cp icon.svg "${APPDIR}/voice-chord.svg"
cp icon.svg "${APPDIR}/usr/share/icons/hicolor/scalable/apps/org.voicechord.VoiceChord.svg"

# Download AppImageTool if not present
if [ ! -f "appimagetool-x86_64.AppImage" ]; then
    echo "Downloading AppImageTool..."
    wget -q "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
    chmod +x appimagetool-x86_64.AppImage
fi

# Build AppImage
echo "Building AppImage..."
ARCH=x86_64 VERSION="${VERSION}" ./appimagetool-x86_64.AppImage "${APPDIR}" "VoiceChord-${VERSION}-x86_64.AppImage"

echo "AppImage built successfully: VoiceChord-${VERSION}-x86_64.AppImage"
echo ""
echo "To test the AppImage:"
echo "  ./VoiceChord-${VERSION}-x86_64.AppImage"
echo ""
echo "To install system-wide:"
echo "  sudo cp VoiceChord-${VERSION}-x86_64.AppImage /usr/local/bin/voice-chord"
echo "  sudo chmod +x /usr/local/bin/voice-chord"
