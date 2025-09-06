/**
 * API Controller
 * Handles all business logic for API endpoints
 */

import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { DeviceManager, DeviceStatus } from '../services/DeviceManager.js';
import config from '../config.js';

export class ApiController {
  private deviceManager: DeviceManager;

  constructor() {
    this.deviceManager = DeviceManager.getInstance();
  }

  /**
   * Get all devices with their current status
   */
  public getDevices = async (req: Request, res: Response): Promise<void> => {
    try {
      const devices = this.deviceManager.getAllDevices();
      const deviceList = devices.map(device => ({
        deviceId: device.deviceId,
        name: device.name || device.deviceId,
        status: device.status,
        config: device.config,
        lastSeen: device.lastSeen,
        isStreaming: device.status === DeviceStatus.STREAMING,
        batteryLevel: device.batteryLevel,
        operationMode: device.operationMode
      }));

      res.json({
        success: true,
        devices: deviceList,
        count: deviceList.length
      });
    } catch (error) {
      console.error('Error getting devices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve devices'
      });
    }
  };

  /**
   * Start streaming for a specific device
   */
  public startDeviceStream = async (req: Request, res: Response): Promise<void> => {
    try {
      const { deviceId: rawDeviceId } = req.params;
      console.log(rawDeviceId);
      
      if (!rawDeviceId) {
        console.log('No device ID provided');
        res.status(400).json({
          success: false,
          error: 'Device ID is required'
        });
        return;
      }

      // URL decode the device ID to handle colons properly
      const deviceId = decodeURIComponent(rawDeviceId);
      console.log('Decoded device ID:', deviceId);
      
      // Debug: List all registered devices
      const allDevices = this.deviceManager.getAllDevices();
      console.log('All registered devices:', allDevices.map(d => d.deviceId));

      const device = this.deviceManager.getDeviceById(deviceId);
      console.log('Device found:', !!device);

      if (!device) {
        console.log('Device not found, returning 404');
        res.status(404).json({
          success: false,
          error: 'Device not found'
        });
        return;
      }

      // For now, allow streaming commands even if WebSocket isn't connected
      // since ESP32 may be sending data via other means
      // if (!device.socket || device.socket.readyState !== device.socket.OPEN) {
      //   res.status(400).json({
      //     success: false,
      //     error: 'Device is not connected'
      //   });
      //   return;
      // }

      // Send wake-up command to ESP32 if WebSocket is available
      if (device.socket && device.socket.readyState === device.socket.OPEN) {
        console.log('Sending wake command to device');
        const wakeCommand = {
          action: 'wake_and_stream',
          duration: req.body.duration || 30000, // Default 30 seconds
          timestamp: Date.now()
        };

        device.socket.send(JSON.stringify(wakeCommand));
        console.log(`Wake command sent to device: ${deviceId}`);
        
        // Update device status
        this.deviceManager.updateDeviceStatus(deviceId, DeviceStatus.STREAMING);

        console.log('Sending success response');
        res.json({
          success: true,
          message: `Stream started for device ${deviceId}`,
          deviceId,
          duration: wakeCommand.duration
        });
      } else {
        console.log('WebSocket not available, sending alternative response');
        
        // Update device status anyway since ESP32 is sending data
        this.deviceManager.updateDeviceStatus(deviceId, DeviceStatus.STREAMING);

        res.json({
          success: true,
          message: `Stream started for device ${deviceId} (WebSocket unavailable)`,
          deviceId,
          duration: req.body.duration || 30000
        });
      }
    } catch (error) {
      console.error('Error in startDeviceStream:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start stream'
      });
    }
  };

  /**
   * Stop streaming for a specific device
   */
  public stopDeviceStream = async (req: Request, res: Response): Promise<void> => {
    try {
      const { deviceId: rawDeviceId } = req.params;
      
      if (!rawDeviceId) {
        res.status(400).json({
          success: false,
          error: 'Device ID is required'
        });
        return;
      }

      // URL decode the device ID to handle colons properly
      const deviceId = decodeURIComponent(rawDeviceId);
      const device = this.deviceManager.getDeviceById(deviceId);

      if (!device) {
        res.status(404).json({
          success: false,
          error: 'Device not found'
        });
        return;
      }

      if (!device.socket || device.socket.readyState !== device.socket.OPEN) {
        res.status(400).json({
          success: false,
          error: 'Device is not connected'
        });
        return;
      }

      // Send stop command to ESP32
      const stopCommand = {
        action: 'stop_stream',
        timestamp: Date.now()
      };

      device.socket.send(JSON.stringify(stopCommand));
      
      // Update device status
      this.deviceManager.updateDeviceStatus(deviceId, DeviceStatus.ONLINE);

      res.json({
        success: true,
        message: `Stream stopped for device ${deviceId}`,
        deviceId
      });
    } catch (error) {
      console.error('Error stopping device stream:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to stop stream'
      });
    }
  };

  /**
   * Get all recordings organized by device, date, and hour
   */
  public getRecordings = async (req: Request, res: Response): Promise<void> => {
    try {
      const recordingsPath = config.recordings.directory;
      const recordings: any = {};

      // Check if recordings directory exists
      try {
        await fs.access(recordingsPath);
      } catch (error) {
        res.json({
          success: true,
          recordings: {},
          message: 'No recordings directory found'
        });
        return;
      }

      // Read device directories
      const deviceDirs = await fs.readdir(recordingsPath);
      
      for (const deviceId of deviceDirs) {
        const devicePath = path.join(recordingsPath, deviceId);
        const stats = await fs.stat(devicePath);
        
        if (stats.isDirectory()) {
          recordings[deviceId] = {};
          
          // Read date directories
          const dateDirs = await fs.readdir(devicePath);
          
          for (const date of dateDirs) {
            const datePath = path.join(devicePath, date);
            const dateStats = await fs.stat(datePath);
            
            if (dateStats.isDirectory()) {
              recordings[deviceId][date] = [];
              
              // Read hour files
              const files = await fs.readdir(datePath);
              
              for (const file of files) {
                if (file.endsWith('.mp4')) {
                  const filePath = path.join(datePath, file);
                  const fileStats = await fs.stat(filePath);
                  const hour = file.replace('.mp4', '');
                  
                  recordings[deviceId][date].push({
                    hour,
                    filename: file,
                    size: fileStats.size,
                    created: fileStats.birthtime,
                    modified: fileStats.mtime,
                    url: `/videos/${deviceId}/${date}/${file}`
                  });
                }
              }
              
              // Sort by hour
              recordings[deviceId][date].sort((a: any, b: any) => a.hour.localeCompare(b.hour));
            }
          }
        }
      }

      res.json({
        success: true,
        recordings
      });
    } catch (error) {
      console.error('Error getting recordings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve recordings'
      });
    }
  };

  /**
   * Delete a specific recording
   */
  public deleteRecording = async (req: Request, res: Response): Promise<void> => {
    try {
      const { deviceId, date, filename } = req.params;
      
      if (!deviceId || !date || !filename) {
        res.status(400).json({
          success: false,
          error: 'Device ID, date, and filename are required'
        });
        return;
      }
      
      // Validate filename to prevent directory traversal
      if (!filename.endsWith('.mp4') || filename.includes('..') || filename.includes('/')) {
        res.status(400).json({
          success: false,
          error: 'Invalid filename'
        });
        return;
      }

      const filePath = path.join(config.recordings.directory, deviceId, date, filename);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        res.status(404).json({
          success: false,
          error: 'Recording not found'
        });
        return;
      }

      // Delete the file
      await fs.unlink(filePath);

      res.json({
        success: true,
        message: `Recording ${filename} deleted successfully`,
        deviceId,
        date,
        filename
      });
    } catch (error) {
      console.error('Error deleting recording:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete recording'
      });
    }
  };

  /**
   * Get system statistics
   */
  public getSystemStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const devices = this.deviceManager.getAllDevices();
      const totalDevices = devices.length;
      const onlineDevices = devices.filter(d => d.status !== DeviceStatus.OFFLINE).length;
      const streamingDevices = devices.filter(d => d.status === DeviceStatus.STREAMING).length;

      // Calculate total recordings size
      let totalRecordingsSize = 0;
      let totalRecordings = 0;

      try {
        const recordingsPath = config.recordings.directory;
        await fs.access(recordingsPath);
        
        const deviceDirs = await fs.readdir(recordingsPath);
        for (const deviceId of deviceDirs) {
          const devicePath = path.join(recordingsPath, deviceId);
          const stats = await fs.stat(devicePath);
          
          if (stats.isDirectory()) {
            const dateDirs = await fs.readdir(devicePath);
            for (const date of dateDirs) {
              const datePath = path.join(devicePath, date);
              const dateStats = await fs.stat(datePath);
              
              if (dateStats.isDirectory()) {
                const files = await fs.readdir(datePath);
                for (const file of files) {
                  if (file.endsWith('.mp4')) {
                    const filePath = path.join(datePath, file);
                    const fileStats = await fs.stat(filePath);
                    totalRecordingsSize += fileStats.size;
                    totalRecordings++;
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        // Recordings directory doesn't exist or is empty
      }

      res.json({
        success: true,
        stats: {
          devices: {
            total: totalDevices,
            online: onlineDevices,
            streaming: streamingDevices,
            offline: totalDevices - onlineDevices
          },
          recordings: {
            total: totalRecordings,
            totalSize: totalRecordingsSize,
            totalSizeFormatted: this.formatBytes(totalRecordingsSize)
          },
          system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: '2.0.0'
          }
        }
      });
    } catch (error) {
      console.error('Error getting system stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system statistics'
      });
    }
  };

  /**
   * Helper function to format bytes
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
