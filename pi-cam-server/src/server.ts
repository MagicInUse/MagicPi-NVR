/**
 * Main Server Application
 * Raspberry Pi 5 Host Server for Wireless Camera System
 */

import express from 'express';
import https from 'https';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Responder } from '@homebridge/ciao';
import { promises as fs } from 'fs';
import { IncomingMessage } from 'http';
import url from 'url';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import services and middleware
import config from './config.js';
import { DeviceManager, DeviceStatus } from './services/DeviceManager.js';
import { VideoProcessor } from './services/VideoProcessor.js';
import { CleanupService } from './services/CleanupService.js';
import { validateApiKey, validateWebSocketApiKey, getDeviceIdFromApiKey } from './middleware/auth.js';
import { ApiRoutes } from './api/routes.js';
import path from 'path';

/**
 * Main server class
 */
class PiCameraServer {
  private app: express.Application;
  private server: https.Server | null = null;
  private httpServer: http.Server | null = null;
  private wsServer: WebSocketServer | null = null;
  private mdnsResponder: Responder | null = null;
  private mdnsService: any = null;
  private deviceManager: DeviceManager;
  private videoProcessor: VideoProcessor;
  private cleanupService: CleanupService;
  private apiRoutes: ApiRoutes;
  private frontendClients: Set<WebSocket> = new Set();

  constructor() {
    this.app = express();
    this.deviceManager = DeviceManager.getInstance();
    this.videoProcessor = new VideoProcessor();
    this.cleanupService = new CleanupService();
    this.apiRoutes = new ApiRoutes();
    
    this.setupMiddleware();
    this.setupRoutes();
    
    console.log('Pi Camera Server initialized');
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));
    
    // Add security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // API Routes - all endpoints prefixed with /api
    this.app.use('/api', this.apiRoutes.getRouter());

    // Static video serving with range request support
    this.app.use('/videos', express.static(config.recordings.directory, {
      acceptRanges: true,
      etag: true,
      lastModified: true
    }));

    // Serve React frontend - check for deployed frontend first, then dev location
    const deployedFrontendPath = path.join(__dirname, './client');
    const devFrontendPath = path.join(__dirname, '../../client/dist');
    
    let frontendPath = deployedFrontendPath;
    try {
      require('fs').accessSync(deployedFrontendPath);
      console.log('Using deployed frontend from:', deployedFrontendPath);
    } catch {
      frontendPath = devFrontendPath;
      console.log('Using development frontend from:', devFrontendPath);
    }
    
    this.app.use(express.static(frontendPath));

    // Legacy device registration endpoint (keep for backward compatibility)
    this.app.post('/register', async (req, res) => {
      try {
        const { deviceId, operationMode, motionSensorDetected, firmwareVersion, capabilities } = req.body;

        if (!deviceId) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'deviceId is required'
          });
        }

        // Validate MAC address format
        const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        if (!macRegex.test(deviceId)) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'deviceId must be a valid MAC address (XX:XX:XX:XX:XX:XX)'
          });
        }

        // Register device
        const result = this.deviceManager.registerDevice(deviceId);

        // Update operation mode if provided
        if (operationMode && ['motion-triggered', 'always-on', 'continuous'].includes(operationMode)) {
          this.deviceManager.updateOperationMode(deviceId, operationMode as any, motionSensorDetected || false);
        }

        // Log registration details
        console.log(`Device registered: ${deviceId}, Mode: ${operationMode || 'default'}, Motion Sensor: ${motionSensorDetected || false}`);

        return res.json({
          success: true,
          apiKey: result.apiKey,
          config: result.config,
          serverInfo: {
            wsPort: config.server.httpsPort,
            wsPath: '/ws'
          },
          operationModes: config.operationModes
        });
      } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to register device'
        });
      }
    });

    // Get device status (protected endpoint)
    this.app.get('/device/status', validateApiKey, (req: any, res) => {
      try {
        const device = this.deviceManager.getDeviceById(req.device.id);
        if (!device) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Device not found'
          });
        }

        return res.json({
          deviceId: device.deviceId,
          status: device.status,
          config: device.config,
          lastSeen: device.lastSeen,
          isRecording: device.isRecording,
          totalConnections: device.totalConnections
        });
      } catch (error) {
        console.error('Error getting device status:', error);
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to get device status'
        });
      }
    });

    // Update device configuration (protected endpoint)
    this.app.put('/device/config', validateApiKey, (req: any, res) => {
      try {
        const { config: newConfig } = req.body;
        
        if (!newConfig) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'config is required'
          });
        }

        this.deviceManager.updateDeviceConfig(req.device.id, newConfig);

        return res.json({
          success: true,
          message: 'Configuration updated successfully'
        });
      } catch (error) {
        console.error('Error updating device config:', error);
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to update configuration'
        });
      }
    });

    // Get recordings list (protected endpoint)
    this.app.get('/recordings', validateApiKey, async (req: any, res) => {
      try {
        const { date } = req.query;
        const recordings = await this.videoProcessor.listRecordings(req.device.id, date as string);
        
        res.json({
          deviceId: req.device.id,
          recordings: recordings.map(recording => ({
            path: recording,
            filename: recording.split('/').pop()
          }))
        });
      } catch (error) {
        console.error('Error getting recordings:', error);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to get recordings'
        });
      }
    });

    // Server statistics endpoint (protected)
    this.app.get('/stats', validateApiKey, async (req, res) => {
      try {
        const devices = this.deviceManager.getAllDevices();
        const recordingStats = this.videoProcessor.getRecordingStats();
        const cleanupStats = await this.cleanupService.getCleanupStats();

        res.json({
          devices: {
            total: devices.length,
            online: devices.filter(d => d.status === DeviceStatus.ONLINE).length,
            streaming: devices.filter(d => d.status === DeviceStatus.STREAMING).length,
            asleep: devices.filter(d => d.status === DeviceStatus.ASLEEP).length
          },
          recordings: recordingStats,
          cleanup: cleanupStats,
          server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Error getting server stats:', error);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to get server statistics'
        });
      }
    });

    // SPA fallback - serve React app for all non-API routes
    this.app.get('*', (req, res) => {
      // Don't serve React for API routes or asset requests
      if (req.path.startsWith('/api') || req.path.startsWith('/videos') || req.path.includes('.')) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Endpoint not found'
        });
      }
      
      // Serve React index.html for all other routes (SPA routing)
      // Use the same frontend path logic as above
      const deployedIndexPath = path.join(__dirname, './client/index.html');
      const devIndexPath = path.join(__dirname, '../../client/dist/index.html');
      
      let indexPath = deployedIndexPath;
      try {
        require('fs').accessSync(deployedIndexPath);
      } catch {
        indexPath = devIndexPath;
      }
      
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error('Error serving React app:', err);
          if (!res.headersSent) {
            res.status(500).json({
              error: 'Internal Server Error',
              message: 'Failed to serve application'
            });
          }
        }
        return;
      });
      return;
    });

    // Error handler
    this.app.use((err: any, req: any, res: any, next: any) => {
      console.error('Express error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    });
  }

  /**
   * Setup WebSocket server for real-time communication
   */
  private setupWebSocketServer(): void {
    if (!this.httpServer) {
      throw new Error('HTTP server must be created before WebSocket server');
    }

    this.wsServer = new WebSocketServer({
      server: this.httpServer,
      path: '/ws',
      
      // Disable per-message-deflate compression to ensure protocol compatibility
      perMessageDeflate: false,
      
      verifyClient: (info: any) => {
        // Check for API key in headers or query parameters
        const apiKey = info.req.headers['x-api-key'] as string || 
                      new URL(`https://dummy${info.req.url}`).searchParams.get('apiKey');
        
        // Check if this is a frontend client by origin or referer
        const origin = info.req.headers.origin || info.req.headers.referer;
        const isFrontendClient = origin && (
          origin.includes(info.req.headers.host) || 
          origin.startsWith('https://localhost') ||
          origin.startsWith('http://localhost')
        );
        
        // Allow frontend clients from the same origin without API key
        if (isFrontendClient) {
          return true;
        }
        
        // For device clients, validate API key
        return apiKey ? validateWebSocketApiKey(apiKey) : false;
      }
    });

    this.wsServer.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleWebSocketConnection(ws, request);
    });

    console.log('WebSocket server setup complete');
  }

  /**
   * Handle new WebSocket connections
   */
  private handleWebSocketConnection(ws: WebSocket, request: IncomingMessage): void {
    try {
      // Determine client type based on origin and API key presence
      const origin = request.headers.origin || request.headers.referer;
      const apiKey = request.headers['x-api-key'] as string;
      
      const isFrontendClient = origin && (
        origin.includes(request.headers.host || '') || 
        origin.startsWith('https://localhost') ||
        origin.startsWith('http://localhost')
      );
      
      if (isFrontendClient && !apiKey) {
        // Handle frontend client connection
        this.handleFrontendConnection(ws, request);
      } else {
        // Handle device client connection
        this.handleDeviceConnection(ws, request);
      }
    } catch (error) {
      console.error('Error handling WebSocket connection:', error);
      ws.close(1011, 'Server error');
    }
  }

  /**
   * Handle frontend client WebSocket connection
   */
  private handleFrontendConnection(ws: WebSocket, request: IncomingMessage): void {
    console.log('Frontend client connected via WebSocket');
    
    // Add to frontend clients set
    this.frontendClients.add(ws);
    
    // Send initial data
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to Pi Camera Server',
      clientType: 'frontend',
      timestamp: new Date().toISOString()
    }));
    
    // Send current device list
    this.sendDeviceListToFrontend(ws);
    
    // Handle frontend messages
    ws.on('message', (data: Buffer) => {
      this.handleFrontendMessage(ws, data);
    });
    
    // Handle frontend disconnect
    ws.on('close', () => {
      console.log('Frontend client disconnected');
      this.frontendClients.delete(ws);
    });
    
    ws.on('error', (error: Error) => {
      console.error('Frontend WebSocket error:', error);
      this.frontendClients.delete(ws);
    });
  }

  /**
   * Handle device client WebSocket connection
   */
  private handleDeviceConnection(ws: WebSocket, request: IncomingMessage): void {
    // Extract API key and get device ID
    const apiKey = request.headers['x-api-key'] as string ||
                   new URL(`https://dummy${request.url}`).searchParams.get('apiKey') || '';
    const deviceId = getDeviceIdFromApiKey(apiKey);

    if (!deviceId) {
      console.warn('Device WebSocket connection rejected: invalid API key');
      ws.close(1008, 'Invalid API key');
      return;
    }

    console.log(`Device WebSocket connection established: ${deviceId}`);

    // Associate WebSocket with device
    this.deviceManager.setSocket(deviceId, ws);

    // Send welcome message now that ESP32 can handle incoming messages properly
    console.log(`Device WebSocket ready for streaming: ${deviceId}`);
    
    // Send welcome message to establish proper connection
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'welcome',
        message: 'WebSocket connection established',
        deviceId: deviceId,
        timestamp: new Date().toISOString()
      }));
      console.log(`Welcome message sent to device: ${deviceId}`);
    }

    // Don't start recording immediately - wait for actual video data
    // this.startRecordingForDevice(deviceId, ws);

    // Handle incoming messages
    ws.on('message', async (data: Buffer) => {
      await this.handleWebSocketMessage(deviceId, data);
    });

    // Handle connection close
    ws.on('close', (code: number, reason: Buffer) => {
      console.log(`Device WebSocket closed ${deviceId}: ${code} - ${reason.toString()}`);
      this.handleWebSocketClose(deviceId);
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      console.error(`Device WebSocket error ${deviceId}:`, error);
      this.handleWebSocketClose(deviceId);
    });

    // Notify frontend clients of device status change
    this.broadcastDeviceUpdate(deviceId);
  }

  /**
   * Start recording for a device
   */
  private async startRecordingForDevice(deviceId: string, ws: WebSocket): Promise<void> {
    try {
      if (!this.videoProcessor.isRecording(deviceId)) {
        await this.videoProcessor.startRecording(deviceId);
        console.log(`Recording started for device: ${deviceId}`);
        
        // Send recording notification to ESP32
        ws.send(JSON.stringify({
          type: 'recording_started',
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error(`Error starting recording for device ${deviceId}:`, error);
      // Send error message to ESP32
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to start recording',
        timestamp: new Date().toISOString()
      }));
    }
  }

  /**
   * Handle WebSocket messages
   */
  private async handleWebSocketMessage(deviceId: string, data: Buffer): Promise<void> {
    try {
      // Check for JPEG magic numbers (0xFF, 0xD8) to identify a binary video frame
      if (data.length > 2 && data[0] === 0xFF && data[1] === 0xD8) {
        // This is a binary JPEG frame
        if (!this.videoProcessor.isRecording(deviceId)) {
          await this.videoProcessor.startRecording(deviceId);
          console.log(`Recording started for device: ${deviceId}`);
        }
        this.videoProcessor.writeFrame(deviceId, data);
      } else {
        // This is a text message (JSON command)
        try {
          const message = JSON.parse(data.toString());
          await this.handleDeviceCommand(deviceId, message);
        } catch (parseError) {
          console.warn(`Invalid JSON from device ${deviceId}:`, data.toString());
        }
      }
    } catch (error) {
      console.error(`Error handling message from device ${deviceId}:`, error);
    }
  }

  /**
   * Handle device commands
   */
  private async handleDeviceCommand(deviceId: string, command: any): Promise<void> {
    try {
      console.log(`Command received from device ${deviceId}:`, command);
      
      // Get device to send responses
      const device = this.deviceManager.getDeviceById(deviceId);

      switch (command.type) {
        case 'status_update':
          if (command.status) {
            const statusMap: { [key: string]: DeviceStatus } = {
              'online': DeviceStatus.ONLINE,
              'streaming': DeviceStatus.STREAMING,
              'entering_sleep': DeviceStatus.ASLEEP,
              'offline': DeviceStatus.OFFLINE
            };
            
            const newStatus = statusMap[command.status];
            if (newStatus) {
              this.deviceManager.updateDeviceStatus(deviceId, newStatus);
              
              // Send acknowledgment
              if (device && device.socket && device.socket.readyState === WebSocket.OPEN) {
                device.socket.send(JSON.stringify({
                  type: 'status_ack',
                  message: 'Status update received',
                  timestamp: new Date().toISOString()
                }));
              }
            }
          }
          break;

        case 'heartbeat':
          // Update last seen timestamp
          this.deviceManager.updateDeviceStatus(deviceId, DeviceStatus.ONLINE);
          
          // Send heartbeat acknowledgment
          if (device && device.socket && device.socket.readyState === WebSocket.OPEN) {
            device.socket.send(JSON.stringify({
              type: 'heartbeat_ack',
              message: 'Heartbeat received',
              timestamp: new Date().toISOString()
            }));
          }
          break;

        case 'ready':
          console.log(`Device ${deviceId} is ready for messages`);
          
          // Send configuration or commands if needed
          if (device && device.socket && device.socket.readyState === WebSocket.OPEN) {
            device.socket.send(JSON.stringify({
              type: 'ready_ack',
              message: 'Server ready for communication',
              timestamp: new Date().toISOString()
            }));
          }
          break;

        case 'error':
          console.error(`Device ${deviceId} reported error:`, command.message);
          break;

        default:
          console.warn(`Unknown command type from device ${deviceId}:`, command.type);
      }
    } catch (error) {
      console.error(`Error handling command from device ${deviceId}:`, error);
    }
  }

  /**
   * Handle WebSocket connection close
   */
  private handleWebSocketClose(deviceId: string): void {
    try {
      // Stop recording for this device
      this.videoProcessor.stopRecording(deviceId);
      
      // Remove WebSocket association
      this.deviceManager.removeSocket(deviceId);
      
      console.log(`WebSocket connection closed and cleaned up for device: ${deviceId}`);
    } catch (error) {
      console.error(`Error handling WebSocket close for device ${deviceId}:`, error);
    }
  }

  /**
   * Load SSL certificates
   */
  private async loadSSLCertificates(): Promise<{ key: Buffer; cert: Buffer }> {
    try {
      const [key, cert] = await Promise.all([
        fs.readFile(config.security.keyPath),
        fs.readFile(config.security.certPath)
      ]);
      
      return { key, cert };
    } catch (error) {
      console.error('Error loading SSL certificates:', error);
      throw new Error('Failed to load SSL certificates. Please ensure certificates exist in the security directory.');
    }
  }

  /**
   * Setup mDNS service advertisement
   */
  private setupMDNS(): void {
    try {
      this.mdnsResponder = Responder.getResponder();

      const service = this.mdnsResponder.createService({
        name: config.server.serviceName,
        type: config.server.serviceType,
        port: config.server.httpsPort,
        txt: {
          version: '1.0.0',
          secure: 'true',
          wsPath: '/ws'
        }
      });

      this.mdnsService = service;
      
      service.advertise().then(() => {
        console.log(`mDNS service published: ${config.server.serviceName} on port ${config.server.httpsPort}`);
      }).catch((error: any) => {
        console.error('Failed to advertise mDNS service:', error);
      });

    } catch (error) {
      console.error('Error setting up mDNS:', error);
    }
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      console.log('Starting Pi Camera Server...');

      // Create insecure HTTP server for WebSocket testing
      this.httpServer = http.createServer(this.app);

      // Load SSL certificates
      const { key, cert } = await this.loadSSLCertificates();

      // Create HTTPS server
      this.server = https.createServer({ key, cert }, this.app);

      // Setup WebSocket server
      this.setupWebSocketServer();

      // Start listening on both servers
      this.server.listen(config.server.httpsPort, config.server.host, () => {
        console.log(`HTTPS server listening on https://${config.server.host}:${config.server.httpsPort}`);
      });

      // Start the HTTP server for WebSocket testing
      this.httpServer.listen(3000, config.server.host, () => {
        console.log(`HTTP server for WS listening on http://${config.server.host}:3000`);
      });

      // Setup mDNS
      this.setupMDNS();

      // Start cleanup service
      this.cleanupService.start();

      console.log('Pi Camera Server started successfully');
    } catch (error) {
      console.error('Error starting server:', error);
      process.exit(1);
    }
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    try {
      console.log('Stopping Pi Camera Server...');

      // Stop cleanup service
      this.cleanupService.stop();

      // Stop all recordings
      await this.videoProcessor.stopAllRecordings();

      // Close WebSocket server
      if (this.wsServer) {
        this.wsServer.close();
      }

      // Close HTTPS server
      if (this.server) {
        this.server.close();
      }

      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close();
      }

      // Stop mDNS
      if (this.mdnsService) {
        await this.mdnsService.destroy();
      }
      if (this.mdnsResponder) {
        await this.mdnsResponder.shutdown();
      }

      console.log('Pi Camera Server stopped');
    } catch (error) {
      console.error('Error stopping server:', error);
    }
  }

  /**
   * Send device list to frontend client
   */
  private sendDeviceListToFrontend(ws: WebSocket): void {
    try {
      const devices = this.deviceManager.getAllDevices().map(device => ({
        deviceId: device.deviceId,
        name: device.name || device.deviceId,
        status: device.status,
        config: device.config,
        lastSeen: device.lastSeen,
        isRecording: device.isRecording,
        isStreaming: device.status === DeviceStatus.STREAMING,
        operationMode: device.operationMode || 'continuous'
      }));

      ws.send(JSON.stringify({
        type: 'device_list',
        devices: devices,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error sending device list to frontend:', error);
    }
  }

  /**
   * Handle frontend WebSocket messages
   */
  private handleFrontendMessage(ws: WebSocket, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'get_devices':
          this.sendDeviceListToFrontend(ws);
          break;
          
        case 'start_stream':
          if (message.deviceId) {
            this.handleStartStreamRequest(message.deviceId, ws);
          }
          break;
          
        case 'stop_stream':
          if (message.deviceId) {
            this.handleStopStreamRequest(message.deviceId, ws);
          }
          break;
          
        case 'get_recordings':
          if (message.deviceId) {
            this.sendRecordingsList(message.deviceId, ws);
          }
          break;
          
        default:
          console.warn('Unknown frontend message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling frontend message:', error);
    }
  }

  /**
   * Broadcast device update to all frontend clients
   */
  private broadcastDeviceUpdate(deviceId: string): void {
    try {
      const device = this.deviceManager.getDeviceById(deviceId);
      if (!device) return;

      const deviceUpdate = {
        type: 'device_update',
        device: {
          deviceId: device.deviceId,
          name: device.name || device.deviceId,
          status: device.status,
          config: device.config,
          lastSeen: device.lastSeen,
          isRecording: device.isRecording,
          isStreaming: device.status === DeviceStatus.STREAMING,
          operationMode: device.operationMode || 'continuous'
        },
        timestamp: new Date().toISOString()
      };

      this.frontendClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(deviceUpdate));
        }
      });
    } catch (error) {
      console.error('Error broadcasting device update:', error);
    }
  }

  /**
   * Handle start stream request from frontend
   */
  private async handleStartStreamRequest(deviceId: string, ws: WebSocket): Promise<void> {
    try {
      const device = this.deviceManager.getDeviceById(deviceId);
      if (!device || !device.socket) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Device not connected',
          deviceId: deviceId
        }));
        return;
      }

      // Request device to start streaming
      device.socket.send(JSON.stringify({
        type: 'start_stream',
        timestamp: new Date().toISOString()
      }));

      ws.send(JSON.stringify({
        type: 'stream_started',
        deviceId: deviceId,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error starting stream:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to start stream',
        deviceId: deviceId
      }));
    }
  }

  /**
   * Handle stop stream request from frontend
   */
  private async handleStopStreamRequest(deviceId: string, ws: WebSocket): Promise<void> {
    try {
      const device = this.deviceManager.getDeviceById(deviceId);
      if (!device || !device.socket) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Device not connected',
          deviceId: deviceId
        }));
        return;
      }

      // Request device to stop streaming
      device.socket.send(JSON.stringify({
        type: 'stop_stream',
        timestamp: new Date().toISOString()
      }));

      ws.send(JSON.stringify({
        type: 'stream_stopped',
        deviceId: deviceId,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error stopping stream:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to stop stream',
        deviceId: deviceId
      }));
    }
  }

  /**
   * Send recordings list to frontend
   */
  private async sendRecordingsList(deviceId: string, ws: WebSocket): Promise<void> {
    try {
      const recordings = await this.videoProcessor.listRecordings(deviceId);
      
      ws.send(JSON.stringify({
        type: 'recordings_list',
        deviceId: deviceId,
        recordings: recordings.map(recording => ({
          path: recording,
          filename: recording.split('/').pop(),
          url: `/videos/${recording}`
        })),
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error sending recordings list:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to get recordings',
        deviceId: deviceId
      }));
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const server = new PiCameraServer();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // Start the server
  await server.start();
}

// Start the application
// In ES modules, we check if this file is being run directly
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if this module is being run directly
if (import.meta.url === `file://${process.argv[1]}` || (process.argv[1] && process.argv[1].endsWith('server.js'))) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default PiCameraServer;
