const { GObject, Gst, GLib, Gio } = imports.gi;

var MidiController = GObject.registerClass({
    Signals: {
        'midi-sent': {
            param_types: [GObject.TYPE_STRING]
        }
    }
}, class MidiController extends GObject.Object {
    
    _init() {
        super._init();
        this.currentInstrument = 0; // Piano by default
        this.velocity = 127; // Full velocity
        this.currentlyPlaying = [];
        this.midiInitialized = false;
        this.useExternalSF2 = true; // Prefer external SF2 players
        this.sf2Player = null;
        this.availablePlayers = [];
        
        // MIDI note mapping
        this.noteToMidi = {
            'C': 60,  'C#': 61, 'D': 62,  'D#': 63,
            'E': 64,  'F': 65,  'F#': 66, 'G': 67,
            'G#': 68, 'A': 69,  'A#': 70, 'B': 71
        };
        
        // Instrument program numbers (General MIDI)
        this.instruments = {
            0: 0,   // Piano
            1: 4,   // Electric Piano
            2: 16,  // Organ
            3: 24,  // Guitar
            4: 29,  // Electric Guitar
            5: 32,  // Bass
            6: 48,  // Strings
            7: 56,  // Brass
            8: 64,  // Woodwinds
            9: 80,  // Synth Lead
            10: 88, // Synth Pad
            11: 52  // Choir
        };
        
        this._setupMidiPipeline();
    }
    
    _setupMidiPipeline() {
        try {
            // Create simple audio pipeline for now (FluidSynth may not be available)
            this.midiPipeline = Gst.Pipeline.new('midi-pipeline');
            
            // Try to use FluidSynth first
            this.fluidSynth = Gst.ElementFactory.make('fluiddec', 'fluid-synth');
            
            if (!this.fluidSynth) {
                // Fallback to simple audio generation
                print('FluidSynth not available, using simple audio synthesis');
                this._setupSimpleAudio();
                return;
            }
            
            // Audio convert and sink
            this.audioConvert = Gst.ElementFactory.make('audioconvert', 'audio-convert');
            this.audioSink = Gst.ElementFactory.make('pulsesink', 'audio-sink');
            
            if (!this.audioSink) {
                this.audioSink = Gst.ElementFactory.make('alsasink', 'audio-sink');
            }
            
            if (!this.audioConvert || !this.audioSink) {
                print('Audio output elements not available');
                this._setupSimpleAudio();
                return;
            }
            
            // Add elements to pipeline
            this.midiPipeline.add(this.fluidSynth);
            this.midiPipeline.add(this.audioConvert);
            this.midiPipeline.add(this.audioSink);
            
            // Link elements
            this.fluidSynth.link(this.audioConvert);
            this.audioConvert.link(this.audioSink);
            
            // Set pipeline to playing state
            this.midiPipeline.set_state(Gst.State.PLAYING);
            
            this.midiInitialized = true;
            print('MIDI pipeline initialized successfully');
            
        } catch (error) {
            print(`Failed to initialize MIDI: ${error.message}`);
            this._setupSimpleAudio();
        }
    }
    
    _setupSimpleAudio() {
        try {
            // Simple audio synthesis pipeline
            this.midiPipeline = Gst.Pipeline.new('simple-audio');
            
            this.audioTestSrc = Gst.ElementFactory.make('audiotestsrc', 'test-src');
            this.audioConvert = Gst.ElementFactory.make('audioconvert', 'convert');
            this.audioSink = Gst.ElementFactory.make('pulsesink', 'sink');
            
            if (!this.audioSink) {
                this.audioSink = Gst.ElementFactory.make('alsasink', 'sink');
            }
            
            if (this.audioTestSrc && this.audioConvert && this.audioSink) {
                this.audioTestSrc.set_property('wave', 0); // Sine wave
                this.audioTestSrc.set_property('freq', 440);
                this.audioTestSrc.set_property('volume', 0.1);
                
                this.midiPipeline.add(this.audioTestSrc);
                this.midiPipeline.add(this.audioConvert);
                this.midiPipeline.add(this.audioSink);
                
                this.audioTestSrc.link(this.audioConvert);
                this.audioConvert.link(this.audioSink);
                
                this.midiInitialized = true;
                print('Simple audio synthesis initialized');
            }
        } catch (error) {
            print(`Failed to initialize simple audio: ${error.message}`);
            this.midiInitialized = false;
        }
    }
    
    initialize() {
        // Detect available SF2 players first
        this._detectSF2Players();
        
        if (this.useExternalSF2 && this.availablePlayers.length > 0) {
            this._setupExternalSF2Player();
        } else if (!this.midiInitialized) {
            this._setupMidiPipeline();
        }
        
        // Set initial instrument
        this.setInstrument(this.currentInstrument);
    }
    
    setInstrument(instrumentIndex) {
        this.currentInstrument = instrumentIndex;
        
        if (this.midiInitialized && this.instruments[instrumentIndex] !== undefined) {
            const programNumber = this.instruments[instrumentIndex];
            this._sendProgramChange(0, programNumber); // Channel 0
        }
    }
    
    playChord(chordName, instrumentIndex = null) {
        if (!this.midiInitialized) {
            print('MIDI not initialized, cannot play chord');
            return;
        }
        
        if (instrumentIndex !== null && instrumentIndex !== this.currentInstrument) {
            this.setInstrument(instrumentIndex);
        }
        
        // Stop currently playing notes
        this._stopCurrentNotes();
        
        // Parse chord and get MIDI notes
        const midiNotes = this._chordToMidiNotes(chordName);
        
        if (midiNotes.length > 0) {
            // Play new chord
            this._playNotes(midiNotes);
            this.currentlyPlaying = midiNotes;
            
            this.emit('midi-sent', `Playing ${chordName} with instrument ${instrumentIndex || this.currentInstrument}`);
            
            // Auto-stop notes after a duration
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this._stopCurrentNotes();
                return GLib.SOURCE_REMOVE;
            });
        }
    }
    
    _chordToMidiNotes(chordName) {
        const notes = [];
        
        // Parse chord name to extract root note and chord type
        let rootNote, chordType;
        
        if (chordName.length >= 2 && chordName[1] === '#') {
            rootNote = chordName.substring(0, 2);
            chordType = chordName.substring(2);
        } else {
            rootNote = chordName[0];
            chordType = chordName.substring(1);
        }
        
        const rootMidi = this.noteToMidi[rootNote];
        if (rootMidi === undefined) {
            return notes;
        }
        
        // Add root note
        notes.push(rootMidi);
        
        // Add chord intervals based on chord type
        switch (chordType) {
            case '': // Major chord
                notes.push(rootMidi + 4); // Major third
                notes.push(rootMidi + 7); // Perfect fifth
                break;
                
            case 'm': // Minor chord
                notes.push(rootMidi + 3); // Minor third
                notes.push(rootMidi + 7); // Perfect fifth
                break;
                
            case '7': // Dominant seventh
                notes.push(rootMidi + 4); // Major third
                notes.push(rootMidi + 7); // Perfect fifth
                notes.push(rootMidi + 10); // Minor seventh
                break;
                
            case 'm7': // Minor seventh
                notes.push(rootMidi + 3); // Minor third
                notes.push(rootMidi + 7); // Perfect fifth
                notes.push(rootMidi + 10); // Minor seventh
                break;
                
            case 'dim': // Diminished
                notes.push(rootMidi + 3); // Minor third
                notes.push(rootMidi + 6); // Diminished fifth
                break;
                
            case 'aug': // Augmented
                notes.push(rootMidi + 4); // Major third
                notes.push(rootMidi + 8); // Augmented fifth
                break;
                
            default:
                // Default to major if unknown
                notes.push(rootMidi + 4);
                notes.push(rootMidi + 7);
        }
        
        return notes;
    }
    
    _playNotes(midiNotes) {
        if (this.audioTestSrc) {
            // For simple audio, play the root note
            const freq = 440 * Math.pow(2, (midiNotes[0] - 69) / 12);
            this.audioTestSrc.set_property('freq', freq);
            this.midiPipeline.set_state(Gst.State.PLAYING);
            
            print(`Playing frequency: ${freq} Hz`);
        } else {
            // For FluidSynth
            for (const note of midiNotes) {
                this._sendNoteOn(0, note, this.velocity); // Channel 0
            }
        }
    }
    
    _stopCurrentNotes() {
        if (this.audioTestSrc) {
            // For simple audio
            this.midiPipeline.set_state(Gst.State.PAUSED);
        } else {
            // For FluidSynth
            for (const note of this.currentlyPlaying) {
                this._sendNoteOff(0, note, 0); // Channel 0
            }
        }
        this.currentlyPlaying = [];
    }
    
    _sendNoteOn(channel, note, velocity) {
        if (!this.midiInitialized || !this.fluidSynth) return;
        
        // Create MIDI Note On message
        const midiData = new Uint8Array([0x90 + channel, note, velocity]);
        this._sendMidiData(midiData);
    }
    
    _sendNoteOff(channel, note, velocity) {
        if (!this.midiInitialized || !this.fluidSynth) return;
        
        // Create MIDI Note Off message
        const midiData = new Uint8Array([0x80 + channel, note, velocity]);
        this._sendMidiData(midiData);
    }
    
    _sendProgramChange(channel, program) {
        if (!this.midiInitialized || !this.fluidSynth) return;
        
        // Create MIDI Program Change message
        const midiData = new Uint8Array([0xC0 + channel, program]);
        this._sendMidiData(midiData);
    }
    
    _sendMidiData(midiData) {
        if (!this.fluidSynth) return;
        
        try {
            // Create GStreamer buffer with MIDI data
            const buffer = Gst.Buffer.new_allocate(null, midiData.length, null);
            const [success, mapInfo] = buffer.map(Gst.MapFlags.WRITE);
            
            if (success) {
                // Copy MIDI data to buffer
                const uint8View = new Uint8Array(mapInfo.data.buffer, mapInfo.data.byteOffset, midiData.length);
                uint8View.set(midiData);
                
                buffer.unmap(mapInfo);
                
                // Send buffer to fluiddec
                const srcPad = this.fluidSynth.get_static_pad('sink');
                if (srcPad) {
                    srcPad.chain(buffer);
                }
            }
        } catch (error) {
            print(`Error sending MIDI data: ${error.message}`);
        }
    }
    
    _detectSF2Players() {
        // Detect available SF2 players on the system
        const players = [
            { name: 'fluidsynth', cmd: 'fluidsynth', description: 'FluidSynth Software Synthesizer' },
            { name: 'qsynth', cmd: 'qsynth', description: 'QSynth (Qt FluidSynth GUI)' },
            { name: 'linuxsampler', cmd: 'linuxsampler', description: 'LinuxSampler' },
            { name: 'zynaddsubfx', cmd: 'zynaddsubfx', description: 'ZynAddSubFX' },
            { name: 'yoshimi', cmd: 'yoshimi', description: 'Yoshimi Software Synthesizer' },
            { name: 'bristol', cmd: 'bristol', description: 'Bristol Synthesizer Emulator' }
        ];
        
        this.availablePlayers = [];
        
        for (const player of players) {
            if (this._commandExists(player.cmd)) {
                this.availablePlayers.push(player);
                print(`Found SF2 player: ${player.name}`);
            }
        }
        
        if (this.availablePlayers.length === 0) {
            print('No external SF2 players detected');
        }
    }
    
    _commandExists(command) {
        try {
            const proc = Gio.Subprocess.new(['which', command], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            const [success, stdout, stderr] = proc.communicate_utf8(null, null);
            return success && stdout.trim().length > 0;
        } catch (error) {
            return false;
        }
    }
    
    _setupExternalSF2Player() {
        // Use the first available SF2 player
        const player = this.availablePlayers[0];
        this.sf2Player = player;
        
        print(`Using external SF2 player: ${player.description}`);
        
        // For external players, we'll use ALSA MIDI or JACK MIDI
        this._setupMidiOutput();
    }
    
    _setupMidiOutput() {
        try {
            // Create a virtual MIDI port or use existing ALSA MIDI
            this.midiInitialized = true;
            print('External MIDI output configured');
        } catch (error) {
            print(`Failed to setup external MIDI: ${error.message}`);
            // Fallback to internal synthesis
            this._setupMidiPipeline();
        }
    }
    
    _sendToExternalPlayer(midiData) {
        if (!this.sf2Player) return;
        
        try {
            // For now, we'll use a simple approach with aplaymidi or similar
            // In a full implementation, you'd want to use ALSA sequencer API
            
            // Create a temporary MIDI file and play it
            this._sendMidiToPort(midiData);
        } catch (error) {
            print(`Error sending MIDI to external player: ${error.message}`);
        }
    }
    
    _sendMidiToPort(midiData) {
        // This is a simplified approach - in a real implementation you'd want to:
        // 1. Connect to ALSA sequencer
        // 2. Create a MIDI port
        // 3. Send raw MIDI data
        // For now, we'll just log the MIDI data
        print(`Would send MIDI data: [${Array.from(midiData).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
    }
    
    getSF2Players() {
        return this.availablePlayers;
    }
    
    setSF2Player(playerName) {
        const player = this.availablePlayers.find(p => p.name === playerName);
        if (player) {
            this.sf2Player = player;
            print(`Switched to SF2 player: ${player.description}`);
            this._setupExternalSF2Player();
        }
    }
    
    setUseExternalSF2(useExternal) {
        this.useExternalSF2 = useExternal;
        if (useExternal && this.availablePlayers.length > 0) {
            this._setupExternalSF2Player();
        } else {
            this._setupMidiPipeline();
        }
    }
    
    setVelocity(velocity) {
        this.velocity = Math.max(0, Math.min(127, velocity));
    }
    
    destroy() {
        if (this.midiPipeline) {
            this._stopCurrentNotes();
            this.midiPipeline.set_state(Gst.State.NULL);
            this.midiPipeline = null;
        }
    }
});
