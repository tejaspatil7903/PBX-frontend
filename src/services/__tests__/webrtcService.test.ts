// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webrtcService } from '../webrtcService';
import { apiService } from '../api';

// Mock Web.SimpleUser from sip.js
vi.mock('sip.js', () => {
  class MockSimpleUser {
    private connected = false;
    private muted = false;

    async connect() {
      this.connected = true;
    }
    async disconnect() {
      this.connected = false;
    }
    isConnected() {
      return this.connected;
    }
    async register() {}
    async call() {}
    async hangup() {}
    mute() {
      this.muted = true;
    }
    unmute() {
      this.muted = false;
    }
    isMuted() {
      return this.muted;
    }
    sendDTMF() {}
  }

  return {
    Web: {
      SimpleUser: MockSimpleUser,
    },
  };
});

describe('QAWebRTCService Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock HTMLAudioElement
    globalThis.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    globalThis.HTMLMediaElement.prototype.pause = vi.fn();

    // Mock Secure Context and mediaDevices for jsdom
    Object.defineProperty(window, 'isSecureContext', { value: true, writable: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({}),
      },
      writable: true,
      configurable: true,
    });
  });

  it('provides initial idle state to subscribers', () => {
    const states: any[] = [];
    const unsubscribe = webrtcService.subscribe((state) => {
      states.push(state);
    });

    expect(states.length).toBeGreaterThan(0);
    expect(states[0].state).toBe('idle');
    expect(states[0].isMuted).toBe(true);

    unsubscribe();
  });

  it('starts silent listen mode with muted microphone and plays remote audio', async () => {
    vi.spyOn(apiService, 'getQAWebRTCCredentials').mockResolvedValue({
      status: 'success',
      ws_server: 'ws://35.244.8.204:5066',
      sip_domain: 'pbx.aikyamlabs.local',
      extension: '1004',
      password: 'testpassword',
      ice_servers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    const states: any[] = [];
    const unsubscribe = webrtcService.subscribe((state) => {
      states.push(state.state);
    });

    await webrtcService.listen('mock-token', '1001');

    expect(states).toContain('connecting');
    expect(states).toContain('listening');
    expect(webrtcService.getState()).toBe('listening');
    expect(webrtcService.getIsMuted()).toBe(true);

    unsubscribe();
  });

  it('switches to barge mode by unmuting and sending DTMF 3', async () => {
    vi.spyOn(apiService, 'getQAWebRTCCredentials').mockResolvedValue({
      status: 'success',
      ws_server: 'ws://35.244.8.204:5066',
      sip_domain: 'pbx.aikyamlabs.local',
      extension: '1004',
      password: 'testpassword',
      ice_servers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    await webrtcService.listen('mock-token', '1001');
    expect(webrtcService.getState()).toBe('listening');

    // Barge in
    await webrtcService.barge('mock-token', '1001');
    expect(webrtcService.getState()).toBe('barging');
    expect(webrtcService.getIsMuted()).toBe(false);

    // Toggle back to listen
    webrtcService.toggleMute();
    expect(webrtcService.getState()).toBe('listening');
    expect(webrtcService.getIsMuted()).toBe(true);
  });

  it('hangs up call cleanly and resets to idle', async () => {
    await webrtcService.hangup();
    expect(webrtcService.getState()).toBe('idle');
    expect(webrtcService.getIsMuted()).toBe(true);
  });
});

describe('apiService WebRTC Credentials Unit Tests', () => {
  it('calls /api/v1/qa/webrtc-credentials with Authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        extension: '1004',
        sip_domain: 'pbx.aikyamlabs.local',
      }),
    });
    globalThis.fetch = mockFetch;

    const res = await apiService.getQAWebRTCCredentials('token-123');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/qa/webrtc-credentials'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      })
    );
    expect(res.extension).toBe('1004');
  });

  it('throws descriptive error if api returns failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'No supervisor extension found' }),
    });

    await expect(apiService.getQAWebRTCCredentials('token-123')).rejects.toThrow(
      'No supervisor extension found'
    );
  });
});
