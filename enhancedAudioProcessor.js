const { GObject, Gst, GstAudio, GLib } = imports.gi;

// FFT implementation for frequency analysis
class FFT {
    constructor(size) {
        this.size = size;
        this.real = new Float32Array(size);
        this.imag = new Float32Array(size);
    }
    
    transform(samples) {
        // Copy input samples to real part
        for (let i = 0; i < Math.min(samples.length, this.size); i++) {
            this.real[i] = samples[i];
            this.imag[i] = 0;
        }
        
        // Pad with zeros if necessary
        for (let i = samples.length; i < this.size; i++) {
            this.real[i] = 0;
            this.imag[i] = 0;
        }
        
        this._fft(this.real, this.imag);
    }
    
    getMagnitude() {
        const magnitude = new Float32Array(this.size / 2);
        for (let i = 0; i < magnitude.length; i++) {
            magnitude[i] = Math.sqrt(this.real[i] * this.real[i] + this.imag[i] * this.imag[i]);
        }
        return magnitude;
    }
    
    _fft(real, imag) {
        const N = this.size;
        
        // Bit-reverse permutation
        for (let i = 0; i < N; i++) {
            const j = this._reverseBits(i, Math.log2(N));
            if (j > i) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
        }
        
        // Cooley-Tukey butterfly operations
        for (let len = 2; len <= N; len *= 2) {
            const wlen = 2 * Math.PI / len;
            for (let i = 0; i < N; i += len) {
                for (let j = 0; j < len / 2; j++) {
                    const u = real[i + j];
                    const v = real[i + j + len / 2];
                    const s = imag[i + j];
                    const t = imag[i + j + len / 2];
                    
                    const wreal = Math.cos(wlen * j);
                    const wimag = -Math.sin(wlen * j);
                    
                    const treal = v * wreal - t * wimag;
                    const timag = v * wimag + t * wreal;
                    
                    real[i + j] = u + treal;
                    real[i + j + len / 2] = u - treal;
                    imag[i + j] = s + timag;
                    imag[i + j + len / 2] = s - timag;
                }
            }
        }
    }
    
    _reverseBits(x, bits) {
        let result = 0;
        for (let i = 0; i < bits; i++) {
            result = (result << 1) | (x & 1);
            x >>= 1;
        }
        return result;
    }
}

var EnhancedAudioProcessor = GObject.registerClass({
    Signals: {
        'audio-data': {
            param_types: [GObject.TYPE_POINTER]
        },
        'audio-level': {
            param_types: [GObject.TYPE_DOUBLE]
        },
        'note-detected': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_DOUBLE] // note, confidence
        },
        'instrument-detected': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_DOUBLE] // instrument, confidence
        }
    }
}, class EnhancedAudioProcessor extends GObject.Object {
    
    _init() {
        super._init();
        this.pipeline = null;
        this.isRecording = false;
        this.sampleRate = 44100;
        this.bufferSize = 2048;
        this.audioLevel = 0;
        
        // FFT for frequency analysis
        this.fft = new FFT(this.bufferSize);
        this.audioBuffer = [];
        this.bufferMaxSize = this.bufferSize;
        
        // Note detection parameters
        this.noteFrequencies = this._initializeNoteFrequencies();
        this.noteHistory = [];
        this.noteHistorySize = 5;
        
        // Instrument detection parameters
        this.instrumentProfiles = this._initializeInstrumentProfiles();
        this.instrumentHistory = [];
        this.instrumentHistorySize = 10;
        
        this._createAudioPipeline();
    }
    
    _initializeNoteFrequencies() {
        // Initialize frequency mapping for notes (A4 = 440 Hz)
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const frequencies = {};
        
        // Generate frequencies for multiple octaves (C1 to C8)
        for (let octave = 1; octave <= 8; octave++) {
            for (let i = 0; i < noteNames.length; i++) {
                const noteNum = (octave - 1) * 12 + i;
                const frequency = 440 * Math.pow(2, (noteNum - 57) / 12); // A4 is MIDI note 69
                const noteName = noteNames[i] + octave;
                frequencies[noteName] = frequency;
            }
        }
        
        return frequencies;
    }
    
    _initializeInstrumentProfiles() {
        // Define harmonic profiles for different instruments
        // These are simplified profiles based on typical harmonic content
        return {
            'Piano': {
                harmonics: [1.0, 0.4, 0.3, 0.2, 0.15, 0.1, 0.08, 0.06],
                attack: 'sharp',
                sustain: 'medium',
                frequency_range: [80, 4000]
            },
            'Guitar': {
                harmonics: [1.0, 0.6, 0.4, 0.25, 0.15, 0.1, 0.06, 0.04],
                attack: 'medium',
                sustain: 'long',
                frequency_range: [80, 3000]
            },
            'Violin': {
                harmonics: [1.0, 0.8, 0.6, 0.4, 0.3, 0.2, 0.15, 0.1],
                attack: 'soft',
                sustain: 'very_long',
                frequency_range: [200, 8000]
            },
            'Flute': {
                harmonics: [1.0, 0.2, 0.1, 0.05, 0.02, 0.01],
                attack: 'soft',
                sustain: 'medium',
                frequency_range: [250, 4000]
            },
            'Trumpet': {
                harmonics: [1.0, 0.7, 0.5, 0.3, 0.2, 0.15, 0.1, 0.08],
                attack: 'sharp',
                sustain: 'medium',
                frequency_range: [150, 5000]
            },
            'Saxophone': {
                harmonics: [1.0, 0.5, 0.3, 0.4, 0.2, 0.15, 0.1, 0.05],
                attack: 'medium',
                sustain: 'long',
                frequency_range: [120, 3000]
            },
            'Clarinet': {
                harmonics: [1.0, 0.1, 0.8, 0.1, 0.6, 0.1, 0.4, 0.1],
                attack: 'soft',
                sustain: 'long',
                frequency_range: [150, 2000]
            },
            'Voice': {
                harmonics: [1.0, 0.6, 0.4, 0.3, 0.2, 0.15, 0.1, 0.08],
                attack: 'soft',
                sustain: 'variable',
                frequency_range: [80, 2000]
            }
        };
    }
    
    _createAudioPipeline() {
        // Force simulation mode to avoid GStreamer thread safety issues in GJS
        print('Enhanced audio processor using simulation mode (avoiding GStreamer threading issues)');
        this._createFallbackSimulation();
        
        // Skip real GStreamer pipeline creation for now due to thread safety issues
        // TODO: Re-enable with proper thread handling when GJS threading improves
        /*
        try {
            // Real GStreamer pipeline code disabled due to threading issues
            throw new Error('Simulation mode forced');
        } catch (error) {
            print(`Enhanced audio processor initialization error: ${error.message}`);
            print('Falling back to simulation mode');
            this._createFallbackSimulation();
        }
        */
    }
    
    _createFallbackSimulation() {
        // Fallback simulation for testing
        this.simulationMode = true;
        this.simulationTimer = null;
    }
    
    _onNewSample(appSink) {
        try {
            const sample = appSink.emit('pull-sample');
            if (!sample) return Gst.FlowReturn.EOS;
            
            const buffer = sample.get_buffer();
            if (!buffer) return Gst.FlowReturn.EOS;
            
            const mapInfo = buffer.map(Gst.MapFlags.READ);
            if (!mapInfo[0]) return Gst.FlowReturn.EOS;
            
            const audioData = mapInfo[1];
            
            // Convert to Float32Array and copy the data
            const samples = new Float32Array(audioData.buffer, audioData.byteOffset, 
                                           audioData.byteLength / 4);
            
            // Copy samples to avoid memory issues when dispatching to main thread
            const samplesCopy = new Float32Array(samples);
            
            buffer.unmap(mapInfo);
            
            // Dispatch to main thread using GLib.idle_add to avoid thread safety issues
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._processRealAudioData(samplesCopy);
                return GLib.SOURCE_REMOVE;
            });
            
            return Gst.FlowReturn.OK;
            
        } catch (error) {
            print(`Error processing audio sample: ${error.message}`);
            return Gst.FlowReturn.ERROR;
        }
    }
    
    _processRealAudioData(samples) {
        // Calculate audio level
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        this.audioLevel = Math.sqrt(sum / samples.length) * 100;
        this.emit('audio-level', this.audioLevel);
        
        // Add samples to buffer
        for (let i = 0; i < samples.length; i++) {
            this.audioBuffer.push(samples[i]);
        }
        
        // Process when we have enough samples
        if (this.audioBuffer.length >= this.bufferMaxSize) {
            const processBuffer = this.audioBuffer.splice(0, this.bufferMaxSize);
            this._analyzeAudio(new Float32Array(processBuffer));
        }
        
        // Keep buffer size manageable
        if (this.audioBuffer.length > this.bufferMaxSize * 2) {
            this.audioBuffer = this.audioBuffer.slice(-this.bufferMaxSize);
        }
        
        // Emit audio data signal
        this.emit('audio-data', samples);
    }
    
    _analyzeAudio(samples) {
        // Perform FFT analysis
        this.fft.transform(samples);
        const magnitude = this.fft.getMagnitude();
        
        // Detect note
        const detectedNote = this._detectNote(magnitude);
        if (detectedNote) {
            this.emit('note-detected', detectedNote.note, detectedNote.confidence);
        }
        
        // Detect instrument
        const detectedInstrument = this._detectInstrument(magnitude);
        if (detectedInstrument) {
            this.emit('instrument-detected', detectedInstrument.instrument, detectedInstrument.confidence);
        }
    }
    
    _detectNote(magnitude) {
        const frequencyResolution = this.sampleRate / this.bufferSize;
        let maxMagnitude = 0;
        let maxFrequency = 0;
        
        // Find peak frequency
        for (let i = 1; i < magnitude.length / 2; i++) {
            const frequency = i * frequencyResolution;
            if (magnitude[i] > maxMagnitude && frequency > 80 && frequency < 2000) {
                maxMagnitude = magnitude[i];
                maxFrequency = frequency;
            }
        }
        
        if (maxMagnitude < 0.01) return null; // Too quiet
        
        // Find closest note
        let closestNote = null;
        let minDifference = Infinity;
        
        for (const [noteName, noteFreq] of Object.entries(this.noteFrequencies)) {
            const difference = Math.abs(Math.log2(maxFrequency / noteFreq));
            if (difference < minDifference && difference < 0.1) { // Within ~12 cents
                minDifference = difference;
                closestNote = noteName;
            }
        }
        
        if (closestNote) {
            // Add to history and check stability
            this.noteHistory.push(closestNote);
            if (this.noteHistory.length > this.noteHistorySize) {
                this.noteHistory.shift();
            }
            
            // Check if note is stable (appears in majority of recent history)
            const noteCount = {};
            this.noteHistory.forEach(note => {
                noteCount[note] = (noteCount[note] || 0) + 1;
            });
            
            const mostCommon = Object.entries(noteCount)
                .sort((a, b) => b[1] - a[1])[0];
            
            if (mostCommon[1] >= Math.ceil(this.noteHistorySize * 0.6)) {
                const confidence = Math.min(maxMagnitude * 10, 1.0);
                return {
                    note: this._simplifyNoteName(mostCommon[0]),
                    confidence: confidence
                };
            }
        }
        
        return null;
    }
    
    _detectInstrument(magnitude) {
        const frequencyResolution = this.sampleRate / this.bufferSize;
        let bestMatch = null;
        let bestScore = 0;
        
        for (const [instrumentName, profile] of Object.entries(this.instrumentProfiles)) {
            const score = this._calculateInstrumentScore(magnitude, profile, frequencyResolution);
            
            if (score > bestScore && score > 0.3) {
                bestScore = score;
                bestMatch = instrumentName;
            }
        }
        
        if (bestMatch) {
            // Add to history for stability
            this.instrumentHistory.push(bestMatch);
            if (this.instrumentHistory.length > this.instrumentHistorySize) {
                this.instrumentHistory.shift();
            }
            
            // Check stability
            const instrumentCount = {};
            this.instrumentHistory.forEach(instrument => {
                instrumentCount[instrument] = (instrumentCount[instrument] || 0) + 1;
            });
            
            const mostCommon = Object.entries(instrumentCount)
                .sort((a, b) => b[1] - a[1])[0];
            
            if (mostCommon[1] >= Math.ceil(this.instrumentHistorySize * 0.5)) {
                return {
                    instrument: mostCommon[0],
                    confidence: bestScore
                };
            }
        }
        
        return null;
    }
    
    _calculateInstrumentScore(magnitude, profile, frequencyResolution) {
        // Find fundamental frequency
        let maxMagnitude = 0;
        let fundamentalBin = 0;
        
        const minBin = Math.floor(profile.frequency_range[0] / frequencyResolution);
        const maxBin = Math.floor(profile.frequency_range[1] / frequencyResolution);
        
        for (let i = minBin; i < Math.min(maxBin, magnitude.length); i++) {
            if (magnitude[i] > maxMagnitude) {
                maxMagnitude = magnitude[i];
                fundamentalBin = i;
            }
        }
        
        if (maxMagnitude < 0.01) return 0;
        
        // Analyze harmonic content
        let score = 0;
        let totalWeight = 0;
        
        for (let h = 0; h < profile.harmonics.length; h++) {
            const harmonicBin = Math.round(fundamentalBin * (h + 1));
            if (harmonicBin < magnitude.length) {
                const expectedMagnitude = maxMagnitude * profile.harmonics[h];
                const actualMagnitude = magnitude[harmonicBin];
                
                // Score based on how well the harmonic matches
                const harmonicScore = 1 - Math.abs(expectedMagnitude - actualMagnitude) / (expectedMagnitude + 0.001);
                score += harmonicScore * profile.harmonics[h];
                totalWeight += profile.harmonics[h];
            }
        }
        
        return totalWeight > 0 ? score / totalWeight : 0;
    }
    
    _simplifyNoteName(noteName) {
        // Remove octave number and return just the note name
        return noteName.replace(/\d+$/, '');
    }
    
    startRecording() {
        if (this.isRecording) return;
        
        this.isRecording = true;
        
        if (this.simulationMode) {
            this._startSimulation();
        } else if (this.pipeline) {
            this.pipeline.set_state(Gst.State.PLAYING);
        }
        
        print('Enhanced audio recording started');
    }
    
    stopRecording() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        
        if (this.simulationMode) {
            this._stopSimulation();
        } else if (this.pipeline) {
            this.pipeline.set_state(Gst.State.NULL);
        }
        
        // Clear buffers
        this.audioBuffer = [];
        this.noteHistory = [];
        this.instrumentHistory = [];
        
        print('Enhanced audio recording stopped');
    }
    
    _startSimulation() {
        if (this.simulationTimer) {
            GLib.source_remove(this.simulationTimer);
        }
        
        // Simulate audio processing every 200ms
        this.simulationTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            if (!this.isRecording) {
                return GLib.SOURCE_REMOVE;
            }
            
            this._simulateDetection();
            return GLib.SOURCE_CONTINUE;
        });
    }
    
    _stopSimulation() {
        if (this.simulationTimer) {
            GLib.source_remove(this.simulationTimer);
            this.simulationTimer = null;
        }
    }
    
    _simulateDetection() {
        // Simulate audio level
        this.audioLevel = Math.random() * 50 + 25;
        this.emit('audio-level', this.audioLevel);
        
        // Simulate note detection
        if (Math.random() < 0.7) {
            const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'F#', 'G#'];
            const note = notes[Math.floor(Math.random() * notes.length)];
            const confidence = Math.random() * 0.4 + 0.6;
            this.emit('note-detected', note, confidence);
        }
        
        // Simulate instrument detection with proper case and higher confidence for testing auto-switching
        if (Math.random() < 0.3) {
            // Use lowercase names that match voice mapping and higher confidence to trigger switching
            const instruments = ['piano', 'guitar', 'violin', 'flute', 'trumpet', 'saxophone'];
            const instrument = instruments[Math.floor(Math.random() * instruments.length)];
            // Generate confidence between 0.65-0.95 to test threshold behavior
            const confidence = Math.random() * 0.3 + 0.65;
            console.log(`[SIMULATION] Emitting instrument: ${instrument} with confidence ${(confidence * 100).toFixed(1)}%`);
            this.emit('instrument-detected', instrument, confidence);
        }
        
        // Skip audio-data emission in simulation mode to avoid G_POINTER conversion issues
        // The enhanced detector doesn't need raw audio data for simulation
    }
    
    destroy() {
        this.stopRecording();
        
        if (this.simulationTimer) {
            GLib.source_remove(this.simulationTimer);
            this.simulationTimer = null;
        }
        
        if (this.pipeline) {
            this.pipeline.set_state(Gst.State.NULL);
            this.pipeline = null;
        }
    }
});
