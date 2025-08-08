const { GObject, GLib } = imports.gi;

var EnhancedSequencer = GObject.registerClass({
    Signals: {
        'sequence-updated': {},
        'playback-started': {},
        'playback-stopped': {},
        'play-notes': {
            param_types: [GObject.TYPE_POINTER, GObject.TYPE_INT] // notes array, duration
        },
        'stop-notes': {
            param_types: [GObject.TYPE_POINTER] // notes array to stop
        }
    }
}, class EnhancedSequencer extends GObject.Object {
    
    _init() {
        super._init();
        
        // Sequence storage
        this.sequence = [];
        this.isRecording = false;
        this.isPlaying = false;
        this.recordingStartTime = 0;
        
        // Playback control
        this.playbackTimer = null;
        this.playbackStartTime = 0;
        this.playbackIndex = 0;
        this.currentlyPlayingNotes = new Set();
        
        // Real-time melody capture
        this.melodyCapture = {
            enabled: true,
            noteBuffer: [],
            lastNoteTime: 0,
            minNoteDuration: 100,  // Minimum 100ms per note
            maxNoteDuration: 2000, // Maximum 2s per note
            noteGapThreshold: 200  // 200ms gap to separate notes
        };
        
        // Rhythm and timing
        this.rhythm = {
            enabled: true,
            tempo: 120, // BPM
            quantization: 'free', // 'free', 'quarter', 'eighth', 'sixteenth'
            swing: 0.0 // 0.0 to 1.0
        };
        
        // Chord progression vs melody mode
        this.captureMode = 'auto'; // 'chord', 'melody', 'auto'
        this.detectedMode = 'melody'; // Current detected mode
    }
    
    // Start recording with enhanced timing capture
    startRecording() {
        if (this.isRecording) return;
        
        this.isRecording = true;
        this.recordingStartTime = Date.now();
        this.sequence = [];
        this.melodyCapture.noteBuffer = [];
        this.melodyCapture.lastNoteTime = 0;
        
        console.log('Enhanced recording started - capturing melody and timing');
        this.emit('sequence-updated');
    }
    
    // Stop recording
    stopRecording() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        this._finalizeRecording();
        
        console.log(`Recording stopped - captured ${this.sequence.length} events`);
        this.emit('sequence-updated');
    }
    
    // Toggle recording state
    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }
    
    // Add individual note to sequence (for melody)
    addNote(note, timestamp, confidence = 1.0) {
        if (!this.isRecording) return;
        
        const relativeTime = timestamp - this.recordingStartTime;
        const duration = this._calculateNoteDuration(timestamp);
        
        // Determine if this is part of melody or chord progression
        this._analyzeMelodyPattern(note, relativeTime, confidence);
        
        const event = {
            type: 'note',
            note: note,
            timestamp: relativeTime,
            duration: duration,
            confidence: confidence,
            velocity: Math.floor(confidence * 127)
        };
        
        this.sequence.push(event);
        this._updateDetectedMode();
        
        console.log(`Added note: ${note} at ${relativeTime}ms, duration: ${duration}ms`);
        this.emit('sequence-updated');
    }
    
    // Add chord to sequence
    addChord(chord, timestamp, notes = null) {
        if (!this.isRecording) return;
        
        const relativeTime = timestamp - this.recordingStartTime;
        const duration = this._calculateChordDuration(timestamp);
        
        const event = {
            type: 'chord',
            chord: chord,
            notes: notes || this._chordToNotes(chord),
            timestamp: relativeTime,
            duration: duration,
            velocity: 100
        };
        
        this.sequence.push(event);
        this._updateDetectedMode();
        
        console.log(`Added chord: ${chord} at ${relativeTime}ms, duration: ${duration}ms`);
        this.emit('sequence-updated');
    }
    
    // Calculate note duration based on timing patterns
    _calculateNoteDuration(currentTime) {
        const timeSinceLastNote = currentTime - this.melodyCapture.lastNoteTime;
        
        if (this.melodyCapture.lastNoteTime === 0) {
            // First note - use default duration
            this.melodyCapture.lastNoteTime = currentTime;
            return 500; // Default 500ms
        }
        
        // For melody, notes should follow more naturally
        let duration;
        if (timeSinceLastNote < this.melodyCapture.noteGapThreshold) {
            // Notes are close together - shorter duration
            duration = Math.max(timeSinceLastNote * 0.8, this.melodyCapture.minNoteDuration);
        } else {
            // Notes are spaced apart - longer duration
            duration = Math.min(timeSinceLastNote * 0.6, this.melodyCapture.maxNoteDuration);
        }
        
        this.melodyCapture.lastNoteTime = currentTime;
        return Math.floor(duration);
    }
    
    // Calculate chord duration
    _calculateChordDuration(currentTime) {
        // Chords typically last longer than individual melody notes
        return 1000; // Default 1 second for chords
    }
    
    // Analyze melody patterns to improve timing
    _analyzeMelodyPattern(note, timestamp, confidence) {
        this.melodyCapture.noteBuffer.push({
            note: note,
            timestamp: timestamp,
            confidence: confidence
        });
        
        // Keep buffer size manageable
        if (this.melodyCapture.noteBuffer.length > 20) {
            this.melodyCapture.noteBuffer.shift();
        }
        
        // Analyze for patterns (could be enhanced with music theory)
        this._detectMusicalPatterns();
    }
    
    // Detect musical patterns to improve playback
    _detectMusicalPatterns() {
        if (this.melodyCapture.noteBuffer.length < 3) return;
        
        const recentNotes = this.melodyCapture.noteBuffer.slice(-5);
        const intervals = [];
        
        // Calculate intervals between notes
        for (let i = 1; i < recentNotes.length; i++) {
            const interval = recentNotes[i].timestamp - recentNotes[i-1].timestamp;
            intervals.push(interval);
        }
        
        // Detect if this is a scale run, arpeggio, or chord progression
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        
        if (avgInterval < 300) {
            this.detectedMode = 'melody'; // Fast notes = melody
        } else if (avgInterval > 800) {
            this.detectedMode = 'chord'; // Slow notes = chord progression
        }
    }
    
    // Update detected mode based on recent events
    _updateDetectedMode() {
        if (this.sequence.length < 2) return;
        
        const recentEvents = this.sequence.slice(-5);
        const noteEvents = recentEvents.filter(e => e.type === 'note').length;
        const chordEvents = recentEvents.filter(e => e.type === 'chord').length;
        
        if (noteEvents > chordEvents * 2) {
            this.detectedMode = 'melody';
        } else if (chordEvents > noteEvents) {
            this.detectedMode = 'chord';
        } else {
            this.detectedMode = 'mixed';
        }
    }
    
    // Finalize recording with timing adjustments
    _finalizeRecording() {
        if (this.sequence.length === 0) return;
        
        // Sort events by timestamp
        this.sequence.sort((a, b) => a.timestamp - b.timestamp);
        
        // Adjust timing based on detected mode
        if (this.detectedMode === 'melody') {
            this._optimizeMelodyTiming();
        } else if (this.detectedMode === 'chord') {
            this._optimizeChordTiming();
        }
        
        // Apply quantization if enabled
        if (this.rhythm.quantization !== 'free') {
            this._quantizeSequence();
        }
    }
    
    // Optimize timing for melody playback
    _optimizeMelodyTiming() {
        for (let i = 0; i < this.sequence.length - 1; i++) {
            const current = this.sequence[i];
            const next = this.sequence[i + 1];
            
            // Adjust duration to not overlap with next note
            const gap = next.timestamp - current.timestamp;
            current.duration = Math.min(current.duration, gap * 0.9);
        }
        
        // Last note gets a reasonable duration
        if (this.sequence.length > 0) {
            const lastNote = this.sequence[this.sequence.length - 1];
            lastNote.duration = Math.min(lastNote.duration, 800);
        }
    }
    
    // Optimize timing for chord progression playback
    _optimizeChordTiming() {
        // Chords should have more consistent timing
        for (const event of this.sequence) {
            if (event.type === 'chord') {
                event.duration = Math.max(event.duration, 1000); // Minimum 1 second
            }
        }
    }
    
    // Quantize sequence to musical timing
    _quantizeSequence() {
        const beatLength = (60 / this.rhythm.tempo) * 1000; // Beat length in ms
        let quantizeUnit;
        
        switch (this.rhythm.quantization) {
            case 'quarter': quantizeUnit = beatLength; break;
            case 'eighth': quantizeUnit = beatLength / 2; break;
            case 'sixteenth': quantizeUnit = beatLength / 4; break;
            default: return; // No quantization
        }
        
        // Quantize timestamps
        for (const event of this.sequence) {
            event.timestamp = Math.round(event.timestamp / quantizeUnit) * quantizeUnit;
        }
    }
    
    // Enhanced playback with proper timing and melody flow
    play() {
        if (this.isPlaying || this.sequence.length === 0) return;
        
        this.isPlaying = true;
        this.playbackStartTime = Date.now();
        this.playbackIndex = 0;
        this.currentlyPlayingNotes.clear();
        
        console.log(`Starting enhanced playback - ${this.detectedMode} mode, ${this.sequence.length} events`);
        this.emit('playback-started');
        
        this._scheduleNextEvent();
    }
    
    // Stop playback
    stop() {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        
        if (this.playbackTimer) {
            GLib.source_remove(this.playbackTimer);
            this.playbackTimer = null;
        }
        
        // Stop all currently playing notes
        if (this.currentlyPlayingNotes.size > 0) {
            this.emit('stop-notes', Array.from(this.currentlyPlayingNotes));
            this.currentlyPlayingNotes.clear();
        }
        
        console.log('Playback stopped');
        this.emit('playback-stopped');
    }
    
    // Schedule next event in sequence
    _scheduleNextEvent() {
        if (!this.isPlaying || this.playbackIndex >= this.sequence.length) {
            this.stop();
            return;
        }
        
        const event = this.sequence[this.playbackIndex];
        const currentTime = Date.now() - this.playbackStartTime;
        const eventTime = event.timestamp;
        
        if (currentTime >= eventTime) {
            // Time to play this event
            this._playEvent(event);
            this.playbackIndex++;
            
            // Schedule next event immediately
            this._scheduleNextEvent();
        } else {
            // Schedule this event for later
            const delay = eventTime - currentTime;
            this.playbackTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                this._playEvent(event);
                this.playbackIndex++;
                this._scheduleNextEvent();
                return GLib.SOURCE_REMOVE;
            });
        }
    }
    
    // Play individual event with proper timing
    _playEvent(event) {
        let notesToPlay = [];
        
        if (event.type === 'note') {
            notesToPlay = [this._noteToMidi(event.note)];
        } else if (event.type === 'chord') {
            notesToPlay = event.notes || this._chordToNotes(event.chord);
        }
        
        if (notesToPlay.length > 0) {
            // Play the notes
            this.emit('play-notes', notesToPlay, event.duration);
            
            // Track playing notes
            notesToPlay.forEach(note => this.currentlyPlayingNotes.add(note));
            
            // Schedule note-off events
            if (event.duration > 0) {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, event.duration, () => {
                    this.emit('stop-notes', notesToPlay);
                    notesToPlay.forEach(note => this.currentlyPlayingNotes.delete(note));
                    return GLib.SOURCE_REMOVE;
                });
            }
        }
    }
    
    // Convert note name to MIDI number
    _noteToMidi(noteName) {
        const noteMap = {
            'C': 60, 'C#': 61, 'D': 62, 'D#': 63, 'E': 64, 'F': 65,
            'F#': 66, 'G': 67, 'G#': 68, 'A': 69, 'A#': 70, 'B': 71
        };
        
        // Handle octave numbers (default to octave 4)
        const match = noteName.match(/^([A-G]#?)(\d?)$/);
        if (match) {
            const note = match[1];
            const octave = parseInt(match[2]) || 4;
            const baseNote = noteMap[note];
            if (baseNote !== undefined) {
                return baseNote + (octave - 4) * 12;
            }
        }
        
        return noteMap[noteName] || 60; // Default to middle C
    }
    
    // Convert chord to MIDI notes
    _chordToNotes(chordName) {
        const chordMap = {
            'C': [60, 64, 67], 'C#': [61, 65, 68], 'D': [62, 66, 69], 'D#': [63, 67, 70],
            'E': [64, 68, 71], 'F': [65, 69, 72], 'F#': [66, 70, 73], 'G': [67, 71, 74],
            'G#': [68, 72, 75], 'A': [69, 73, 76], 'A#': [70, 74, 77], 'B': [71, 75, 78],
            'Cm': [60, 63, 67], 'C#m': [61, 64, 68], 'Dm': [62, 65, 69], 'D#m': [63, 66, 70],
            'Em': [64, 67, 71], 'Fm': [65, 68, 72], 'F#m': [66, 69, 73], 'Gm': [67, 70, 74],
            'G#m': [68, 71, 75], 'Am': [69, 72, 76], 'A#m': [70, 73, 77], 'Bm': [71, 74, 78],
            'C7': [60, 64, 67, 70], 'Dm7': [62, 65, 69, 72], 'Em7': [64, 67, 71, 74],
            'F7': [65, 69, 72, 75], 'G7': [67, 71, 74, 77], 'Am7': [69, 72, 76, 79]
        };
        
        return chordMap[chordName] || [60, 64, 67]; // Default to C major
    }
    
    // Clear sequence
    clear() {
        this.stop();
        this.sequence = [];
        this.melodyCapture.noteBuffer = [];
        this.detectedMode = 'melody';
        this.emit('sequence-updated');
    }
    
    // Get current sequence
    getSequence() {
        return this.sequence;
    }
    
    // Get playback info
    getPlaybackInfo() {
        return {
            isPlaying: this.isPlaying,
            isRecording: this.isRecording,
            detectedMode: this.detectedMode,
            sequenceLength: this.sequence.length,
            currentIndex: this.playbackIndex
        };
    }
    
    // Set capture mode
    setCaptureMode(mode) {
        this.captureMode = mode; // 'chord', 'melody', 'auto'
    }
    
    // Set rhythm parameters
    setRhythm(tempo, quantization = 'free', swing = 0.0) {
        this.rhythm.tempo = Math.max(60, Math.min(200, tempo));
        this.rhythm.quantization = quantization;
        this.rhythm.swing = Math.max(0, Math.min(1, swing));
    }
    
    // Export sequence for MIDI
    exportSequence() {
        return {
            events: this.sequence,
            mode: this.detectedMode,
            tempo: this.rhythm.tempo,
            totalDuration: this.sequence.length > 0 ? 
                Math.max(...this.sequence.map(e => e.timestamp + e.duration)) : 0
        };
    }
});
