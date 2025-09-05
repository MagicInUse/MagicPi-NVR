/**
 * ESP32-CAM Wireless Camera Client
 * 
 * This code implements a wireless camera client for ESP32-CAM AI-Thinker boards
 * that connects to the Pi Camera Server for secure video streaming and recording.
 * 
 * Features:
 * - Automatic server discovery via mDNS
 * - Secure device registration with API key authentication
 * - WebSocket-based video streaming over TLS
 * - Motion-triggered wake from deep sleep
 * - Configurable camera settings via server commands
 * - Power-efficient operation with deep sleep
 * 
 * Hardware Requirements:
 * - ESP32-CAM AI-Thinker board
 * - PIR motion sensor connected to GPIO 13
 * - Stable power supply (3.3V recommended)
 * 
 * @author MagicInUse
 * @version 1.0.0
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ESPmDNS.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
#include <esp_camera.h>
#include <esp_sleep.h>
#include <esp_system.h>

using namespace websockets;

// ===== CAMERA MODEL CONFIGURATION =====
#define CAMERA_MODEL_AI_THINKER
#include "camera_pins.h"

// ===== PIN DEFINITIONS =====
#define MOTION_SENSOR_PIN 13  // GPIO 13 (RTC-capable pin for wake-up)
#define LED_PIN 4             // Built-in LED pin
#define FLASH_PIN 4           // Camera flash pin

// ===== NETWORK CONFIGURATION =====
const char* WIFI_SSID = "YOUR_WIFI_SSID";        // Replace with your WiFi network name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // Replace with your WiFi password

// ===== MDNS SERVICE DISCOVERY =====
const char* SERVICE_TYPE = "_mycam-server";
const char* PROTOCOL = "_tcp";
const int MDNS_TIMEOUT = 10000; // 10 seconds

// ===== OPERATION MODE CONFIGURATION =====
// Set to true to force always-on mode (ignores motion sensor)
// Set to false to auto-detect based on motion sensor presence
#define FORCE_ALWAYS_ON_MODE false

// Always-on mode settings
const unsigned long ALWAYS_ON_STREAMING_DURATION = 300000;  // 5 minutes
const unsigned long ALWAYS_ON_SLEEP_DURATION = 300000;      // 5 minutes between sessions
const unsigned long CONTINUOUS_MODE_HEARTBEAT = 30000;      // 30 seconds for continuous mode

// ===== STREAMING CONFIGURATION =====
const unsigned long STREAMING_DURATION = 30000; // 30 seconds of streaming (motion mode)
const unsigned long FRAME_INTERVAL = 100;       // 100ms between frames (10 fps)
const unsigned long HEARTBEAT_INTERVAL = 5000;  // 5 seconds between heartbeats

// ===== RTC MEMORY VARIABLES (persist through deep sleep) =====
RTC_DATA_ATTR char serverIP[16] = "";
RTC_DATA_ATTR int serverPort = 0;
RTC_DATA_ATTR char apiKey[65] = "";
RTC_DATA_ATTR bool isRegistered = false;
RTC_DATA_ATTR int bootCount = 0;
RTC_DATA_ATTR unsigned long totalUptime = 0;
RTC_DATA_ATTR char operationMode[20] = "auto-detect";  // "motion-triggered", "always-on", "continuous", "auto-detect"
RTC_DATA_ATTR bool motionSensorDetected = false;

// ===== GLOBAL VARIABLES =====
WiFiClientSecure secureClient;
WebsocketsClient wsClient;
camera_config_t cameraConfig;
bool isStreaming = false;
unsigned long streamingStartTime = 0;
unsigned long lastFrameTime = 0;
unsigned long lastHeartbeatTime = 0;
unsigned long currentStreamingDuration = STREAMING_DURATION;
bool continuousMode = false;

// ===== SERVER CERTIFICATE =====
// Replace this with the contents of your server's cert.pem file
// Remove the BEGIN/END lines and newlines, create one long string
const char* SERVER_CERTIFICATE = 
"-----BEGIN CERTIFICATE-----\n"
"PASTE_YOUR_CERTIFICATE_CONTENT_HERE\n"
"-----END CERTIFICATE-----\n";

/**
 * Detect if motion sensor is connected and determine operation mode
 * Tests the motion sensor pin to see if it responds appropriately
 */
String detectOperationMode() {
  if (FORCE_ALWAYS_ON_MODE) {
    Serial.println("Force always-on mode enabled");
    motionSensorDetected = false;
    return "always-on";
  }
  
  // Test motion sensor presence
  Serial.println("Testing motion sensor presence...");
  
  // Configure pin as input with pulldown
  pinMode(MOTION_SENSOR_PIN, INPUT_PULLDOWN);
  delay(100);
  
  // Read initial state
  int initialReading = digitalRead(MOTION_SENSOR_PIN);
  delay(100);
  
  // Configure as input with pullup and test again
  pinMode(MOTION_SENSOR_PIN, INPUT_PULLUP);
  delay(100);
  int pullupReading = digitalRead(MOTION_SENSOR_PIN);
  
  // Restore normal input mode
  pinMode(MOTION_SENSOR_PIN, INPUT);
  delay(100);
  
  // If readings are significantly different, sensor is likely connected
  if (initialReading != pullupReading) {
    motionSensorDetected = true;
    Serial.println("Motion sensor detected - using motion-triggered mode");
    return "motion-triggered";
  } else {
    motionSensorDetected = false;
    Serial.println("No motion sensor detected - using always-on mode");
    return "always-on";
  }
}

/**
 * Configure operation mode based on detection or stored setting
 */
void configureOperationMode() {
  String detectedMode;
  
  // If operation mode is already set and not auto-detect, use it
  if (strcmp(operationMode, "auto-detect") != 0 && strcmp(operationMode, "") != 0) {
    detectedMode = String(operationMode);
    Serial.printf("Using stored operation mode: %s\n", operationMode);
  } else {
    // Auto-detect operation mode
    detectedMode = detectOperationMode();
    strcpy(operationMode, detectedMode.c_str());
  }
  
  // Configure based on operation mode
  if (detectedMode == "continuous") {
    continuousMode = true;
    currentStreamingDuration = 0; // Unlimited
    Serial.println("Configured for continuous streaming mode");
  } else if (detectedMode == "always-on") {
    continuousMode = false;
    currentStreamingDuration = ALWAYS_ON_STREAMING_DURATION;
    Serial.printf("Configured for always-on mode (%lu ms streaming)\n", currentStreamingDuration);
  } else {
    // motion-triggered (default)
    continuousMode = false;
    currentStreamingDuration = STREAMING_DURATION;
    Serial.printf("Configured for motion-triggered mode (%lu ms streaming)\n", currentStreamingDuration);
  }
}

/**
 * Initialize camera with AI-Thinker specific configuration
 * Sets up camera with optimal settings for streaming
 */
void initializeCamera() {
  Serial.println("Initializing camera...");
  
  cameraConfig.ledc_channel = LEDC_CHANNEL_0;
  cameraConfig.ledc_timer = LEDC_TIMER_0;
  cameraConfig.pin_d0 = Y2_GPIO_NUM;
  cameraConfig.pin_d1 = Y3_GPIO_NUM;
  cameraConfig.pin_d2 = Y4_GPIO_NUM;
  cameraConfig.pin_d3 = Y5_GPIO_NUM;
  cameraConfig.pin_d4 = Y6_GPIO_NUM;
  cameraConfig.pin_d5 = Y7_GPIO_NUM;
  cameraConfig.pin_d6 = Y8_GPIO_NUM;
  cameraConfig.pin_d7 = Y9_GPIO_NUM;
  cameraConfig.pin_xclk = XCLK_GPIO_NUM;
  cameraConfig.pin_pclk = PCLK_GPIO_NUM;
  cameraConfig.pin_vsync = VSYNC_GPIO_NUM;
  cameraConfig.pin_href = HREF_GPIO_NUM;
  cameraConfig.pin_sscb_sda = SIOD_GPIO_NUM;
  cameraConfig.pin_sscb_scl = SIOC_GPIO_NUM;
  cameraConfig.pin_pwdn = PWDN_GPIO_NUM;
  cameraConfig.pin_reset = RESET_GPIO_NUM;
  cameraConfig.xclk_freq_hz = 20000000;
  cameraConfig.pixel_format = PIXFORMAT_JPEG;
  
  // Configure resolution based on PSRAM availability
  if (psramFound()) {
    cameraConfig.frame_size = FRAMESIZE_SVGA;  // 800x600
    cameraConfig.jpeg_quality = 10;
    cameraConfig.fb_count = 2;
    Serial.println("PSRAM found - using SVGA resolution");
  } else {
    cameraConfig.frame_size = FRAMESIZE_VGA;   // 640x480
    cameraConfig.jpeg_quality = 12;
    cameraConfig.fb_count = 1;
    Serial.println("PSRAM not found - using VGA resolution");
  }

  // Initialize the camera
  esp_err_t err = esp_camera_init(&cameraConfig);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    ESP.restart();
  }

  // Configure camera sensor settings
  sensor_t* sensor = esp_camera_sensor_get();
  if (sensor != NULL) {
    sensor->set_brightness(sensor, 0);     // -2 to 2
    sensor->set_contrast(sensor, 0);       // -2 to 2
    sensor->set_saturation(sensor, 0);     // -2 to 2
    sensor->set_special_effect(sensor, 0); // 0 to 6 (0-No Effect, 1-Negative, ...)
    sensor->set_whitebal(sensor, 1);       // 0 = disable , 1 = enable
    sensor->set_awb_gain(sensor, 1);       // 0 = disable , 1 = enable
    sensor->set_wb_mode(sensor, 0);        // 0 to 4 - if awb_gain enabled (0 - Auto, ...)
    sensor->set_exposure_ctrl(sensor, 1);  // 0 = disable , 1 = enable
    sensor->set_aec2(sensor, 0);           // 0 = disable , 1 = enable
    sensor->set_ae_level(sensor, 0);       // -2 to 2
    sensor->set_aec_value(sensor, 300);    // 0 to 1200
    sensor->set_gain_ctrl(sensor, 1);      // 0 = disable , 1 = enable
    sensor->set_agc_gain(sensor, 0);       // 0 to 30
    sensor->set_gainceiling(sensor, (gainceiling_t)0); // 0 to 6
    sensor->set_bpc(sensor, 0);            // 0 = disable , 1 = enable
    sensor->set_wpc(sensor, 1);            // 0 = disable , 1 = enable
    sensor->set_raw_gma(sensor, 1);        // 0 = disable , 1 = enable
    sensor->set_lenc(sensor, 1);           // 0 = disable , 1 = enable
    sensor->set_hmirror(sensor, 0);        // 0 = disable , 1 = enable
    sensor->set_vflip(sensor, 0);          // 0 = disable , 1 = enable
    sensor->set_dcw(sensor, 1);            // 0 = disable , 1 = enable
    sensor->set_colorbar(sensor, 0);       // 0 = disable , 1 = enable
  }

  Serial.println("Camera initialized successfully");
}

/**
 * Connect to WiFi network with retry logic
 * Includes timeout and connection status monitoring
 */
bool connectToWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  const int maxAttempts = 20; // 20 seconds timeout
  
  while (WiFi.status() != WL_CONNECTED && attempts < maxAttempts) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi connected! IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("MAC address: ");
    Serial.println(WiFi.macAddress());
    return true;
  } else {
    Serial.println();
    Serial.println("WiFi connection failed!");
    return false;
  }
}

/**
 * Discover Pi Camera Server using mDNS
 * Searches for the service and retrieves IP address and port
 */
bool discoverServer() {
  Serial.println("Starting mDNS discovery...");
  
  if (!MDNS.begin("esp32cam")) {
    Serial.println("Error starting mDNS");
    return false;
  }
  
  Serial.printf("Searching for service: %s.%s.local\n", SERVICE_TYPE, PROTOCOL);
  
  unsigned long startTime = millis();
  while (millis() - startTime < MDNS_TIMEOUT) {
    int n = MDNS.queryService(SERVICE_TYPE, PROTOCOL);
    
    if (n > 0) {
      Serial.printf("Found %d service(s)\n", n);
      
      // Use the first service found
      IPAddress serverIPAddr = MDNS.IP(0);
      int port = MDNS.port(0);
      
      // Store in RTC memory
      strcpy(serverIP, serverIPAddr.toString().c_str());
      serverPort = port;
      
      Serial.printf("Server found at: %s:%d\n", serverIP, serverPort);
      return true;
    }
    
    delay(1000);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.println("Server discovery timeout");
  return false;
}

/**
 * Register device with the Pi Camera Server
 * Sends MAC address and receives API key and configuration
 */
bool registerWithServer() {
  Serial.println("Registering with server...");
  
  // Setup secure client
  secureClient.setCACert(SERVER_CERTIFICATE);
  secureClient.setTimeout(10000); // 10 second timeout
  
  // Connect to server
  String url = "https://" + String(serverIP) + ":" + String(serverPort);
  
  if (!secureClient.connect(serverIP, serverPort)) {
    Serial.println("Failed to connect to server for registration");
    return false;
  }
  
  // Create registration JSON
  StaticJsonDocument<300> registrationDoc;
  registrationDoc["deviceId"] = WiFi.macAddress();
  registrationDoc["operationMode"] = operationMode;
  registrationDoc["motionSensorDetected"] = motionSensorDetected;
  registrationDoc["firmwareVersion"] = "1.1.0";
  registrationDoc["capabilities"] = "camera,motion,sleep";
  
  String jsonString;
  serializeJson(registrationDoc, jsonString);
  
  // Send HTTP POST request
  String httpRequest = "POST /register HTTP/1.1\r\n";
  httpRequest += "Host: " + String(serverIP) + ":" + String(serverPort) + "\r\n";
  httpRequest += "Content-Type: application/json\r\n";
  httpRequest += "Content-Length: " + String(jsonString.length()) + "\r\n";
  httpRequest += "Connection: close\r\n\r\n";
  httpRequest += jsonString;
  
  secureClient.print(httpRequest);
  
  // Read response
  String response = "";
  unsigned long timeout = millis() + 10000;
  
  while (millis() < timeout) {
    if (secureClient.available()) {
      response += secureClient.readString();
      break;
    }
    delay(10);
  }
  
  secureClient.stop();
  
  if (response.length() == 0) {
    Serial.println("No response from server");
    return false;
  }
  
  // Parse response
  int jsonStart = response.indexOf("\r\n\r\n");
  if (jsonStart == -1) {
    Serial.println("Invalid HTTP response");
    return false;
  }
  
  String jsonResponse = response.substring(jsonStart + 4);
  Serial.println("Server response: " + jsonResponse);
  
  StaticJsonDocument<500> responseDoc;
  DeserializationError error = deserializeJson(responseDoc, jsonResponse);
  
  if (error) {
    Serial.print("JSON parsing failed: ");
    Serial.println(error.c_str());
    return false;
  }
  
  if (responseDoc["success"] == true) {
    // Store API key in RTC memory
    const char* receivedApiKey = responseDoc["apiKey"];
    strcpy(apiKey, receivedApiKey);
    isRegistered = true;
    
    Serial.println("Registration successful!");
    Serial.printf("API Key: %s\n", apiKey);
    
    return true;
  } else {
    Serial.println("Registration failed");
    return false;
  }
}

/**
 * WebSocket event handler for messages from server
 * Processes configuration updates and control commands
 */
void onWebSocketMessage(WebsocketsMessage message) {
  if (message.isText()) {
    Serial.println("Received message: " + message.data());
    
    StaticJsonDocument<300> doc;
    DeserializationError error = deserializeJson(doc, message.data());
    
    if (error) {
      Serial.println("Failed to parse WebSocket message");
      return;
    }
    
    const char* messageType = doc["type"];
    
    if (strcmp(messageType, "welcome") == 0) {
      Serial.println("Received welcome message from server");
    }
    else if (strcmp(messageType, "recording_started") == 0) {
      Serial.println("Server confirmed recording started");
    }
    else if (strcmp(messageType, "config_update") == 0) {
      handleConfigurationUpdate(doc["config"]);
    }
    else if (strcmp(messageType, "command") == 0) {
      handleServerCommand(doc);
    }
    else if (strcmp(messageType, "error") == 0) {
      Serial.println("Server error: " + String(doc["message"].as<const char*>()));
    }
  }
}

/**
 * Handle configuration updates from server
 * Updates camera settings based on server commands
 */
void handleConfigurationUpdate(JsonObject config) {
  Serial.println("Updating camera configuration...");
  
  sensor_t* sensor = esp_camera_sensor_get();
  if (sensor == NULL) {
    Serial.println("Camera sensor not available");
    return;
  }
  
  // Update resolution if specified
  if (config.containsKey("resolution")) {
    String resolution = config["resolution"];
    framesize_t frameSize = FRAMESIZE_SVGA; // default
    
    if (resolution == "QQVGA") frameSize = FRAMESIZE_QQVGA;
    else if (resolution == "QCIF") frameSize = FRAMESIZE_QCIF;
    else if (resolution == "HQVGA") frameSize = FRAMESIZE_HQVGA;
    else if (resolution == "QVGA") frameSize = FRAMESIZE_QVGA;
    else if (resolution == "CIF") frameSize = FRAMESIZE_CIF;
    else if (resolution == "VGA") frameSize = FRAMESIZE_VGA;
    else if (resolution == "SVGA") frameSize = FRAMESIZE_SVGA;
    else if (resolution == "XGA") frameSize = FRAMESIZE_XGA;
    else if (resolution == "SXGA") frameSize = FRAMESIZE_SXGA;
    else if (resolution == "UXGA") frameSize = FRAMESIZE_UXGA;
    
    sensor->set_framesize(sensor, frameSize);
    Serial.println("Resolution updated to: " + resolution);
  }
  
  // Update quality if specified
  if (config.containsKey("quality")) {
    int quality = config["quality"];
    sensor->set_quality(sensor, quality);
    Serial.printf("Quality updated to: %d\n", quality);
  }
  
  // Update brightness if specified
  if (config.containsKey("brightness")) {
    int brightness = config["brightness"];
    sensor->set_brightness(sensor, brightness);
    Serial.printf("Brightness updated to: %d\n", brightness);
  }
  
  // Update contrast if specified
  if (config.containsKey("contrast")) {
    int contrast = config["contrast"];
    sensor->set_contrast(sensor, contrast);
    Serial.printf("Contrast updated to: %d\n", contrast);
  }
  
  // Update saturation if specified
  if (config.containsKey("saturation")) {
    int saturation = config["saturation"];
    sensor->set_saturation(sensor, saturation);
    Serial.printf("Saturation updated to: %d\n", saturation);
  }
}

/**
 * Handle server commands
 * Processes control commands from the server
 */
void handleServerCommand(JsonObject command) {
  const char* action = command["action"];
  
  if (strcmp(action, "start_streaming") == 0) {
    Serial.println("Server requested streaming start");
    isStreaming = true;
  }
  else if (strcmp(action, "stop_streaming") == 0) {
    Serial.println("Server requested streaming stop");
    isStreaming = false;
  }
  else if (strcmp(action, "update_operation_mode") == 0) {
    const char* newMode = command["operationMode"];
    if (newMode) {
      strcpy(operationMode, newMode);
      Serial.printf("Operation mode updated to: %s\n", operationMode);
      configureOperationMode();
    }
  }
  else if (strcmp(action, "reboot") == 0) {
    Serial.println("Server requested reboot");
    ESP.restart();
  }
  else if (strcmp(action, "sleep") == 0) {
    Serial.println("Server requested sleep");
    enterDeepSleep();
  }
  else {
    Serial.println("Unknown server command: " + String(action));
  }
}

/**
 * WebSocket event handler for connection events
 */
void onWebSocketEvent(WebsocketsEvent event, String data) {
  switch (event) {
    case WebsocketsEvent::ConnectionOpened:
      Serial.println("WebSocket connection opened");
      isStreaming = true;
      streamingStartTime = millis();
      break;
      
    case WebsocketsEvent::ConnectionClosed:
      Serial.println("WebSocket connection closed");
      isStreaming = false;
      break;
      
    case WebsocketsEvent::GotPing:
      Serial.println("WebSocket ping received");
      break;
      
    case WebsocketsEvent::GotPong:
      Serial.println("WebSocket pong received");
      break;
  }
}

/**
 * Connect to server via WebSocket with authentication
 * Establishes secure WebSocket connection for streaming
 */
bool connectToWebSocket() {
  Serial.println("Connecting to WebSocket...");
  
  // Set up WebSocket client
  wsClient.setCACert(SERVER_CERTIFICATE);
  wsClient.onMessage(onWebSocketMessage);
  wsClient.onEvent(onWebSocketEvent);
  
  // Add authentication header
  wsClient.addHeader("X-API-Key", apiKey);
  
  // Connect to WebSocket endpoint
  String wsUrl = "wss://" + String(serverIP) + ":" + String(serverPort) + "/ws";
  
  bool connected = wsClient.connect(wsUrl);
  
  if (connected) {
    Serial.println("WebSocket connected successfully");
    
    // Send initial status
    StaticJsonDocument<100> statusDoc;
    statusDoc["type"] = "status_update";
    statusDoc["status"] = "online";
    
    String statusMessage;
    serializeJson(statusDoc, statusMessage);
    wsClient.send(statusMessage);
    
    return true;
  } else {
    Serial.println("WebSocket connection failed");
    return false;
  }
}

/**
 * Send heartbeat message to server
 * Keeps connection alive and updates server status
 */
void sendHeartbeat() {
  if (wsClient.available()) {
    StaticJsonDocument<150> heartbeatDoc;
    heartbeatDoc["type"] = "heartbeat";
    heartbeatDoc["uptime"] = millis();
    heartbeatDoc["free_heap"] = ESP.getFreeHeap();
    heartbeatDoc["boot_count"] = bootCount;
    
    String heartbeatMessage;
    serializeJson(heartbeatDoc, heartbeatMessage);
    wsClient.send(heartbeatMessage);
  }
}

/**
 * Capture and send video frame to server
 * Captures JPEG frame and sends via WebSocket
 */
void captureAndSendFrame() {
  camera_fb_t* frameBuffer = esp_camera_fb_get();
  
  if (!frameBuffer) {
    Serial.println("Camera capture failed");
    return;
  }
  
  if (frameBuffer->format != PIXFORMAT_JPEG) {
    Serial.println("Frame is not JPEG format");
    esp_camera_fb_return(frameBuffer);
    return;
  }
  
  // Send frame via WebSocket
  if (wsClient.available()) {
    wsClient.sendBinary((const char*)frameBuffer->buf, frameBuffer->len);
  }
  
  // Return frame buffer
  esp_camera_fb_return(frameBuffer);
}

/**
 * Configure deep sleep and enter sleep mode
 * Sets up wake-up source and enters power-saving mode
 */
void enterDeepSleep() {
  Serial.println("Preparing for deep sleep...");
  
  // Send sleep status to server
  if (wsClient.available()) {
    StaticJsonDocument<100> sleepDoc;
    sleepDoc["type"] = "status_update";
    sleepDoc["status"] = "entering_sleep";
    sleepDoc["operationMode"] = operationMode;
    
    String sleepMessage;
    serializeJson(sleepDoc, sleepMessage);
    wsClient.send(sleepMessage);
    
    delay(100); // Allow message to be sent
  }
  
  // Close WebSocket connection
  wsClient.close();
  
  // Update total uptime
  totalUptime += millis();
  
  // Configure wake-up based on operation mode
  if (strcmp(operationMode, "continuous") == 0) {
    Serial.println("Continuous mode - not entering deep sleep");
    // Don't sleep in continuous mode, just restart streaming
    delay(1000);
    return;
  }
  else if (strcmp(operationMode, "always-on") == 0) {
    // Always-on mode: sleep for configured interval, then wake with timer
    Serial.printf("Always-on mode - sleeping for %lu ms\n", ALWAYS_ON_SLEEP_DURATION);
    esp_sleep_enable_timer_wakeup(ALWAYS_ON_SLEEP_DURATION * 1000); // Convert to microseconds
  }
  else if (motionSensorDetected) {
    // Motion-triggered mode: wake on motion sensor
    Serial.println("Motion-triggered mode - sleeping until motion detected");
    esp_sleep_enable_ext0_wakeup((gpio_num_t)MOTION_SENSOR_PIN, HIGH);
  }
  else {
    // Fallback: timer wake-up if no motion sensor
    Serial.println("No motion sensor - using timer wake-up");
    esp_sleep_enable_timer_wakeup(ALWAYS_ON_SLEEP_DURATION * 1000);
  }
  
  Serial.flush();
  
  // Enter deep sleep
  esp_deep_sleep_start();
}

/**
 * Check if streaming duration has expired
 * Returns true if streaming time limit reached (unless in continuous mode)
 */
bool isStreamingTimeExpired() {
  if (continuousMode || currentStreamingDuration == 0) {
    return false; // Never expire in continuous mode
  }
  return (millis() - streamingStartTime) > currentStreamingDuration;
}

/**
 * Main setup function
 * Initializes hardware and establishes server connection
 */
void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  
  // Increment boot counter
  bootCount++;
  
  Serial.println();
  Serial.println("=== ESP32-CAM Wireless Camera Client ===");
  Serial.printf("Boot #%d\n", bootCount);
  Serial.printf("Total uptime: %lu ms\n", totalUptime);
  
  // Check wake-up reason
  esp_sleep_wakeup_cause_t wakeupReason = esp_sleep_get_wakeup_cause();
  
  switch (wakeupReason) {
    case ESP_SLEEP_WAKEUP_EXT0:
      Serial.println("Woke up from motion detection");
      break;
    case ESP_SLEEP_WAKEUP_TIMER:
      Serial.println("Woke up from timer (always-on mode)");
      break;
    case ESP_SLEEP_WAKEUP_UNDEFINED:
    default:
      Serial.println("Cold boot - not from sleep");
      // Clear RTC memory on cold boot
      isRegistered = false;
      memset(serverIP, 0, sizeof(serverIP));
      memset(apiKey, 0, sizeof(apiKey));
      memset(operationMode, 0, sizeof(operationMode));
      strcpy(operationMode, "auto-detect");
      serverPort = 0;
      motionSensorDetected = false;
      break;
  }
  
  // Configure operation mode early
  configureOperationMode();
  
  // Initialize GPIO pins
  pinMode(MOTION_SENSOR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Initialize camera
  initializeCamera();
  
  // Connect to WiFi
  if (!connectToWiFi()) {
    Serial.println("WiFi connection failed - entering sleep");
    delay(5000);
    enterDeepSleep();
  }
  
  // Server discovery and registration (skip if already registered)
  if (!isRegistered || strlen(serverIP) == 0 || strlen(apiKey) == 0) {
    Serial.println("Device not registered - performing discovery and registration");
    
    if (!discoverServer()) {
      Serial.println("Server discovery failed - entering sleep");
      delay(5000);
      enterDeepSleep();
    }
    
    if (!registerWithServer()) {
      Serial.println("Server registration failed - entering sleep");
      delay(5000);
      enterDeepSleep();
    }
  } else {
    Serial.printf("Using stored server: %s:%d\n", serverIP, serverPort);
    Serial.printf("Using stored API key: %s\n", apiKey);
  }
  
  // Connect to WebSocket
  if (!connectToWebSocket()) {
    Serial.println("WebSocket connection failed - entering sleep");
    delay(5000);
    enterDeepSleep();
  }
  
  // Turn on LED to indicate active streaming
  digitalWrite(LED_PIN, HIGH);
  
  Serial.println("Setup complete - starting video streaming");
}

/**
 * Main loop function
 * Handles video streaming and connection maintenance
 */
void loop() {
  // Check if WebSocket is still connected
  if (!wsClient.available()) {
    Serial.println("WebSocket disconnected - entering sleep");
    enterDeepSleep();
  }
  
  // Handle WebSocket events
  wsClient.poll();
  
  // Check if streaming time has expired
  if (isStreamingTimeExpired()) {
    Serial.println("Streaming duration expired - entering sleep");
    enterDeepSleep();
  }
  
  // Send video frames at specified interval
  if (isStreaming && millis() - lastFrameTime > FRAME_INTERVAL) {
    captureAndSendFrame();
    lastFrameTime = millis();
  }
  
  // Send heartbeat at specified interval
  if (millis() - lastHeartbeatTime > HEARTBEAT_INTERVAL) {
    sendHeartbeat();
    lastHeartbeatTime = millis();
  }
  
  // Small delay to prevent watchdog timeout
  delay(10);
}
