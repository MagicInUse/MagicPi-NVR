/**
 * Video Processing Service
 * Handles video recording, processing, and storage using FFmpeg
 */

import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { Writable } from 'stream';
import config from '../config.js';
import { DeviceManager } from './DeviceManager.js';

/**
 * Video processing class for handling camera streams
 */
export class VideoProcessor {
  private activeRecordings: Map<string, ffmpeg.FfmpegCommand> = new Map();
  private recordingStreams: Map<string, Writable> = new Map();
  private deviceManager: DeviceManager;

  constructor() {
    this.deviceManager = DeviceManager.getInstance();
    console.log('VideoProcessor initialized');
  }

  /**
   * Start recording for a specific device
   * @param deviceId - Device ID to start recording for
   * @returns Promise<Writable> - Stream to write video data to
   */
  public async startRecording(deviceId: string): Promise<Writable> {
    try {
      console.log(`Starting recording for device: ${deviceId}`);

      // Stop existing recording if any
      await this.stopRecording(deviceId);

      // Create output directory structure
      const outputPath = await this.createOutputPath(deviceId);
      
      // Get device configuration
      const device = this.deviceManager.getDeviceById(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      // Create FFmpeg command
      const command = ffmpeg()
        .inputFormat(config.video.inputFormat)
        .inputOptions([
          '-use_wallclock_as_timestamps', '1',
          '-thread_queue_size', '512'
        ])
        .videoCodec(config.video.outputCodec)
        .outputOptions([
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-crf', '23',
          '-maxrate', '2M',
          '-bufsize', '4M',
          '-g', '30',
          '-keyint_min', '30',
          '-sc_threshold', '0',
          '-f', 'mp4',
          '-movflags', '+faststart'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`FFmpeg recording started for ${deviceId}: ${commandLine}`);
          this.deviceManager.setRecordingStatus(deviceId, true);
        })
        .on('progress', (progress) => {
          // Log progress every minute to avoid spam
          if (progress.timemark && progress.timemark.includes(':00.')) {
            console.log(`Recording progress for ${deviceId}: ${progress.timemark}`);
          }
        })
        .on('error', (err, stdout, stderr) => {
          console.error(`FFmpeg error for device ${deviceId}:`, err.message);
          console.error('FFmpeg stderr:', stderr);
          this.handleRecordingError(deviceId, err);
        })
        .on('end', () => {
          console.log(`Recording ended for device: ${deviceId}`);
          this.deviceManager.setRecordingStatus(deviceId, false);
          this.activeRecordings.delete(deviceId);
          this.recordingStreams.delete(deviceId);
        });

      // Store the command for later reference
      this.activeRecordings.set(deviceId, command);

      // Create input stream for FFmpeg
      const inputStream = new Writable({
        write(chunk, encoding, callback) {
          // FFmpeg will read from this stream
          callback();
        }
      });

      // Connect input stream to FFmpeg
      command.input(inputStream);
      
      // Start the FFmpeg process
      command.run();

      // Store the stream reference
      this.recordingStreams.set(deviceId, inputStream);

      return inputStream;
    } catch (error) {
      console.error(`Error starting recording for device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Stop recording for a specific device
   * @param deviceId - Device ID to stop recording for
   */
  public async stopRecording(deviceId: string): Promise<void> {
    try {
      const command = this.activeRecordings.get(deviceId);
      const stream = this.recordingStreams.get(deviceId);

      if (command) {
        console.log(`Stopping recording for device: ${deviceId}`);
        
        // End the input stream first
        if (stream) {
          stream.end();
        }

        // Kill the FFmpeg process
        command.kill('SIGTERM');

        // Clean up references
        this.activeRecordings.delete(deviceId);
        this.recordingStreams.delete(deviceId);
        this.deviceManager.setRecordingStatus(deviceId, false);
      }
    } catch (error) {
      console.error(`Error stopping recording for device ${deviceId}:`, error);
    }
  }

  /**
   * Write video frame data to the recording stream
   * @param deviceId - Device ID
   * @param frameData - JPEG frame data
   */
  public writeFrame(deviceId: string, frameData: Buffer): void {
    try {
      const stream = this.recordingStreams.get(deviceId);
      if (stream && !stream.destroyed) {
        stream.write(frameData);
      }
    } catch (error) {
      console.error(`Error writing frame for device ${deviceId}:`, error);
    }
  }

  /**
   * Get recording status for a device
   * @param deviceId - Device ID
   * @returns boolean indicating if device is currently recording
   */
  public isRecording(deviceId: string): boolean {
    return this.activeRecordings.has(deviceId);
  }

  /**
   * Stop all active recordings
   */
  public async stopAllRecordings(): Promise<void> {
    console.log('Stopping all active recordings...');
    const stopPromises = Array.from(this.activeRecordings.keys()).map(deviceId =>
      this.stopRecording(deviceId)
    );
    await Promise.all(stopPromises);
  }

  /**
   * Create output directory path for recordings
   * @param deviceId - Device ID
   * @returns Promise<string> - Full path to output file
   */
  private async createOutputPath(deviceId: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');

    const dateString = `${year}-${month}-${day}`;
    const deviceDir = path.join(config.video.recordingsPath, deviceId);
    const dateDir = path.join(deviceDir, dateString);

    // Create directories if they don't exist
    await fs.mkdir(dateDir, { recursive: true });

    // Generate filename with timestamp
    const filename = `${hour}.mp4`;
    return path.join(dateDir, filename);
  }

  /**
   * Handle FFmpeg recording errors
   * @param deviceId - Device ID
   * @param error - Error object
   */
  private handleRecordingError(deviceId: string, error: Error): void {
    console.error(`Recording error for device ${deviceId}:`, error.message);
    
    // Clean up on error
    this.activeRecordings.delete(deviceId);
    this.recordingStreams.delete(deviceId);
    this.deviceManager.setRecordingStatus(deviceId, false);

    // Optionally attempt to restart recording after a delay
    setTimeout(() => {
      console.log(`Attempting to restart recording for device ${deviceId}`);
      this.startRecording(deviceId).catch(err => {
        console.error(`Failed to restart recording for device ${deviceId}:`, err);
      });
    }, 5000); // Wait 5 seconds before retry
  }

  /**
   * Get recording statistics
   * @returns Object with recording statistics
   */
  public getRecordingStats(): {
    activeRecordings: number;
    devices: string[];
    totalRecordingTime: number;
  } {
    return {
      activeRecordings: this.activeRecordings.size,
      devices: Array.from(this.activeRecordings.keys()),
      totalRecordingTime: 0 // Could be enhanced to track actual recording time
    };
  }

  /**
   * List recordings for a specific device
   * @param deviceId - Device ID
   * @param dateFilter - Optional date filter (YYYY-MM-DD)
   * @returns Promise<string[]> - Array of recording file paths
   */
  public async listRecordings(deviceId: string, dateFilter?: string): Promise<string[]> {
    try {
      const deviceDir = path.join(config.video.recordingsPath, deviceId);
      
      // Check if device directory exists
      try {
        await fs.access(deviceDir);
      } catch {
        return []; // No recordings for this device
      }

      const recordings: string[] = [];

      if (dateFilter) {
        // List recordings for specific date
        const dateDir = path.join(deviceDir, dateFilter);
        try {
          const files = await fs.readdir(dateDir);
          files.forEach(file => {
            if (file.endsWith('.mp4')) {
              recordings.push(path.join(dateDir, file));
            }
          });
        } catch {
          // Date directory doesn't exist
        }
      } else {
        // List all recordings
        const dateDirs = await fs.readdir(deviceDir);
        for (const dateDir of dateDirs) {
          const fullDatePath = path.join(deviceDir, dateDir);
          const stat = await fs.stat(fullDatePath);
          if (stat.isDirectory()) {
            const files = await fs.readdir(fullDatePath);
            files.forEach(file => {
              if (file.endsWith('.mp4')) {
                recordings.push(path.join(fullDatePath, file));
              }
            });
          }
        }
      }

      return recordings.sort();
    } catch (error) {
      console.error(`Error listing recordings for device ${deviceId}:`, error);
      return [];
    }
  }
}
