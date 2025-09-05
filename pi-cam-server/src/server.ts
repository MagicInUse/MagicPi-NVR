/**
 * Main Server Application
 * Raspberry Pi 5 Host Server for Wireless Camera System
 */

import express from 'express';
import https from 'https';
import { WebSocketServer, WebSocket } from 'ws';
import bonjour from 'bonjour';
import { promises as fs } from 'fs';
import { IncomingMessage } from 'http';
import url from 'url';

// Import services and middleware
import config from './config.js';
import { DeviceManager, DeviceStatus } from './services/DeviceManager.js';
import { VideoProcessor } from './services/VideoProcessor.js';
import { CleanupService } from './services/CleanupService.js';
import { validateApiKey, validateWebSocketApiKey, getDeviceIdFromApiKey } from './middleware/auth.js';

/**
 * Main server class
 */
class PiCameraServer {
  private app: express.Application;
  private server: https.Server | null = null;
  private wsServer: WebSocketServer | null = null;
  private bonjourInstance: any = null;
  private deviceManager: DeviceManager;
  private videoProcessor: VideoProcessor;
  private cleanupService: CleanupService;

  constructor() {
    this.app = express();
    this.deviceManager = DeviceManager.getInstance();
    this.videoProcessor = new VideoProcessor();
    this.cleanupService = new CleanupService();
    
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
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });

    // Device registration endpoint
    this.app.post('/register', async (req, res) => {
      try {
        const { deviceId } = req.body;

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

        res.json({
          success: true,
          apiKey: result.apiKey,
          config: result.config,
          serverInfo: {
            wsPort: config.server.httpsPort,
            wsPath: '/ws'
          }
        });

        console.log(`Device registered successfully: ${deviceId}`);
      } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
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

        res.json({
          deviceId: device.deviceId,
          status: device.status,
          config: device.config,
          lastSeen: device.lastSeen,
          isRecording: device.isRecording,
          totalConnections: device.totalConnections
        });
      } catch (error) {
        console.error('Error getting device status:', error);
        res.status(500).json({
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

        res.json({
          success: true,
          message: 'Configuration updated successfully'
        });
      } catch (error) {
        console.error('Error updating device config:', error);
        res.status(500).json({
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

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'Endpoint not found'
      });
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
    if (!this.server) {
      throw new Error('HTTPS server must be created before WebSocket server');
    }

    this.wsServer = new WebSocketServer({
      server: this.server,
      path: '/ws',
      verifyClient: (info) => {
        // Extract API key from headers
        const apiKey = info.req.headers['x-api-key'] as string;
        return validateWebSocketApiKey(apiKey);
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
      // Extract API key and get device ID
      const apiKey = request.headers['x-api-key'] as string;
      const deviceId = getDeviceIdFromApiKey(apiKey);

      if (!deviceId) {
        console.warn('WebSocket connection rejected: invalid API key');
        ws.close(1008, 'Invalid API key');
        return;
      }

      console.log(`WebSocket connection established for device: ${deviceId}`);

      // Associate WebSocket with device
      this.deviceManager.setSocket(deviceId, ws);

      // Start recording for this device
      this.startRecordingForDevice(deviceId, ws);

      // Handle incoming messages
      ws.on('message', async (data: Buffer) => {
        await this.handleWebSocketMessage(deviceId, data);
      });

      // Handle connection close
      ws.on('close', (code: number, reason: Buffer) => {
        console.log(`WebSocket closed for device ${deviceId}: ${code} - ${reason.toString()}`);
        this.handleWebSocketClose(deviceId);
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        console.error(`WebSocket error for device ${deviceId}:`, error);
        this.handleWebSocketClose(deviceId);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to Pi Camera Server',
        deviceId: deviceId,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      console.error('Error handling WebSocket connection:', error);
      ws.close(1011, 'Server error');
    }
  }

  /**
   * Start recording for a device
   */
  private async startRecordingForDevice(deviceId: string, ws: WebSocket): Promise<void> {
    try {
      if (!this.videoProcessor.isRecording(deviceId)) {
        await this.videoProcessor.startRecording(deviceId);
        console.log(`Recording started for device: ${deviceId}`);
        
        // Notify device that recording has started
        ws.send(JSON.stringify({
          type: 'recording_started',
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error(`Error starting recording for device ${deviceId}:`, error);
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
      // Check if message is binary (video frame) or text (JSON command)
      if (data.length > 0 && data[0] === 0xFF && data[1] === 0xD8) {
        // JPEG frame (binary data starting with FF D8)
        this.videoProcessor.writeFrame(deviceId, data);
      } else {
        // Text message (JSON command)
        try {
          const message = JSON.parse(data.toString());
          await this.handleDeviceCommand(deviceId, message);
        } catch (parseError) {
          console.warn(`Invalid JSON message from device ${deviceId}:`, parseError);
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
            }
          }
          break;

        case 'heartbeat':
          // Update last seen timestamp
          this.deviceManager.updateDeviceStatus(deviceId, DeviceStatus.ONLINE);
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
      this.bonjourInstance = bonjour();
      
      this.bonjourInstance.publish({
        name: config.server.serviceName,
        type: config.server.serviceType,
        protocol: config.server.protocol,
        port: config.server.httpsPort,
        txt: {
          version: '1.0.0',
          secure: 'true',
          wsPath: '/ws'
        }
      });

      console.log(`mDNS service published: ${config.server.serviceName} on port ${config.server.httpsPort}`);
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

      // Load SSL certificates
      const { key, cert } = await this.loadSSLCertificates();

      // Create HTTPS server
      this.server = https.createServer({ key, cert }, this.app);

      // Setup WebSocket server
      this.setupWebSocketServer();

      // Start listening
      this.server.listen(config.server.httpsPort, config.server.host, () => {
        console.log(`Server listening on https://${config.server.host}:${config.server.httpsPort}`);
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

      // Stop mDNS
      if (this.bonjourInstance) {
        this.bonjourInstance.unpublishAll();
        this.bonjourInstance.destroy();
      }

      console.log('Pi Camera Server stopped');
    } catch (error) {
      console.error('Error stopping server:', error);
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
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default PiCameraServer;
