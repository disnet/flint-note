#!/bin/bash
# test-auto-update.sh - Automated local testing for auto-updates
# This script helps set up and test the auto-update mechanism locally

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_PORT=3000
BUILD_DIR="build-autoupdate"
OLD_DIR="$BUILD_DIR/old"
NEW_DIR="$BUILD_DIR/new"

# Versions will be determined from package.json
OLD_VERSION=""
NEW_VERSION=""

# Function to print colored output
print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to get current version from package.json
get_current_version() {
    node -p "require('./package.json').version"
}

# Function to increment patch version
increment_patch_version() {
    local version=$1
    # Split version into major.minor.patch
    local major=$(echo "$version" | cut -d. -f1)
    local minor=$(echo "$version" | cut -d. -f2)
    local patch=$(echo "$version" | cut -d. -f3 | cut -d- -f1)  # Handle pre-release tags

    # Increment patch
    patch=$((patch + 1))

    echo "${major}.${minor}.${patch}"
}

# Function to backup package.json and electron-builder.yml
backup_configs() {
    print_step "Backing up configuration files..."
    mkdir -p "$BUILD_DIR"
    cp package.json "$BUILD_DIR/package.json.bak"
    cp electron-builder.yml "$BUILD_DIR/electron-builder.yml.bak"
    print_success "Backups created"
}

# Function to restore configs
restore_configs() {
    if [ -f "$BUILD_DIR/package.json.bak" ]; then
        print_step "Restoring configuration files..."
        cp "$BUILD_DIR/package.json.bak" package.json
        cp "$BUILD_DIR/electron-builder.yml.bak" electron-builder.yml
        print_success "Configs restored"
    fi
}

# Function to set update server URL for testing
set_test_update_url() {
    print_step "Configuring test update server URL..."
    # Temporarily update electron-builder.yml to use localhost
    sed -i.tmp 's|url: https://updates.flintnote.com|url: http://localhost:3000|' electron-builder.yml
    rm electron-builder.yml.tmp

    # Disable code signing for test builds to avoid signature verification issues
    # Comment out the identity line to disable signing
    sed -i.tmp "s|identity: 'Timothy Disney (R54QLXZTK7)'|# identity: 'Timothy Disney (R54QLXZTK7)' # Disabled for local testing|" electron-builder.yml
    rm electron-builder.yml.tmp

    print_success "Update server URL set to http://localhost:3000"
    print_success "Code signing disabled for local testing"
}

# Function to set version in package.json
set_version() {
    local version=$1
    print_step "Setting version to $version..."
    npm version "$version" --no-git-tag-version --allow-same-version
    print_success "Version set to $version"
}

# Function to build the app
build_app() {
    local version=$1
    print_step "Building version $version..."
    npm run build
    npm run build:mac
    print_success "Build completed"
}

# Function to preserve build artifacts
preserve_old_version() {
    print_step "Preserving old version artifacts..."
    mkdir -p "$OLD_DIR"

    # Find the DMG file for the old version
    DMG_FILE=$(find dist -name "Flint-${OLD_VERSION}*.dmg" -type f | head -n 1)

    if [ -n "$DMG_FILE" ]; then
        mv "$DMG_FILE" "$OLD_DIR/"
        print_success "Moved old DMG to $OLD_DIR: $(basename "$DMG_FILE")"
    else
        print_warning "Could not find old version DMG"
    fi

    if [ -f "dist/latest-mac.yml" ]; then
        cp dist/latest-mac.yml "$OLD_DIR/latest-mac-${OLD_VERSION}.yml"
        print_success "Saved old latest-mac.yml"
    fi

    # Clean dist directory to avoid confusion
    rm -f dist/*.dmg dist/*.yml dist/*.zip 2>/dev/null || true
    print_success "Cleaned dist directory"
}

# Function to set up update server
setup_update_server() {
    print_step "Setting up local update server..."

    # Create server directory
    rm -rf "$NEW_DIR"
    mkdir -p "$NEW_DIR"

    # Copy new version artifacts (use specific version to avoid wrong file)
    DMG_FILE=$(find dist -name "Flint-${NEW_VERSION}*.dmg" -type f | head -n 1)
    ZIP_FILE=$(find dist -name "Flint-${NEW_VERSION}*.zip" -type f | head -n 1)

    if [ -n "$DMG_FILE" ]; then
        cp "$DMG_FILE" "$NEW_DIR/"
        print_success "Copied NEW version DMG: $(basename "$DMG_FILE")"
    else
        print_error "No DMG file found for version $NEW_VERSION in dist/"
        print_warning "Available files in dist:"
        ls -lh dist/ || true
        exit 1
    fi

    if [ -n "$ZIP_FILE" ]; then
        cp "$ZIP_FILE" "$NEW_DIR/"
        print_success "Copied NEW version ZIP: $(basename "$ZIP_FILE")"
    else
        print_warning "No ZIP file found for version $NEW_VERSION in dist/"
        print_warning "ZIP file is required for auto-updates on macOS"
    fi

    if [ -f "dist/latest-mac.yml" ]; then
        cp dist/latest-mac.yml "$NEW_DIR/"
        print_success "Copied latest-mac.yml"

        # Verify the version in latest-mac.yml matches NEW_VERSION
        YAML_VERSION=$(grep "^version:" "$NEW_DIR/latest-mac.yml" | cut -d' ' -f2)
        if [ "$YAML_VERSION" = "$NEW_VERSION" ]; then
            print_success "Verified: latest-mac.yml has correct version ($YAML_VERSION)"
        else
            print_error "Version mismatch! latest-mac.yml has $YAML_VERSION but expected $NEW_VERSION"
            exit 1
        fi
    else
        print_error "No latest-mac.yml found in dist/"
        exit 1
    fi

    # Show what's in the update server directory
    echo ""
    print_step "Update server contents:"
    ls -lh "$NEW_DIR"

    # Show file sizes for comparison
    if [ -d "$OLD_DIR" ]; then
        echo ""
        print_step "OLD version (in $OLD_DIR):"
        ls -lh "$OLD_DIR"/*.dmg 2>/dev/null || echo "  No DMG found"
    fi
    echo ""
}

# Function to start http-server (foreground)
start_server() {
    print_step "Starting HTTP server on port $SERVER_PORT..."
    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}  Press Ctrl+C to stop the server${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""

    # Start server in foreground using npx (no global install needed)
    cd "$NEW_DIR"
    npx http-server . -p "$SERVER_PORT" --cors
    cd ..
}


# Function to show next steps
show_next_steps() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Auto-Update Test Environment Ready${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}Update Server:${NC}"
    echo "  URL: http://localhost:$SERVER_PORT"
    echo "  Old Version: $OLD_VERSION"
    echo "  New Version: $NEW_VERSION"
    echo ""
    echo -e "${BLUE}Testing Steps:${NC}"
    echo ""
    echo "1. Install the OLD version:"
    OLD_DMG=$(find "$OLD_DIR" -name "*.dmg" -type f | head -n 1)
    if [ -n "$OLD_DMG" ]; then
        echo -e "   ${YELLOW}open \"$OLD_DMG\"${NC}"
    else
        echo -e "   ${YELLOW}open $OLD_DIR/Flint-${OLD_VERSION}*.dmg${NC}"
    fi
    echo "   Drag to Applications"
    echo ""
    echo "   ${YELLOW}Important: Start the app with FLINT_LOCAL_TESTING=true${NC}"
    echo -e "   ${YELLOW}FLINT_LOCAL_TESTING=true /Applications/Flint.app/Contents/MacOS/Flint${NC}"
    echo ""
    echo "2. In the app, go to Settings (⚙️) and click 'Check for Updates'"
    echo ""
    echo "3. Expected behavior:"
    echo "   - Update notification should appear"
    echo "   - Shows version $NEW_VERSION is available"
    echo "   - Download and install the update"
    echo ""
    echo -e "${BLUE}Monitoring:${NC}"
    echo -e "   - App logs: ${YELLOW}tail -f ~/Library/Logs/Flint/main.log${NC}"
    echo ""
    echo -e "${BLUE}Next Step:${NC}"
    echo "   Now starting the HTTP server..."
    echo "   The server will serve the new version for auto-update testing."
    echo ""
    echo -e "   ${YELLOW}Press Ctrl+C to stop the server when done testing${NC}"
    echo ""
    echo -e "${BLUE}Cleanup:${NC}"
    echo "   After stopping the server, run:"
    echo -e "   ${YELLOW}npm run clean${NC}"
    echo ""
}

# Main script logic
main() {
    local command=${1:-setup}

    case "$command" in
        setup)
            echo ""
            echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
            echo -e "${BLUE}║  Auto-Update Local Testing Setup      ║${NC}"
            echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
            echo ""

            # Check prerequisites
            print_step "Checking prerequisites..."
            if ! command_exists node; then
                print_error "Node.js is required but not installed"
                exit 1
            fi
            if ! command_exists npm; then
                print_error "npm is required but not installed"
                exit 1
            fi
            print_success "Prerequisites OK"

            # Get current version and calculate test versions
            CURRENT_VERSION=$(get_current_version)
            print_step "Current version in package.json: $CURRENT_VERSION"

            # OLD_VERSION = current version (what's already in package.json)
            OLD_VERSION="$CURRENT_VERSION"

            # NEW_VERSION = current version + 1 patch
            NEW_VERSION=$(increment_patch_version "$CURRENT_VERSION")

            echo ""
            print_step "Test versions:"
            echo "  Old version (to upgrade from): $OLD_VERSION"
            echo "  New version (to upgrade to):   $NEW_VERSION"
            echo ""

            # Backup configs
            backup_configs

            # Set test update server URL
            set_test_update_url

            # Clean dist directory before building
            print_step "Cleaning dist directory..."
            rm -rf dist
            mkdir -p dist

            # Build old version (current version, no need to change package.json)
            echo ""
            print_step "Building OLD version ($OLD_VERSION)..."
            build_app "$OLD_VERSION"
            preserve_old_version

            # Build new version
            echo ""
            print_step "Building NEW version ($NEW_VERSION)..."
            set_version "$NEW_VERSION"
            build_app "$NEW_VERSION"

            # Set up update server
            echo ""
            setup_update_server

            # Restore original configs
            restore_configs

            # Show next steps
            show_next_steps

            # Start server (foreground - will block until Ctrl+C)
            start_server
            ;;

        status)
            echo ""
            print_step "Auto-Update Test Status"
            echo ""

            if [ -d "$BUILD_DIR" ]; then
                print_success "Test environment exists"

                if [ -d "$OLD_DIR" ]; then
                    echo ""
                    print_step "Old version directory ($OLD_DIR):"
                    ls -lh "$OLD_DIR"
                fi

                if [ -d "$NEW_DIR" ]; then
                    echo ""
                    print_step "New version directory ($NEW_DIR):"
                    ls -lh "$NEW_DIR"
                fi
            else
                print_warning "Test environment not set up"
                echo "Run './scripts/test-auto-update.sh setup' to create it"
            fi

            echo ""
            ;;

        logs)
            print_step "Monitoring app logs..."
            echo ""
            echo -e "${YELLOW}App logs location: ~/Library/Logs/Flint/main.log${NC}"
            echo ""
            if [ -f ~/Library/Logs/Flint/main.log ]; then
                tail -f ~/Library/Logs/Flint/main.log
            else
                print_error "No app logs found yet"
                echo "Logs will appear after you run the app at least once"
            fi
            ;;

        help|--help|-h)
            echo ""
            echo "Auto-Update Local Testing Script"
            echo ""
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  setup      Build old/new versions and start HTTP server for testing"
            echo "  status     Show current test environment status"
            echo "  logs       Monitor app logs (tail -f)"
            echo "  help       Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 setup      # Set up and start server (use Ctrl+C to stop)"
            echo "  $0 status     # Check test environment"
            echo "  npm run clean # Clean up after testing"
            echo ""
            ;;

        *)
            print_error "Unknown command: $command"
            echo "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Handle Ctrl+C gracefully during setup
trap 'echo ""; print_warning "Interrupted by user"; restore_configs; exit 130' INT TERM

# Run main function
main "$@"