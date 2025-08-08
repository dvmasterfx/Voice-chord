Name:           voice-chord
Version:        1.0.0
Release:        1%{?dist}
Summary:        Real-time voice chord recognition application with MIDI output

License:        GPL-3.0-or-later
URL:            https://github.com/dvmasterfx/Voice-chord
Source0:        %{name}-%{version}.tar.gz

BuildArch:      noarch

BuildRequires:  desktop-file-utils

Requires:       gjs >= 1.68.0
Requires:       gtk4 >= 4.0
Requires:       libadwaita >= 1.0
Requires:       gstreamer1 >= 1.18
Requires:       gstreamer1-plugins-base
Requires:       gstreamer1-plugins-good
Requires:       gstreamer1-plugins-bad
Requires:       fluidsynth >= 2.0
Requires:       fluidsynth-soundfont-default

%description
Voice Chord is a real-time voice chord recognition application for Linux GNOME 
that detects individual notes, instruments, and chords from your voice, 
converting them to MIDI output with advanced sequencing capabilities.

Features:
- Real-time chord detection from voice input
- Individual note and instrument recognition
- MIDI conversion with multiple instruments
- Built-in sequencer for recording and playback
- Advanced FFT-based audio analysis
- Export to standard MIDI files

%prep
%autosetup

%build
# No build required for GJS application

%install
# Create directories
mkdir -p %{buildroot}%{_datadir}/%{name}
mkdir -p %{buildroot}%{_bindir}
mkdir -p %{buildroot}%{_datadir}/applications
mkdir -p %{buildroot}%{_datadir}/doc/%{name}
mkdir -p %{buildroot}%{_datadir}/icons/hicolor/scalable/apps

# Install application files
install -m 644 main.js %{buildroot}%{_datadir}/%{name}/
install -m 644 audioProcessor.js %{buildroot}%{_datadir}/%{name}/
install -m 644 chordDetector.js %{buildroot}%{_datadir}/%{name}/
install -m 644 midiController.js %{buildroot}%{_datadir}/%{name}/
install -m 644 sequencer.js %{buildroot}%{_datadir}/%{name}/
install -m 644 fluidsynthController.js %{buildroot}%{_datadir}/%{name}/
install -m 644 enhancedAudioProcessor.js %{buildroot}%{_datadir}/%{name}/
install -m 644 enhancedDetector.js %{buildroot}%{_datadir}/%{name}/
install -m 644 enhancedSequencer.js %{buildroot}%{_datadir}/%{name}/
install -m 644 style.css %{buildroot}%{_datadir}/%{name}/
install -m 644 "Yamaha XG Sound Set.sf2" %{buildroot}%{_datadir}/%{name}/

# Install launcher script
cat > %{buildroot}%{_bindir}/%{name} << 'EOF'
#!/bin/bash
cd %{_datadir}/%{name}
exec gjs main.js "$@"
EOF
chmod 755 %{buildroot}%{_bindir}/%{name}

# Install icon and desktop file
install -m 644 icon.svg %{buildroot}%{_datadir}/icons/hicolor/scalable/apps/org.voicechord.VoiceChord.svg
install -m 644 org.voicechord.VoiceChord.desktop %{buildroot}%{_datadir}/applications/

# Install documentation
install -m 644 README.md %{buildroot}%{_datadir}/doc/%{name}/

%check
desktop-file-validate %{buildroot}%{_datadir}/applications/org.voicechord.VoiceChord.desktop

%files
%license
%doc %{_datadir}/doc/%{name}/README.md
%{_bindir}/%{name}
%{_datadir}/%{name}/
%{_datadir}/applications/org.voicechord.VoiceChord.desktop
%{_datadir}/icons/hicolor/scalable/apps/org.voicechord.VoiceChord.svg

%changelog
* Thu Aug 08 2024 David Martins <dvdmartinsfx@gmail.com> - 1.0.0-1
- Initial release
- Real-time voice chord recognition
- Advanced audio analysis with FFT
- Individual note and instrument detection
- MIDI output with multiple instruments
- Built-in sequencer and MIDI export
- Enhanced UI with confidence levels
