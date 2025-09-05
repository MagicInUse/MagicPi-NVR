/**
 * Cleanup Service
 * Handles automated cleanup of old recordings and maintenance tasks
 */

import cron from 'node-cron';
import { promises as fs } from 'fs';
import path from 'path';
import config from '../config.js';
import { DeviceManager } from './DeviceManager.js';

/**
 * Service for automated cleanup tasks
 */
export class CleanupService {
  private deviceManager: DeviceManager;
  private cleanupTask: cron.ScheduledTask | null = null;

  constructor() {
    this.deviceManager = DeviceManager.getInstance();
    console.log('CleanupService initialized');
  }

  /**
   * Start the cleanup service
   */
  public start(): void {
    try {
      // Schedule daily cleanup task
      this.cleanupTask = cron.schedule(config.server.cleanupSchedule, async () => {
        console.log('Starting scheduled cleanup...');
        await this.performCleanup();
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      console.log(`Cleanup service started. Scheduled for: ${config.server.cleanupSchedule}`);
    } catch (error) {
      console.error('Error starting cleanup service:', error);
    }
  }

  /**
   * Stop the cleanup service
   */
  public stop(): void {
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
      console.log('Cleanup service stopped');
    }
  }

  /**
   * Perform manual cleanup
   */
  public async performCleanup(): Promise<void> {
    try {
      console.log('Starting cleanup process...');
      
      const startTime = Date.now();
      
      // Clean up old recordings
      const deletedFiles = await this.cleanupOldRecordings();
      
      // Clean up inactive devices
      this.deviceManager.cleanupInactiveDevices();
      
      // Clean up empty directories
      await this.cleanupEmptyDirectories();
      
      const duration = Date.now() - startTime;
      console.log(`Cleanup completed in ${duration}ms. Deleted ${deletedFiles} files.`);
      
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Clean up recordings older than retention period
   * @returns Promise<number> - Number of files deleted
   */
  private async cleanupOldRecordings(): Promise<number> {
    let deletedCount = 0;
    
    try {
      const recordingsPath = config.video.recordingsPath;
      const retentionDays = config.server.recordingRetentionDays;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      console.log(`Cleaning up recordings older than ${retentionDays} days (before ${cutoffDate.toISOString()})`);

      // Check if recordings directory exists
      try {
        await fs.access(recordingsPath);
      } catch {
        console.log('Recordings directory does not exist, skipping cleanup');
        return 0;
      }

      // Get all device directories
      const deviceDirs = await fs.readdir(recordingsPath);
      
      for (const deviceDir of deviceDirs) {
        const devicePath = path.join(recordingsPath, deviceDir);
        const stat = await fs.stat(devicePath);
        
        if (stat.isDirectory()) {
          deletedCount += await this.cleanupDeviceRecordings(devicePath, cutoffDate);
        }
      }
      
    } catch (error) {
      console.error('Error cleaning up old recordings:', error);
    }
    
    return deletedCount;
  }

  /**
   * Clean up recordings for a specific device
   * @param devicePath - Path to device recordings directory
   * @param cutoffDate - Date before which to delete recordings
   * @returns Promise<number> - Number of files deleted
   */
  private async cleanupDeviceRecordings(devicePath: string, cutoffDate: Date): Promise<number> {
    let deletedCount = 0;
    
    try {
      const dateDirs = await fs.readdir(devicePath);
      
      for (const dateDir of dateDirs) {
        // Check if directory name matches date format (YYYY-MM-DD)
        const dateMatch = dateDir.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!dateMatch) {
          continue; // Skip non-date directories
        }
        
        const dirDate = new Date(dateDir + 'T00:00:00Z');
        
        if (dirDate < cutoffDate) {
          const fullDatePath = path.join(devicePath, dateDir);
          console.log(`Deleting old recordings: ${fullDatePath}`);
          
          // Count files before deletion
          const files = await this.getFilesRecursively(fullDatePath);
          deletedCount += files.length;
          
          // Remove the entire date directory
          await fs.rm(fullDatePath, { recursive: true, force: true });
        }
      }
    } catch (error) {
      console.error(`Error cleaning up device recordings at ${devicePath}:`, error);
    }
    
    return deletedCount;
  }

  /**
   * Get all files recursively from a directory
   * @param dirPath - Directory path
   * @returns Promise<string[]> - Array of file paths
   */
  private async getFilesRecursively(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = await fs.stat(itemPath);
        
        if (stat.isDirectory()) {
          const subFiles = await this.getFilesRecursively(itemPath);
          files.push(...subFiles);
        } else {
          files.push(itemPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
    }
    
    return files;
  }

  /**
   * Clean up empty directories in recordings path
   */
  private async cleanupEmptyDirectories(): Promise<void> {
    try {
      const recordingsPath = config.video.recordingsPath;
      
      // Check if recordings directory exists
      try {
        await fs.access(recordingsPath);
      } catch {
        return; // Directory doesn't exist
      }

      await this.removeEmptyDirectoriesRecursively(recordingsPath);
    } catch (error) {
      console.error('Error cleaning up empty directories:', error);
    }
  }

  /**
   * Remove empty directories recursively
   * @param dirPath - Directory path to check
   */
  private async removeEmptyDirectoriesRecursively(dirPath: string): Promise<void> {
    try {
      const items = await fs.readdir(dirPath);
      
      // Process subdirectories first
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = await fs.stat(itemPath);
        
        if (stat.isDirectory()) {
          await this.removeEmptyDirectoriesRecursively(itemPath);
        }
      }
      
      // Check if directory is now empty (after processing subdirectories)
      const remainingItems = await fs.readdir(dirPath);
      if (remainingItems.length === 0 && dirPath !== config.video.recordingsPath) {
        console.log(`Removing empty directory: ${dirPath}`);
        await fs.rmdir(dirPath);
      }
    } catch (error) {
      // Ignore errors for directories that don't exist or can't be removed
      if ((error as any).code !== 'ENOENT' && (error as any).code !== 'ENOTEMPTY') {
        console.error(`Error processing directory ${dirPath}:`, error);
      }
    }
  }

  /**
   * Get cleanup statistics
   * @returns Object with cleanup statistics
   */
  public async getCleanupStats(): Promise<{
    totalRecordings: number;
    oldestRecording: string | null;
    newestRecording: string | null;
    totalSizeBytes: number;
    deviceCount: number;
  }> {
    const stats = {
      totalRecordings: 0,
      oldestRecording: null as string | null,
      newestRecording: null as string | null,
      totalSizeBytes: 0,
      deviceCount: 0
    };

    try {
      const recordingsPath = config.video.recordingsPath;
      
      // Check if recordings directory exists
      try {
        await fs.access(recordingsPath);
      } catch {
        return stats;
      }

      const deviceDirs = await fs.readdir(recordingsPath);
      stats.deviceCount = deviceDirs.length;

      for (const deviceDir of deviceDirs) {
        const devicePath = path.join(recordingsPath, deviceDir);
        const stat = await fs.stat(devicePath);
        
        if (stat.isDirectory()) {
          await this.collectDeviceStats(devicePath, stats);
        }
      }
    } catch (error) {
      console.error('Error collecting cleanup stats:', error);
    }

    return stats;
  }

  /**
   * Collect statistics for a device's recordings
   * @param devicePath - Path to device recordings
   * @param stats - Statistics object to update
   */
  private async collectDeviceStats(
    devicePath: string, 
    stats: { totalRecordings: number; oldestRecording: string | null; newestRecording: string | null; totalSizeBytes: number }
  ): Promise<void> {
    try {
      const files = await this.getFilesRecursively(devicePath);
      
      for (const file of files) {
        if (file.endsWith('.mp4')) {
          stats.totalRecordings++;
          
          const fileStat = await fs.stat(file);
          stats.totalSizeBytes += fileStat.size;
          
          const fileDate = fileStat.mtime.toISOString();
          
          if (!stats.oldestRecording || fileDate < stats.oldestRecording) {
            stats.oldestRecording = fileDate;
          }
          
          if (!stats.newestRecording || fileDate > stats.newestRecording) {
            stats.newestRecording = fileDate;
          }
        }
      }
    } catch (error) {
      console.error(`Error collecting stats for device ${devicePath}:`, error);
    }
  }

  /**
   * Force cleanup of specific device recordings
   * @param deviceId - Device ID to clean up
   * @param beforeDate - Delete recordings before this date
   * @returns Promise<number> - Number of files deleted
   */
  public async cleanupDeviceRecordingsManual(deviceId: string, beforeDate: Date): Promise<number> {
    try {
      const devicePath = path.join(config.video.recordingsPath, deviceId);
      return await this.cleanupDeviceRecordings(devicePath, beforeDate);
    } catch (error) {
      console.error(`Error manually cleaning up device ${deviceId}:`, error);
      return 0;
    }
  }
}
