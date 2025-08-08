#!/bin/bash

# Voice Chord Application Runner
# This script sets up the environment and runs the Voice Chord recognition application

echo "Voice Chord Recognition - Starting..."

# Check if required dependencies are available
check_dependency() {
    if ! command -v "$1" &> /dev/null; then
        echo "Error: $1 is not installed or not in PATH"
        echo "Please install the required dependencies:"
        echo "  - gjs (GNOME JavaScript)"
        echo "  - gtk4-devel"
        echo "  - gstreamer1-devel"
        echo "  - gstreamer1-plugins-base"
        echo "  - gstreamer1-plugins-good"
        echo "  - gstreamer1-plugins-bad"
        echo "  - fluidsynth (optional, for better MIDI support)"
        exit 1
    fi
}

# Check basic dependencies
check_dependency "gjs"

# Check FluidSynth availability
if command -v "fluidsynth" &> /dev/null; then
    echo "✓ FluidSynth found - Enhanced audio synthesis available"
    FLUIDSYNTH_AVAILABLE=true
else
    echo "⚠ FluidSynth not found - Using fallback audio synthesis"
    echo "  Install fluidsynth for better audio quality: sudo dnf install fluidsynth"
    FLUIDSYNTH_AVAILABLE=false
fi

# Check for SF2 soundfont file
if [ -f "Yamaha XG Sound Set.sf2" ]; then
    echo "✓ Yamaha XG Sound Set.sf2 found - High-quality instruments available"
else
    echo "⚠ SF2 soundfont not found - Using GM fallback instruments"
    echo "  Place your .sf2 file in this directory for better sound quality"
fi

# Kill any existing FluidSynth processes to prevent conflicts
if [ "$FLUIDSYNTH_AVAILABLE" = true ]; then
    pkill fluidsynth 2>/dev/null || true
    echo "✓ Cleaned up any existing FluidSynth processes"
fi

# Set environment variables
export GJS_PATH="$(pwd):$GJS_PATH"

# Load CSS styling
export GTK_THEME="Adwaita"

# Run the application
echo ""
echo "🎵 Starting Voice Chord Recognition application..."
echo "📋 Features enabled:"
echo "   • Voice chord detection"
echo "   • Real-time MIDI playback"
echo "   • Sequence recording and export"
if [ "$FLUIDSYNTH_AVAILABLE" = true ]; then
    echo "   • FluidSynth integration"
fi
echo ""
echo "📍 Make sure your microphone is working and has proper permissions."
echo "🎛️ The theme chooser is now available in the header bar menu."
echo ""

# Create a desktop entry if it doesn't exist in user applications
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/voice-chord.desktop"

if [ ! -f "$DESKTOP_FILE" ]; then
    mkdir -p "$DESKTOP_DIR"
    cp org.voicechord.VoiceChord.desktop "$DESKTOP_FILE"
    sed -i "s|Exec=gjs main.js|Exec=$(pwd)/run.sh|g" "$DESKTOP_FILE"
    echo "Desktop entry created at $DESKTOP_FILE"
fi

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    if [ "$FLUIDSYNTH_AVAILABLE" = true ]; then
        pkill fluidsynth 2>/dev/null || true
        echo "✓ FluidSynth processes terminated"
    fi
    echo "Application closed."
    exit 0
}

# Set up signal handlers for clean exit
trap cleanup INT TERM

# Run the main application
gjs main.js

# Clean up after normal exit
cleanup
