/**
 * API Routes
 * Defines all REST API endpoints for the surveillance dashboard
 */

import { Router } from 'express';
import { ApiController } from './controller.js';
import { validateApiKey } from '../middleware/auth.js';

export class ApiRoutes {
  private router: Router;
  private controller: ApiController;

  constructor() {
    this.router = Router();
    this.controller = new ApiController();
    this.setupRoutes();
  }

  /**
   * Configure all API routes
   */
  private setupRoutes(): void {
    // Dashboard Endpoints (no authentication required - internal frontend)
    this.router.get('/dashboard/devices', this.controller.getDevices);
    this.router.get('/dashboard/recordings', this.controller.getRecordings);
    this.router.get('/dashboard/stats', this.controller.getSystemStats);
    this.router.post('/dashboard/devices/:deviceId/stream/start', this.controller.startDeviceStream);
    this.router.post('/dashboard/devices/:deviceId/stream/stop', this.controller.stopDeviceStream);
    this.router.delete('/dashboard/recordings/:deviceId/:date/:filename', this.controller.deleteRecording);

    // Device Management Endpoints (require API key authentication)
    this.router.get('/devices', validateApiKey, this.controller.getDevices);
    this.router.post('/devices/:deviceId/stream/start', validateApiKey, this.controller.startDeviceStream);
    this.router.post('/devices/:deviceId/stream/stop', validateApiKey, this.controller.stopDeviceStream);

    // Recording Management Endpoints (require API key authentication)
    this.router.get('/recordings', validateApiKey, this.controller.getRecordings);
    this.router.delete('/recordings/:deviceId/:date/:filename', validateApiKey, this.controller.deleteRecording);

    // System Information Endpoints (require API key authentication)
    this.router.get('/stats', validateApiKey, this.controller.getSystemStats);

    // Health Check Endpoint
    this.router.get('/health', (req, res) => {
      res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '2.0.0'
      });
    });
  }

  /**
   * Get the configured router
   */
  public getRouter(): Router {
    return this.router;
  }
}

export default ApiRoutes;
