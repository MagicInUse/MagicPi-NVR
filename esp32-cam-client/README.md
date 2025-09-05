# ESP32-CAM Wireless Camera Client

Arduino code for ESP32-CAM AI-Thinker boards that connects to the Pi Camera Server for secure wireless video streaming and recording.

## Features

- **Automatic Server Discovery**: Uses mDNS to find the Pi Camera Server
- **Secure Registration**: Automatic device registration with API key authentication
- **TLS Encryption**: All communications encrypted with TLS/SSL
- **Motion-Triggered Wake**: Deep sleep with wake on motion detection
- **Power Efficient**: Optimized for battery operation with deep sleep
- **Configurable Settings**: Camera settings controlled remotely by server
- **Real-time Streaming**: WebSocket-based video streaming
- **Automatic Reconnection**: Handles network disconnections gracefully

## Hardware Requirements

### ESP32-CAM AI-Thinker Board
- ESP32-CAM AI-Thinker module
- MicroSD card slot (optional, for local storage)
- Built-in camera and LED

### Motion Sensor
- PIR motion sensor (HC-SR501 or similar)
- Connect VCC to 3.3V
- Connect GND to GND  
- Connect OUT to GPIO 13

### Power Supply
- Stable 3.3V power supply recommended
- USB power adapter or battery pack
- Minimum 500mA current capacity

## Pin Connections

```
ESP32-CAM AI-Thinker Pin Layout:
                    ┌─────────────┐
                    │   ESP32-CAM │
                    │             │
    Motion Sensor ──┤ GPIO 13     │
                    │             │
        Built-in LED┤ GPIO 4      │
                    │             │
              Camera┤ Camera Port │
                    │             │
                    └─────────────┘
```

## Software Requirements

### Arduino IDE Setup
1. **Install Arduino IDE** (version 2.0+ recommended)
2. **Add ESP32 Board Support**:
   - Go to File → Preferences
   - Add this URL to Additional Board Manager URLs:
     ```
     https://dl.espressif.com/dl/package_esp32_index.json
     ```
   - Go to Tools → Board → Board Manager
   - Search for "ESP32" and install "ESP32 by Espressif Systems"

### Required Libraries
Install these libraries via Arduino IDE Library Manager:

1. **ArduinoWebsockets** by Gil Maimon
   ```
   Tools → Manage Libraries → Search "ArduinoWebsockets"
   ```

2. **ArduinoJson** by Benoit Blanchon
   ```
   Tools → Manage Libraries → Search "ArduinoJson"
   ```

3. **ESP32 Camera Library** (included with ESP32 board package)

### Board Configuration
Select the following settings in Arduino IDE:

- **Board**: "ESP32 Wrover Module"
- **Upload Speed**: "921600"  
- **CPU Frequency**: "240MHz (WiFi/BT)"
- **Flash Frequency**: "80MHz"
- **Flash Mode**: "QIO"
- **Flash Size**: "4MB (32Mb)"
- **Partition Scheme**: "Default 4MB with spiffs"
- **Core Debug Level**: "None"
- **PSRAM**: "Enabled"

## Installation and Configuration

### Step 1: Hardware Assembly
1. Connect PIR motion sensor to GPIO 13
2. Ensure stable 3.3V power supply
3. Insert programmed ESP32-CAM into camera housing

### Step 2: Code Configuration
1. **WiFi Credentials**: Update these lines in the code:
   ```cpp
   const char* WIFI_SSID = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   ```

2. **Server Certificate**: Replace the placeholder certificate:
   ```cpp
   const char* SERVER_CERTIFICATE = 
   "-----BEGIN CERTIFICATE-----\n"
   "PASTE_YOUR_CERTIFICATE_CONTENT_HERE\n"
   "-----END CERTIFICATE-----\n";
   ```
   
   To get the certificate:
   - Copy contents of `pi-cam-server/security/cert.pem`
   - Paste entire content including BEGIN/END lines
   - Keep the newline characters (`\n`)

### Step 3: Upload Code
1. **Connect ESP32-CAM to computer**:
   - Use USB-to-Serial adapter (FTDI or similar)
   - Connect GPIO 0 to GND during upload
   - Power cycle the board

2. **Upload Process**:
   ```
   Arduino IDE → Select correct port → Upload
   ```

3. **Post-Upload**:
   - Disconnect GPIO 0 from GND
   - Power cycle the board
   - Open Serial Monitor (115200 baud) to view logs

### Step 4: Verify Operation
1. **Check Serial Output**:
   ```
   === ESP32-CAM Wireless Camera Client ===
   Boot #1
   WiFi connected! IP address: 192.168.1.100
   Server found at: 192.168.1.50:3443
   Registration successful!
   WebSocket connected successfully
   Setup complete - starting video streaming
   ```

2. **Verify on Server**: Check server logs for device registration

## Configuration Options

### Camera Settings
Modify these values in the code to adjust camera behavior:

```cpp
// Streaming duration before sleep (milliseconds)
const unsigned long STREAMING_DURATION = 30000; // 30 seconds

// Frame rate (milliseconds between frames)
const unsigned long FRAME_INTERVAL = 100; // 10 fps

// Heartbeat interval (milliseconds)
const unsigned long HEARTBEAT_INTERVAL = 5000; // 5 seconds
```

### Power Management
```cpp
// Motion sensor pin (must be RTC-capable)
#define MOTION_SENSOR_PIN 13

// Deep sleep wake-up trigger
esp_sleep_enable_ext0_wakeup((gpio_num_t)MOTION_SENSOR_PIN, HIGH);
```

### Camera Quality Settings
```cpp
// In initializeCamera() function:
cameraConfig.frame_size = FRAMESIZE_SVGA;  // Resolution
cameraConfig.jpeg_quality = 10;            // Quality (lower = better)
cameraConfig.fb_count = 2;                 // Frame buffers
```

## Operation Modes

### Cold Boot Sequence
1. Hardware initialization
2. WiFi connection
3. mDNS server discovery
4. Device registration with server
5. WebSocket connection establishment
6. Video streaming for configured duration
7. Deep sleep until motion detected

### Wake from Sleep Sequence
1. Motion detection wake-up
2. WiFi reconnection
3. WebSocket reconnection (using stored credentials)
4. Video streaming
5. Return to deep sleep

### Status LED Indicators
- **LED OFF**: Device in deep sleep
- **LED ON**: Device active and streaming
- **LED Blinking**: WiFi connection or server communication

## Troubleshooting

### Common Issues

1. **WiFi Connection Failed**
   - Check SSID and password
   - Verify WiFi signal strength
   - Ensure 2.4GHz network (ESP32 doesn't support 5GHz)

2. **Server Discovery Failed**
   - Verify Pi server is running
   - Check network connectivity
   - Ensure mDNS is working (ping `pi-hostname.local`)

3. **Registration Failed**
   - Check server certificate
   - Verify server API is accessible
   - Check server logs for errors

4. **WebSocket Connection Failed**
   - Verify API key received during registration
   - Check server WebSocket endpoint
   - Ensure firewall allows connection

5. **Camera Initialization Failed**
   - Check camera module connection
   - Verify PSRAM settings
   - Try different frame size/quality settings

### Debug Mode
Enable verbose logging by modifying:
```cpp
Serial.setDebugOutput(true); // Already enabled in code
```

### Serial Monitor Output
Monitor these messages for troubleshooting:
```
Camera initialized successfully
WiFi connected! IP address: x.x.x.x
Server found at: x.x.x.x:3443
Registration successful!
WebSocket connected successfully
Received message: {"type":"welcome"...}
```

## Power Consumption

### Active Mode (Streaming)
- WiFi + Camera + Processing: ~200-300mA @ 3.3V
- Estimated battery life with 2000mAh: ~7-10 hours

### Deep Sleep Mode
- RTC + Wake circuit: ~10-50µA @ 3.3V
- Estimated battery life with 2000mAh: ~4-20 months

### Optimization Tips
1. Reduce streaming duration
2. Lower frame rate
3. Reduce frame size/quality
4. Use motion detection strategically
5. Implement scheduled wake-ups

## Advanced Configuration

### Custom Camera Settings
```cpp
// In initializeCamera() function, adjust:
sensor->set_brightness(sensor, 0);     // -2 to 2
sensor->set_contrast(sensor, 0);       // -2 to 2
sensor->set_saturation(sensor, 0);     // -2 to 2
sensor->set_quality(sensor, 10);       // 0-63 (lower = better)
```

### Network Configuration
```cpp
// Static IP (optional)
IPAddress local_IP(192, 168, 1, 100);
IPAddress gateway(192, 168, 1, 1);
IPAddress subnet(255, 255, 255, 0);
WiFi.config(local_IP, gateway, subnet);
```

### OTA Updates
For over-the-air updates, add WiFiUdp and ArduinoOTA libraries:
```cpp
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
```

## Security Considerations

1. **Certificate Validation**: Always use valid server certificates
2. **API Key Security**: API keys are stored in RTC memory
3. **Network Security**: Use WPA2/WPA3 WiFi networks
4. **Physical Security**: Secure device mounting and access
5. **Firmware Updates**: Keep ESP32 firmware updated

## Support and Troubleshooting

### Hardware Issues
- Check power supply stability
- Verify camera module connection
- Test motion sensor separately

### Software Issues
- Check library versions
- Verify board package version
- Clear RTC memory if needed

### Network Issues
- Use WiFi analyzer to check signal strength
- Test with different networks
- Check router firewall settings

## License

MIT License - see LICENSE file for details.
