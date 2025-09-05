/**
 * Authentication middleware for the Pi Camera Server
 * Validates API keys for device authentication
 */

import { Request, Response, NextFunction } from 'express';
import { DeviceManager } from '../services/DeviceManager.js';

/**
 * Extended Request interface to include device information
 */
export interface AuthenticatedRequest extends Request {
  device?: {
    id: string;
    apiKey: string;
  };
}

/**
 * Middleware function to validate API keys from request headers
 * Extracts X-API-Key header and validates against registered devices
 * 
 * @param req - Express request object
 * @param res - Express response object  
 * @param next - Express next function
 */
export const validateApiKey = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Extract API key from X-API-Key header
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'API key is required. Please provide X-API-Key header.'
      });
      return;
    }

    // Validate API key against registered devices
    const deviceManager = DeviceManager.getInstance();
    const device = deviceManager.getDevice(apiKey);

    if (!device) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key. Device not found or not registered.'
      });
      return;
    }

    // Add device information to request object for downstream middleware
    req.device = {
      id: device.deviceId,
      apiKey: apiKey
    };

    // Proceed to next middleware
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication validation failed.'
    });
  }
};

/**
 * Middleware specifically for WebSocket authentication
 * Validates API key from WebSocket upgrade request headers
 * 
 * @param apiKey - API key from WebSocket headers
 * @returns boolean indicating if authentication was successful
 */
export const validateWebSocketApiKey = (apiKey: string): boolean => {
  try {
    if (!apiKey) {
      return false;
    }

    const deviceManager = DeviceManager.getInstance();
    const device = deviceManager.getDevice(apiKey);

    return device !== undefined;
  } catch (error) {
    console.error('WebSocket authentication error:', error);
    return false;
  }
};

/**
 * Extract device ID from API key for WebSocket connections
 * 
 * @param apiKey - API key from WebSocket headers
 * @returns device ID if found, undefined otherwise
 */
export const getDeviceIdFromApiKey = (apiKey: string): string | undefined => {
  try {
    const deviceManager = DeviceManager.getInstance();
    const device = deviceManager.getDevice(apiKey);
    return device?.deviceId;
  } catch (error) {
    console.error('Error getting device ID from API key:', error);
    return undefined;
  }
};
