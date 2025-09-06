/**
 * Main Dashboard Component
 * Surveillance camera system dashboard with real-time updates
 */

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import DeviceCard from './DeviceCard';
import RecordingsBrowser from './RecordingsBrowser';
import VideoPlayer from './VideoPlayer';
import './Dashboard.css';

interface Device {
  deviceId: string;
  name: string;
  status: 'registered' | 'online' | 'streaming' | 'asleep' | 'offline';
  config: Record<string, unknown>;
  lastSeen: string;
  isStreaming: boolean;
  batteryLevel?: number;
  operationMode: 'motion-triggered' | 'always-on' | 'continuous';
}

interface SystemStats {
  devices: {
    total: number;
    online: number;
    streaming: number;
    offline: number;
  };
  recordings: {
    total: number;
    totalSize: number;
    totalSizeFormatted: string;
  };
  system: {
    uptime: number;
    memory: any;
    version: string;
  };
}

const Dashboard: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'recordings'>('dashboard');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
  const [videoPlayerMode, setVideoPlayerMode] = useState<'live' | 'recorded'>('live');
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [streamSubscriptions, setStreamSubscriptions] = useState<Set<string>>(new Set());
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // WebSocket connection for real-time updates
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const connectWebSocket = () => {
    try {
      // Use HTTP WebSocket server on port 3000 for all WebSocket connections
      // This avoids SSL certificate issues and uses the dedicated WebSocket port
      const wsUrl = `ws://${window.location.hostname}:3000/ws`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected to surveillance server');
        setWsConnection(ws);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          // Handle both JSON messages and binary data
          if (typeof event.data === 'string') {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
          } else {
            // Binary data (video frames)
            handleVideoFrame(event.data);
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
        setWsConnection(null);
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect WebSocket...');
          connectWebSocket();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error: Unable to connect to surveillance server');
      };

    } catch (err) {
      console.error('Error creating WebSocket connection:', err);
      setError('Failed to establish WebSocket connection');
    }
  };

  const handleWebSocketMessage = (message: { type: string; [key: string]: unknown }) => {
    switch (message.type) {
      case 'welcome':
        console.log('WebSocket welcome message received:', message);
        break;
      case 'device_list':
        console.log('Device list update received:', message);
        // Refresh the device list when server sends updated device info
        fetchDevices();
        break;
      case 'device_update':
        console.log('Device update received:', message);
        if (typeof message.deviceId === 'string' && typeof message.status === 'string') {
          updateDeviceStatus(message.deviceId, message.status);
        }
        break;
      case 'device_status_update':
        if (typeof message.deviceId === 'string' && typeof message.status === 'string') {
          updateDeviceStatus(message.deviceId, message.status);
        }
        break;
      case 'new_device_registered':
        fetchDevices(); // Refresh device list
        break;
      case 'device_disconnected':
        if (typeof message.deviceId === 'string') {
          updateDeviceStatus(message.deviceId, 'offline');
        }
        break;
      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  };

  const handleVideoFrame = (frameData: ArrayBuffer) => {
    // Convert binary frame data to blob URL for display
    const blob = new Blob([frameData], { type: 'image/jpeg' });
    const frameUrl = URL.createObjectURL(blob);
    
    // Notify video player component about new frame
    window.dispatchEvent(new CustomEvent('videoFrame', { 
      detail: { frameUrl, timestamp: Date.now() }
    }));
  };

  const updateDeviceStatus = (deviceId: string, newStatus: string) => {
    setDevices(prevDevices => 
      prevDevices.map(device => 
        device.deviceId === deviceId 
          ? { ...device, status: newStatus as Device['status'] }
          : device
      )
    );
  };

  // Fetch initial data
  useEffect(() => {
    fetchDevices();
    fetchSystemStats();
    
    // Set up periodic refresh
    const interval = setInterval(() => {
      fetchDevices();
      fetchSystemStats();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await axios.get('/api/dashboard/devices', {
        headers: {
          'X-API-Key': 'frontend-access' // This should be a proper API key in production
        }
      });
      
      if (response.data.success) {
        setDevices(response.data.devices);
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError('Failed to fetch device list');
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemStats = async () => {
    try {
      const response = await axios.get('/api/dashboard/stats', {
        headers: {
          'X-API-Key': 'frontend-access'
        }
      });
      
      if (response.data.success) {
        setSystemStats(response.data.stats);
      }
    } catch (err) {
      console.error('Error fetching system stats:', err);
    }
  };

  const startDeviceStream = async (deviceId: string) => {
    try {
      // URL encode the device ID to handle colons and other special characters
      const encodedDeviceId = encodeURIComponent(deviceId);
      const response = await axios.post(`/api/dashboard/devices/${encodedDeviceId}/stream/start`, {}, {
        headers: {
          'X-API-Key': 'frontend-access'
        }
      });
      
      if (response.data.success) {
        // Subscribe to video stream via WebSocket
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.send(JSON.stringify({
            action: 'subscribe',
            deviceId: deviceId
          }));
          
          setStreamSubscriptions(prev => new Set([...prev, deviceId]));
        }
        
        // Update device status
        updateDeviceStatus(deviceId, 'streaming');
      }
    } catch (err) {
      console.error('Error starting device stream:', err);
      setError('Failed to start camera stream');
    }
  };

  const stopDeviceStream = async (deviceId: string) => {
    try {
      // URL encode the device ID to handle colons and other special characters
      const encodedDeviceId = encodeURIComponent(deviceId);
      const response = await axios.post(`/api/dashboard/devices/${encodedDeviceId}/stream/stop`, {}, {
        headers: {
          'X-API-Key': 'frontend-access'
        }
      });
      
      if (response.data.success) {
        // Unsubscribe from video stream
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.send(JSON.stringify({
            action: 'unsubscribe',
            deviceId: deviceId
          }));
          
          setStreamSubscriptions(prev => {
            const newSet = new Set(prev);
            newSet.delete(deviceId);
            return newSet;
          });
        }
        
        // Update device status
        updateDeviceStatus(deviceId, 'online');
      }
    } catch (err) {
      console.error('Error stopping device stream:', err);
      setError('Failed to stop camera stream');
    }
  };

  const openVideoPlayer = (device: Device, mode: 'live' | 'recorded' = 'live') => {
    setSelectedDevice(device);
    setVideoPlayerMode(mode);
    setIsVideoPlayerOpen(true);
  };

  const closeVideoPlayer = () => {
    setSelectedDevice(null);
    setIsVideoPlayerOpen(false);
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading surveillance dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🎥 MagicPi-NVR Surveillance Dashboard</h1>
        <nav className="dashboard-nav">
          <button 
            className={activeView === 'dashboard' ? 'nav-button active' : 'nav-button'}
            onClick={() => setActiveView('dashboard')}
          >
            Live Dashboard
          </button>
          <button 
            className={activeView === 'recordings' ? 'nav-button active' : 'nav-button'}
            onClick={() => setActiveView('recordings')}
          >
            Recordings
          </button>
        </nav>
        <div className="connection-status">
          <span className={`status-indicator ${wsConnection ? 'connected' : 'disconnected'}`}>
            {wsConnection ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {systemStats && (
        <div className="stats-summary">
          <div className="stat-card">
            <h3>Devices</h3>
            <div className="stat-grid">
              <span>Total: {systemStats.devices.total}</span>
              <span className="online">Online: {systemStats.devices.online}</span>
              <span className="streaming">Streaming: {systemStats.devices.streaming}</span>
              <span className="offline">Offline: {systemStats.devices.offline}</span>
            </div>
          </div>
          <div className="stat-card">
            <h3>Recordings</h3>
            <div className="stat-grid">
              <span>Total: {systemStats.recordings.total}</span>
              <span>Size: {systemStats.recordings.totalSizeFormatted}</span>
            </div>
          </div>
          <div className="stat-card">
            <h3>System</h3>
            <div className="stat-grid">
              <span>Uptime: {formatUptime(systemStats.system.uptime)}</span>
              <span>Version: {systemStats.system.version}</span>
            </div>
          </div>
        </div>
      )}

      <main className="dashboard-content">
        {activeView === 'dashboard' && (
          <div className="devices-grid">
            {devices.length === 0 ? (
              <div className="empty-state">
                <h3>No cameras detected</h3>
                <p>Waiting for ESP32-CAM devices to register...</p>
              </div>
            ) : (
              devices.map(device => (
                <DeviceCard
                  key={device.deviceId}
                  device={device}
                  onStartStream={startDeviceStream}
                  onStopStream={stopDeviceStream}
                  onOpenVideo={openVideoPlayer}
                  isSubscribed={streamSubscriptions.has(device.deviceId)}
                />
              ))
            )}
          </div>
        )}

        {activeView === 'recordings' && (
          <RecordingsBrowser onPlayRecording={openVideoPlayer} />
        )}
      </main>

      {isVideoPlayerOpen && selectedDevice && (
        <VideoPlayer
          device={selectedDevice}
          onClose={closeVideoPlayer}
          mode={videoPlayerMode}
        />
      )}
    </div>
  );
};

export default Dashboard;
