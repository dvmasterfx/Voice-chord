const { GObject, GLib } = imports.gi;

var ChordDetector = GObject.registerClass({
    Signals: {
        'chord-detected': {
            param_types: [GObject.TYPE_STRING]
        }
    }
}, class ChordDetector extends GObject.Object {
    
    _init() {
        super._init();
        this.sampleRate = 44100;
        this.threshold = 0.1;
        this.lastDetectedChord = null;
        this.chordStability = 0;
        this.stabilityThreshold = 2;
        
        // For demonstration, we'll cycle through common chords
        this.demoChords = [
            'C', 'Am', 'F', 'G', 
            'Dm', 'Em', 'C7', 'G7',
            'Am7', 'Dm7', 'Cmaj7', 'Fmaj7'
        ];
        this.currentChordIndex = 0;
        this.detectionTimer = null;
    }
    
    processAudioData(audioData) {
        // For demonstration purposes, we'll simulate chord detection
        // In a real implementation, this would perform FFT analysis
        
        // For the demo, we'll just simulate detection regardless of input
        this._simulateChordDetection();
    }
    
    _simulateChordDetection() {
        // For demo purposes, detect chords based on simulated analysis
        // This would normally analyze frequency content
        
        // Randomly select a chord with some logic
        let detectedChord;
        
        if (Math.random() < 0.7) {
            // 70% chance to pick the "current" chord in our demo progression
            detectedChord = this.demoChords[this.currentChordIndex];
        } else {
            // 30% chance to pick a random chord
            detectedChord = this.demoChords[Math.floor(Math.random() * this.demoChords.length)];
        }
        
        this._handleChordDetection(detectedChord);
        
        // Advance to next chord in demo progression occasionally
        if (Math.random() < 0.2) { // 20% chance to advance
            this.currentChordIndex = (this.currentChordIndex + 1) % this.demoChords.length;
        }
    }
    
    _handleChordDetection(chord) {
        if (chord === this.lastDetectedChord) {
            this.chordStability++;
        } else {
            this.chordStability = 1;
            this.lastDetectedChord = chord;
        }
        
        // Only emit chord if it's been stable for a few detections
        if (this.chordStability >= this.stabilityThreshold) {
            this.emit('chord-detected', chord);
            print(`Chord detected: ${chord}`);
        }
    }
    
    setThreshold(threshold) {
        this.threshold = threshold;
    }
    
    setStabilityThreshold(threshold) {
        this.stabilityThreshold = threshold;
    }
    
    // Method to manually trigger a chord detection for testing
    triggerChord(chordName) {
        if (this.demoChords.includes(chordName)) {
            this._handleChordDetection(chordName);
        }
    }
    
    // Method to set the demo chord progression
    setDemoProgression(chords) {
        if (Array.isArray(chords) && chords.length > 0) {
            this.demoChords = chords;
            this.currentChordIndex = 0;
        }
    }
    
    destroy() {
        if (this.detectionTimer) {
            GLib.source_remove(this.detectionTimer);
            this.detectionTimer = null;
        }
    }
});

// Export the class for use in other modules
