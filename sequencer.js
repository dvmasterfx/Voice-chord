const { GObject, GLib } = imports.gi;

var Sequencer = GObject.registerClass({
    Signals: {
        'sequence-updated': {},
        'playback-position': {
            param_types: [GObject.TYPE_INT]
        },
        'play-chord': {
            param_types: [GObject.TYPE_STRING]
        }
    }
}, class Sequencer extends GObject.Object {
    
    _init() {
        super._init();
        
        this.sequence = [];
        this.isRecording = false;
        this.isPlaying = false;
        this.recordStartTime = 0;
        this.playbackStartTime = 0;
        this.playbackPosition = 0;
        this.playbackTimeout = null;
        
        // Quantization settings
        this.quantizeBeats = true;
        this.beatsPerMinute = 120;
        this.beatDuration = 60000 / this.beatsPerMinute; // ms per beat
        this.quantizeGrid = 1; // 1 = quarter note, 0.5 = eighth note, etc.
    }
    
    startRecording() {
        if (this.isPlaying) {
            this.stop();
        }
        
        this.isRecording = true;
        this.recordStartTime = Date.now();
        this.sequence = []; // Clear existing sequence
        
        print('Sequencer recording started');
        this.emit('sequence-updated');
    }
    
    stopRecording() {
        this.isRecording = false;
        print(`Sequencer recording stopped. Recorded ${this.sequence.length} events`);
        this.emit('sequence-updated');
    }
    
    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }
    
    addChord(chordName, timestamp = null) {
        if (!this.isRecording) {
            return;
        }
        
        const eventTime = timestamp || Date.now();
        const relativeTime = eventTime - this.recordStartTime;
        
        // Quantize timing if enabled
        const quantizedTime = this.quantizeBeats ? 
            this._quantizeTime(relativeTime) : relativeTime;
        
        const event = {
            type: 'chord',
            chord: chordName,
            timestamp: quantizedTime,
            duration: 1000 // Default duration of 1 second
        };
        
        // Check if we need to replace a recent chord or add a new one
        const lastEvent = this.sequence[this.sequence.length - 1];
        if (lastEvent && 
            lastEvent.type === 'chord' && 
            Math.abs(lastEvent.timestamp - quantizedTime) < 100) {
            // Replace the last chord if it's very recent
            lastEvent.chord = chordName;
            lastEvent.timestamp = quantizedTime;
        } else {
            this.sequence.push(event);
        }
        
        print(`Added chord: ${chordName} at ${quantizedTime}ms`);
        this.emit('sequence-updated');
    }
    
    play() {
        if (this.sequence.length === 0) {
            print('No sequence to play');
            return;
        }
        
        if (this.isRecording) {
            this.stopRecording();
        }
        
        this.isPlaying = true;
        this.playbackStartTime = Date.now();
        this.playbackPosition = 0;
        
        print('Sequencer playback started');
        this._scheduleNextEvent();
    }
    
    stop() {
        this.isPlaying = false;
        this.playbackPosition = 0;
        
        if (this.playbackTimeout) {
            GLib.source_remove(this.playbackTimeout);
            this.playbackTimeout = null;
        }
        
        print('Sequencer playback stopped');
        this.emit('playback-position', -1);
    }
    
    pause() {
        this.isPlaying = false;
        
        if (this.playbackTimeout) {
            GLib.source_remove(this.playbackTimeout);
            this.playbackTimeout = null;
        }
        
        print('Sequencer playback paused');
    }
    
    resume() {
        if (this.sequence.length === 0 || this.playbackPosition >= this.sequence.length) {
            return;
        }
        
        this.isPlaying = true;
        this.playbackStartTime = Date.now() - this._getCurrentTimestamp();
        
        print('Sequencer playback resumed');
        this._scheduleNextEvent();
    }
    
    _scheduleNextEvent() {
        if (!this.isPlaying || this.playbackPosition >= this.sequence.length) {
            this.stop();
            return;
        }
        
        const event = this.sequence[this.playbackPosition];
        const currentTime = Date.now() - this.playbackStartTime;
        const delay = Math.max(0, event.timestamp - currentTime);
        
        this.playbackTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._executeEvent(event);
            this.playbackPosition++;
            this.emit('playback-position', this.playbackPosition);
            
            this._scheduleNextEvent();
            return GLib.SOURCE_REMOVE;
        });
    }
    
    _executeEvent(event) {
        if (event.type === 'chord') {
            // Emit a signal that the main app can listen to
            // The main app will handle actually playing the chord
            this.emit('play-chord', event.chord);
            print(`Playing chord: ${event.chord}`);
        }
    }
    
    _getCurrentTimestamp() {
        if (this.playbackPosition < this.sequence.length) {
            return this.sequence[this.playbackPosition].timestamp;
        }
        return 0;
    }
    
    _quantizeTime(timeMs) {
        if (!this.quantizeBeats) {
            return timeMs;
        }
        
        const gridDuration = this.beatDuration * this.quantizeGrid;
        const quantizedBeats = Math.round(timeMs / gridDuration);
        return quantizedBeats * gridDuration;
    }
    
    clear() {
        this.stop();
        this.sequence = [];
        this.playbackPosition = 0;
        
        print('Sequence cleared');
        this.emit('sequence-updated');
    }
    
    getSequence() {
        return this.sequence.map((event, index) => ({
            ...event,
            index: index,
            formattedTime: this._formatTime(event.timestamp)
        }));
    }
    
    _formatTime(timeMs) {
        const seconds = Math.floor(timeMs / 1000);
        const milliseconds = timeMs % 1000;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}.${Math.floor(milliseconds / 100)}`;
    }
    
    exportSequence() {
        const exportData = {
            version: '1.0',
            bpm: this.beatsPerMinute,
            quantizeGrid: this.quantizeGrid,
            sequence: this.sequence,
            metadata: {
                created: new Date().toISOString(),
                duration: this.getTotalDuration()
            }
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    importSequence(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            
            if (data.version && data.sequence) {
                this.sequence = data.sequence;
                
                if (data.bpm) {
                    this.beatsPerMinute = data.bpm;
                    this.beatDuration = 60000 / this.beatsPerMinute;
                }
                
                if (data.quantizeGrid) {
                    this.quantizeGrid = data.quantizeGrid;
                }
                
                this.playbackPosition = 0;
                this.emit('sequence-updated');
                
                print(`Imported sequence with ${this.sequence.length} events`);
                return true;
            }
        } catch (error) {
            print(`Failed to import sequence: ${error.message}`);
        }
        
        return false;
    }
    
    getTotalDuration() {
        if (this.sequence.length === 0) {
            return 0;
        }
        
        const lastEvent = this.sequence[this.sequence.length - 1];
        return lastEvent.timestamp + lastEvent.duration;
    }
    
    setTempo(bpm) {
        this.beatsPerMinute = Math.max(60, Math.min(200, bpm));
        this.beatDuration = 60000 / this.beatsPerMinute;
        print(`Tempo set to ${this.beatsPerMinute} BPM`);
    }
    
    setQuantization(enabled, grid = 1) {
        this.quantizeBeats = enabled;
        this.quantizeGrid = grid;
        print(`Quantization ${enabled ? 'enabled' : 'disabled'}, grid: ${grid}`);
    }
    
    removeEvent(index) {
        if (index >= 0 && index < this.sequence.length) {
            const removed = this.sequence.splice(index, 1)[0];
            print(`Removed event: ${removed.chord} at index ${index}`);
            this.emit('sequence-updated');
            return true;
        }
        return false;
    }
    
    insertEvent(index, chord, timestamp, duration = 1000) {
        const event = {
            type: 'chord',
            chord: chord,
            timestamp: timestamp,
            duration: duration
        };
        
        this.sequence.splice(index, 0, event);
        print(`Inserted ${chord} at index ${index}`);
        this.emit('sequence-updated');
    }
});

// Export the class for use in other modules

