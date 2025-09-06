# 🎥 MagicPi NVR - Network Video Recorder

A high-performance surveillance system featuring **real-time binary JPEG streaming** from ESP32-CAM devices with live frontend video display, centralized recording, and complete web dashboard control.

## ✨ Key Features

🔴 **Live Video Streaming** - Real-time JPEG frames via WebSocket binary streaming  
📹 **H.264 Recording** - FFmpeg transcoding with automatic file management  
🎛️ **Web Dashboard** - React frontend with device control and live video display  
🔐 **Secure HTTPS** - SSL encryption for all communications  
⚡ **Real-time Status** - Device heartbeats, connection monitoring, and status updates  
🎯 **ESP32-CAM Support** - Optimized for ESP32-CAM binary streaming protocol  

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm
- OpenSSL (for SSL certificates)

### Installation & Deployment

```bash
# 1. Install all dependencies
npm run install:all

# 2. Generate SSL certificates (development)
npm run setup:certs

# 3. Build the complete application
npm run build

# 4. Start the server
npm start
```

The application will be available at: `https://localhost:3443`

## 📁 Project Structure

```
MagicPi-NVR/
├── client/                 # React TypeScript frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/       # API services
│   │   └── types/          # TypeScript interfaces
│   └── dist/              # Built frontend (after npm run build)
├── pi-cam-server/         # Node.js TypeScript backend
│   ├── src/
│   │   ├── api/           # REST API controllers
│   │   ├── services/      # Business logic services  
│   │   ├── middleware/    # Express middleware
│   │   └── types/         # TypeScript interfaces
│   ├── dist/              # Built backend + deployed frontend
│   │   ├── client/        # Frontend files (copied during build)
│   │   └── *.js           # Compiled backend files
│   └── security/          # SSL certificates
└── package.json           # Root workspace configuration
```

## 🛠️ Development

### Frontend Development
```bash
npm run dev:frontend      # Start Vite dev server (http://localhost:5173)
```

### Backend Development  
```bash
npm run dev:backend       # Start nodemon with auto-reload
```

### Full Development Setup
```bash
# Terminal 1: Frontend dev server
npm run dev:frontend

# Terminal 2: Backend dev server  
npm run dev:backend
```

## 🏗️ Build Process

The build process creates a single deployable package:

1. **Frontend Build**: React app compiled to static files
2. **Backend Build**: TypeScript compiled to JavaScript
3. **Integration**: Frontend copied to backend's `dist/client/` 
4. **Result**: Single `pi-cam-server/dist/` folder ready for deployment

### Build Commands

```bash
# Build everything for production
npm run build

# Or step by step:
cd client && npm run build              # Build frontend
cd pi-cam-server && npm run build      # Build backend  
cd pi-cam-server && npm run copy:frontend  # Copy frontend to backend
```

## 🔧 Configuration

### SSL Certificates

For **development**:
```bash
npm run setup:certs  # Generates self-signed certificates
```

For **production**: Replace files in `pi-cam-server/security/`:
- `key.pem` - Private key
- `cert.pem` - Certificate

### Server Configuration

Edit `pi-cam-server/src/config.ts`:
- Server ports and host
- Recording settings  
- Video processing options
- Security settings

## 📦 Deployment

### Single Server Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Copy the `pi-cam-server/dist/` folder to your server

3. Install production dependencies:
   ```bash
   cd pi-cam-server
   npm install --production
   ```

4. Add proper SSL certificates to `security/`

5. Start the server:
   ```bash
   npm start
   ```

### Docker Deployment (Future)

Docker support will be added in future versions for easier deployment.

## 🎯 Features

### 🚀 **Binary Video Streaming Architecture** (Latest Implementation)

- **Real-time JPEG Streaming**: ESP32-CAM devices send raw binary JPEG frames via WebSocket
- **Automatic Format Detection**: Server detects JPEG magic numbers (0xFF, 0xD8) vs JSON commands
- **Live Video Recording**: Binary frames processed through FFmpeg pipeline to MP4 files
- **High Performance**: Eliminates JSON parsing overhead for video data transmission
- **Stream Processing**: PassThrough streams with MJPEG input format for efficient processing

### Frontend (React + TypeScript)

- 📱 Responsive surveillance dashboard
- 🎥 Real-time video streaming interface
- 📁 Recording browser with hierarchical navigation
- ⚙️ Device configuration interface
- 🔄 WebSocket real-time updates
- 📊 Device status monitoring

### Backend (Node.js + TypeScript)

- 🛡️ Device registration and authentication
- 🎬 **FFmpeg Binary Stream Processing**: Direct MJPEG input from binary WebSocket data
- 🔐 HTTPS and WebSocket secure connections
- 📡 mDNS service discovery
- 🧹 Automatic cleanup services
- 🔄 Dual WebSocket support (frontend + devices)
- 📦 **Binary Data Handling**: Efficient processing of raw JPEG frames
- 🎥 **H.264 MP4 Recording**: Real-time encoding with configurable quality settings

### ESP32-CAM Client Features

- 📹 **Binary JPEG Transmission**: Sends raw camera frames via `wsClient.sendBinary()`
- 🔄 Automatic server discovery and registration
- 💤 Power-efficient operation modes
- 🔧 Remote configuration capabilities
- 📱 Hardware motion sensor support

## � Technical Implementation

### Binary Streaming Architecture

The system implements a high-performance binary streaming architecture for real-time video transmission:

```mermaid
graph LR
    A[ESP32-CAM] -->|Binary JPEG| B[WebSocket]
    B -->|Magic Number Detection| C[Server Handler]
    C -->|JPEG Data| D[PassThrough Stream]
    D -->|MJPEG Input| E[FFmpeg Process]
    E -->|H.264 Encode| F[MP4 File]
```

### Key Components

#### 1. ESP32-CAM Binary Transmission
```cpp
// Sends raw JPEG buffer data
wsClient.sendBinary((const char*)frameBuffer->buf, frameBuffer->len);
```

#### 2. Server-side JPEG Detection & Live Streaming
```typescript
// Detect JPEG magic numbers (0xFF, 0xD8)
if (data[0] === 0xFF && data[1] === 0xD8) {
    // Process as binary JPEG frame for recording
    await this.videoProcessor.writeFrame(deviceId, data);
    
    // Forward frame to subscribed frontend clients for live viewing
    this.forwardVideoFrameToFrontend(deviceId, data);
}
```

#### 3. Frontend Live Video Subscription
```typescript
// Subscribe to live video stream
const subscribeMessage = {
    type: 'subscribe',
    deviceId: deviceId
};
this.ws.send(JSON.stringify(subscribeMessage));

// Handle incoming video frames
ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
        // Display live JPEG frame in video player
        this.handleVideoFrame(new Uint8Array(event.data));
    }
};
```

#### 4. FFmpeg Stream Processing
```typescript
// Direct MJPEG input from WebSocket stream
ffmpeg()
    .inputFormat('mjpeg')
    .input('pipe:0')
    .videoCodec('libx264')
    .outputOptions(['-preset ultrafast', '-tune zerolatency'])
    .fps(10)
    .save(outputPath)
```

### Performance Benefits

- **Zero JSON Overhead**: Raw binary transmission eliminates parsing delays
- **Real-time Live Streaming**: JPEG frames forwarded directly to frontend via WebSocket
- **Direct Stream Processing**: JPEG frames pipe directly to FFmpeg without intermediate storage
- **Dual Output**: Simultaneous live viewing and H.264 recording from single stream
- **Memory Efficient**: PassThrough streams prevent buffer accumulation

### Live Streaming Pipeline

1. **Frame Capture**: ESP32-CAM captures JPEG at configured quality
2. **Binary Transmission**: Raw frame data sent via WebSocket to server
3. **Magic Number Detection**: Server identifies JPEG vs command data
4. **Dual Processing**: 
   - **Live Stream**: Frame forwarded to subscribed frontend clients
   - **Recording**: Frame written to FFmpeg PassThrough stream
5. **Frontend Display**: Browser receives binary JPEG and displays in real-time
6. **H.264 Recording**: Simultaneous conversion to MP4 with configurable settings
7. **File Management**: Automatic directory creation and file rotation

## �🚨 Troubleshooting

### Build Errors
- Ensure all dependencies installed: `npm run install:all`
- Clear build cache: `npm run clean && npm run build`

### SSL Certificate Issues
- Regenerate certificates: `npm run setup:certs`
- Check `pi-cam-server/security/` folder exists

### Frontend Not Loading
- Verify build completed: Check `pi-cam-server/dist/client/` exists
- Check server logs for frontend path detection

### Port Conflicts
- Default HTTPS port: 3443
- Modify in `pi-cam-server/src/config.ts` if needed

## � Next Steps - Frontend Integration

### Phase 1: Real-time Binary Stream Display (In Progress)

The backend binary streaming architecture is complete and operational. The next development phase focuses on frontend integration:

#### 🎯 Immediate Goals

1. **Live Stream Viewer Component**
   - Create React component to display real-time JPEG frames
   - WebSocket connection to receive binary frame data
   - Canvas-based rendering for smooth playback

2. **Recording Status Integration**
   - Real-time recording indicators on device dashboard
   - Live file size and duration tracking
   - Recording start/stop controls

3. **Binary Stream Monitoring**
   - Frame rate statistics and quality metrics
   - Network throughput visualization
   - Device performance monitoring

#### 🔧 Technical Implementation Plan

```typescript
// Frontend WebSocket handler for binary frames
const handleBinaryFrame = (data: ArrayBuffer) => {
  const blob = new Blob([data], { type: 'image/jpeg' });
  const imageUrl = URL.createObjectURL(blob);
  updateCanvasWithFrame(imageUrl);
};
```

#### 📊 Development Status

- ✅ **Backend Binary Streaming**: Complete
- ✅ **ESP32-CAM Binary Transmission**: Complete  
- ✅ **FFmpeg Pipeline**: Complete
- ✅ **MP4 Recording**: Complete
- 🚧 **Frontend Live Display**: Next Phase
- 🚧 **Stream Controls**: Next Phase
- 🚧 **Recording Management UI**: Next Phase

### Phase 2: Enhanced UI Features (Planned)

- Advanced video player with scrubbing
- Multi-camera grid view
- Motion detection visualization
- Mobile-responsive controls

## License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Ready for deployment! 🚀** - Wireless Camera Security System

A complete, secure wireless camera system consisting of a Raspberry Pi 5 host server and multiple ESP32-CAM clients. This system provides automated video recording, motion detection, and secure wireless communication for comprehensive surveillance coverage.

## 🏗️ System Architecture

```
┌─────────────────┐    WiFi/TLS    ┌─────────────────┐
│   ESP32-CAM     │◄──────────────►│ Raspberry Pi 5  │
│   (Client)      │   WebSocket    │ (Host Server)   │
│                 │                │                 │
│ • Motion Detection│              │ • Video Recording│
│ • Camera Streaming│              │ • Device Management│
│ • Deep Sleep    │                │ • Web API       │
│ • TLS Security  │                │ • mDNS Service  │
└─────────────────┘                └─────────────────┘
        │                                   │
        │            Multiple Clients       │
        └───────────────────────────────────┘
```

## 🚀 Features

### Raspberry Pi 5 Host Server
- **Secure Communication**: HTTPS/WSS with TLS encryption
- **Device Management**: Automatic discovery and registration
- **Video Recording**: H.264 encoding with FFmpeg
- **RESTful API**: Complete device control and monitoring
- **Automated Cleanup**: Configurable retention policies
- **mDNS Discovery**: Zero-configuration networking
- **Multi-client Support**: Handle up to 50 ESP32-CAM devices

### ESP32-CAM Clients
- **Motion-Triggered Recording**: PIR sensor integration
- **Always-On Mode**: Continuous monitoring without motion sensor
- **Continuous Mode**: Non-stop streaming for critical areas
- **Auto-Detection**: Automatically detects hardware and configures mode
- **Power Efficient**: Deep sleep with wake-on-motion or timer
- **Auto-Discovery**: Finds server via mDNS
- **Secure Registration**: API key authentication
- **Real-time Streaming**: JPEG over WebSocket
- **Remote Configuration**: Server-controlled camera settings
- **OTA Ready**: Over-the-air update capable

## 📁 Project Structure

```
MagicPi-NVR/
├── pi-cam-server/              # Raspberry Pi 5 Host Server
│   ├── src/
│   │   ├── services/           # Core business logic
│   │   │   ├── DeviceManager.ts
│   │   │   ├── VideoProcessor.ts
│   │   │   └── CleanupService.ts
│   │   ├── middleware/         # Authentication & security
│   │   │   └── auth.ts
│   │   ├── config.ts          # Configuration settings
│   │   └── server.ts          # Main application
│   ├── security/              # SSL certificates
│   ├── recordings/            # Video storage
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
│
├── esp32-cam-client/          # ESP32-CAM Client Code
│   ├── esp32_cam_client.ino   # Arduino sketch
│   └── README.md
│
├── LICENSE
└── README.md                  # This file
```

## 🛠️ Hardware Requirements

### Raspberry Pi 5 (Host Server)
- Raspberry Pi 5 (4GB+ RAM recommended)
- MicroSD card (32GB+ Class 10)
- Ethernet connection or WiFi
- Power supply (USB-C, 5V/5A)

### ESP32-CAM AI-Thinker (Clients)
- ESP32-CAM AI-Thinker modules
- PIR motion sensors (HC-SR501)
- Stable 3.3V power supplies
- MicroSD cards (optional)

## 🔧 Quick Start

### 1. Setup Raspberry Pi Server

```bash
# Clone the repository
git clone https://github.com/MagicInUse/MagicPi-NVR.git
cd MagicPi-NVR/pi-cam-server

# Install dependencies
npm install

# Generate SSL certificates
openssl genrsa -out security/key.pem 2048
openssl req -new -x509 -key security/key.pem -out security/cert.pem -days 365 \
  -subj "/C=US/ST=State/L=City/O=Pi Camera Server/CN=$(hostname -I | awk '{print $1}')"

# Install FFmpeg
sudo apt update && sudo apt install ffmpeg

# Start the server
npm run build && npm start
```

### 2. Setup ESP32-CAM Clients

1. **Install Arduino IDE** with ESP32 support
2. **Install required libraries**:
   - ArduinoWebsockets
   - ArduinoJson
3. **Configure the code**:
   - Update WiFi credentials
   - Paste server certificate
4. **Upload to ESP32-CAM**
5. **Connect motion sensor** to GPIO 13

### 3. Verify System Operation

1. **Check server logs**:
   ```bash
   # Server should show:
   # "Device registered: XX:XX:XX:XX:XX:XX"
   # "WebSocket connection established"
   ```

2. **Trigger motion detection** on ESP32-CAM
3. **Check recordings** in `/recordings/` directory

## 📡 API Reference

### Device Registration
```http
POST /register
Content-Type: application/json

{
  "deviceId": "AA:BB:CC:DD:EE:FF"
}
```

### Get Device Status
```http
GET /device/status
X-API-Key: your-api-key
```

### Update Configuration
```http
PUT /device/config
X-API-Key: your-api-key

{
  "config": {
    "resolution": "VGA",
    "framerate": 15
  }
}
```

### List Recordings
```http
GET /recordings?date=2023-12-01
X-API-Key: your-api-key
```

## 🔒 Security Features

- **TLS 1.2+ Encryption**: All communications encrypted
- **API Key Authentication**: Unique keys per device
- **Certificate Validation**: ESP32 clients validate server
- **Secure Headers**: HSTS, CSP, and other security headers
- **Rate Limiting**: Protection against abuse

## 📹 Recording System

### Directory Structure
```
/recordings/
├── AA-BB-CC-DD-EE-FF/          # Device MAC address
│   ├── 2023-12-01/             # Date (YYYY-MM-DD)
│   │   ├── 08.mp4              # Hour-based files
│   │   ├── 09.mp4
│   │   └── ...
│   └── 2023-12-02/
└── ...
```

### Video Specifications
- **Format**: MP4 (H.264)
- **Input**: MJPEG from ESP32-CAM
- **Quality**: Configurable (CRF 23 default)
- **Resolution**: Up to UXGA (1600×1200)
- **Frame Rate**: Configurable (10 FPS default)

## ⚡ Power Management

### ESP32-CAM Power Consumption
- **Active (Streaming)**: ~200-300mA
- **Deep Sleep**: ~10-50µA
- **Battery Life**: 7-10 hours active, 4-20 months sleep

### Optimization Strategies
- Motion-triggered activation
- Configurable streaming duration
- Deep sleep between triggers
- Optimized camera settings

## 🔧 Configuration

### Server Configuration (`pi-cam-server/src/config.ts`)
```typescript
export const config = {
  server: {
    httpsPort: 3443,
    recordingRetentionDays: 7,
    cleanupSchedule: '0 2 * * *'  // Daily at 2 AM
  },
  video: {
    inputFormat: 'mjpeg',
    outputCodec: 'libx264',
    defaultResolution: 'SVGA'
  }
};
```

### Client Configuration (Arduino)
```cpp
const unsigned long STREAMING_DURATION = 30000; // 30 seconds
const unsigned long FRAME_INTERVAL = 100;       // 10 FPS
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
```

## 📊 Monitoring

### Server Statistics
```http
GET /stats
X-API-Key: your-api-key
```

Returns:
- Device counts by status
- Recording statistics
- System resources
- Cleanup information

### Health Check
```http
GET /health
```

### Log Monitoring
- Server logs: Console output
- Client logs: Serial monitor (115200 baud)
- Recording errors: Automatic logging

## 🛠️ Troubleshooting

### Common Issues

1. **ESP32-CAM won't connect**
   - Check WiFi credentials
   - Verify power supply stability
   - Ensure 2.4GHz network

2. **Server discovery fails**
   - Check mDNS service
   - Verify network connectivity
   - Check firewall settings

3. **Recording issues**
   - Verify FFmpeg installation
   - Check disk space
   - Review camera settings

4. **Certificate errors**
   - Regenerate certificates
   - Check date/time sync
   - Verify certificate format

### Debug Mode
Enable verbose logging:
```bash
# Server
NODE_ENV=development npm run dev

# Client
Serial.setDebugOutput(true);  // In Arduino code
```

## 🔄 Updates and Maintenance

### Server Updates
```bash
cd pi-cam-server
git pull origin main
npm install
npm run build
sudo systemctl restart pi-camera-server
```

### Client Updates
- Use Arduino IDE for firmware updates
- Consider implementing OTA updates
- Update libraries regularly

### Maintenance Tasks
- Monitor disk usage
- Check certificate expiration
- Review cleanup logs
- Update dependencies

## 📝 Development

### Contributing
1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

### Adding Features
- Server: Add services in `src/services/`
- Client: Modify Arduino sketch
- Update documentation

### Testing
```bash
# Server tests
npm test

# Client tests
# Use Arduino IDE serial monitor
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Support

### Documentation
- [Server README](pi-cam-server/README.md)
- [Client README](esp32-cam-client/README.md)
- [API Documentation](pi-cam-server/docs/api.md)

### Issues
- Check existing issues on GitHub
- Provide detailed error logs
- Include hardware specifications
- Test with minimal configuration

### Community
- GitHub Discussions for questions
- Wiki for additional documentation
- Examples in `/examples` directory

## 🌟 Acknowledgments

- ESP32 Camera library by Espressif
- FFmpeg for video processing
- Arduino WebSocket library
- Node.js and TypeScript communities

---

**Made with ❤️ by MagicInUse**
A repository for ESP32 Cameras and a Raspberry Pi home network video recording client/server interaction.
