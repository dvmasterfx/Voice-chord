PREFIX ?= /usr/local
DESTDIR ?=
BINDIR = $(DESTDIR)$(PREFIX)/bin
DATADIR = $(DESTDIR)$(PREFIX)/share
APPDIR = $(DATADIR)/voice-chord
DOCDIR = $(DATADIR)/doc/voice-chord
DESKTOPDIR = $(DATADIR)/applications
ICONDIR = $(DATADIR)/icons/hicolor/scalable/apps

VERSION = 1.0.0
PACKAGE_NAME = voice-chord
TARBALL = $(PACKAGE_NAME)-$(VERSION).tar.gz

# Application files
APP_FILES = main.js audioProcessor.js chordDetector.js midiController.js sequencer.js \
            fluidsynthController.js enhancedAudioProcessor.js enhancedDetector.js \
            enhancedSequencer.js style.css
SOUNDFONT = Yamaha XG Sound Set.sf2
ICON_FILE = icon.svg
DOC_FILES = README.md
DESKTOP_FILE = org.voicechord.VoiceChord.desktop

.PHONY: all install uninstall clean dist rpm deb appimage flatpak help

all: help

help:
	@echo "Voice Chord Build System"
	@echo "========================"
	@echo ""
	@echo "Available targets:"
	@echo "  install    - Install application to system (requires sudo)"
	@echo "  uninstall  - Remove application from system (requires sudo)"
	@echo "  dist       - Create source tarball for distribution"
	@echo "  rpm        - Build RPM package (Fedora/RHEL)"
	@echo "  deb        - Build DEB package (Debian/Ubuntu)"
	@echo "  appimage   - Build AppImage (universal Linux)"
	@echo "  flatpak    - Build Flatpak package"
	@echo "  clean      - Clean build artifacts"
	@echo "  test       - Run application tests"
	@echo ""
	@echo "Installation prefix: $(PREFIX)"
	@echo "Current version: $(VERSION)"

install: all
	@echo "Installing Voice Chord v$(VERSION)..."
	install -d $(BINDIR)
	install -d $(APPDIR)
	install -d $(DOCDIR)
	install -d $(DESKTOPDIR)
	install -d $(ICONDIR)
	
	# Install application files
	install -m 644 $(APP_FILES) $(APPDIR)/
	install -m 644 "$(SOUNDFONT)" $(APPDIR)/
	
	# Install launcher script
	echo '#!/bin/bash' > $(BINDIR)/voice-chord
	echo 'cd $(PREFIX)/share/voice-chord' >> $(BINDIR)/voice-chord
	echo 'exec gjs main.js "$$@"' >> $(BINDIR)/voice-chord
	chmod 755 $(BINDIR)/voice-chord
	
	# Install icon, desktop file and documentation
	install -m 644 $(ICON_FILE) $(ICONDIR)/org.voicechord.VoiceChord.svg
	install -m 644 $(DESKTOP_FILE) $(DESKTOPDIR)/
	install -m 644 $(DOC_FILES) $(DOCDIR)/
	
	@echo "Installation complete!"
	@echo "Run with: voice-chord"

uninstall:
	@echo "Uninstalling Voice Chord..."
	rm -f $(BINDIR)/voice-chord
	rm -rf $(APPDIR)
	rm -rf $(DOCDIR)
	rm -f $(DESKTOPDIR)/$(DESKTOP_FILE)
	rm -f $(ICONDIR)/org.voicechord.VoiceChord.svg
	@echo "Uninstallation complete!"

dist: clean
	@echo "Creating source distribution..."
	mkdir -p $(PACKAGE_NAME)-$(VERSION)
	cp -r $(APP_FILES) "$(SOUNDFONT)" $(ICON_FILE) $(DOC_FILES) $(DESKTOP_FILE) \
	      run.sh package.json Makefile \
	      $(PACKAGE_NAME)-$(VERSION)/
	cp -r debian/ $(PACKAGE_NAME)-$(VERSION)/
	cp *.spec $(PACKAGE_NAME)-$(VERSION)/ 2>/dev/null || true
	tar -czf $(TARBALL) $(PACKAGE_NAME)-$(VERSION)
	rm -rf $(PACKAGE_NAME)-$(VERSION)
	@echo "Source tarball created: $(TARBALL)"

rpm: dist
	@echo "Building RPM package..."
	@if ! command -v rpmbuild >/dev/null 2>&1; then \
		echo "Error: rpmbuild not found. Install rpm-build package."; \
		exit 1; \
	fi
	mkdir -p ~/rpmbuild/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
	cp $(TARBALL) ~/rpmbuild/SOURCES/
	cp $(PACKAGE_NAME).spec ~/rpmbuild/SPECS/
	rpmbuild -ba ~/rpmbuild/SPECS/$(PACKAGE_NAME).spec
	@echo "RPM packages built in ~/rpmbuild/RPMS/"

deb: clean
	@echo "Building DEB package..."
	@if ! command -v debuild >/dev/null 2>&1; then \
		echo "Error: debuild not found. Install devscripts package."; \
		exit 1; \
	fi
	debuild -us -uc -b
	@echo "DEB package built in parent directory"

appimage: clean
	@echo "Building AppImage..."
	./build-appimage.sh
	@echo "AppImage built successfully!"

flatpak: clean
	@echo "Building Flatpak package..."
	@if ! command -v flatpak-builder >/dev/null 2>&1; then \
		echo "Error: flatpak-builder not found. Install flatpak-builder package."; \
		exit 1; \
	fi
	flatpak-builder --force-clean build-dir org.voicechord.VoiceChord.json
	@echo "Flatpak package built in build-dir/"

test:
	@echo "Running Voice Chord tests..."
	@if [ -x "./simple_test.sh" ]; then \
		./simple_test.sh; \
	else \
		echo "No tests found. Running basic syntax check..."; \
		gjs -c main.js && echo "Syntax check passed!"; \
	fi

clean:
	@echo "Cleaning build artifacts..."
	rm -rf $(PACKAGE_NAME)-$(VERSION)
	rm -f $(TARBALL)
	rm -rf VoiceChord.AppDir/
	rm -f VoiceChord-*.AppImage
	rm -f appimagetool-*.AppImage
	rm -rf build-dir/
	rm -f ../*.deb ../*.dsc ../*.changes ../*.tar.* ../*.buildinfo
	@echo "Clean complete!"

check-deps:
	@echo "Checking dependencies..."
	@echo -n "GJS: "
	@if command -v gjs >/dev/null 2>&1; then \
		gjs --version 2>/dev/null || echo "present"; \
	else \
		echo "MISSING - install gjs package"; \
	fi
	@echo -n "FluidSynth: "
	@if command -v fluidsynth >/dev/null 2>&1; then \
		fluidsynth --version 2>/dev/null | head -1 || echo "present"; \
	else \
		echo "MISSING - install fluidsynth package"; \
	fi
	@echo -n "GTK4: "
	@if pkg-config --exists gtk4; then \
		pkg-config --modversion gtk4; \
	else \
		echo "MISSING - install libgtk-4-dev or gtk4-devel"; \
	fi

info:
	@echo "Voice Chord Package Information"
	@echo "==============================="
	@echo "Name: $(PACKAGE_NAME)"
	@echo "Version: $(VERSION)"
	@echo "Files: $(words $(APP_FILES) $(SOUNDFONT) $(DOC_FILES) $(DESKTOP_FILE)) files"
	@echo "Size: $$(du -sh . 2>/dev/null | cut -f1) (including soundfont)"
	@echo "Prefix: $(PREFIX)"
	@echo "Target: $(DESTDIR)"
	@echo ""
	@echo "Build targets: rpm, deb, appimage, flatpak"
	@echo "Install target: install (requires root/sudo)"
