#!/bin/bash

echo "Testing basic FluidSynth playback..."

# Kill any existing FluidSynth processes
pkill fluidsynth 2>/dev/null || true
sleep 1

# Test 1: Direct FluidSynth with commands
echo "Test 1: Direct FluidSynth command test"
echo -e "noteon 0 60 100\nsleep 1000\nnoteoff 0 60\nquit" | fluidsynth -ni "Yamaha XG Sound Set.sf2" 2>/dev/null

echo ""
echo "Test 2: FluidSynth with ALSA raw audio"
# Start FluidSynth in background with ALSA
fluidsynth -a alsa -g 0.8 "Yamaha XG Sound Set.sf2" < /dev/null &
FLUID_PID=$!
sleep 3

echo "FluidSynth started with PID: $FLUID_PID"

# Try to send MIDI data directly via ALSA
if command -v amidi >/dev/null 2>&1; then
    echo "Trying ALSA raw MIDI..."
    # Find MIDI devices
    echo "Available MIDI devices:"
    amidi -l 2>/dev/null || echo "No raw MIDI devices found"
fi

# Clean up
kill $FLUID_PID 2>/dev/null || true

echo "Test complete."
