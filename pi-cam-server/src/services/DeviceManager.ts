/**
 * Device Manager Service
 * Manages all connected ESP32-CAM devices, their authentication, and state
 */

import { WebSocket } from 'ws';
import crypto from 'crypto';
import config from '../config.js';

/**
 * Device status enumeration
 */
export enum DeviceStatus {
  REGISTERED = 'registered',
  ONLINE = 'online',
  STREAMING = 'streaming',
  ASLEEP = 'asleep',
  OFFLINE = 'offline'
}

/**
 * Device configuration interface
 */
export interface DeviceConfig {
  resolution: string;
  framerate: number;
  quality: number;
  brightness: number;
  contrast: number;
  saturation: number;
  operationMode: 'motion-triggered' | 'always-on' | 'continuous';
  alwaysOnDuration?: number;
  alwaysOnInterval?: number;
}

/**
 * Device information interface
 */
export interface DeviceInfo {
  deviceId: string;
  apiKey: string;
  name?: string;
  status: DeviceStatus;
  config: DeviceConfig;
  socket?: WebSocket;
  lastSeen: Date;
  registeredAt: Date;
  totalConnections: number;
  isRecording: boolean;
  operationMode: 'motion-triggered' | 'always-on' | 'continuous';
  motionSensorDetected: boolean;
  batteryLevel?: number;
}

/**
 * Singleton Device Manager class
 * Handles device registration, authentication, and state management
 */
export class DeviceManager {
  private static instance: DeviceManager;
  private devices: Map<string, DeviceInfo> = new Map();
  private apiKeyToDeviceId: Map<string, string> = new Map();

  private constructor() {
    console.log('DeviceManager initialized');
  }

  /**
   * Get singleton instance of DeviceManager
   */
  public static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  /**
   * Register a new device and generate API key
   * @param deviceId - MAC address of the device
   * @returns Object containing API key and initial configuration
   */
  public registerDevice(deviceId: string): { apiKey: string; config: DeviceConfig } {
    try {
      // Check if device is already registered
      if (this.devices.has(deviceId)) {
        const existingDevice = this.devices.get(deviceId)!;
        console.log(`Device ${deviceId} already registered, returning existing API key`);
        return {
          apiKey: existingDevice.apiKey,
          config: existingDevice.config
        };
      }

      // Generate unique API key
      const apiKey = this.generateApiKey();
      
      // Create device configuration with defaults
      const deviceConfig: DeviceConfig = { ...config.defaultDeviceConfig };

      // Create device info
      const deviceInfo: DeviceInfo = {
        deviceId,
        apiKey,
        status: DeviceStatus.REGISTERED,
        config: deviceConfig,
        lastSeen: new Date(),
        registeredAt: new Date(),
        totalConnections: 0,
        isRecording: false,
        operationMode: deviceConfig.operationMode,
        motionSensorDetected: false // Will be updated when device connects
      };

      // Store device information
      this.devices.set(deviceId, deviceInfo);
      this.apiKeyToDeviceId.set(apiKey, deviceId);

      console.log(`Device registered: ${deviceId} with API key: ${apiKey.substring(0, 8)}...`);

      return {
        apiKey,
        config: deviceConfig
      };
    } catch (error) {
      console.error(`Error registering device ${deviceId}:`, error);
      throw new Error('Failed to register device');
    }
  }

  /**
   * Get device information by API key
   * @param apiKey - API key to lookup
   * @returns Device information or undefined if not found
   */
  public getDevice(apiKey: string): DeviceInfo | undefined {
    try {
      const deviceId = this.apiKeyToDeviceId.get(apiKey);
      if (!deviceId) {
        return undefined;
      }
      return this.devices.get(deviceId);
    } catch (error) {
      console.error(`Error getting device by API key:`, error);
      return undefined;
    }
  }

  /**
   * Get device information by device ID
   * @param deviceId - Device ID to lookup
   * @returns Device information or undefined if not found
   */
  public getDeviceById(deviceId: string): DeviceInfo | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Update device status
   * @param deviceId - Device ID to update
   * @param status - New status
   */
  public updateDeviceStatus(deviceId: string, status: DeviceStatus): void {
    try {
      const device = this.devices.get(deviceId);
      if (device) {
        device.status = status;
        device.lastSeen = new Date();
        
        if (status === DeviceStatus.ONLINE) {
          device.totalConnections++;
        }

        console.log(`Device ${deviceId} status updated to: ${status}`);
      } else {
        console.warn(`Attempted to update status for unknown device: ${deviceId}`);
      }
    } catch (error) {
      console.error(`Error updating device status for ${deviceId}:`, error);
    }
  }

  /**
   * Associate a WebSocket connection with a device
   * @param deviceId - Device ID
   * @param socket - WebSocket connection
   */
  public setSocket(deviceId: string, socket: WebSocket): void {
    try {
      const device = this.devices.get(deviceId);
      if (device) {
        // Close existing socket if present
        if (device.socket && device.socket.readyState === WebSocket.OPEN) {
          device.socket.close();
        }

        device.socket = socket;
        this.updateDeviceStatus(deviceId, DeviceStatus.ONLINE);
        console.log(`WebSocket associated with device: ${deviceId}`);
      } else {
        console.warn(`Attempted to set socket for unknown device: ${deviceId}`);
      }
    } catch (error) {
      console.error(`Error setting socket for device ${deviceId}:`, error);
    }
  }

  /**
   * Send command to a specific device via WebSocket
   * @param deviceId - Target device ID
   * @param command - Command object to send
   * @returns boolean indicating success
   */
  public sendCommand(deviceId: string, command: object): boolean {
    try {
      const device = this.devices.get(deviceId);
      if (!device || !device.socket || device.socket.readyState !== WebSocket.OPEN) {
        console.warn(`Cannot send command to device ${deviceId}: no active connection`);
        return false;
      }

      const message = JSON.stringify(command);
      device.socket.send(message);
      console.log(`Command sent to device ${deviceId}:`, command);
      return true;
    } catch (error) {
      console.error(`Error sending command to device ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * Remove WebSocket association when connection closes
   * @param deviceId - Device ID
   */
  public removeSocket(deviceId: string): void {
    try {
      const device = this.devices.get(deviceId);
      if (device) {
        delete device.socket;
        this.updateDeviceStatus(deviceId, DeviceStatus.OFFLINE);
        console.log(`WebSocket removed from device: ${deviceId}`);
      }
    } catch (error) {
      console.error(`Error removing socket for device ${deviceId}:`, error);
    }
  }

  /**
   * Get all registered devices
   * @returns Array of all device information
   */
  public getAllDevices(): DeviceInfo[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get devices by status
   * @param status - Status to filter by
   * @returns Array of devices with specified status
   */
  public getDevicesByStatus(status: DeviceStatus): DeviceInfo[] {
    return Array.from(this.devices.values()).filter(device => device.status === status);
  }

  /**
   * Update device configuration
   * @param deviceId - Device ID to update
   * @param config - New configuration
   */
  public updateDeviceConfig(deviceId: string, config: Partial<DeviceConfig>): void {
    try {
      const device = this.devices.get(deviceId);
      if (device) {
        device.config = { ...device.config, ...config };
        console.log(`Device ${deviceId} configuration updated:`, config);
        
        // Temporarily disable sending config updates to ESP32 until we fix the receive issue
        // if (device.socket && device.socket.readyState === WebSocket.OPEN) {
        //   this.sendCommand(deviceId, {
        //     action: 'update_config',
        //     config: device.config
        //   });
        // }
      } else {
        console.warn(`Attempted to update config for unknown device: ${deviceId}`);
      }
    } catch (error) {
      console.error(`Error updating device config for ${deviceId}:`, error);
    }
  }

  /**
   * Update device operation mode
   * @param deviceId - Device ID to update
   * @param operationMode - New operation mode
   * @param motionSensorDetected - Whether motion sensor is detected
   */
  public updateOperationMode(
    deviceId: string, 
    operationMode: 'motion-triggered' | 'always-on' | 'continuous',
    motionSensorDetected: boolean = false
  ): void {
    try {
      const device = this.devices.get(deviceId);
      if (device) {
        device.operationMode = operationMode;
        device.motionSensorDetected = motionSensorDetected;
        device.config.operationMode = operationMode;
        
        console.log(`Device ${deviceId} operation mode updated to: ${operationMode} (motion sensor: ${motionSensorDetected})`);
        
        // Temporarily disable sending commands to ESP32 until we fix the receive issue
        // if (device.socket && device.socket.readyState === WebSocket.OPEN) {
        //   this.sendCommand(deviceId, {
        //     action: 'update_operation_mode',
        //     operationMode: operationMode,
        //     config: device.config
        //   });
        // }
      } else {
        console.warn(`Attempted to update operation mode for unknown device: ${deviceId}`);
      }
    } catch (error) {
      console.error(`Error updating operation mode for device ${deviceId}:`, error);
    }
  }

  /**
   * Set device recording status
   * @param deviceId - Device ID
   * @param isRecording - Recording status
   */
  public setRecordingStatus(deviceId: string, isRecording: boolean): void {
    try {
      const device = this.devices.get(deviceId);
      if (device) {
        device.isRecording = isRecording;
        if (isRecording) {
          this.updateDeviceStatus(deviceId, DeviceStatus.STREAMING);
        }
      }
    } catch (error) {
      console.error(`Error setting recording status for device ${deviceId}:`, error);
    }
  }

  /**
   * Generate a secure random API key
   * @returns Random hex string
   */
  private generateApiKey(): string {
    return crypto.randomBytes(config.security.apiKeyLength).toString('hex');
  }

  /**
   * Clean up inactive devices (called periodically)
   */
  public cleanupInactiveDevices(): void {
    const now = new Date();
    const maxInactiveTime = 24 * 60 * 60 * 1000; // 24 hours

    for (const [deviceId, device] of this.devices.entries()) {
      const inactiveTime = now.getTime() - device.lastSeen.getTime();
      
      if (inactiveTime > maxInactiveTime && device.status === DeviceStatus.OFFLINE) {
        console.log(`Cleaning up inactive device: ${deviceId}`);
        this.apiKeyToDeviceId.delete(device.apiKey);
        this.devices.delete(deviceId);
      }
    }
  }
}
