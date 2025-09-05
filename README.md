# MagicPi-NVR - Wireless Camera Security System

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
