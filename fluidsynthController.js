#!/usr/bin/env gjs

const { GLib, Gio } = imports.gi;

// Import platform-specific GioUnix for newer GJS versions
try {
    imports.gi.versions.GioUnix = '2.0';
    const { GioUnix } = imports.gi;
    var UnixOutputStream = GioUnix.OutputStream;
} catch (error) {
    // Fallback to older Gio.UnixOutputStream if GioUnix is not available
    var UnixOutputStream = Gio.UnixOutputStream;
}

var FluidSynthController = class FluidSynthController {
    constructor() {
        this.fluidProcess = null;
        this.soundfontPath = null;
        this.instruments = [];
        this.currentInstrument = 0;
        this.isConnected = false;
        
        // Yamaha XG Extended GM instrument names
        this.gmInstruments = [
            // Piano (0-7)
            '001: Acoustic Grand Piano', '002: Bright Acoustic Piano', '003: Electric Grand Piano', '004: Honky-tonk Piano',
            '005: Electric Piano 1', '006: Electric Piano 2', '007: Harpsichord', '008: Clavi',
            // Chromatic Percussion (8-15)
            '009: Celesta', '010: Glockenspiel', '011: Music Box', '012: Vibraphone',
            '013: Marimba', '014: Xylophone', '015: Tubular Bells', '016: Dulcimer',
            // Organ (16-23)
            '017: Drawbar Organ', '018: Percussive Organ', '019: Rock Organ', '020: Church Organ',
            '021: Reed Organ', '022: Accordion', '023: Harmonica', '024: Tango Accordion',
            // Guitar (24-31)
            '025: Acoustic Guitar (nylon)', '026: Acoustic Guitar (steel)', '027: Electric Guitar (jazz)', '028: Electric Guitar (clean)',
            '029: Electric Guitar (muted)', '030: Overdriven Guitar', '031: Distortion Guitar', '032: Guitar Harmonics',
            // Bass (32-39)
            '033: Acoustic Bass', '034: Electric Bass (finger)', '035: Electric Bass (pick)', '036: Fretless Bass',
            '037: Slap Bass 1', '038: Slap Bass 2', '039: Synth Bass 1', '040: Synth Bass 2',
            // Strings (40-47)
            '041: Violin', '042: Viola', '043: Cello', '044: Contrabass',
            '045: Tremolo Strings', '046: Pizzicato Strings', '047: Orchestral Harp', '048: Timpani',
            // Ensemble (48-55)
            '049: String Ensemble 1', '050: String Ensemble 2', '051: SynthStrings 1', '052: SynthStrings 2',
            '053: Choir Aahs', '054: Voice Oohs', '055: Synth Voice', '056: Orchestra Hit',
            // Brass (56-63)
            '057: Trumpet', '058: Trombone', '059: Tuba', '060: Muted Trumpet',
            '061: French Horn', '062: Brass Section', '063: SynthBrass 1', '064: SynthBrass 2',
            // Reed (64-71)
            '065: Soprano Sax', '066: Alto Sax', '067: Tenor Sax', '068: Baritone Sax',
            '069: Oboe', '070: English Horn', '071: Bassoon', '072: Clarinet',
            // Pipe (72-79)
            '073: Piccolo', '074: Flute', '075: Recorder', '076: Pan Flute',
            '077: Blown Bottle', '078: Shakuhachi', '079: Whistle', '080: Ocarina',
            // Synth Lead (80-87)
            '081: Lead 1 (square)', '082: Lead 2 (sawtooth)', '083: Lead 3 (calliope)', '084: Lead 4 (chiff)',
            '085: Lead 5 (charang)', '086: Lead 6 (voice)', '087: Lead 7 (fifths)', '088: Lead 8 (bass + lead)',
            // Synth Pad (88-95)
            '089: Pad 1 (new age)', '090: Pad 2 (warm)', '091: Pad 3 (polysynth)', '092: Pad 4 (choir)',
            '093: Pad 5 (bowed)', '094: Pad 6 (metallic)', '095: Pad 7 (halo)', '096: Pad 8 (sweep)',
            // Synth Effects (96-103)
            '097: FX 1 (rain)', '098: FX 2 (soundtrack)', '099: FX 3 (crystal)', '100: FX 4 (atmosphere)',
            '101: FX 5 (brightness)', '102: FX 6 (goblins)', '103: FX 7 (echoes)', '104: FX 8 (sci-fi)',
            // Ethnic (104-111)
            '105: Sitar', '106: Banjo', '107: Shamisen', '108: Koto',
            '109: Kalimba', '110: Bag pipe', '111: Fiddle', '112: Shanai',
            // Percussive (112-119)
            '113: Tinkle Bell', '114: Agogo', '115: Steel Drums', '116: Woodblock',
            '117: Taiko Drum', '118: Melodic Tom', '119: Synth Drum', '120: Reverse Cymbal',
            // Sound Effects (120-127)
            '121: Guitar Fret Noise', '122: Breath Noise', '123: Seashore', '124: Bird Tweet',
            '125: Telephone Ring', '126: Helicopter', '127: Applause', '128: Gunshot'
        ];
    }
    
    async initialize(soundfontPath = null) {
        this.soundfontPath = soundfontPath || this._findSoundfont();
        
        if (!this.soundfontPath) {
            console.log('No soundfont found, using GM instrument names');
            this.instruments = this.gmInstruments;
            return false;
        }
        
        console.log(`Initializing FluidSynth with soundfont: ${this.soundfontPath}`);
        
        try {
            await this._startFluidSynth();
            await this._loadInstruments();
            return true;
        } catch (error) {
            console.error('Failed to initialize FluidSynth:', error.message);
            this.instruments = this.gmInstruments;
            return false;
        }
    }
    
    _findSoundfont() {
        const currentDir = GLib.get_current_dir();
        const possiblePaths = [
            GLib.build_filenamev([currentDir, 'Yamaha XG Sound Set.sf2']),
            GLib.build_filenamev([currentDir, 'soundfont.sf2']),
            GLib.build_filenamev([currentDir, 'default.sf2']),
        ];
        
        for (const path of possiblePaths) {
            if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
                return path;
            }
        }
        
        return null;
    }
    
    async _startFluidSynth() {
        return new Promise((resolve, reject) => {
            try {
                // Kill any existing FluidSynth process
                this._killExistingFluidSynth();
                
                console.log('FluidSynth will use direct command execution (the proven method)');
                
                // Test that FluidSynth works with our soundfont
                const testCommand = `echo -e "gain 5\\nnoteon 0 60 50\\nsleep 200\\nnoteoff 0 60\\nquit" | fluidsynth -a pulseaudio "${this.soundfontPath}" >/dev/null 2>&1`;
                
                try {
                    GLib.spawn_command_line_async(testCommand);
                    console.log('FluidSynth test command executed');
                } catch (error) {
                    console.log('FluidSynth test failed:', error.message);
                }
                
                // We don't maintain a persistent process - instead use the echo method
                this.fluidProcess = null;
                this.stdinStream = null;
                
                // Wait a moment then mark as ready
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                    this.isConnected = true;
                    console.log('FluidSynth ready for command execution');
                    resolve();
                    return GLib.SOURCE_REMOVE;
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    _killExistingFluidSynth() {
        try {
            // Kill any existing FluidSynth processes
            GLib.spawn_command_line_sync('pkill fluidsynth');
        } catch (error) {
            // Ignore errors - process might not exist
        }
    }
    
    async _loadInstruments() {
        try {
            // For Yamaha XG Sound Set, we know it follows GM standard with extensions
            // Try to detect if this is specifically the Yamaha XG soundfont
            if (this.soundfontPath && this.soundfontPath.includes('Yamaha XG')) {
                console.log('Detected Yamaha XG Sound Set - using extended GM instrument list');
                this.instruments = this.gmInstruments;
                return;
            }
            
            // Try alternative method to get instrument info
            console.log('Attempting to load instruments from soundfont...');
            
            // Use sf2info if available (part of libsndfile-tools)
            try {
                const [success, stdout] = GLib.spawn_command_line_sync(`sf2info "${this.soundfontPath}"`);
                if (success) {
                    const output = new TextDecoder().decode(stdout);
                    this.instruments = this._parseSf2Info(output);
                    if (this.instruments.length > 0) {
                        console.log(`Loaded ${this.instruments.length} instruments using sf2info`);
                        return;
                    }
                }
            } catch (error) {
                console.log('sf2info not available, trying FluidSynth method...');
            }
            
            // Fallback: Try FluidSynth interactive mode with timeout
            try {
                const [success, stdout] = GLib.spawn_command_line_sync(
                    `timeout 3s bash -c 'echo -e "fonts\\nquit" | fluidsynth -i "${this.soundfontPath}" 2>/dev/null'`
                );
                
                if (success) {
                    const output = new TextDecoder().decode(stdout);
                    this.instruments = this._parseFluidSynthFonts(output);
                    if (this.instruments.length > 0) {
                        console.log(`Loaded ${this.instruments.length} instruments from FluidSynth`);
                        return;
                    }
                }
            } catch (error) {
                console.log('FluidSynth instrument detection failed:', error.message);
            }
            
            // Final fallback: Use GM names
            console.log('Using standard GM instrument names as fallback');
            this.instruments = this.gmInstruments;
            
        } catch (error) {
            console.error('Error loading instruments:', error.message);
            this.instruments = this.gmInstruments;
        }
    }
    
    _parseInstrumentList(output) {
        const instruments = [];
        const lines = output.split('\n');
        
        for (const line of lines) {
            // Look for instrument definition lines
            // Format typically: "000-000 Piano 1"
            const match = line.match(/^\d{3}-\d{3}\s+(.+)$/);
            if (match) {
                instruments.push(match[1].trim());
            }
        }
        
        return instruments;
    }
    
    _parseSf2Info(output) {
        const instruments = [];
        const lines = output.split('\n');
        
        for (const line of lines) {
            // Look for instrument lines in sf2info output
            if (line.includes('Instrument:') || line.includes('instrument:')) {
                const parts = line.split(':');
                if (parts.length > 1) {
                    const instrumentName = parts[1].trim();
                    if (instrumentName && !instruments.includes(instrumentName)) {
                        instruments.push(instrumentName);
                    }
                }
            }
        }
        
        return instruments;
    }
    
    _parseFluidSynthFonts(output) {
        const instruments = [];
        const lines = output.split('\n');
        
        for (const line of lines) {
            // Look for soundfont information in fonts command output
            if (line.includes('bank') || line.includes('preset')) {
                // Try to extract instrument names from FluidSynth fonts output
                const match = line.match(/\s+(\S.*\S)\s*$/);
                if (match) {
                    const instrumentName = match[1].trim();
                    if (instrumentName && !instruments.includes(instrumentName)) {
                        instruments.push(instrumentName);
                    }
                }
            }
        }
        
        return instruments;
    }
    
    getInstruments() {
        return this.instruments;
    }
    
    setInstrument(instrumentIndex, channel = 0) {
        this.currentInstrument = instrumentIndex;
        
        if (!this.isConnected) {
            console.log(`Set instrument ${instrumentIndex} (${this.instruments[instrumentIndex]}) - FluidSynth not connected`);
            return;
        }
        
        try {
            // Send program change command to FluidSynth via MIDI
            const command = `prog ${channel} ${instrumentIndex}`;
            this._sendFluidCommand(command);
            console.log(`Set instrument ${instrumentIndex} (${this.instruments[instrumentIndex]})`);
        } catch (error) {
            console.error('Error setting instrument:', error.message);
        }
    }
    
    playChord(chordNotes, velocity = 100, channel = 0, duration = 1000) {
        if (!this.isConnected) {
            console.log('FluidSynth not connected');
            return;
        }
        
        try {
            // Build a single FluidSynth command with all notes like the working manual test
            let fluidCommands = 'gain 5\n';
            
            // IMPORTANT: Set the current instrument before playing
            if (this.currentInstrument !== undefined) {
                fluidCommands += `prog ${channel} ${this.currentInstrument}\n`;
            }
            
            // Add all note-on commands
            for (const note of chordNotes) {
                fluidCommands += `noteon ${channel} ${note} ${velocity}\n`;
            }
            
            // Add sleep for specified duration
            fluidCommands += `sleep ${duration}\n`;
            
            // Add all note-off commands
            for (const note of chordNotes) {
                fluidCommands += `noteoff ${channel} ${note}\n`;
            }
            
            fluidCommands += 'quit';
            
            // Write commands to temporary script file
            const scriptPath = '/tmp/fluidsynth_chord.sh';
            const scriptContent = `#!/bin/bash\ncd "${GLib.get_current_dir()}"\necho -e "${fluidCommands}" | fluidsynth -a pulseaudio "${this.soundfontPath}"`;
            
            try {
                GLib.file_set_contents(scriptPath, scriptContent);
                GLib.spawn_command_line_sync(`chmod +x ${scriptPath}`);
                
                GLib.spawn_command_line_async(scriptPath);
                console.log(`Playing chord: ${chordNotes.join(',')} for ${duration}ms`);
            } catch (scriptError) {
                console.log('FluidSynth script execution failed:', scriptError.message);
                // Fallback to direct command
                const fallbackCommand = `/home/david/voice-chord/test_audio.sh`;
                GLib.spawn_command_line_async(fallbackCommand);
            }
            
        } catch (error) {
            console.error('Error playing chord:', error.message);
        }
    }
    
    // Enhanced method for playing multiple notes with precise timing
    playNotes(notes, velocity = 100, channel = 0, duration = 500) {
        if (!this.isConnected) {
            console.log('FluidSynth not connected');
            return;
        }
        
        try {
            let fluidCommands = 'gain 5\n';
            
            // IMPORTANT: Set the current instrument before playing
            if (this.currentInstrument !== undefined) {
                fluidCommands += `prog ${channel} ${this.currentInstrument}\n`;
            }
            
            // Add all note-on commands
            for (const note of notes) {
                fluidCommands += `noteon ${channel} ${note} ${velocity}\n`;
            }
            
            // Add sleep for specified duration
            fluidCommands += `sleep ${duration}\n`;
            
            // Add all note-off commands
            for (const note of notes) {
                fluidCommands += `noteoff ${channel} ${note}\n`;
            }
            
            fluidCommands += 'quit';
            
            // Execute command for melody playback
            const fullCommand = `echo -e "${fluidCommands}" | fluidsynth -a pulseaudio "${this.soundfontPath}" &`;
            GLib.spawn_command_line_async(fullCommand);
            
            console.log(`Playing notes: [${notes.join(', ')}] for ${duration}ms`);
            
        } catch (error) {
            console.error('Error playing notes:', error.message);
        }
    }
    
    // Method to start notes without automatic stop (for sequence playback)
    startNotes(notes, velocity = 100, channel = 0) {
        if (!this.isConnected) {
            console.log('FluidSynth not connected');
            return;
        }
        
        try {
            let fluidCommands = 'gain 5\n';
            
            // Add all note-on commands
            for (const note of notes) {
                fluidCommands += `noteon ${channel} ${note} ${velocity}\n`;
            }
            
            fluidCommands += 'quit';
            
            const fullCommand = `echo -e "${fluidCommands}" | fluidsynth -a pulseaudio "${this.soundfontPath}" &`;
            GLib.spawn_command_line_async(fullCommand);
            
            console.log(`Started notes: [${notes.join(', ')}]`);
            
        } catch (error) {
            console.error('Error starting notes:', error.message);
        }
    }
    
    // Method to stop specific notes
    stopNotes(notes, channel = 0) {
        if (!this.isConnected) {
            console.log('FluidSynth not connected');
            return;
        }
        
        try {
            let fluidCommands = 'gain 5\n';
            
            // Add all note-off commands
            for (const note of notes) {
                fluidCommands += `noteoff ${channel} ${note}\n`;
            }
            
            fluidCommands += 'quit';
            
            const fullCommand = `echo -e "${fluidCommands}" | fluidsynth -a pulseaudio "${this.soundfontPath}" &`;
            GLib.spawn_command_line_async(fullCommand);
            
            console.log(`Stopped notes: [${notes.join(', ')}]`);
            
        } catch (error) {
            console.error('Error stopping notes:', error.message);
        }
    }
    
    playNote(note, velocity = 100, channel = 0, duration = 1000) {
        if (!this.isConnected) {
            console.log('FluidSynth not connected');
            return;
        }
        
        try {
            this._sendFluidCommand(`noteon ${channel} ${note} ${velocity}`);
            
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
                this._sendFluidCommand(`noteoff ${channel} ${note}`);
                return GLib.SOURCE_REMOVE;
            });
        } catch (error) {
            console.error('Error playing note:', error.message);
        }
    }
    
    _sendFluidCommand(command) {
        if (!this.isConnected) {
            return;
        }
        
        try {
            this._sendDirectCommand(command);
        } catch (error) {
            console.error('Error sending FluidSynth command:', error.message);
        }
    }
    
    _sendDirectCommand(command) {
        try {
            // Use the echo method that we know works from testing
            let fluidCommand = '';
            
            if (command.startsWith('prog')) {
                const parts = command.split(' ');
                if (parts.length >= 3) {
                    const channel = parseInt(parts[1]);
                    const program = parseInt(parts[2]);
                    fluidCommand = `echo -e "gain 5\\nprog ${channel} ${program}\\nquit" | fluidsynth -a pulseaudio "${this.soundfontPath}" >/dev/null`;
                }
            } else if (command.startsWith('noteon')) {
                const parts = command.split(' ');
                if (parts.length >= 4) {
                    const channel = parseInt(parts[1]);
                    const note = parseInt(parts[2]);
                    const velocity = parseInt(parts[3]);
                    fluidCommand = `echo -e "gain 5\\nnoteon ${channel} ${note} ${velocity}\\nquit" | fluidsynth -a pulseaudio "${this.soundfontPath}"`;
                }
            } else if (command.startsWith('noteoff')) {
                const parts = command.split(' ');
                if (parts.length >= 3) {
                    const channel = parseInt(parts[1]);
                    const note = parseInt(parts[2]);
                    fluidCommand = `echo -e "gain 5\\nnoteoff ${channel} ${note}\\nquit" | fluidsynth -a pulseaudio "${this.soundfontPath}"`;
                }
            } else if (command.startsWith('cc')) {
                const parts = command.split(' ');
                if (parts.length >= 4) {
                    const channel = parseInt(parts[1]);
                    const control = parseInt(parts[2]);
                    const value = parseInt(parts[3]);
                    fluidCommand = `echo -e "gain 5\\ncc ${channel} ${control} ${value}\\nquit" | fluidsynth -a pulseaudio "${this.soundfontPath}" >/dev/null`;
                }
            }
            
            if (fluidCommand) {
                GLib.spawn_command_line_async(fluidCommand);
                console.log(`Executed FluidSynth: ${command}`);
            }
            
        } catch (error) {
            console.error('Error executing FluidSynth command:', error.message);
        }
    }
    
    cleanup() {
        // Kill any FluidSynth processes that might be running
        this._killExistingFluidSynth();
        
        this.fluidProcess = null;
        this.stdinStream = null;
        this.isConnected = false;
        
        console.log('FluidSynth controller cleaned up');
    }
    
    isReady() {
        return this.isConnected && this.instruments.length > 0;
    }
    
    getCurrentInstrument() {
        return this.currentInstrument;
    }
    
    getCurrentInstrumentName() {
        return this.instruments[this.currentInstrument] || 'Unknown';
    }
}

// Export the class for use in other modules
