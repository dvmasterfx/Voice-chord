const { GObject, GLib } = imports.gi;

var EnhancedDetector = GObject.registerClass({
    Signals: {
        'note-detected': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_DOUBLE] // note, confidence
        },
        'instrument-detected': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_DOUBLE] // instrument, confidence
        },
        'chord-detected': {
            param_types: [GObject.TYPE_STRING] // chord
        },
        'analysis-updated': {
            param_types: [GObject.TYPE_STRING] // analysis data as JSON string
        }
    }
}, class EnhancedDetector extends GObject.Object {
    
    _init() {
        super._init();
        
        // Detection states
        this.currentNote = null;
        this.currentInstrument = null;
        this.currentChord = null;
        this.noteConfidence = 0;
        this.instrumentConfidence = 0;
        
        // Note detection history for stability
        this.noteDetectionHistory = [];
        this.instrumentDetectionHistory = [];
        this.historySize = 8;
        
        // Chord building from detected notes
        this.detectedNotes = new Set();
        this.noteTimestamps = new Map();
        this.chordTimeoutMs = 2000; // 2 seconds to build a chord
        
        // Analysis parameters
        this.noteChangeThreshold = 0.15; // Minimum confidence change to report new note
        this.instrumentChangeThreshold = 0.25; // Minimum confidence change to report new instrument
        
        // Initialize note-to-chord mappings
        this.chordMappings = this._initializeChordMappings();
        
        // Timer for chord timeout
        this.chordTimer = null;
        
        this._setupPeriodicAnalysis();
    }
    
    _initializeChordMappings() {
        // Define chord patterns based on detected notes
        return {
            // Major chords
            'C': new Set(['C', 'E', 'G']),
            'D': new Set(['D', 'F#', 'A']),
            'E': new Set(['E', 'G#', 'B']),
            'F': new Set(['F', 'A', 'C']),
            'G': new Set(['G', 'B', 'D']),
            'A': new Set(['A', 'C#', 'E']),
            'B': new Set(['B', 'D#', 'F#']),
            
            // Minor chords
            'Cm': new Set(['C', 'D#', 'G']),
            'Dm': new Set(['D', 'F', 'A']),
            'Em': new Set(['E', 'G', 'B']),
            'Fm': new Set(['F', 'G#', 'C']),
            'Gm': new Set(['G', 'A#', 'D']),
            'Am': new Set(['A', 'C', 'E']),
            'Bm': new Set(['B', 'D', 'F#']),
            
            // Seventh chords (basic)
            'C7': new Set(['C', 'E', 'G', 'A#']),
            'D7': new Set(['D', 'F#', 'A', 'C']),
            'E7': new Set(['E', 'G#', 'B', 'D']),
            'F7': new Set(['F', 'A', 'C', 'D#']),
            'G7': new Set(['G', 'B', 'D', 'F']),
            'A7': new Set(['A', 'C#', 'E', 'G']),
            'B7': new Set(['B', 'D#', 'F#', 'A']),
            
            // Minor seventh chords
            'Cm7': new Set(['C', 'D#', 'G', 'A#']),
            'Dm7': new Set(['D', 'F', 'A', 'C']),
            'Em7': new Set(['E', 'G', 'B', 'D']),
            'Fm7': new Set(['F', 'G#', 'C', 'D#']),
            'Gm7': new Set(['G', 'A#', 'D', 'F']),
            'Am7': new Set(['A', 'C', 'E', 'G']),
            'Bm7': new Set(['B', 'D', 'F#', 'A']),
            
            // Major seventh chords
            'Cmaj7': new Set(['C', 'E', 'G', 'B']),
            'Dmaj7': new Set(['D', 'F#', 'A', 'C#']),
            'Emaj7': new Set(['E', 'G#', 'B', 'D#']),
            'Fmaj7': new Set(['F', 'A', 'C', 'E']),
            'Gmaj7': new Set(['G', 'B', 'D', 'F#']),
            'Amaj7': new Set(['A', 'C#', 'E', 'G#']),
            'Bmaj7': new Set(['B', 'D#', 'F#', 'A#'])
        };
    }
    
    processNoteDetection(note, confidence) {
        // Add to detection history
        this.noteDetectionHistory.push({ note, confidence, timestamp: Date.now() });
        if (this.noteDetectionHistory.length > this.historySize) {
            this.noteDetectionHistory.shift();
        }
        
        // Get most stable note detection
        const stableNote = this._getStableDetection(this.noteDetectionHistory, 'note');
        
        if (stableNote && (
            !this.currentNote || 
            this.currentNote !== stableNote.detection ||
            Math.abs(this.noteConfidence - stableNote.confidence) > this.noteChangeThreshold
        )) {
            this.currentNote = stableNote.detection;
            this.noteConfidence = stableNote.confidence;
            
            // Emit note detection
            this.emit('note-detected', this.currentNote, this.noteConfidence);
            
            // Add to chord building
            this._addNoteToChordBuilding(this.currentNote);
        }
    }
    
    processInstrumentDetection(instrument, confidence) {
        // Add to detection history
        this.instrumentDetectionHistory.push({ 
            instrument, 
            confidence, 
            timestamp: Date.now() 
        });
        if (this.instrumentDetectionHistory.length > this.historySize) {
            this.instrumentDetectionHistory.shift();
        }
        
        // Get most stable instrument detection
        const stableInstrument = this._getStableDetection(this.instrumentDetectionHistory, 'instrument');
        
        if (stableInstrument && (
            !this.currentInstrument || 
            this.currentInstrument !== stableInstrument.detection ||
            Math.abs(this.instrumentConfidence - stableInstrument.confidence) > this.instrumentChangeThreshold
        )) {
            this.currentInstrument = stableInstrument.detection;
            this.instrumentConfidence = stableInstrument.confidence;
            
            // Emit instrument detection
            this.emit('instrument-detected', this.currentInstrument, this.instrumentConfidence);
        }
    }
    
    _getStableDetection(history, key) {
        if (history.length < 3) return null;
        
        // Count occurrences of each detection
        const detectionCounts = {};
        let totalConfidence = {};
        
        history.forEach(item => {
            const detection = item[key];
            if (!detectionCounts[detection]) {
                detectionCounts[detection] = 0;
                totalConfidence[detection] = 0;
            }
            detectionCounts[detection]++;
            totalConfidence[detection] += item.confidence;
        });
        
        // Find most frequent detection
        const mostFrequent = Object.entries(detectionCounts)
            .sort((a, b) => b[1] - a[1])[0];
        
        if (mostFrequent[1] >= Math.ceil(history.length * 0.5)) {
            return {
                detection: mostFrequent[0],
                confidence: totalConfidence[mostFrequent[0]] / mostFrequent[1]
            };
        }
        
        return null;
    }
    
    _addNoteToChordBuilding(note) {
        const now = Date.now();
        
        // Clean up old notes
        this._cleanupOldNotes(now);
        
        // Add current note
        this.detectedNotes.add(note);
        this.noteTimestamps.set(note, now);
        
        // Reset chord timeout
        if (this.chordTimer) {
            GLib.source_remove(this.chordTimer);
        }
        
        // Set timer to analyze chord after a brief pause
        this.chordTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._analyzeChord();
            this.chordTimer = null;
            return GLib.SOURCE_REMOVE;
        });
    }
    
    _cleanupOldNotes(currentTime) {
        // Remove notes older than chord timeout
        const notesToRemove = [];
        
        for (const [note, timestamp] of this.noteTimestamps) {
            if (currentTime - timestamp > this.chordTimeoutMs) {
                notesToRemove.push(note);
            }
        }
        
        notesToRemove.forEach(note => {
            this.detectedNotes.delete(note);
            this.noteTimestamps.delete(note);
        });
    }
    
    _analyzeChord() {
        if (this.detectedNotes.size < 2) {
            // Not enough notes for a chord, but could be a single note
            if (this.detectedNotes.size === 1) {
                const singleNote = Array.from(this.detectedNotes)[0];
                if (this.currentChord !== singleNote) {
                    this.currentChord = singleNote;
                    this.emit('chord-detected', this.currentChord);
                }
            }
            return;
        }
        
        // Find best matching chord
        let bestMatch = null;
        let bestScore = 0;
        
        for (const [chordName, chordNotes] of Object.entries(this.chordMappings)) {
            const score = this._calculateChordMatchScore(this.detectedNotes, chordNotes);
            
            if (score > bestScore && score > 0.6) { // Require at least 60% match
                bestScore = score;
                bestMatch = chordName;
            }
        }
        
        if (bestMatch && this.currentChord !== bestMatch) {
            this.currentChord = bestMatch;
            this.emit('chord-detected', this.currentChord);
            console.log(`Chord detected: ${this.currentChord} (${Array.from(this.detectedNotes).join(', ')})`);
        }
    }
    
    _calculateChordMatchScore(detectedNotes, chordNotes) {
        const detected = new Set(detectedNotes);
        const expected = new Set(chordNotes);
        
        // Calculate intersection and union
        const intersection = new Set([...detected].filter(x => expected.has(x)));
        const union = new Set([...detected, ...expected]);
        
        // Jaccard similarity coefficient
        return intersection.size / union.size;
    }
    
    _setupPeriodicAnalysis() {
        // Periodic analysis for updating UI with current state
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._emitAnalysisUpdate();
            return GLib.SOURCE_CONTINUE;
        });
    }
    
    _emitAnalysisUpdate() {
        const analysisData = {
            currentNote: this.currentNote,
            noteConfidence: this.noteConfidence,
            currentInstrument: this.currentInstrument,
            instrumentConfidence: this.instrumentConfidence,
            currentChord: this.currentChord,
            detectedNotes: Array.from(this.detectedNotes),
            analysisTime: Date.now()
        };
        
        this.emit('analysis-updated', JSON.stringify(analysisData));
    }
    
    // Manual methods for testing
    triggerNote(note, confidence = 0.8) {
        this.processNoteDetection(note, confidence);
    }
    
    triggerInstrument(instrument, confidence = 0.7) {
        this.processInstrumentDetection(instrument, confidence);
    }
    
    clearDetections() {
        this.detectedNotes.clear();
        this.noteTimestamps.clear();
        this.noteDetectionHistory = [];
        this.instrumentDetectionHistory = [];
        
        this.currentNote = null;
        this.currentInstrument = null;
        this.currentChord = null;
        this.noteConfidence = 0;
        this.instrumentConfidence = 0;
        
        if (this.chordTimer) {
            GLib.source_remove(this.chordTimer);
            this.chordTimer = null;
        }
    }
    
    // Getters for current state
    getCurrentNote() {
        return this.currentNote;
    }
    
    getCurrentInstrument() {
        return this.currentInstrument;
    }
    
    getCurrentChord() {
        return this.currentChord;
    }
    
    getDetectedNotes() {
        return Array.from(this.detectedNotes);
    }
    
    // Configuration methods
    setNoteChangeThreshold(threshold) {
        this.noteChangeThreshold = Math.max(0, Math.min(1, threshold));
    }
    
    setInstrumentChangeThreshold(threshold) {
        this.instrumentChangeThreshold = Math.max(0, Math.min(1, threshold));
    }
    
    setChordTimeout(timeoutMs) {
        this.chordTimeoutMs = Math.max(500, timeoutMs);
    }
    
    setHistorySize(size) {
        this.historySize = Math.max(3, Math.min(20, size));
    }
    
    destroy() {
        if (this.chordTimer) {
            GLib.source_remove(this.chordTimer);
            this.chordTimer = null;
        }
        
        this.clearDetections();
    }
});
