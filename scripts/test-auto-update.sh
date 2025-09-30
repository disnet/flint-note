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
UPDATE_SERVER_DIR="local-update-server"
BACKUP_DIR="update-test-backup"

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

# Function to backup package.json
backup_package_json() {
    print_step "Backing up package.json..."
    mkdir -p "$BACKUP_DIR"
    cp package.json "$BACKUP_DIR/package.json.bak"
    print_success "Backup created"
}

# Function to restore package.json
restore_package_json() {
    if [ -f "$BACKUP_DIR/package.json.bak" ]; then
        print_step "Restoring package.json..."
        cp "$BACKUP_DIR/package.json.bak" package.json
        print_success "Package.json restored"
    fi
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
    mkdir -p "$BACKUP_DIR"

    # Find the DMG file for the old version
    DMG_FILE=$(find dist -name "Flint-${OLD_VERSION}*.dmg" -type f | head -n 1)

    if [ -n "$DMG_FILE" ]; then
        mv "$DMG_FILE" "$BACKUP_DIR/"
        print_success "Moved old DMG to backup: $(basename "$DMG_FILE")"
    else
        print_warning "Could not find old version DMG"
    fi

    if [ -f "dist/latest-mac.yml" ]; then
        cp dist/latest-mac.yml "$BACKUP_DIR/latest-mac-${OLD_VERSION}.yml"
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
    rm -rf "$UPDATE_SERVER_DIR"
    mkdir -p "$UPDATE_SERVER_DIR"

    # Copy new version artifacts (use specific version to avoid wrong file)
    DMG_FILE=$(find dist -name "Flint-${NEW_VERSION}*.dmg" -type f | head -n 1)
    ZIP_FILE=$(find dist -name "Flint-${NEW_VERSION}*.zip" -type f | head -n 1)

    if [ -n "$DMG_FILE" ]; then
        cp "$DMG_FILE" "$UPDATE_SERVER_DIR/"
        print_success "Copied NEW version DMG: $(basename "$DMG_FILE")"
    else
        print_error "No DMG file found for version $NEW_VERSION in dist/"
        print_warning "Available files in dist:"
        ls -lh dist/ || true
        exit 1
    fi

    if [ -n "$ZIP_FILE" ]; then
        cp "$ZIP_FILE" "$UPDATE_SERVER_DIR/"
        print_success "Copied NEW version ZIP: $(basename "$ZIP_FILE")"
    else
        print_warning "No ZIP file found for version $NEW_VERSION in dist/"
        print_warning "ZIP file is required for auto-updates on macOS"
    fi

    if [ -f "dist/latest-mac.yml" ]; then
        cp dist/latest-mac.yml "$UPDATE_SERVER_DIR/"
        print_success "Copied latest-mac.yml"

        # Verify the version in latest-mac.yml matches NEW_VERSION
        YAML_VERSION=$(grep "^version:" "$UPDATE_SERVER_DIR/latest-mac.yml" | cut -d' ' -f2)
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
    ls -lh "$UPDATE_SERVER_DIR"

    # Show file sizes for comparison
    if [ -d "$BACKUP_DIR" ]; then
        echo ""
        print_step "OLD version (in backup):"
        ls -lh "$BACKUP_DIR"/*.dmg 2>/dev/null || echo "  No DMG found"
    fi
    echo ""
}

# Function to start http-server
start_server() {
    print_step "Starting HTTP server on port $SERVER_PORT..."

    # Start server in background using npx (no global install needed)
    cd "$UPDATE_SERVER_DIR"
    npx http-server . -p "$SERVER_PORT" --cors > ../server.log 2>&1 &
    SERVER_PID=$!
    cd ..

    # Save PID for cleanup
    echo "$SERVER_PID" > server.pid

    # Wait a bit for server to start
    sleep 3

    # Check if server is running
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        print_success "Server started (PID: $SERVER_PID)"
        print_success "Update server running at: http://localhost:$SERVER_PORT"
        echo ""
        print_step "Available files:"
        curl -s "http://localhost:$SERVER_PORT/" | grep -o 'href="[^"]*"' | sed 's/href="//;s/"//' | grep -v '^/$' || true
        echo ""
    else
        print_error "Failed to start server"
        cat server.log 2>/dev/null || true
        exit 1
    fi
}

# Function to stop http-server
stop_server() {
    if [ -f "server.pid" ]; then
        SERVER_PID=$(cat server.pid)
        if kill -0 "$SERVER_PID" 2>/dev/null; then
            print_step "Stopping HTTP server (PID: $SERVER_PID)..."
            kill "$SERVER_PID" 2>/dev/null || true
            rm -f server.pid
            print_success "Server stopped"
        fi
    fi
}

# Function to cleanup
cleanup() {
    print_step "Cleaning up..."

    # Stop server
    stop_server

    # Remove server directory
    rm -rf "$UPDATE_SERVER_DIR"

    # Remove backup directory
    rm -rf "$BACKUP_DIR"

    # Remove log file
    rm -f server.log

    print_success "Cleanup complete"
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
    OLD_DMG=$(find "$BACKUP_DIR" -name "*.dmg" -type f | head -n 1)
    if [ -n "$OLD_DMG" ]; then
        echo "   ${YELLOW}open \"$OLD_DMG\"${NC}"
    else
        echo "   ${YELLOW}open $BACKUP_DIR/Flint-${OLD_VERSION}*.dmg${NC}"
    fi
    echo "   Drag to Applications and launch"
    echo ""
    echo "2. In the app, go to Settings (⚙️) and click 'Check for Updates'"
    echo ""
    echo "3. Expected behavior:"
    echo "   - Update notification should appear"
    echo "   - Shows version $NEW_VERSION is available"
    echo "   - Download and install the update"
    echo ""
    echo -e "${BLUE}Monitoring:${NC}"
    echo "   - Server logs: ${YELLOW}tail -f server.log${NC}"
    echo "   - App logs: ${YELLOW}tail -f ~/Library/Logs/Flint/main.log${NC}"
    echo ""
    echo -e "${BLUE}Cleanup:${NC}"
    echo "   When done testing, run:"
    echo "   ${YELLOW}./scripts/test-auto-update.sh cleanup${NC}"
    echo ""
    echo -e "${YELLOW}Note: Server is running in background (PID: $(cat server.pid 2>/dev/null || echo 'N/A'))${NC}"
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

            # Backup package.json
            backup_package_json

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

            # Start server
            start_server

            # Restore original version
            restore_package_json

            # Show next steps
            show_next_steps
            ;;

        cleanup)
            echo ""
            print_step "Cleaning up test environment..."
            cleanup
            restore_package_json
            print_success "Test environment cleaned up"
            echo ""
            ;;

        status)
            echo ""
            print_step "Auto-Update Test Status"
            echo ""

            if [ -f "server.pid" ]; then
                SERVER_PID=$(cat server.pid)
                if kill -0 "$SERVER_PID" 2>/dev/null; then
                    print_success "Server is running (PID: $SERVER_PID)"
                    echo "  URL: http://localhost:$SERVER_PORT"
                else
                    print_warning "Server PID file exists but server is not running"
                fi
            else
                print_warning "Server is not running"
            fi

            if [ -d "$UPDATE_SERVER_DIR" ]; then
                echo ""
                print_step "Update server contents:"
                ls -lh "$UPDATE_SERVER_DIR"
            fi

            if [ -d "$BACKUP_DIR" ]; then
                echo ""
                print_step "Backup directory contents:"
                ls -lh "$BACKUP_DIR"
            fi

            echo ""
            ;;

        logs)
            if [ -f "server.log" ]; then
                print_step "HTTP Server logs:"
                tail -f server.log
            else
                print_error "No server logs found"
                echo "Run './scripts/test-auto-update.sh setup' first"
            fi
            ;;

        help|--help|-h)
            echo ""
            echo "Auto-Update Local Testing Script"
            echo ""
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  setup      Set up test environment (builds both versions, starts server)"
            echo "  cleanup    Stop server and remove test artifacts"
            echo "  status     Show current test environment status"
            echo "  logs       Show HTTP server logs (follows)"
            echo "  help       Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 setup      # Set up test environment"
            echo "  $0 status     # Check if server is running"
            echo "  $0 cleanup    # Clean up when done testing"
            echo ""
            ;;

        *)
            print_error "Unknown command: $command"
            echo "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Handle Ctrl+C gracefully
trap 'echo ""; print_warning "Interrupted by user"; cleanup; exit 130' INT TERM

# Run main function
main "$@"