#!/usr/bin/env gjs

/**
 * Voice Chord - Real-time voice chord recognition application
 * Author: David Martins <dvdmartinsfx@gmail.com>
 * License: GPL-3.0
 * Version: 1.0.0
 */

imports.gi.versions.Gtk = '4.0';
imports.gi.versions.Gst = '1.0';
imports.gi.versions.GstAudio = '1.0';

const { GLib, Gtk, Gst, GstAudio, Gio, Gdk } = imports.gi;

// Import application modules
imports.searchPath.unshift('.');
const AudioProcessor = imports.audioProcessor.AudioProcessor;
const EnhancedAudioProcessor = imports.enhancedAudioProcessor.EnhancedAudioProcessor;
const ChordDetector = imports.chordDetector.ChordDetector;
const EnhancedDetector = imports.enhancedDetector.EnhancedDetector;
const FluidSynthController = imports.fluidsynthController.FluidSynthController;
const Sequencer = imports.sequencer.Sequencer;
const EnhancedSequencer = imports.enhancedSequencer.EnhancedSequencer;
// MIDI File classes (inline to avoid import issues)
class MidiFile {
    constructor() {
        this.tracks = [];
        this.ticksPerQuarter = 480;
        this.format = 1;
        
        this.noteMapping = {
            'C': [60, 64, 67], 'C#': [61, 65, 68], 'D': [62, 66, 69], 'D#': [63, 67, 70],
            'E': [64, 68, 71], 'F': [65, 69, 72], 'F#': [66, 70, 73], 'G': [67, 71, 74],
            'G#': [68, 72, 75], 'A': [69, 73, 76], 'A#': [70, 74, 77], 'B': [71, 75, 78],
            'Cm': [60, 63, 67], 'C#m': [61, 64, 68], 'Dm': [62, 65, 69], 'D#m': [63, 66, 70],
            'Em': [64, 67, 71], 'Fm': [65, 68, 72], 'F#m': [66, 69, 73], 'Gm': [67, 70, 74],
            'G#m': [68, 71, 75], 'Am': [69, 72, 76], 'A#m': [70, 73, 77], 'Bm': [71, 74, 78],
            'C7': [60, 64, 67, 70], 'Dm7': [62, 65, 69, 72], 'Em7': [64, 67, 71, 74],
            'F7': [65, 69, 72, 75], 'G7': [67, 71, 74, 77], 'Am7': [69, 72, 76, 79],
            'Cmaj7': [60, 64, 67, 71], 'Dmaj7': [62, 66, 69, 73], 'Fmaj7': [65, 69, 72, 76]
        };
        
        this.instrumentPrograms = {
            0: 0, 1: 4, 2: 16, 3: 24, 4: 29, 5: 32, 6: 48, 7: 56, 8: 64, 9: 80, 10: 88, 11: 52
        };
    }
    
    addSequence(sequence, instrumentIndex = 0) {
        if (!sequence || sequence.length === 0) return;
        
        const track = new MidiTrack();
        const program = this.instrumentPrograms[instrumentIndex] || 0;
        track.addEvent(0, new MidiEvent('program_change', { channel: 0, program: program }));
        
        let currentTime = 0;
        const msPerTick = (60000 / 120 / this.ticksPerQuarter);
        
        for (let i = 0; i < sequence.length; i++) {
            const event = sequence[i];
            const deltaTime = Math.round((event.timestamp - (i > 0 ? sequence[i-1].timestamp : 0)) / msPerTick);
            const notes = this.noteMapping[event.chord] || [60];
            
            for (const note of notes) {
                track.addEvent(currentTime + deltaTime, new MidiEvent('note_on', {
                    channel: 0, note: note, velocity: 100
                }));
            }
            
            const chordDuration = Math.round((event.duration || 1000) / msPerTick);
            for (const note of notes) {
                track.addEvent(currentTime + deltaTime + chordDuration, new MidiEvent('note_off', {
                    channel: 0, note: note, velocity: 0
                }));
            }
            
            currentTime += deltaTime;
        }
        
        track.addEvent(currentTime + 480, new MidiEvent('end_of_track'));
        this.tracks.push(track);
    }
    
    toByteArray() {
        const data = [];
        this._writeHeader(data);
        for (const track of this.tracks) {
            this._writeTrack(data, track);
        }
        return new Uint8Array(data);
    }
    
    _writeHeader(data) {
        data.push(0x4D, 0x54, 0x68, 0x64);
        this._writeInt32(data, 6);
        this._writeInt16(data, this.format);
        this._writeInt16(data, this.tracks.length);
        this._writeInt16(data, this.ticksPerQuarter);
    }
    
    _writeTrack(data, track) {
        const trackData = [];
        track.events.sort((a, b) => a.time - b.time);
        
        let lastTime = 0;
        for (const event of track.events) {
            const deltaTime = event.time - lastTime;
            this._writeVarLength(trackData, deltaTime);
            this._writeEvent(trackData, event.event);
            lastTime = event.time;
        }
        
        data.push(0x4D, 0x54, 0x72, 0x6B);
        this._writeInt32(data, trackData.length);
        data.push(...trackData);
    }
    
    _writeEvent(data, event) {
        switch (event.type) {
            case 'note_on': data.push(0x90 | event.channel, event.note, event.velocity); break;
            case 'note_off': data.push(0x80 | event.channel, event.note, event.velocity); break;
            case 'program_change': data.push(0xC0 | event.channel, event.program); break;
            case 'end_of_track': data.push(0xFF, 0x2F, 0x00); break;
        }
    }
    
    _writeVarLength(data, value) {
        if (value < 0x80) {
            data.push(value);
        } else {
            const bytes = [];
            bytes.push(value & 0x7F);
            value >>= 7;
            while (value > 0) {
                bytes.unshift((value & 0x7F) | 0x80);
                value >>= 7;
            }
            data.push(...bytes);
        }
    }
    
    _writeInt32(data, value) {
        data.push((value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF);
    }
    
    _writeInt16(data, value) {
        data.push((value >> 8) & 0xFF, value & 0xFF);
    }
}

class MidiTrack {
    constructor() { this.events = []; }
    addEvent(time, event) { this.events.push({ time: time, event: event }); }
}

class MidiEvent {
    constructor(type, params = {}) {
        this.type = type;
        Object.assign(this, params);
    }
}

class VoiceChordApp {
    constructor() {
        this.application = new Gtk.Application({
            application_id: 'org.voicechord.VoiceChord',
            flags: Gio.ApplicationFlags.FLAGS_NONE,
        });
        
        this.application.connect('activate', this._onActivate.bind(this));
        this.application.connect('startup', this._onStartup.bind(this));
        
        // Initialize GStreamer
        Gst.init(null);
        
        // Enhanced audio processing components
        this.enhancedAudioProcessor = new EnhancedAudioProcessor();
        this.enhancedDetector = new EnhancedDetector();
        this.audioProcessor = new AudioProcessor(); // Keep as fallback
        this.chordDetector = new ChordDetector(); // Keep as fallback
        this.fluidSynthController = new FluidSynthController();
        this.sequencer = new Sequencer(); // Keep as fallback
        this.enhancedSequencer = new EnhancedSequencer(); // Enhanced sequencer with timing
        
        // Current state
        this.isRecording = false;
        this.currentChord = null;
        this.currentNote = null;
        this.currentInstrument = null;
        this.selectedInstrument = 0; // Piano by default
        this.currentTheme = 'system'; // Default to system theme
        
        // Detection confidence levels
        this.noteConfidence = 0;
        this.instrumentConfidence = 0;
        
        // Automatic instrument switching
        this.autoInstrumentSwitch = true; // Enable automatic switching
        this.instrumentSwitchThreshold = 0.7; // Minimum confidence to switch
        this.lastInstrumentSwitch = 0; // Prevent rapid switching
        this.instrumentSwitchCooldown = 3000; // 3 seconds between switches
        
        // Instrument name mapping for voice recognition to MIDI instruments
        this.voiceInstrumentMap = this._initializeVoiceInstrumentMap();
        
        this._setupAudioPipeline();
    }
    
    async _onStartup() {
        // Initialize FluidSynth controller
        try {
            const initialized = await this.fluidSynthController.initialize();
            if (initialized) {
                console.log('FluidSynth initialized successfully');
            } else {
                console.log('FluidSynth initialization failed, using fallback');
            }
            
            // Update UI after FluidSynth initialization
            this._updateFluidSynthUI();
        } catch (error) {
            console.error('Error initializing FluidSynth:', error.message);
            // Still update UI even if initialization failed
            this._updateFluidSynthUI();
        }
    }
    
    _onActivate() {
        if (!this.window) {
            this._buildUI();
        }
        this.window.present();
    }
    
    _buildUI() {
        this.window = new Gtk.ApplicationWindow({
            application: this.application,
            title: 'Voice Chord Recognition',
            default_width: 800,
            default_height: 600,
        });
        
        // Create header bar with menu
        const headerBar = this._createHeaderBar();
        this.window.set_titlebar(headerBar);
        
        // Create main container
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 20,
            margin_bottom: 20,
            margin_start: 20,
            margin_end: 20,
        });
        
        // Status section
        const statusBox = this._createStatusSection();
        mainBox.append(statusBox);
        
        // Enhanced detection display section
        const detectionBox = this._createEnhancedDetectionSection();
        mainBox.append(detectionBox);
        
        // Chord display section (legacy)
        const chordBox = this._createChordDisplaySection();
        mainBox.append(chordBox);
        
        // Instrument selection section
        const instrumentBox = this._createInstrumentSection();
        mainBox.append(instrumentBox);
        
        // Sequencer section
        const sequencerBox = this._createSequencerSection();
        mainBox.append(sequencerBox);
        
        // Control buttons section
        const controlBox = this._createControlSection();
        mainBox.append(controlBox);
        
        this.window.set_child(mainBox);
        
        // Initialize theming after window is created
        this._setupTheming();
    }
    
    _createHeaderBar() {
        const headerBar = new Gtk.HeaderBar({
            title_widget: new Gtk.Label({ label: 'Voice Chord Recognition' }),
            show_title_buttons: true,
        });
        
        // Create theme menu button
        const themeMenuButton = new Gtk.MenuButton({
            icon_name: 'applications-graphics-symbolic',
            tooltip_text: 'Theme Selection',
        });
        
        // Create theme menu
        const themeMenu = new Gio.Menu();
        themeMenu.append('🔄 System Default', 'app.theme-system');
        themeMenu.append('☀️ Light Theme', 'app.theme-light');
        themeMenu.append('🌙 Dark Theme', 'app.theme-dark');
        
        themeMenuButton.set_menu_model(themeMenu);
        
        // Add theme actions
        const themeSystemAction = new Gio.SimpleAction({
            name: 'theme-system',
        });
        themeSystemAction.connect('activate', () => this._setTheme('system'));
        this.application.add_action(themeSystemAction);
        
        const themeLightAction = new Gio.SimpleAction({
            name: 'theme-light',
        });
        themeLightAction.connect('activate', () => this._setTheme('light'));
        this.application.add_action(themeLightAction);
        
        const themeDarkAction = new Gio.SimpleAction({
            name: 'theme-dark',
        });
        themeDarkAction.connect('activate', () => this._setTheme('dark'));
        this.application.add_action(themeDarkAction);
        
        // Add menu button to header bar
        headerBar.pack_end(themeMenuButton);
        
        // Store reference for theme widget styling
        this.themeMenuButton = themeMenuButton;
        
        return headerBar;
    }
    
    _createStatusSection() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            margin_bottom: 10,
        });
        
        const statusLabel = new Gtk.Label({
            label: 'Status:',
            css_classes: ['dim-label'],
        });
        
        this.statusLabel = new Gtk.Label({
            label: 'Ready',
            css_classes: ['dim-label'],
        });
        
        box.append(statusLabel);
        box.append(this.statusLabel);
        
        return box;
    }
    
    _createEnhancedDetectionSection() {
        const frame = new Gtk.Frame({
            label: 'Real-time Audio Analysis',
            margin_top: 10,
        });
        
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 15,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
        });
        
        // Current detections row
        const detectionsRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 20,
            homogeneous: true,
        });
        
        // Note detection
        const noteBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 5,
        });
        
        const noteLabel = new Gtk.Label({
            label: '<b>Current Note</b>',
            use_markup: true,
        });
        
        this.currentNoteLabel = new Gtk.Label({
            label: '<span size="x-large" weight="bold">-</span>',
            use_markup: true,
            css_classes: ['note-display'],
        });
        
        this.noteConfidenceLabel = new Gtk.Label({
            label: 'Confidence: 0%',
            css_classes: ['dim-label'],
        });
        
        noteBox.append(noteLabel);
        noteBox.append(this.currentNoteLabel);
        noteBox.append(this.noteConfidenceLabel);
        
        // Instrument detection
        const instrumentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 5,
        });
        
        const instrumentLabel = new Gtk.Label({
            label: '<b>Detected Instrument</b>',
            use_markup: true,
        });
        
        this.currentInstrumentLabel = new Gtk.Label({
            label: '<span size="large" weight="bold">-</span>',
            use_markup: true,
            css_classes: ['instrument-display'],
        });
        
        this.instrumentConfidenceLabel = new Gtk.Label({
            label: 'Confidence: 0%',
            css_classes: ['dim-label'],
        });
        
        instrumentBox.append(instrumentLabel);
        instrumentBox.append(this.currentInstrumentLabel);
        instrumentBox.append(this.instrumentConfidenceLabel);
        
        detectionsRow.append(noteBox);
        detectionsRow.append(instrumentBox);
        
        // Audio level indicator
        const levelBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
        });
        
        const levelLabel = new Gtk.Label({
            label: 'Audio Level:',
        });
        
        this.levelBar = new Gtk.LevelBar({
            min_value: 0,
            max_value: 100,
            value: 0,
        });
        
        levelBox.append(levelLabel);
        levelBox.append(this.levelBar);
        
        // Detected notes display
        const notesFrame = new Gtk.Frame({
            label: 'Active Notes',
        });
        
        this.detectedNotesLabel = new Gtk.Label({
            label: 'None',
            css_classes: ['monospace'],
            margin_top: 5,
            margin_bottom: 5,
            margin_start: 10,
            margin_end: 10,
        });
        
        notesFrame.set_child(this.detectedNotesLabel);
        
        mainBox.append(detectionsRow);
        mainBox.append(levelBox);
        mainBox.append(notesFrame);
        
        frame.set_child(mainBox);
        return frame;
    }
    
    _createChordDisplaySection() {
        const frame = new Gtk.Frame({
            label: 'Chord Analysis',
            margin_top: 10,
        });
        
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
        });
        
        this.chordLabel = new Gtk.Label({
            label: '<span size="xx-large" weight="bold">-</span>',
            use_markup: true,
            css_classes: ['chord-display'],
        });
        
        const chordInfoLabel = new Gtk.Label({
            label: 'Built from detected notes',
            css_classes: ['dim-label'],
        });
        
        box.append(this.chordLabel);
        box.append(chordInfoLabel);
        
        frame.set_child(box);
        return frame;
    }
    
    _createInstrumentSection() {
        const frame = new Gtk.Frame({
            label: 'FluidSynth Instrument',
            margin_top: 10,
        });
        
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
        });
        
        // First row: Instrument selection
        const instrumentRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
        });
        
        const label = new Gtk.Label({
            label: 'Instrument:',
        });
        
        this.instrumentCombo = new Gtk.ComboBoxText();
        
        // Instruments will be loaded after FluidSynth initialization
        // Add a placeholder item
        this.instrumentCombo.append_text('Initializing...');
        
        this.instrumentCombo.connect('changed', () => {
            this.selectedInstrument = this.instrumentCombo.get_active();
            this.fluidSynthController.setInstrument(this.selectedInstrument);
            
            // Update status to show current instrument
            const instrumentName = this.fluidSynthController.getCurrentInstrumentName();
            console.log(`Switched to instrument: ${instrumentName}`);
        });
        
        instrumentRow.append(label);
        instrumentRow.append(this.instrumentCombo);
        
        // Second row: Status and controls
        const statusRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
        });
        
        const statusLabel = new Gtk.Label({
            label: 'FluidSynth:',
            css_classes: ['dim-label'],
        });
        
        this.fluidStatusLabel = new Gtk.Label({
            label: 'Initializing...',
            css_classes: ['dim-label'],
        });
        
        // Test button to play a chord
        this.testChordButton = new Gtk.Button({
            label: 'Test Sound',
        });
        this.testChordButton.connect('clicked', () => {
            this._testCurrentInstrument();
        });
        
        statusRow.append(statusLabel);
        statusRow.append(this.fluidStatusLabel);
        statusRow.append(this.testChordButton);
        
        box.append(instrumentRow);
        box.append(statusRow);
        
        frame.set_child(box);
        return frame;
    }
    
    _loadInstrumentList() {
        // Clear existing items
        this.instrumentCombo.remove_all();
        
        // Get instruments from FluidSynth controller
        const instruments = this.fluidSynthController.getInstruments();
        
        console.log(`Loading ${instruments.length} instruments into UI`);
        
        instruments.forEach(instrument => {
            this.instrumentCombo.append_text(instrument);
        });
        
        // Set default selection (Piano)
        this.instrumentCombo.set_active(0);
        this.selectedInstrument = 0;
    }
    
    _updateFluidSynthUI() {
        // This is called after FluidSynth initialization to update the UI
        if (this.instrumentCombo) {
            this._loadInstrumentList();
        }
        
        if (this.fluidStatusLabel) {
            this.fluidStatusLabel.label = this.fluidSynthController.isReady() ? 'Ready' : 'Not Ready';
        }
        
        console.log('FluidSynth UI updated');
    }
    
    _testCurrentInstrument() {
        // Play a C major chord for testing
        const testChord = [60, 64, 67]; // C, E, G
        this.fluidSynthController.playChord(testChord, 100, 0);
    }
    
    _createSequencerSection() {
        const frame = new Gtk.Frame({
            label: 'Sequencer',
            margin_top: 10,
        });
        
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
        });
        
        // Sequencer controls
        const controlBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
        });
        
        this.playButton = new Gtk.Button({
            label: 'Play',
        });
        this.playButton.connect('clicked', () => {
            this.enhancedSequencer.play();
        });
        
        this.stopButton = new Gtk.Button({
            label: 'Stop',
        });
        this.stopButton.connect('clicked', () => {
            this.enhancedSequencer.stop();
        });
        
        this.recordSeqButton = new Gtk.Button({
            label: 'Record Sequence',
        });
        this.recordSeqButton.connect('clicked', () => {
            this.enhancedSequencer.toggleRecording();
            this._updateRecordingButton();
        });
        
        this.clearButton = new Gtk.Button({
            label: 'Clear',
        });
        this.clearButton.connect('clicked', () => {
            this.enhancedSequencer.clear();
            this._updateSequenceDisplay();
        });
        
        this.exportMidiButton = new Gtk.Button({
            label: 'Export MIDI',
        });
        this.exportMidiButton.connect('clicked', () => {
            this._exportMidiFile();
        });
        
        controlBox.append(this.playButton);
        controlBox.append(this.stopButton);
        controlBox.append(this.recordSeqButton);
        controlBox.append(this.clearButton);
        controlBox.append(this.exportMidiButton);
        
        // Sequence display
        const scrolled = new Gtk.ScrolledWindow({
            hexpand: true,
            vexpand: true,
            min_content_height: 150,
        });
        
        this.sequenceTextView = new Gtk.TextView({
            editable: false,
            css_classes: ['monospace'],
        });
        
        scrolled.set_child(this.sequenceTextView);
        
        box.append(controlBox);
        box.append(scrolled);
        
        frame.set_child(box);
        return frame;
    }
    
    _createControlSection() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            margin_top: 20,
        });
        
        this.startButton = new Gtk.Button({
            label: 'Start Recording',
            css_classes: ['suggested-action'],
        });
        this.startButton.connect('clicked', this._toggleRecording.bind(this));
        
        this.quitButton = new Gtk.Button({
            label: 'Quit',
            css_classes: ['destructive-action'],
        });
        this.quitButton.connect('clicked', () => {
            // Cleanup FluidSynth before quitting
            this.fluidSynthController.cleanup();
            this.application.quit();
        });
        
        box.append(this.startButton);
        box.append(this.quitButton);
        
        return box;
    }
    
    _createSettingsSection() {
        const frame = new Gtk.Frame({
            label: 'Settings',
            margin_top: 10,
        });
        
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 20,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 10,
            margin_end: 10,
        });
        
        // Theme selection
        const themeLabel = new Gtk.Label({
            label: '🎨 Theme:',
        });
        
        this.themeCombo = new Gtk.ComboBoxText();
        this.themeCombo.append_text('🔄 System Default');
        this.themeCombo.append_text('☀️ Light Theme');
        this.themeCombo.append_text('🌙 Dark Theme');
        
        // Set current theme selection
        switch (this.currentTheme) {
            case 'light': this.themeCombo.set_active(1); break;
            case 'dark': this.themeCombo.set_active(2); break;
            default: this.themeCombo.set_active(0); break;
        }
        
        this.themeCombo.connect('changed', () => {
            const activeIndex = this.themeCombo.get_active();
            switch (activeIndex) {
                case 1:
                    this._setTheme('light');
                    break;
                case 2:
                    this._setTheme('dark');
                    break;
                default:
                    this._setTheme('system');
                    break;
            }
        });
        
        box.append(themeLabel);
        box.append(this.themeCombo);
        
        frame.set_child(box);
        return frame;
    }
    
    _setupTheming() {
        // Try to get AdwStyleManager for GTK4/Adwaita
        try {
            imports.gi.versions.Adw = '1';
            const { Adw } = imports.gi;
            this.styleManager = Adw.StyleManager.get_default();
            console.log('Using Adwaita StyleManager');
        } catch (error) {
            console.log('Adwaita not available, using GTK settings approach');
            this.styleManager = null;
        }
        
        // Fallback to GTK settings
        if (!this.styleManager) {
            try {
                this.gtkSettings = Gtk.Settings.get_default();
                console.log('Using GTK Settings for theming');
            } catch (error) {
                console.log('Could not access GTK settings:', error.message);
            }
        }
        
        // Apply initial theme
        this._setTheme(this.currentTheme);
    }
    
    _setTheme(theme) {
        this.currentTheme = theme;
        
        // Apply CSS classes to the window to force theme changes
        this._applyThemeClasses(theme);
        
        // Apply theme classes directly to specific widgets
        this._applyWidgetThemeClasses(theme);
        
        // Try Adwaita StyleManager first
        if (this.styleManager && this.styleManager.set_color_scheme) {
            console.log(`Setting Adwaita theme to: ${theme}`);
            switch (theme) {
                case 'light':
                    this.styleManager.set_color_scheme(1); // ADW_COLOR_SCHEME_FORCE_LIGHT
                    break;
                case 'dark':
                    this.styleManager.set_color_scheme(2); // ADW_COLOR_SCHEME_FORCE_DARK
                    break;
                default:
                    this.styleManager.set_color_scheme(0); // ADW_COLOR_SCHEME_DEFAULT
                    break;
            }
        } else if (this.gtkSettings) {
            console.log(`Setting GTK theme to: ${theme}`);
            // GTK settings approach - use correct property names
            switch (theme) {
                case 'light':
                    this.gtkSettings.set_string_property('gtk-theme-name', this._getLightTheme());
                    this.gtkSettings.set_boolean_property('gtk-application-prefer-dark-theme', false);
                    break;
                case 'dark':
                    this.gtkSettings.set_string_property('gtk-theme-name', this._getDarkTheme());
                    this.gtkSettings.set_boolean_property('gtk-application-prefer-dark-theme', true);
                    break;
                default:
                    // Reset to system default
                    const systemPrefersDark = this._getSystemPrefersDark();
                    this.gtkSettings.set_string_property('gtk-theme-name', systemPrefersDark ? this._getDarkTheme() : this._getLightTheme());
                    this.gtkSettings.set_boolean_property('gtk-application-prefer-dark-theme', systemPrefersDark);
                    break;
            }
        }
        
        // Apply our comprehensive CSS styling
        this._applyCustomCSS(theme);
        
        // Force a complete style context update
        this._forceStyleUpdate();
        
        console.log(`Theme changed to: ${theme}`);
    }
    
    _applyThemeClasses(theme) {
        // Apply theme-specific CSS classes to the window
        if (this.window) {
            const styleContext = this.window.get_style_context();
            
            // Remove existing theme classes
            styleContext.remove_class('light-theme');
            styleContext.remove_class('dark-theme');
            styleContext.remove_class('system-theme');
            
            // Add new theme class
            switch (theme) {
                case 'light':
                    styleContext.add_class('light-theme');
                    break;
                case 'dark':
                    styleContext.add_class('dark-theme');
                    break;
                default:
                    styleContext.add_class('system-theme');
                    break;
            }
        }
    }
    
    _applyWidgetThemeClasses(theme) {
        // Apply theme classes directly to specific problematic widgets
        const widgets = [
            this.themeCombo,
            this.instrumentCombo, 
            this.sf2Combo,
            this.playButton,
            this.stopButton,
            this.recordSeqButton,
            this.clearButton,
            this.exportMidiButton,
            this.startButton,
            this.quitButton
        ];
        
        widgets.forEach(widget => {
            if (widget) {
                const styleContext = widget.get_style_context();
                
                // Remove existing theme classes
                styleContext.remove_class('app-light-widget');
                styleContext.remove_class('app-dark-widget');
                styleContext.remove_class('app-system-widget');
                
                // Add new theme class
                switch (theme) {
                    case 'light':
                        styleContext.add_class('app-light-widget');
                        break;
                    case 'dark':
                        styleContext.add_class('app-dark-widget');
                        break;
                    default:
                        styleContext.add_class('app-system-widget');
                        break;
                }
                
                // Try programmatic color override as last resort
                this._forceWidgetColors(widget, theme);
            }
        });
    }
    
    _forceWidgetColors(widget, theme) {
        // Programmatically force widget colors - this should override any CSS
        try {
            const styleContext = widget.get_style_context();
            
            if (theme === 'dark') {
                // Create dark theme colors
                const darkBg = new Gdk.RGBA();
                darkBg.parse('#404040');
                const lightFg = new Gdk.RGBA();
                lightFg.parse('#ffffff');
                
                // Force override colors at the highest priority
                styleContext.add_class('force-dark-colors');
                
            } else if (theme === 'light') {
                // Create light theme colors
                const lightBg = new Gdk.RGBA();
                lightBg.parse('#f5f5f5');
                const darkFg = new Gdk.RGBA();
                darkFg.parse('#000000');
                
                // Force override colors at the highest priority
                styleContext.add_class('force-light-colors');
            }
            
            // Force re-render
            widget.queue_draw();
            
        } catch (error) {
            console.log('Could not set programmatic colors:', error.message);
        }
    }
    
    _getLightTheme() {
        // Return a known light theme name
        const lightThemes = ['Adwaita', 'Default', 'Breeze', 'Arc'];
        const settings = Gtk.Settings.get_default();
        const currentTheme = settings.get_property('gtk-theme-name');
        
        // If current theme has a light variant, return it
        for (const theme of lightThemes) {
            if (currentTheme && currentTheme.includes(theme)) {
                return theme;
            }
        }
        
        return 'Adwaita'; // Default fallback
    }
    
    _getDarkTheme() {
        // Return a known dark theme name
        const settings = Gtk.Settings.get_default();
        const currentTheme = settings.get_property('gtk-theme-name');
        
        // If current theme has a dark variant, return it
        if (currentTheme) {
            if (currentTheme.includes('Adwaita')) return 'Adwaita-dark';
            if (currentTheme.includes('Breeze')) return 'Breeze-Dark';
            if (currentTheme.includes('Arc')) return 'Arc-Dark';
        }
        
        return 'Adwaita-dark'; // Default fallback
    }
    
    _getSystemPrefersDark() {
        // Try to detect system dark theme preference
        try {
            const settings = Gtk.Settings.get_default();
            const themeName = settings.get_property('gtk-theme-name');
            const iconThemeName = settings.get_property('gtk-icon-theme-name');
            
            // Simple heuristic - check if theme name contains "dark"
            return (themeName && themeName.toLowerCase().includes('dark')) ||
                   (iconThemeName && iconThemeName.toLowerCase().includes('dark'));
        } catch (error) {
            console.log('Could not detect system theme preference, defaulting to false');
            return false;
        }
    }
    
    _forceStyleUpdate() {
        // Force a style update on all widgets
        if (this.window) {
            try {
                // Queue a resize to force re-rendering
                this.window.queue_resize();
                
                // Also try to invalidate style contexts
                this._invalidateStyleContext(this.window);
            } catch (error) {
                console.log('Error forcing style update:', error.message);
            }
        }
    }
    
    _invalidateStyleContext(widget) {
        // Recursively invalidate style contexts
        try {
            const styleContext = widget.get_style_context();
            if (styleContext && styleContext.invalidate) {
                styleContext.invalidate();
            }
            
            // If it's a container, iterate through children
            if (widget.get_first_child) {
                let child = widget.get_first_child();
                while (child) {
                    this._invalidateStyleContext(child);
                    child = child.get_next_sibling();
                }
            }
        } catch (error) {
            // Ignore errors for widgets that don't support these operations
        }
    }
    
    _applyCustomCSS(theme) {
        // Create or update CSS provider for custom styling
        if (!this.cssProvider) {
            this.cssProvider = new Gtk.CssProvider();
            Gtk.StyleContext.add_provider_for_display(
                this.window?.get_display() || Gdk.Display.get_default(),
                this.cssProvider,
                Gtk.STYLE_PROVIDER_PRIORITY_USER
            );
        }
        
        let customCSS = `
            .chord-display {
                padding: 20px;
                border-radius: 8px;
                transition: all 200ms ease;
            }
            
            .monospace {
                font-family: "Liberation Mono", "DejaVu Sans Mono", monospace;
                font-size: 11pt;
            }
            
            .dim-label {
                opacity: 0.7;
            }
        `;
        
        // Add comprehensive theme-specific styling for the entire window
        if (theme === 'dark') {
            customCSS += `
                /* Force dark theme for entire window */
                window {
                    background-color: #2d2d2d;
                    color: #ffffff;
                }
                
                frame {
                    background-color: #3d3d3d;
                    border: 1px solid #555555;
                }
                
                box {
                    background-color: rgba(255, 255, 255, 0.02);
                }
                
                .chord-display {
                    background-color: rgba(255, 255, 255, 0.15);
                    color: #ffffff;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                
                /* Button styling with proper contrast */
                button {
                    background-color: #404040;
                    color: #ffffff;
                    border: 1px solid #606060;
                }
                
                button:hover {
                    background-color: #505050;
                    color: #ffffff;
                }
                
                button:active {
                    background-color: #353535;
                    color: #ffffff;
                }
                
                /* ComboBox specific styling */
                combobox {
                    background-color: #404040;
                    color: #ffffff;
                }
                
                combobox button {
                    background-color: #404040;
                    color: #ffffff;
                    border: 1px solid #606060;
                }
                
                combobox button:hover {
                    background-color: #505050;
                    color: #ffffff;
                }
                
                combobox button label {
                    color: #ffffff;
                }
                
                /* ComboBox dropdown styling */
                popover {
                    background-color: #404040;
                    color: #ffffff;
                    border: 1px solid #606060;
                }
                
                popover contents {
                    background-color: #404040;
                    color: #ffffff;
                }
                
                popover modelbutton {
                    background-color: #404040;
                    color: #ffffff;
                }
                
                popover modelbutton:hover {
                    background-color: #505050;
                    color: #ffffff;
                }
                
                popover modelbutton label {
                    color: #ffffff;
                }
                
                /* Entry styling */
                entry {
                    background-color: #404040;
                    color: #ffffff;
                    border: 1px solid #606060;
                }
                
                entry:focus {
                    background-color: #454545;
                    color: #ffffff;
                }
                
                entry text {
                    color: #ffffff;
                }
                
                /* Text view styling */
                textview {
                    background-color: #2d2d2d;
                    color: #ffffff;
                }
                
                textview text {
                    background-color: #2d2d2d;
                    color: #ffffff;
                }
                
                scrolledwindow {
                    background-color: #2d2d2d;
                }
                
                /* Level bar styling */
                levelbar block {
                    background-color: #4a90e2;
                }
                
                /* Label styling */
                label {
                    color: #ffffff;
                }
                
                /* Frame label styling */
                frame > label {
                    color: #ffffff;
                    background-color: transparent;
                }
                
                /* Direct widget theme classes for dark theme */
                .app-dark-widget {
                    background-color: #404040;
                    color: #ffffff;
                }
                
                .app-dark-widget button {
                    background-color: #404040;
                    color: #ffffff;
                    border: 1px solid #606060;
                }
                
                .app-dark-widget label {
                    color: #ffffff;
                }
                
                /* Force color classes with highest specificity */
                window .force-dark-colors {
                    background-color: #404040;
                    color: #ffffff;
                }
                
                window .force-dark-colors label {
                    color: #ffffff;
                }
                
                window .force-dark-colors button {
                    background-color: #404040;
                    color: #ffffff;
                    border: 1px solid #606060;
                }
                
                window .force-dark-colors combobox button {
                    background-color: #404040;
                    color: #ffffff;
                    border: 1px solid #606060;
                }
                
                window .force-dark-colors combobox button label {
                    color: #ffffff;
                }
            `;
        } else if (theme === 'light') {
            customCSS += `
                /* Force light theme for entire window */
                window {
                    background-color: #ffffff;
                    color: #000000;
                }
                
                frame {
                    background-color: #f8f8f8;
                    border: 1px solid #e0e0e0;
                }
                
                box {
                    background-color: rgba(0, 0, 0, 0.01);
                }
                
                .chord-display {
                    background-color: rgba(0, 0, 0, 0.08);
                    color: #000000;
                    border: 1px solid rgba(0, 0, 0, 0.1);
                }
                
                button {
                    background-color: #f5f5f5;
                    color: #000000;
                    border: 1px solid #d0d0d0;
                }
                
                button:hover {
                    background-color: #e8e8e8;
                }
                
                combobox button {
                    background-color: #f5f5f5;
                    color: #000000;
                }
                
                entry {
                    background-color: #ffffff;
                    color: #000000;
                    border: 1px solid #d0d0d0;
                }
                
                textview {
                    background-color: #ffffff;
                    color: #000000;
                }
                
                textview text {
                    background-color: #ffffff;
                    color: #000000;
                }
                
                scrolledwindow {
                    background-color: #ffffff;
                }
                
                levelbar block {
                    background-color: #007acc;
                }
            `;
        } else {
            // System theme - minimal custom styling
            customCSS += `
                .chord-display {
                    background-color: alpha(@theme_bg_color, 0.1);
                    border: 1px solid alpha(@theme_fg_color, 0.2);
                }
            `;
        }
        
        try {
            this.cssProvider.load_from_data(customCSS, customCSS.length);
            console.log(`Applied ${theme} theme CSS styles`);
        } catch (error) {
            console.error('Failed to load CSS:', error.message);
        }
    }
    
    _setupAudioPipeline() {
        // Connect enhanced audio processor callbacks
        this.enhancedAudioProcessor.connect('audio-data', (processor, data) => {
            // Pass audio data to enhanced detector
            this.enhancedDetector.processAudioData(data);
        });
        
        this.enhancedAudioProcessor.connect('audio-level', (processor, level) => {
            if (this.levelBar) {
                this.levelBar.set_value(level);
            }
        });
        
        this.enhancedAudioProcessor.connect('note-detected', (processor, note, confidence) => {
            this._onNoteDetected(note, confidence);
            // Also process through enhanced detector for chord building
            this.enhancedDetector.processNoteDetection(note, confidence);
        });
        
        this.enhancedAudioProcessor.connect('instrument-detected', (processor, instrument, confidence) => {
            this._onInstrumentDetected(instrument, confidence);
            // Also process through enhanced detector
            this.enhancedDetector.processInstrumentDetection(instrument, confidence);
        });
        
        // Connect enhanced detector callbacks
        this.enhancedDetector.connect('note-detected', (detector, note, confidence) => {
            this._onStableNoteDetected(note, confidence);
        });
        
        this.enhancedDetector.connect('instrument-detected', (detector, instrument, confidence) => {
            this._onStableInstrumentDetected(instrument, confidence);
        });
        
        this.enhancedDetector.connect('chord-detected', (detector, chord) => {
            this._onChordDetected(chord);
        });
        
        this.enhancedDetector.connect('analysis-updated', (detector, analysisDataJson) => {
            try {
                const analysisData = JSON.parse(analysisDataJson);
                this._updateAnalysisDisplay(analysisData);
            } catch (error) {
                console.log('Error parsing analysis data:', error.message);
            }
        });
        
        // Legacy connections for fallback
        this.audioProcessor.connect('audio-data', (processor) => {
            this._processAudioData();
        });
        
        this.audioProcessor.connect('audio-level', (processor, level) => {
            if (this.levelBar) {
                this.levelBar.set_value(level);
            }
        });
        
        this.chordDetector.connect('chord-detected', (detector, chord) => {
            this._onChordDetected(chord);
        });
        
        // Connect enhanced sequencer callbacks
        this.enhancedSequencer.connect('sequence-updated', () => {
            this._updateSequenceDisplay();
        });
        
        this.enhancedSequencer.connect('play-notes', (sequencer, notes, duration) => {
            // Play notes with proper timing using enhanced FluidSynth methods
            this.fluidSynthController.playNotes(notes, 100, 0, duration);
        });
        
        this.enhancedSequencer.connect('stop-notes', (sequencer, notes) => {
            // Stop specific notes
            this.fluidSynthController.stopNotes(notes, 0);
        });
        
        this.enhancedSequencer.connect('playback-started', () => {
            this._updatePlaybackButtons(true);
        });
        
        this.enhancedSequencer.connect('playback-stopped', () => {
            this._updatePlaybackButtons(false);
        });
        
        // Legacy sequencer callbacks for fallback
        this.sequencer.connect('sequence-updated', () => {
            this._updateSequenceDisplay();
        });
        
        this.sequencer.connect('play-chord', (sequencer, chord) => {
            // Convert chord name to MIDI notes and play with FluidSynth
            const notes = this._chordToNotes(chord);
            this.fluidSynthController.playChord(notes, 100, 0);
        });
    }
    
    _toggleRecording() {
        if (this.isRecording) {
            this._stopRecording();
        } else {
            this._startRecording();
        }
    }
    
    _startRecording() {
        try {
            // Use enhanced audio processor primarily
            this.enhancedAudioProcessor.startRecording();
            // Also start legacy processor as fallback
            this.audioProcessor.startRecording();
            
            this.isRecording = true;
            this.startButton.label = 'Stop Recording';
            this.startButton.css_classes = ['destructive-action'];
            this.statusLabel.label = 'Recording - Detecting Notes & Instruments...';
        } catch (error) {
            this._showError('Failed to start recording: ' + error.message);
        }
    }
    
    _stopRecording() {
        // Stop both processors
        this.enhancedAudioProcessor.stopRecording();
        this.audioProcessor.stopRecording();
        
        // Clear enhanced detector state
        this.enhancedDetector.clearDetections();
        
        this.isRecording = false;
        this.startButton.label = 'Start Recording';
        this.startButton.css_classes = ['suggested-action'];
        this.statusLabel.label = 'Ready';
        
        // Reset UI displays
        if (this.currentNoteLabel) {
            this.currentNoteLabel.label = '<span size="x-large" weight="bold">-</span>';
            this.noteConfidenceLabel.label = 'Confidence: 0%';
        }
        if (this.currentInstrumentLabel) {
            this.currentInstrumentLabel.label = '<span size="large" weight="bold">-</span>';
            this.instrumentConfidenceLabel.label = 'Confidence: 0%';
        }
        if (this.detectedNotesLabel) {
            this.detectedNotesLabel.label = 'None';
        }
    }
    
    _processAudioData(data) {
        // Process audio data for chord detection
        this.chordDetector.processAudioData(data);
    }
    
    _chordToNotes(chordName) {
        // Convert chord name to MIDI note numbers
        const noteMapping = {
            'C': [60, 64, 67], 'C#': [61, 65, 68], 'D': [62, 66, 69], 'D#': [63, 67, 70],
            'E': [64, 68, 71], 'F': [65, 69, 72], 'F#': [66, 70, 73], 'G': [67, 71, 74],
            'G#': [68, 72, 75], 'A': [69, 73, 76], 'A#': [70, 74, 77], 'B': [71, 75, 78],
            'Cm': [60, 63, 67], 'C#m': [61, 64, 68], 'Dm': [62, 65, 69], 'D#m': [63, 66, 70],
            'Em': [64, 67, 71], 'Fm': [65, 68, 72], 'F#m': [66, 69, 73], 'Gm': [67, 70, 74],
            'G#m': [68, 71, 75], 'Am': [69, 72, 76], 'A#m': [70, 73, 77], 'Bm': [71, 74, 78],
            'C7': [60, 64, 67, 70], 'Dm7': [62, 65, 69, 72], 'Em7': [64, 67, 71, 74],
            'F7': [65, 69, 72, 75], 'G7': [67, 71, 74, 77], 'Am7': [69, 72, 76, 79],
            'Cmaj7': [60, 64, 67, 71], 'Dmaj7': [62, 66, 69, 73], 'Fmaj7': [65, 69, 72, 76]
        };
        
        return noteMapping[chordName] || [60]; // Default to middle C if chord not found
    }
    
    // Enhanced detection callbacks
    _onNoteDetected(note, confidence) {
        // Raw note detection from audio processor (before stability filtering)
        console.log(`Raw note detected: ${note} (${(confidence * 100).toFixed(1)}%)`);
    }
    
    _onInstrumentDetected(instrument, confidence) {
        // Raw instrument detection from audio processor (before stability filtering)
        console.log(`Raw instrument detected: ${instrument} (${(confidence * 100).toFixed(1)}%)`);
    }
    
    _onStableNoteDetected(note, confidence) {
        // Stable note detection from enhanced detector
        if (note !== this.currentNote) {
            this.currentNote = note;
            this.noteConfidence = confidence;
            
            if (this.currentNoteLabel) {
                this.currentNoteLabel.label = `<span size="x-large" weight="bold">${note}</span>`;
            }
            if (this.noteConfidenceLabel) {
                this.noteConfidenceLabel.label = `Confidence: ${(confidence * 100).toFixed(0)}%`;
            }
            
            console.log(`Stable note: ${note} (${(confidence * 100).toFixed(1)}%)`);
            
            // Add note to enhanced sequencer if recording
            if (this.enhancedSequencer.getPlaybackInfo().isRecording) {
                this.enhancedSequencer.addNote(note, Date.now(), confidence);
            }
        }
    }
    
    _onStableInstrumentDetected(instrument, confidence) {
        // Stable instrument detection from enhanced detector
        if (instrument !== this.currentInstrument) {
            this.currentInstrument = instrument;
            this.instrumentConfidence = confidence;
            
            if (this.currentInstrumentLabel) {
                this.currentInstrumentLabel.label = `<span size="large" weight="bold">${instrument}</span>`;
            }
            if (this.instrumentConfidenceLabel) {
                this.instrumentConfidenceLabel.label = `Confidence: ${(confidence * 100).toFixed(0)}%`;
            }
            
            console.log(`Stable instrument: ${instrument} (${(confidence * 100).toFixed(1)}%)`);
            
            // Automatically switch FluidSynth instrument if enabled and confidence is high enough
            this._maybeAutoSwitchInstrument(instrument, confidence);
        }
    }
    
    _updateAnalysisDisplay(analysisData) {
        // Update the active notes display
        if (this.detectedNotesLabel && analysisData.detectedNotes) {
            const notesText = analysisData.detectedNotes.length > 0 
                ? analysisData.detectedNotes.join(', ') 
                : 'None';
            this.detectedNotesLabel.label = notesText;
        }
    }
    
    _onChordDetected(chord) {
        if (chord !== this.currentChord) {
            this.currentChord = chord;
            this.chordLabel.label = `<span size="xx-large" weight="bold">${chord}</span>`;
            
            // Convert chord to MIDI notes and play with FluidSynth
            const notes = this._chordToNotes(chord);
            this.fluidSynthController.playChord(notes, 100, 0);
            
            // Add to enhanced sequencer if recording
            if (this.enhancedSequencer.getPlaybackInfo().isRecording) {
                this.enhancedSequencer.addChord(chord, Date.now());
            }
            
            // Legacy sequencer for fallback
            if (this.sequencer.isRecording) {
                this.sequencer.addChord(chord, Date.now());
            }
            
            console.log(`Chord detected: ${chord}`);
        }
    }
    
    _updateSequenceDisplay() {
        const enhancedSequence = this.enhancedSequencer.getSequence();
        const playbackInfo = this.enhancedSequencer.getPlaybackInfo();
        
        let text = `=== Enhanced Sequence (${playbackInfo.detectedMode} mode) ===\n`;
        text += `Events: ${enhancedSequence.length}, Recording: ${playbackInfo.isRecording ? 'ON' : 'OFF'}\n\n`;
        
        if (enhancedSequence.length > 0) {
            enhancedSequence.forEach((item, index) => {
                const timeStr = `${(item.timestamp / 1000).toFixed(2)}s`;
                if (item.type === 'note') {
                    text += `${index + 1}: [${timeStr}] Note: ${item.note} (${item.duration}ms, conf: ${(item.confidence * 100).toFixed(0)}%)\n`;
                } else if (item.type === 'chord') {
                    text += `${index + 1}: [${timeStr}] Chord: ${item.chord} (${item.duration}ms)\n`;
                }
            });
        } else {
            text += 'No recorded events\n';
        }
        
        this.sequenceTextView.get_buffer().set_text(text, -1);
    }
    
    // Update recording button state
    _updateRecordingButton() {
        const playbackInfo = this.enhancedSequencer.getPlaybackInfo();
        if (playbackInfo.isRecording) {
            this.recordSeqButton.label = 'Stop Recording Sequence';
            this.recordSeqButton.css_classes = ['destructive-action'];
        } else {
            this.recordSeqButton.label = 'Record Sequence';
            this.recordSeqButton.css_classes = ['suggested-action'];
        }
    }
    
    // Update playback button states
    _updatePlaybackButtons(isPlaying) {
        if (isPlaying) {
            this.playButton.label = 'Playing...';
            this.playButton.sensitive = false;
            this.stopButton.sensitive = true;
        } else {
            this.playButton.label = 'Play';
            this.playButton.sensitive = true;
            this.stopButton.sensitive = false;
        }
    }
    
    _exportMidiFile() {
        const sequence = this.sequencer.getSequence();
        
        if (sequence.length === 0) {
            this._showError('No sequence to export. Please record a sequence first.');
            return;
        }
        
        // Create file chooser dialog
        const dialog = new Gtk.FileChooserDialog({
            title: 'Export MIDI File',
            transient_for: this.window,
            modal: true,
            action: Gtk.FileChooserAction.SAVE,
        });
        
        dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
        dialog.add_button('Export', Gtk.ResponseType.ACCEPT);
        
        // Set default filename
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:\-T]/g, '');
        dialog.set_current_name(`voice-chord-sequence-${timestamp}.mid`);
        
        // Add MIDI file filter
        const filter = new Gtk.FileFilter();
        filter.set_name('MIDI Files');
        filter.add_pattern('*.mid');
        filter.add_pattern('*.midi');
        dialog.add_filter(filter);
        
        dialog.connect('response', (dialog, responseId) => {
            if (responseId === Gtk.ResponseType.ACCEPT) {
                const filename = dialog.get_file().get_path();
                this._saveMidiFile(filename, sequence);
            }
            dialog.close();
        });
        
        dialog.present();
    }
    
    _saveMidiFile(filename, sequence) {
        try {
            // Generate MIDI file data
            const midiData = this._generateMidiData(sequence);
            
            // Write to file
            const file = Gio.File.new_for_path(filename);
            const outputStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            
            const bytes = GLib.Bytes.new(midiData);
            outputStream.write_bytes(bytes, null);
            outputStream.close(null);
            
            // Show success message
            this._showMessage('MIDI Export', `Successfully exported MIDI file to:\n${filename}`);
            
        } catch (error) {
            this._showError(`Failed to export MIDI file: ${error.message}`);
        }
    }
    
    _generateMidiData(sequence) {
        // Create a basic MIDI file structure
        const midiFile = new MidiFile();
        
        // Add sequence events
        midiFile.addSequence(sequence, this.selectedInstrument);
        
        return midiFile.toByteArray();
    }
    
    _showMessage(title, message) {
        const dialog = new Gtk.MessageDialog({
            transient_for: this.window,
            modal: true,
            message_type: Gtk.MessageType.INFO,
            buttons: Gtk.ButtonsType.OK,
            text: title,
            secondary_text: message,
        });
        
        dialog.connect('response', () => {
            dialog.close();
        });
        
        dialog.present();
    }
    
    _showError(message) {
        const dialog = new Gtk.MessageDialog({
            transient_for: this.window,
            modal: true,
            message_type: Gtk.MessageType.ERROR,
            buttons: Gtk.ButtonsType.OK,
            text: message,
        });
        
        dialog.connect('response', () => {
            dialog.close();
        });
        
        dialog.present();
    }
    
    _initializeVoiceInstrumentMap() {
        // Map voice recognition instrument names to FluidSynth instrument indices
        // Based on General MIDI / Yamaha XG Sound Set instrument numbers (0-based indexing)
        return {
            // Piano family (0-7)
            'piano': 0,           // 001: Acoustic Grand Piano
            'acoustic piano': 0,  
            'grand piano': 0,
            'electric piano': 4,  // 005: Electric Piano 1
            'harpsichord': 6,     // 007: Harpsichord
            'clavinet': 7,        // 008: Clavinet
            
            // Organ family (16-23)
            'organ': 16,          // 017: Drawbar Organ
            'church organ': 19,   // 020: Church Organ
            'hammond organ': 16,  // 017: Drawbar Organ
            'electric organ': 16, // 017: Drawbar Organ
            
            // Guitar family (24-31)
            'guitar': 24,           // 025: Acoustic Guitar (nylon)
            'acoustic guitar': 24,  // 025: Acoustic Guitar (nylon)
            'electric guitar': 27,  // 028: Electric Guitar (clean)
            'clean guitar': 27,     // 028: Electric Guitar (clean)
            'distortion guitar': 30, // 031: Guitar Distortion
            'overdrive guitar': 29,  // 030: Guitar Overdrive
            'bass': 32,             // 033: Acoustic Bass
            'bass guitar': 33,      // 034: Electric Bass (finger)
            'electric bass': 33,    // 034: Electric Bass (finger)
            
            // String family (40-47)
            'violin': 40,         // 041: Violin - CORRECT INDEX!
            'viola': 41,          // 042: Viola
            'cello': 42,          // 043: Cello
            'strings': 48,        // 049: String Ensemble 1
            'string section': 48, // 049: String Ensemble 1
            
            // Brass family (56-63)
            'trumpet': 56,        // 057: Trumpet
            'trombone': 57,       // 058: Trombone
            'french horn': 60,    // 061: French Horn
            'tuba': 58,           // 059: Tuba
            'brass': 61,          // 062: Synth Brass 1
            'brass section': 61,  // 062: Synth Brass 1
            
            // Wind instruments (64-79)
            'flute': 73,          // 074: Flute - CORRECT INDEX!
            'clarinet': 71,       // 072: Clarinet
            'saxophone': 64,      // 065: Soprano Sax
            'sax': 64,            // 065: Soprano Sax
            'oboe': 68,           // 069: Oboe
            'woodwind': 73,       // 074: Flute
            
            // Synth sounds (80-95)
            'synthesizer': 80,    // 081: Lead 1 (square)
            'synth': 80,          // 081: Lead 1 (square)
            'lead': 80,           // 081: Lead 1 (square)
            'pad': 88,            // 089: Pad 1 (new age)
            'strings pad': 92,    // 093: Pad 5 (bowed)
            
            // Percussion (112-119) - Channel 9 in GM, but for melodic use different instruments
            'drums': 116,         // 117: Taiko Drum
            'percussion': 116,    // 117: Taiko Drum
            'kit': 116,           // 117: Taiko Drum
            'drum kit': 116       // 117: Taiko Drum
        };
    }
    
    _maybeAutoSwitchInstrument(recognizedInstrument, confidence) {
        // Check if automatic instrument switching is enabled
        if (!this.autoInstrumentSwitch) {
            return;
        }
        
        // Check confidence threshold
        if (confidence < this.instrumentSwitchThreshold) {
            console.log(`Instrument confidence (${(confidence * 100).toFixed(1)}%) below threshold (${(this.instrumentSwitchThreshold * 100)}%), not switching`);
            return;
        }
        
        // Check cooldown to prevent rapid switching
        const now = Date.now();
        if (now - this.lastInstrumentSwitch < this.instrumentSwitchCooldown) {
            console.log('Instrument switch on cooldown, not switching');
            return;
        }
        
        // Find matching instrument index
        const instrumentName = recognizedInstrument.toLowerCase();
        const instrumentIndex = this.voiceInstrumentMap[instrumentName];
        
        if (instrumentIndex === undefined) {
            console.log(`No mapping found for instrument: ${recognizedInstrument}`);
            return;
        }
        
        // Check if it's different from current selection
        if (instrumentIndex === this.selectedInstrument) {
            console.log(`Instrument ${recognizedInstrument} already selected`);
            return;
        }
        
        // Perform the switch
        console.log(`Auto-switching instrument: ${recognizedInstrument} -> index ${instrumentIndex}`);
        
        // Update UI selector
        // For Gtk.ComboBoxText, we need to check if the index is valid differently
        if (this.instrumentCombo) {
            // Get the model from ComboBoxText and check its length
            const model = this.instrumentCombo.get_model();
            if (model && instrumentIndex < model.iter_n_children(null)) {
                this.instrumentCombo.set_active(instrumentIndex);
            } else {
                console.log(`Instrument index ${instrumentIndex} out of range`);
            }
        }
        
        // Update selected instrument
        this.selectedInstrument = instrumentIndex;
        
        // Set FluidSynth instrument
        this.fluidSynthController.setInstrument(instrumentIndex);
        
        // Update cooldown timer
        this.lastInstrumentSwitch = now;
        
        // Get the actual instrument name for feedback
        const actualInstrumentName = this.fluidSynthController.getCurrentInstrumentName();
        console.log(`Successfully switched to: ${actualInstrumentName}`);
        
        // Optional: Show a brief notification in the UI
        this._showInstrumentSwitchNotification(recognizedInstrument, actualInstrumentName);
    }
    
    _showInstrumentSwitchNotification(recognizedName, actualName) {
        // Temporarily update status to show the switch
        const originalStatus = this.statusLabel.label;
        this.statusLabel.label = `Auto-switched to ${actualName} (detected: ${recognizedName})`;
        
        // Reset status after a few seconds
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
            if (this.statusLabel.label.includes('Auto-switched')) {
                this.statusLabel.label = originalStatus;
            }
            return GLib.SOURCE_REMOVE;
        });
    }
    
    run(argv) {
        return this.application.run(argv);
    }
}

// Run the application
const app = new VoiceChordApp();
app.run(ARGV);
