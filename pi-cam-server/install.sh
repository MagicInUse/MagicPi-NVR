#!/bin/bash

# Pi Camera Server Installation Script
# This script automates the installation and setup of the Pi Camera Server
# on a Raspberry Pi 5 running Raspberry Pi OS

set -e  # Exit on any error

echo "=========================================="
echo "Pi Camera Server Installation Script"
echo "=========================================="

# Color definitions for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if running on Raspberry Pi
print_step "Checking system compatibility..."
if ! grep -q "Raspberry Pi" /proc/cpuinfo; then
    print_error "This script is designed for Raspberry Pi systems"
    exit 1
fi

print_status "Running on Raspberry Pi - OK"

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    print_error "Please do not run this script as root"
    print_status "Run as regular user: ./install.sh"
    exit 1
fi

# Update system packages
print_step "Updating system packages..."
sudo apt update
sudo apt upgrade -y

# Install Node.js (using NodeSource repository for latest LTS)
print_step "Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt install -y nodejs
    print_status "Node.js installed: $(node --version)"
else
    print_status "Node.js already installed: $(node --version)"
fi

# Verify Node.js version (should be 18+)
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_warning "Node.js version is less than 18. Some features may not work correctly."
fi

# Install FFmpeg
print_step "Installing FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    sudo apt install -y ffmpeg
    print_status "FFmpeg installed: $(ffmpeg -version | head -n1)"
else
    print_status "FFmpeg already installed: $(ffmpeg -version | head -n1)"
fi

# Install additional system dependencies
print_step "Installing system dependencies..."
sudo apt install -y \
    git \
    curl \
    wget \
    build-essential \
    python3 \
    python3-pip \
    openssl \
    avahi-daemon \
    avahi-utils

# Enable and start Avahi daemon (for mDNS)
print_step "Configuring mDNS service..."
sudo systemctl enable avahi-daemon
sudo systemctl start avahi-daemon
print_status "mDNS service configured"

# Create project directory
PROJECT_DIR="$HOME/pi-cam-server"
print_step "Setting up project directory at $PROJECT_DIR..."

if [ -d "$PROJECT_DIR" ]; then
    print_warning "Project directory already exists"
    read -p "Do you want to continue and overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "Installation cancelled"
        exit 1
    fi
    rm -rf "$PROJECT_DIR"
fi

# Copy project files
if [ -d "$(dirname "$0")" ]; then
    cp -r "$(dirname "$0")" "$PROJECT_DIR"
else
    print_error "Could not find project source files"
    exit 1
fi

cd "$PROJECT_DIR"

# Install Node.js dependencies
print_step "Installing Node.js dependencies..."
npm install

# Create required directories
print_step "Creating required directories..."
mkdir -p recordings
mkdir -p security
mkdir -p logs

# Set proper permissions
chmod 755 recordings
chmod 700 security
chmod 755 logs

# Generate SSL certificates
print_step "Generating SSL certificates..."
if [ ! -f "security/key.pem" ] || [ ! -f "security/cert.pem" ]; then
    # Get Pi's IP address
    PI_IP=$(hostname -I | awk '{print $1}')
    
    print_status "Generating SSL certificate for IP: $PI_IP"
    
    # Generate private key
    openssl genrsa -out security/key.pem 2048
    
    # Generate self-signed certificate
    openssl req -new -x509 -key security/key.pem -out security/cert.pem -days 365 \
        -subj "/C=US/ST=State/L=City/O=Pi Camera Server/CN=$PI_IP"
    
    # Set proper permissions
    chmod 600 security/key.pem
    chmod 644 security/cert.pem
    
    print_status "SSL certificates generated successfully"
else
    print_status "SSL certificates already exist"
fi

# Build the TypeScript project
print_step "Building TypeScript project..."
npm run build

# Create systemd service file
print_step "Creating systemd service..."
SERVICE_FILE="/etc/systemd/system/pi-camera-server.service"

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Pi Camera Server
After=network.target
Wants=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=pi-camera-server

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable pi-camera-server

print_status "Systemd service created and enabled"

# Configure firewall (if ufw is installed)
if command -v ufw &> /dev/null; then
    print_step "Configuring firewall..."
    sudo ufw allow 3443/tcp comment 'Pi Camera Server HTTPS'
    print_status "Firewall rule added for port 3443"
fi

# Create log rotation configuration
print_step "Setting up log rotation..."
sudo tee "/etc/logrotate.d/pi-camera-server" > /dev/null <<EOF
/var/log/syslog {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    postrotate
        systemctl reload rsyslog > /dev/null 2>&1 || true
    endscript
}
EOF

print_status "Log rotation configured"

# Create configuration backup
print_step "Creating configuration backup..."
cp src/config.ts config.backup.ts
print_status "Configuration backed up to config.backup.ts"

# Start the service
print_step "Starting Pi Camera Server service..."
sudo systemctl start pi-camera-server

# Wait a moment for service to start
sleep 3

# Check service status
if sudo systemctl is-active --quiet pi-camera-server; then
    print_status "Pi Camera Server is running successfully!"
else
    print_error "Service failed to start. Check logs with: sudo journalctl -u pi-camera-server -f"
    exit 1
fi

# Display important information
echo ""
echo "=========================================="
echo -e "${GREEN}Installation Complete!${NC}"
echo "=========================================="
echo ""
echo "Server Information:"
echo "  • Service Name: pi-camera-server"
echo "  • Port: 3443 (HTTPS)"
echo "  • IP Address: $(hostname -I | awk '{print $1}')"
echo "  • mDNS Name: $(hostname).local"
echo ""
echo "Useful Commands:"
echo "  • Start service:   sudo systemctl start pi-camera-server"
echo "  • Stop service:    sudo systemctl stop pi-camera-server"
echo "  • Restart service: sudo systemctl restart pi-camera-server"
echo "  • View logs:       sudo journalctl -u pi-camera-server -f"
echo "  • Service status:  sudo systemctl status pi-camera-server"
echo ""
echo "Configuration:"
echo "  • Project directory: $PROJECT_DIR"
echo "  • SSL certificates:  $PROJECT_DIR/security/"
echo "  • Recordings:        $PROJECT_DIR/recordings/"
echo "  • Configuration:     $PROJECT_DIR/src/config.ts"
echo ""
echo "Next Steps:"
echo "  1. Configure your ESP32-CAM clients with this server's certificate"
echo "  2. Update WiFi credentials in ESP32-CAM code"
echo "  3. Test device registration and streaming"
echo ""
echo "Health Check URL: https://$(hostname -I | awk '{print $1}'):3443/health"
echo ""
echo -e "${YELLOW}Note: You may need to accept the self-signed certificate in your browser${NC}"
echo ""
