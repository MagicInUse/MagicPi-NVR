# Pi Camera Server

A secure, scalable wireless camera system host server for Raspberry Pi 5, designed to work with ESP32-CAM clients.

## Features

- **Secure Communication**: HTTPS/WSS with TLS encryption
- **Device Management**: Auto-discovery and registration of ESP32-CAM devices
- **Video Recording**: Automatic recording with FFmpeg integration
- **Automated Cleanup**: Configurable retention policies for recordings
- **mDNS Discovery**: Automatic service advertisement for client discovery
- **RESTful API**: Complete API for device management and configuration
- **WebSocket Streaming**: Real-time video streaming from camera devices

## Prerequisites

- Raspberry Pi 5 with Raspberry Pi OS
- Node.js 18+ installed
- FFmpeg installed
- OpenSSL for certificate generation

## Installation

1. **Clone and navigate to the project:**
   ```bash
   cd pi-cam-server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Generate SSL certificates:**
   ```bash
   # Follow instructions in security/README.md
   openssl genrsa -out security/key.pem 2048
   openssl req -new -x509 -key security/key.pem -out security/cert.pem -days 365 -subj "/C=US/ST=State/L=City/O=Pi Camera Server/CN=$(hostname -I | awk '{print $1}')"
   chmod 600 security/key.pem
   chmod 644 security/cert.pem
   ```

4. **Install FFmpeg (if not already installed):**
   ```bash
   sudo apt update
   sudo apt install ffmpeg
   ```

## Configuration

The server configuration is located in `src/config.ts`. Key settings include:

- **Server ports**: HTTPS port (default: 3443)
- **Recording retention**: Days to keep recordings (default: 7)
- **Cleanup schedule**: When to run cleanup (default: daily at 2 AM)
- **Video settings**: Recording format and quality settings

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

### Available Scripts
- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Start the production server
- `npm run dev` - Start development server with auto-reload
- `npm run clean` - Clean compiled files

## API Endpoints

### Device Registration
```http
POST /register
Content-Type: application/json

{
  "deviceId": "AA:BB:CC:DD:EE:FF"
}
```

Response:
```json
{
  "success": true,
  "apiKey": "generated-api-key",
  "config": {
    "resolution": "SVGA",
    "framerate": 10,
    "quality": 12
  },
  "serverInfo": {
    "wsPort": 3443,
    "wsPath": "/ws"
  }
}
```

### Device Status (Requires API Key)
```http
GET /device/status
X-API-Key: your-api-key
```

### Update Device Configuration (Requires API Key)
```http
PUT /device/config
X-API-Key: your-api-key
Content-Type: application/json

{
  "config": {
    "resolution": "VGA",
    "framerate": 15
  }
}
```

### List Recordings (Requires API Key)
```http
GET /recordings?date=2023-12-01
X-API-Key: your-api-key
```

### Server Statistics (Requires API Key)
```http
GET /stats
X-API-Key: your-api-key
```

## WebSocket Communication

### Connection
Connect to `wss://pi-ip:3443/ws` with the following headers:
```
X-API-Key: your-device-api-key
```

### Message Types

#### From Device to Server
- **Binary messages**: JPEG video frames
- **Text messages**: JSON status updates

Example status update:
```json
{
  "type": "status_update",
  "status": "streaming"
}
```

#### From Server to Device
- **Configuration updates**
- **Control commands**
- **Status acknowledgments**

## Directory Structure

```
/recordings/
├── AA-BB-CC-DD-EE-FF/          # Device ID (MAC address)
│   ├── 2023-12-01/             # Date folder
│   │   ├── 08.mp4              # Hour-based recording files
│   │   ├── 09.mp4
│   │   └── ...
│   └── 2023-12-02/
└── ...
```

## Security

- **TLS Encryption**: All communications use TLS 1.2+
- **API Key Authentication**: Each device has a unique API key
- **Certificate Validation**: ESP32 clients validate server certificates
- **Rate Limiting**: Built-in protection against abuse

## Monitoring and Maintenance

### Logs
The server provides detailed logging for:
- Device connections and disconnections
- Recording status
- Error conditions
- Cleanup operations

### Automatic Cleanup
- Configurable retention period (default: 7 days)
- Runs daily at 2 AM (configurable)
- Removes old recordings and empty directories
- Cleans up inactive device records

### Health Check
```http
GET /health
```

Returns server status and uptime information.

## Troubleshooting

### Common Issues

1. **Certificate errors**: Ensure SSL certificates are properly generated
2. **FFmpeg not found**: Install FFmpeg: `sudo apt install ffmpeg`
3. **Permission errors**: Check file permissions on recordings directory
4. **Port conflicts**: Ensure port 3443 is available

### Debug Mode
Set `NODE_ENV=development` for verbose logging:
```bash
NODE_ENV=development npm run dev
```

### Log Locations
- Application logs: Console output
- Recording errors: Logged to console with device ID
- Cleanup logs: Scheduled task output

## Development

### Project Structure
```
src/
├── services/           # Core business logic
│   ├── DeviceManager.ts
│   ├── VideoProcessor.ts
│   └── CleanupService.ts
├── middleware/         # Express middleware
│   └── auth.ts
├── config.ts          # Configuration settings
└── server.ts          # Main application entry point
```

### Adding New Features
1. Create new services in `src/services/`
2. Add new routes in `src/server.ts`
3. Update configuration in `src/config.ts`
4. Update TypeScript types as needed

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review log output for error details
3. Ensure all prerequisites are installed
4. Verify network connectivity between Pi and ESP32 devices
