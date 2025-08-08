# Voice Chord Recognition - Enhanced Edition

A real-time voice chord recognition application for Linux GNOME that detects **individual notes**, **instruments**, and **chords** from your voice, converting them to MIDI output with advanced sequencing capabilities.

## ✨ Enhanced Features

### 🎵 Advanced Audio Analysis
- **Individual Note Detection**: Real-time detection of musical notes (C, D, E, F, G, A, B with sharps/flats)
- **Instrument Recognition**: Identifies instrument timbres (Piano, Guitar, Violin, Flute, Trumpet, Saxophone, Clarinet, Voice)
- **Smart Chord Construction**: Automatically builds chords from detected note combinations
- **Confidence Levels**: Shows detection confidence percentages for notes and instruments
- **FFT-based Analysis**: Uses Fast Fourier Transform for accurate frequency analysis

### 🎼 Core Features
- **Real-time Chord Detection**: Analyzes audio input from your microphone to detect chord progressions
- **MIDI Conversion**: Converts detected notes and chords to MIDI with selectable instruments
- **Enhanced Visual Display**: Shows current note, detected instrument, active notes, and constructed chords
- **Audio Level Monitoring**: Real-time audio input level indicator with waveform analysis
- **Multiple MIDI Instruments**: Choose from 12 different FluidSynth instruments
- **Built-in Sequencer**: Record and playback chord sequences with precise timing
- **MIDI Export**: Save your detected chord progressions as standard MIDI files

## Requirements

### System Requirements
- Linux distribution with GNOME desktop environment
- PipeWire, PulseAudio, or ALSA audio system
- Microphone input

### Dependencies
Install the following packages using your distribution's package manager:

#### Fedora/RHEL:
```bash
sudo dnf install gjs gtk4-devel gstreamer1-devel gstreamer1-plugins-base \
    gstreamer1-plugins-good gstreamer1-plugins-bad gstreamer1-plugins-ugly \
    fluidsynth fluidsynth-soundfont-default
```

#### Ubuntu/Debian:
```bash
sudo apt install gjs libgtk-4-dev gstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
    gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly fluidsynth fluid-soundfont-gm
```

#### Arch Linux:
```bash
sudo pacman -S gjs gtk4 gstreamer gst-plugins-base gst-plugins-good \
    gst-plugins-bad gst-plugins-ugly fluidsynth soundfont-fluid
```

## Installation

1. **Clone or download** this project to your desired location
2. **Navigate** to the project directory:
   ```bash
   cd voice-chord
   ```
3. **Make the run script executable** (if not already):
   ```bash
   chmod +x run.sh
   ```

## Usage

### Starting the Application

Run the application using the provided script:
```bash
./run.sh
```

Or directly with GJS:
```bash
gjs main.js
```

### Using the Application

1. **Start Recording**: Click the "Start Recording" button to begin audio input from your microphone
2. **Sing or Hum**: Perform chord progressions or individual chords with your voice
3. **View Chords**: The detected chord will appear in large text in the "Current Chord" section
4. **Select Instrument**: Choose your preferred MIDI instrument from the dropdown menu
5. **Monitor Audio**: Watch the audio level bar to ensure proper input levels

### Sequencer Features

1. **Record Sequences**: 
   - Click "Record Sequence" to start recording chord changes
   - Perform your chord progression while recording
   - Click again to stop recording

2. **Playback**:
   - Click "Play" to replay your recorded sequence
   - Use "Stop" to halt playback
   - "Clear" removes all recorded events

3. **Sequence Display**: View your recorded chord progression with timestamps in the text area

### Tips for Best Results

- **Clear Voice**: Sing or hum chords clearly with distinct note separation
- **Proper Distance**: Keep a consistent distance from your microphone (6-12 inches)
- **Audio Levels**: Maintain moderate input levels - not too quiet or too loud
- **Room Acoustics**: Use in a quiet environment with minimal background noise
- **Chord Quality**: Major and minor chords work best; complex jazz chords may require adjustment

## Chord Detection

The application recognizes:
- **Major chords**: C, D, E, F, G, A, B, etc.
- **Minor chords**: Cm, Dm, Em, Fm, Gm, Am, Bm, etc.
- **Seventh chords**: C7, Dm7, Em7, F7, G7, Am7, etc.
- **Diminished chords**: Cdim, Ddim, etc.
- **Augmented chords**: Caug, Daug, etc.

## MIDI Instruments

Available instruments:
1. Piano
2. Electric Piano
3. Organ
4. Guitar
5. Electric Guitar
6. Bass
7. Strings
8. Brass
9. Woodwinds
10. Synth Lead
11. Synth Pad
12. Choir

## Troubleshooting

### No Audio Input
- Check microphone permissions for the application
- Verify microphone is working with other applications
- Try adjusting input levels in system audio settings

### No MIDI Sound
- Install FluidSynth and soundfonts as listed in dependencies
- Check audio output settings
- Verify PulseAudio/PipeWire is working correctly

### Chord Detection Issues
- Ensure you're singing/humming clearly
- Try adjusting microphone input levels
- Experiment with different distances from the microphone
- Practice with simple major and minor chords first

### Performance Issues
- Close other audio applications
- Ensure system has adequate CPU resources
- Try reducing other system load

## Development

### File Structure
- `main.js` - Main application and GUI
- `audioProcessor.js` - GStreamer audio input pipeline
- `chordDetector.js` - FFT analysis and chord recognition
- `midiController.js` - MIDI output and instrument control
- `sequencer.js` - Chord sequence recording and playback
- `style.css` - Application styling
- `run.sh` - Launch script

### Extending the Application

The modular design allows for easy extensions:
- Add new chord types in `chordDetector.js`
- Implement additional instruments in `midiController.js`
- Enhance the sequencer with more features
- Add export formats for popular DAWs

## License

This project is open source. Feel free to modify and distribute according to your needs.

## Contributing

Contributions are welcome! Areas for improvement:
- Enhanced chord detection algorithms
- Additional MIDI instruments and effects
- Better UI/UX design
- Export to standard MIDI files
- Integration with DAW software
- Mobile/tablet support

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Verify all dependencies are installed correctly
3. Test with different audio settings
4. Check system audio permissions
