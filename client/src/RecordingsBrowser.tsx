/**
 * Recordings Browser Component
 *const RecordingsBrowser: React.FC<RecordingsBrowserProps> = ({ onPlayRecording }) => {
  const [recordings, setRecordings] = useState<RecordingsData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());ys and manages recorded video files
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './RecordingsBrowser.css';

interface Recording {
  hour: string;
  filename: string;
  size: number;
  created: string;
  modified: string;
  url: string;
}

interface RecordingsData {
  [deviceId: string]: {
    [date: string]: Recording[];
  };
}

interface Device {
  deviceId: string;
  name: string;
  status: 'registered' | 'online' | 'streaming' | 'asleep' | 'offline';
  config: Record<string, unknown>;
  lastSeen: string;
  isStreaming: boolean;
  operationMode: 'motion-triggered' | 'always-on' | 'continuous';
}

interface RecordingsBrowserProps {
  onPlayRecording: (device: Device, mode: 'live' | 'recorded') => void;
}

const RecordingsBrowser: React.FC<RecordingsBrowserProps> = ({ onPlayRecording }) => {
  const [recordings, setRecordings] = useState<RecordingsData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchRecordings();
  }, []);

  const fetchRecordings = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/dashboard/recordings', {
        headers: {
          'X-API-Key': 'frontend-access'
        }
      });

      if (response.data.success) {
        setRecordings(response.data.recordings);
      }
    } catch (err) {
      console.error('Error fetching recordings:', err);
      setError('Failed to fetch recordings');
    } finally {
      setLoading(false);
    }
  };

  const deleteRecording = async (deviceId: string, date: string, filename: string) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) {
      return;
    }

    try {
      const response = await axios.delete(`/api/dashboard/recordings/${deviceId}/${date}/${filename}`, {
        headers: {
          'X-API-Key': 'frontend-access'
        }
      });

      if (response.data.success) {
        // Remove the recording from state
        setRecordings(prev => {
          const updated = { ...prev };
          if (updated[deviceId] && updated[deviceId][date]) {
            updated[deviceId][date] = updated[deviceId][date].filter(
              recording => recording.filename !== filename
            );
            
            // Remove empty date if no recordings left
            if (updated[deviceId][date].length === 0) {
              delete updated[deviceId][date];
            }
            
            // Remove empty device if no dates left
            if (Object.keys(updated[deviceId]).length === 0) {
              delete updated[deviceId];
            }
          }
          return updated;
        });
      }
    } catch (err) {
      console.error('Error deleting recording:', err);
      setError('Failed to delete recording');
    }
  };

  const toggleDeviceExpansion = (deviceId: string) => {
    setExpandedDevices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deviceId)) {
        newSet.delete(deviceId);
      } else {
        newSet.add(deviceId);
      }
      return newSet;
    });
  };

  const toggleDateExpansion = (dateKey: string) => {
    setExpandedDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey);
      } else {
        newSet.add(dateKey);
      }
      return newSet;
    });
  };

  const playRecording = (deviceId: string, recording: Recording) => {
    const device: Device = {
      deviceId,
      name: `${deviceId} - ${recording.filename}`,
      status: 'offline',
      config: { recordingUrl: recording.url },
      lastSeen: '',
      isStreaming: false,
      operationMode: 'continuous'
    };
    
    onPlayRecording(device, 'recorded');
  };

  const downloadRecording = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (hour: string): string => {
    const hourNum = parseInt(hour);
    return `${hourNum.toString().padStart(2, '0')}:00 - ${(hourNum + 1).toString().padStart(2, '0')}:00`;
  };

  if (loading) {
    return (
      <div className="recordings-loading">
        <div className="loading-spinner"></div>
        <p>Loading recordings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="recordings-error">
        <p>❌ {error}</p>
        <button onClick={fetchRecordings}>Retry</button>
      </div>
    );
  }

  const deviceIds = Object.keys(recordings);

  if (deviceIds.length === 0) {
    return (
      <div className="recordings-empty">
        <h3>No recordings found</h3>
        <p>Recordings will appear here once cameras start recording.</p>
        <button onClick={fetchRecordings}>Refresh</button>
      </div>
    );
  }

  return (
    <div className="recordings-browser">
      <div className="recordings-header">
        <h2>📁 Recorded Videos</h2>
        <button className="refresh-button" onClick={fetchRecordings}>
          🔄 Refresh
        </button>
      </div>

      <div className="recordings-tree">
        {deviceIds.map(deviceId => {
          const deviceRecordings = recordings[deviceId];
          const dateKeys = Object.keys(deviceRecordings).sort().reverse(); // Most recent first
          const isDeviceExpanded = expandedDevices.has(deviceId);
          
          // Calculate total recordings and size for this device
          const totalRecordings = dateKeys.reduce((sum, date) => sum + deviceRecordings[date].length, 0);
          const totalSize = dateKeys.reduce((sum, date) => 
            sum + deviceRecordings[date].reduce((dateSum, recording) => dateSum + recording.size, 0), 0
          );

          return (
            <div key={deviceId} className="device-section">
              <div 
                className="device-header"
                onClick={() => toggleDeviceExpansion(deviceId)}
              >
                <span className="expand-icon">
                  {isDeviceExpanded ? '📂' : '📁'}
                </span>
                <span className="device-name">
                  📹 {deviceId}
                </span>
                <span className="device-summary">
                  {totalRecordings} recordings ({formatFileSize(totalSize)})
                </span>
              </div>

              {isDeviceExpanded && (
                <div className="device-content">
                  {dateKeys.map(date => {
                    const dateRecordings = deviceRecordings[date];
                    const dateKey = `${deviceId}-${date}`;
                    const isDateExpanded = expandedDates.has(dateKey);
                    
                    const dateSize = dateRecordings.reduce((sum, recording) => sum + recording.size, 0);

                    return (
                      <div key={date} className="date-section">
                        <div 
                          className="date-header"
                          onClick={() => toggleDateExpansion(dateKey)}
                        >
                          <span className="expand-icon">
                            {isDateExpanded ? '📂' : '📁'}
                          </span>
                          <span className="date-name">
                            📅 {formatDate(date)}
                          </span>
                          <span className="date-summary">
                            {dateRecordings.length} recordings ({formatFileSize(dateSize)})
                          </span>
                        </div>

                        {isDateExpanded && (
                          <div className="recordings-list">
                            {dateRecordings.map(recording => (
                              <div key={recording.filename} className="recording-item">
                                <div className="recording-info">
                                  <span className="recording-time">
                                    🕐 {formatTime(recording.hour)}
                                  </span>
                                  <span className="recording-size">
                                    {formatFileSize(recording.size)}
                                  </span>
                                  <span className="recording-date">
                                    {new Date(recording.created).toLocaleString()}
                                  </span>
                                </div>
                                
                                <div className="recording-actions">
                                  <button 
                                    className="action-button play"
                                    onClick={() => playRecording(deviceId, recording)}
                                  >
                                    ▶️ Play
                                  </button>
                                  <button 
                                    className="action-button download"
                                    onClick={() => downloadRecording(recording.url, recording.filename)}
                                  >
                                    💾 Download
                                  </button>
                                  <button 
                                    className="action-button delete"
                                    onClick={() => deleteRecording(deviceId, date, recording.filename)}
                                  >
                                    🗑️ Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RecordingsBrowser;
