/**
 * Device Card Component
 * Displays individual camera device with controls
 */

import React, { useState, useRef, useEffect } from 'react';
import './DeviceCard.css';

interface Device {
  deviceId: string;
  name: string;
  status: 'registered' | 'online' | 'streaming' | 'asleep' | 'offline';
  config: any;
  lastSeen: string;
  isStreaming: boolean;
  batteryLevel?: number;
  operationMode: 'motion-triggered' | 'always-on' | 'continuous';
}

interface DeviceCardProps {
  device: Device;
  onStartStream: (deviceId: string) => void;
  onStopStream: (deviceId: string) => void;
  onOpenVideo: (device: Device, mode: 'live' | 'recorded') => void;
  isSubscribed: boolean;
}

const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onStartStream,
  onStopStream,
  onOpenVideo,
  isSubscribed
}) => {
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [lastFrameTime, setLastFrameTime] = useState<number>(0);
  const frameUrlRef = useRef<string | null>(null);

  // Listen for video frames when subscribed
  useEffect(() => {
    if (!isSubscribed) {
      setCurrentFrame(null);
      if (frameUrlRef.current) {
        URL.revokeObjectURL(frameUrlRef.current);
        frameUrlRef.current = null;
      }
      return;
    }

    const handleVideoFrame = (event: CustomEvent) => {
      const { frameUrl, timestamp } = event.detail;
      
      // Only update if this is a new frame
      if (timestamp > lastFrameTime) {
        // Clean up previous frame URL
        if (frameUrlRef.current) {
          URL.revokeObjectURL(frameUrlRef.current);
        }
        
        frameUrlRef.current = frameUrl;
        setCurrentFrame(frameUrl);
        setLastFrameTime(timestamp);
      }
    };

    window.addEventListener('videoFrame', handleVideoFrame as EventListener);
    
    return () => {
      window.removeEventListener('videoFrame', handleVideoFrame as EventListener);
      if (frameUrlRef.current) {
        URL.revokeObjectURL(frameUrlRef.current);
      }
    };
  }, [isSubscribed, lastFrameTime]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'online': return '#4CAF50';
      case 'streaming': return '#2196F3';
      case 'asleep': return '#FF9800';
      case 'offline': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'online': return '🟢';
      case 'streaming': return '📹';
      case 'asleep': return '😴';
      case 'offline': return '🔴';
      default: return '⚪';
    }
  };

  const getOperationModeIcon = (mode: string): string => {
    switch (mode) {
      case 'motion-triggered': return '🚶';
      case 'always-on': return '🔄';
      case 'continuous': return '⏺️';
      default: return '❓';
    }
  };

  const formatLastSeen = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const handleStreamToggle = () => {
    if (device.status === 'streaming') {
      onStopStream(device.deviceId);
    } else {
      onStartStream(device.deviceId);
    }
  };

  const canStartStream = device.status === 'online' || device.status === 'asleep';
  const isCurrentlyStreaming = device.status === 'streaming';

  return (
    <div className={`device-card ${device.status}`}>
      <div className="device-header">
        <div className="device-info">
          <h3 className="device-name">
            {device.name || device.deviceId}
          </h3>
          <div className="device-id">
            {device.deviceId}
          </div>
        </div>
        <div className="device-status">
          <span 
            className="status-badge"
            style={{ backgroundColor: getStatusColor(device.status) }}
          >
            {getStatusIcon(device.status)} {device.status}
          </span>
        </div>
      </div>

      <div className="video-preview">
        {isSubscribed && currentFrame ? (
          <img 
            src={currentFrame} 
            alt="Live feed"
            className="live-preview"
            onClick={() => onOpenVideo(device, 'live')}
            style={{ cursor: 'pointer' }}
          />
        ) : (
          <div className="preview-placeholder">
            <div className="camera-icon">📷</div>
            <p>{isCurrentlyStreaming ? 'Loading stream...' : 'Camera offline'}</p>
          </div>
        )}
      </div>

      <div className="device-details">
        <div className="detail-row">
          <span className="detail-label">Mode:</span>
          <span className="detail-value">
            {getOperationModeIcon(device.operationMode)} {device.operationMode}
          </span>
        </div>
        
        <div className="detail-row">
          <span className="detail-label">Last seen:</span>
          <span className="detail-value">
            {formatLastSeen(device.lastSeen)}
          </span>
        </div>

        {device.batteryLevel !== undefined && (
          <div className="detail-row">
            <span className="detail-label">Battery:</span>
            <span className="detail-value">
              <div className="battery-indicator">
                <div 
                  className="battery-level"
                  style={{ width: `${device.batteryLevel}%` }}
                ></div>
              </div>
              {device.batteryLevel}%
            </span>
          </div>
        )}

        <div className="detail-row">
          <span className="detail-label">Resolution:</span>
          <span className="detail-value">{device.config?.resolution || 'SVGA'}</span>
        </div>
      </div>

      <div className="device-actions">
        {canStartStream && (
          <button 
            className="action-button start-stream"
            onClick={handleStreamToggle}
            disabled={device.status === 'offline'}
          >
            📹 Start Live Feed
          </button>
        )}
        
        {isCurrentlyStreaming && (
          <>
            <button 
              className="action-button stop-stream"
              onClick={handleStreamToggle}
            >
              ⏹️ Stop Feed
            </button>
            <button 
              className="action-button fullscreen"
              onClick={() => onOpenVideo(device, 'live')}
            >
              🔍 Fullscreen
            </button>
          </>
        )}

        <button 
          className="action-button recordings"
          onClick={() => onOpenVideo(device, 'recorded')}
        >
          📁 View Recordings
        </button>
      </div>
    </div>
  );
};

export default DeviceCard;
