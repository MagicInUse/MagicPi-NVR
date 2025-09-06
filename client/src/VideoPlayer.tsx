/**
 * Video Player Component
 * Versatile player for both live streams and recorded videos
 */

import React, { useState, useRef, useEffect } from 'react';
import './VideoPlayer.css';

interface Device {
  deviceId: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  lastSeen: string;
  isStreaming: boolean;
  operationMode: string;
}

interface VideoPlayerProps {
  device: Device;
  recordingUrl?: string;
  onClose: () => void;
  mode: 'live' | 'recorded';
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  device,
  recordingUrl,
  onClose,
  mode
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [lastFrameTime, setLastFrameTime] = useState<number>(0);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const frameUrlRef = useRef<string | null>(null);

  // Handle live stream frames
  useEffect(() => {
    if (mode !== 'live') return;

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
        setConnectionStatus('connected');
        setError(null);
      }
    };

    window.addEventListener('videoFrame', handleVideoFrame as EventListener);
    
    // Set up connection timeout
    const connectionTimeout = setTimeout(() => {
      if (connectionStatus === 'connecting') {
        setConnectionStatus('disconnected');
        setError('No video feed received. Camera may be offline.');
      }
    }, 10000); // 10 second timeout

    return () => {
      window.removeEventListener('videoFrame', handleVideoFrame as EventListener);
      clearTimeout(connectionTimeout);
      if (frameUrlRef.current) {
        URL.revokeObjectURL(frameUrlRef.current);
      }
    };
  }, [mode, lastFrameTime, connectionStatus]);

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!playerRef.current) return;

    if (!isFullscreen) {
      if (playerRef.current.requestFullscreen) {
        playerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isFullscreen) {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          }
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, onClose]);

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected': return '🟢';
      case 'connecting': return '🟡';
      case 'disconnected': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <div className={`video-player-overlay ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="video-player" ref={playerRef}>
        <div className="player-header">
          <div className="player-title">
            <h3>
              {mode === 'live' ? '📹 Live Feed' : '📁 Recording'}: {device.name || device.deviceId}
            </h3>
            {mode === 'live' && (
              <div className="connection-status">
                <span className={`status-indicator ${connectionStatus}`}>
                  {getStatusIcon()} {connectionStatus}
                </span>
              </div>
            )}
          </div>
          
          <div className="player-controls">
            <button 
              className="control-button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? '🗗' : '🗖'}
            </button>
            
            <button 
              className="control-button close"
              onClick={onClose}
              title="Close Player"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="player-content">
          {mode === 'recorded' && (recordingUrl || device.config.recordingUrl) ? (
            // Recorded video player
            <video
              ref={videoRef}
              src={recordingUrl || device.config.recordingUrl as string}
              controls
              autoPlay
              className="recorded-video"
              onError={() => setError('Failed to load video file')}
              onLoadStart={() => setConnectionStatus('connecting')}
              onCanPlay={() => setConnectionStatus('connected')}
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            // Live stream player
            <div className="live-stream-container">
              {currentFrame ? (
                <img
                  ref={imgRef}
                  src={currentFrame}
                  alt="Live camera feed"
                  className="live-stream"
                  onError={() => setError('Failed to display video frame')}
                />
              ) : (
                <div className="stream-placeholder">
                  {connectionStatus === 'connecting' && (
                    <>
                      <div className="loading-spinner"></div>
                      <p>Connecting to camera...</p>
                    </>
                  )}
                  
                  {connectionStatus === 'disconnected' && (
                    <>
                      <div className="error-icon">📵</div>
                      <p>No video signal</p>
                      <small>Camera may be offline or sleeping</small>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="error-overlay">
              <div className="error-message">
                ⚠️ {error}
              </div>
            </div>
          )}
        </div>

        <div className="player-footer">
          <div className="player-info">
            {mode === 'live' ? (
              <>
                <span>Device: {device.deviceId}</span>
                <span>Mode: {device.operationMode}</span>
                <span>Status: {device.status}</span>
              </>
            ) : (
              <>
                <span>File: {(recordingUrl || device.config.recordingUrl as string)?.split('/').pop()}</span>
                <span>Device: {device.deviceId}</span>
              </>
            )}
          </div>
          
          {mode === 'live' && (
            <div className="live-indicator">
              <span className="live-dot"></span>
              LIVE
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
