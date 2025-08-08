#!/bin/bash

# Voice Chord Installation Script
# This script provides multiple installation methods for the Voice Chord application

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="1.0.0"
APP_NAME="Voice Chord"
AUTHOR="David Martins <dvdmartinsfx@gmail.com>"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
is_root() {
    [ "$EUID" -eq 0 ]
}

# Detect distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
        VERSION_ID=$VERSION_ID
    else
        print_error "Cannot detect Linux distribution"
        exit 1
    fi
}

# Check dependencies
check_dependencies() {
    local missing_deps=()
    
    print_info "Checking dependencies..."
    
    # Check GJS
    if ! command -v gjs >/dev/null 2>&1; then
        missing_deps+=("gjs")
    fi
    
    # Check FluidSynth
    if ! command -v fluidsynth >/dev/null 2>&1; then
        missing_deps+=("fluidsynth")
    fi
    
    # Check GTK4 development files
    if ! pkg-config --exists gtk4 2>/dev/null; then
        case $DISTRO in
            fedora|rhel|centos)
                missing_deps+=("gtk4-devel")
                ;;
            ubuntu|debian)
                missing_deps+=("libgtk-4-dev")
                ;;
            arch|manjaro)
                missing_deps+=("gtk4")
                ;;
        esac
    fi
    
    # Check GStreamer
    if ! pkg-config --exists gstreamer-1.0 2>/dev/null; then
        case $DISTRO in
            fedora|rhel|centos)
                missing_deps+=("gstreamer1-devel")
                ;;
            ubuntu|debian)
                missing_deps+=("libgstreamer1.0-dev")
                ;;
            arch|manjaro)
                missing_deps+=("gstreamer")
                ;;
        esac
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_warning "Missing dependencies: ${missing_deps[*]}"
        return 1
    else
        print_success "All dependencies are satisfied"
        return 0
    fi
}

# Install dependencies
install_dependencies() {
    print_info "Installing dependencies for $DISTRO..."
    
    case $DISTRO in
        fedora|rhel|centos)
            sudo dnf install -y gjs gtk4-devel gstreamer1-devel \
                gstreamer1-plugins-base gstreamer1-plugins-good \
                gstreamer1-plugins-bad gstreamer1-plugins-ugly \
                fluidsynth fluidsynth-soundfont-default
            ;;
        ubuntu|debian)
            sudo apt update
            sudo apt install -y gjs libgtk-4-dev gstreamer1.0-dev \
                libgstreamer-plugins-base1.0-dev gstreamer1.0-plugins-base \
                gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \
                gstreamer1.0-plugins-ugly fluidsynth fluid-soundfont-gm
            ;;
        arch|manjaro)
            sudo pacman -S --noconfirm gjs gtk4 gstreamer gst-plugins-base \
                gst-plugins-good gst-plugins-bad gst-plugins-ugly \
                fluidsynth soundfont-fluid
            ;;
        *)
            print_error "Unsupported distribution: $DISTRO"
            print_info "Please install dependencies manually and try again"
            exit 1
            ;;
    esac
}

# Install to system
install_system() {
    print_info "Installing $APP_NAME to system..."
    
    if ! is_root; then
        print_error "System installation requires root privileges"
        print_info "Run: sudo $0 --system"
        exit 1
    fi
    
    # Use make install
    make install PREFIX=/usr/local
    
    print_success "$APP_NAME installed to system"
    print_info "Run with: voice-chord"
}

# Install to user directory
install_user() {
    local USER_BIN="$HOME/.local/bin"
    local USER_SHARE="$HOME/.local/share"
    
    print_info "Installing $APP_NAME to user directory..."
    
    # Create directories
    mkdir -p "$USER_BIN"
    mkdir -p "$USER_SHARE/voice-chord"
    mkdir -p "$USER_SHARE/applications"
    mkdir -p "$USER_SHARE/doc/voice-chord"
    mkdir -p "$USER_SHARE/icons/hicolor/scalable/apps"
    
    # Copy application files
    cp main.js audioProcessor.js chordDetector.js midiController.js sequencer.js \
       fluidsynthController.js enhancedAudioProcessor.js enhancedDetector.js \
       enhancedSequencer.js style.css "$USER_SHARE/voice-chord/"
    cp "Yamaha XG Sound Set.sf2" "$USER_SHARE/voice-chord/"
    
    # Create launcher script
    cat > "$USER_BIN/voice-chord" << EOF
#!/bin/bash
cd "$USER_SHARE/voice-chord"
exec gjs main.js "\$@"
EOF
    chmod +x "$USER_BIN/voice-chord"
    
    # Install icon, desktop file and docs
    cp icon.svg "$USER_SHARE/icons/hicolor/scalable/apps/org.voicechord.VoiceChord.svg"
    cp org.voicechord.VoiceChord.desktop "$USER_SHARE/applications/"
    cp README.md "$USER_SHARE/doc/voice-chord/"
    
    # Update desktop database
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$USER_SHARE/applications" 2>/dev/null || true
    fi
    
    print_success "$APP_NAME installed to user directory"
    print_info "Make sure $USER_BIN is in your PATH"
    print_info "Run with: voice-chord"
    
    # Check if user bin is in PATH
    if [[ ":$PATH:" != *":$USER_BIN:"* ]]; then
        print_warning "$USER_BIN is not in your PATH"
        print_info "Add this line to your ~/.bashrc or ~/.zshrc:"
        print_info "export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
}

# Create portable version
create_portable() {
    local PORTABLE_DIR="voice-chord-portable"
    
    print_info "Creating portable version..."
    
    # Clean previous builds
    rm -rf "$PORTABLE_DIR"
    mkdir -p "$PORTABLE_DIR"
    
    # Copy all necessary files
    cp main.js audioProcessor.js chordDetector.js midiController.js sequencer.js \
       fluidsynthController.js enhancedAudioProcessor.js enhancedDetector.js \
       enhancedSequencer.js style.css "$PORTABLE_DIR/"
    cp "Yamaha XG Sound Set.sf2" "$PORTABLE_DIR/"
    cp README.md "$PORTABLE_DIR/"
    
    # Create run script
    cat > "$PORTABLE_DIR/run.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
exec gjs main.js "$@"
EOF
    chmod +x "$PORTABLE_DIR/run.sh"
    
    print_success "Portable version created in $PORTABLE_DIR/"
    print_info "Run with: ./$PORTABLE_DIR/run.sh"
}

# Show usage
show_usage() {
    cat << EOF
Voice Chord Installation Script v$VERSION

Usage: $0 [OPTIONS]

Installation Methods:
  --system      Install to system (/usr/local) - requires sudo
  --user        Install to user directory (~/.local)
  --portable    Create portable version in current directory
  --appimage    Build AppImage (if build tools available)

Options:
  --deps        Install system dependencies only
  --check       Check dependencies and system compatibility
  --uninstall   Uninstall from system (requires sudo)
  --help        Show this help message

Examples:
  $0 --check            # Check if system is compatible
  $0 --deps             # Install dependencies
  $0 --user             # Install for current user
  sudo $0 --system      # Install system-wide
  $0 --portable         # Create portable version

For more advanced packaging options, use:
  make appimage         # Build AppImage
  make rpm              # Build RPM package
  make deb              # Build DEB package
  make flatpak          # Build Flatpak package

EOF
}

# Uninstall from system
uninstall_system() {
    print_info "Uninstalling $APP_NAME from system..."
    
    if ! is_root; then
        print_error "System uninstallation requires root privileges"
        print_info "Run: sudo $0 --uninstall"
        exit 1
    fi
    
    make uninstall PREFIX=/usr/local
    print_success "$APP_NAME uninstalled from system"
}

# Main installation logic
main() {
    print_info "Voice Chord Installation Script v$VERSION"
    echo
    
    detect_distro
    print_info "Detected system: $DISTRO $VERSION_ID"
    
    case "${1:-}" in
        --help|-h)
            show_usage
            exit 0
            ;;
        --check)
            check_dependencies
            exit $?
            ;;
        --deps)
            install_dependencies
            exit 0
            ;;
        --system)
            if ! check_dependencies; then
                print_warning "Some dependencies are missing"
                read -p "Install dependencies automatically? [y/N] " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    install_dependencies
                else
                    print_error "Cannot proceed without dependencies"
                    exit 1
                fi
            fi
            install_system
            ;;
        --user)
            if ! check_dependencies; then
                print_error "Dependencies missing. Install them first with:"
                print_info "$0 --deps"
                exit 1
            fi
            install_user
            ;;
        --portable)
            create_portable
            ;;
        --appimage)
            if [ -x "./build-appimage.sh" ]; then
                ./build-appimage.sh
            else
                print_error "AppImage build script not found"
                exit 1
            fi
            ;;
        --uninstall)
            uninstall_system
            ;;
        "")
            # Interactive mode
            print_info "Interactive installation mode"
            echo
            print_info "Choose installation method:"
            echo "1) User installation (recommended)"
            echo "2) System installation (requires sudo)"
            echo "3) Create portable version"
            echo "4) Check dependencies only"
            echo "5) Exit"
            echo
            read -p "Enter choice [1-5]: " choice
            
            case $choice in
                1)
                    if ! check_dependencies; then
                        print_warning "Dependencies missing. Install them first?"
                        read -p "[y/N] " -n 1 -r
                        echo
                        if [[ $REPLY =~ ^[Yy]$ ]]; then
                            install_dependencies
                        else
                            print_error "Cannot proceed without dependencies"
                            exit 1
                        fi
                    fi
                    install_user
                    ;;
                2)
                    if ! check_dependencies; then
                        print_warning "Dependencies missing. Install them first?"
                        read -p "[y/N] " -n 1 -r
                        echo
                        if [[ $REPLY =~ ^[Yy]$ ]]; then
                            install_dependencies
                        else
                            print_error "Cannot proceed without dependencies"
                            exit 1
                        fi
                    fi
                    install_system
                    ;;
                3)
                    create_portable
                    ;;
                4)
                    check_dependencies
                    ;;
                5|*)
                    print_info "Installation cancelled"
                    exit 0
                    ;;
            esac
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Check if we're in the right directory
if [ ! -f "main.js" ] || [ ! -f "README.md" ]; then
    print_error "Please run this script from the Voice Chord source directory"
    exit 1
fi

# Run main function
main "$@"
