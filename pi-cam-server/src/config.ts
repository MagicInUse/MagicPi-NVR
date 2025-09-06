/**
 * Configuration settings for the Pi Camera Server
 * Contains all environment-specific and application settings
 */

export interface ServerConfig {
  port: number;
  httpsPort: number;
  host: string;
  serviceName: string;
  serviceType: string;
  protocol: string;
  maxDevices: number;
  streamingTimeout: number;
  recordingRetentionDays: number;
  cleanupSchedule: string;
}

export interface SecurityConfig {
  keyPath: string;
  certPath: string;
  apiKeyLength: number;
}

export interface VideoConfig {
  inputFormat: string;
  outputCodec: string;
  defaultResolution: string;
  defaultFramerate: number;
  recordingsPath: string;
}

export interface RecordingsConfig {
  directory: string;
  maxSizeGB: number;
  retentionDays: number;
}

/**
 * Main configuration object
 */
export const config = {
  server: {
    port: 3000,
    httpsPort: 3443,
    host: '0.0.0.0',
    serviceName: 'Pi Camera Server',
    serviceType: '_mycam-server',
    protocol: '_tcp',
    maxDevices: 50,
    streamingTimeout: 30000, // 30 seconds
    recordingRetentionDays: 7,
    cleanupSchedule: '0 2 * * *' // Daily at 2:00 AM
  } as ServerConfig,

  security: {
    keyPath: './security/key.pem',
    certPath: './security/cert.pem',
    apiKeyLength: 32
  } as SecurityConfig,

  video: {
    inputFormat: 'mjpeg',
    outputCodec: 'libx264',
    defaultResolution: 'SVGA',
    defaultFramerate: 10,
    recordingsPath: './recordings'
  } as VideoConfig,

  recordings: {
    directory: './recordings',
    maxSizeGB: 100,
    retentionDays: 7
  } as RecordingsConfig,

  // Camera resolution mappings for ESP32-CAM
  cameraResolutions: {
    'QQVGA': { width: 160, height: 120 },
    'QCIF': { width: 176, height: 144 },
    'HQVGA': { width: 240, height: 176 },
    'QVGA': { width: 320, height: 240 },
    'CIF': { width: 400, height: 296 },
    'VGA': { width: 640, height: 480 },
    'SVGA': { width: 800, height: 600 },
    'XGA': { width: 1024, height: 768 },
    'SXGA': { width: 1280, height: 1024 },
    'UXGA': { width: 1600, height: 1200 }
  },

  // Default device configuration
  defaultDeviceConfig: {
    resolution: 'SVGA',
    framerate: 10,
    quality: 12,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    operationMode: 'motion-triggered', // 'motion-triggered' or 'always-on'
    alwaysOnDuration: 300000, // 5 minutes of continuous streaming for always-on mode
    alwaysOnInterval: 600000  // 10 minutes between streaming sessions for always-on mode
  },

  // Operation mode configurations
  operationModes: {
    'motion-triggered': {
      description: 'Wake on motion detection, stream, then sleep',
      powerEfficient: true,
      requiresMotionSensor: true,
      streamingDuration: 30000, // 30 seconds
      sleepBetweenTriggers: true
    },
    'always-on': {
      description: 'Continuous operation with periodic streaming',
      powerEfficient: false,
      requiresMotionSensor: false,
      streamingDuration: 300000, // 5 minutes
      sleepBetweenTriggers: true,
      sleepDuration: 300000 // 5 minutes sleep between sessions
    },
    'continuous': {
      description: 'Non-stop streaming (requires constant power)',
      powerEfficient: false,
      requiresMotionSensor: false,
      streamingDuration: 0, // Unlimited
      sleepBetweenTriggers: false
    }
  }
} as const;

export default config;
