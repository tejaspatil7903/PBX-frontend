import { Web } from 'sip.js';
import { apiService } from './api';

export type WebRTCAudioState = 'idle' | 'connecting' | 'listening' | 'barging' | 'error';

export interface WebRTCStateChange {
  state: WebRTCAudioState;
  agentExtension?: string;
  errorMessage?: string;
  isMuted: boolean;
}

type StateListener = (change: WebRTCStateChange) => void;

class QAWebRTCService {
  private simpleUser: Web.SimpleUser | null = null;
  private currentAgentExt: string | null = null;
  private currentState: WebRTCAudioState = 'idle';
  private isMuted: boolean = true;
  private listeners: Set<StateListener> = new Set();
  private audioElement: HTMLAudioElement | null = null;

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    // Send immediate initial state
    listener({
      state: this.currentState,
      agentExtension: this.currentAgentExt || undefined,
      isMuted: this.isMuted,
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(change: Partial<WebRTCStateChange>) {
    if (change.state !== undefined) this.currentState = change.state;
    if (change.isMuted !== undefined) this.isMuted = change.isMuted;
    if (change.agentExtension !== undefined) this.currentAgentExt = change.agentExtension;

    const fullChange: WebRTCStateChange = {
      state: this.currentState,
      agentExtension: this.currentAgentExt || undefined,
      isMuted: this.isMuted,
      errorMessage: change.errorMessage,
    };

    this.listeners.forEach((listener) => {
      try {
        listener(fullChange);
      } catch (err) {
        console.error('Error in WebRTC state listener:', err);
      }
    });
  }

  private ensureAudioElement(): HTMLAudioElement {
    if (this.audioElement && document.body.contains(this.audioElement)) {
      return this.audioElement;
    }

    let el = document.getElementById('qa-remote-audio') as HTMLAudioElement;
    if (!el) {
      el = document.createElement('audio');
      el.id = 'qa-remote-audio';
      el.autoplay = true;
      (el as any).playsInline = true;
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    this.audioElement = el;
    return el;
  }

  private async initializeSimpleUser(token: string): Promise<Web.SimpleUser> {
    if (this.simpleUser && this.simpleUser.isConnected()) {
      return this.simpleUser;
    }

    if (this.simpleUser) {
      try {
        await this.simpleUser.disconnect();
      } catch {}
      this.simpleUser = null;
    }

    // Check for Secure Context upfront to provide clear, actionable error
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Media devices not available in insecure context. Please enable the Chrome flag (chrome://flags/#unsafely-treat-insecure-origin-as-secure) or open via http://localhost:5173."
      );
    }

    const creds = await apiService.getQAWebRTCCredentials(token);
    const audioEl = this.ensureAudioElement();

    // Determine WebSocket server URL using the proxied /ws-sip or /wss endpoint on current host
    const isHttps = window.location.protocol === 'https:';
    const protocol = isHttps ? 'wss:' : 'ws:';
    const wsServer = isHttps 
      ? `wss://${window.location.host}/wss`
      : `${protocol}//${window.location.host}/ws-sip`;

    const simpleUserOptions: Web.SimpleUserOptions = {
      aor: `sip:${creds.extension}@${creds.sip_domain}`,
      media: {
        constraints: { audio: true, video: false },
        remote: {
          audio: audioEl,
        },
      },
      userAgentOptions: {
        authorizationUsername: creds.extension,
        authorizationPassword: creds.password,
        displayName: creds.display_name || 'Web Supervisor',
        logLevel: 'error',
      },
      delegate: {
        onCallHangup: () => {
          this.notify({ state: 'idle', isMuted: true, agentExtension: undefined });
        },
      },
    };

    const user = new Web.SimpleUser(wsServer, simpleUserOptions);
    await user.connect();
    try {
      await user.register();
    } catch (regErr) {
      console.warn('WebRTC registration warning (call can still proceed):', regErr);
    }

    this.simpleUser = user;
    return user;
  }

  /**
   * Listen to active agent call silently in browser (Microphone MUTED)
   */
  public async listen(token: string, agentExt: string): Promise<void> {
    try {
      this.currentAgentExt = agentExt;
      this.notify({ state: 'connecting', agentExtension: agentExt, isMuted: true });

      const user = await this.initializeSimpleUser(token);
      const creds = await apiService.getQAWebRTCCredentials(token);

      const target = `sip:*880${agentExt}@${creds.sip_domain}`;

      // Call target *880<agentExt> (Silent Listen / Eavesdrop)
      await user.call(target);

      // Keep supervisor microphone strictly muted for listening
      user.mute();
      this.isMuted = true;

      // Ensure remote audio element starts playing
      if (this.audioElement) {
        this.audioElement.play().catch((playErr) => {
          console.warn('Audio autoplay blocked, user interaction required:', playErr);
        });
      }

      this.notify({ state: 'listening', agentExtension: agentExt, isMuted: true });
    } catch (err: any) {
      console.error('Failed to start in-browser WebRTC listening:', err);
      this.notify({ state: 'error', errorMessage: err?.message || 'Failed to connect in-browser audio' });
      throw err;
    }
  }

  /**
   * Barge into active call in browser (Microphone LIVE)
   */
  public async barge(token: string, agentExt: string): Promise<void> {
    try {
      this.currentAgentExt = agentExt;

      // If already connected in Listen mode, unmute mic and send DTMF '3' to barge!
      if (this.simpleUser && this.currentState === 'listening') {
        this.simpleUser.unmute();
        this.simpleUser.sendDTMF('3');
        this.notify({ state: 'barging', isMuted: false, agentExtension: agentExt });
        return;
      }

      this.notify({ state: 'connecting', agentExtension: agentExt, isMuted: false });
      const user = await this.initializeSimpleUser(token);
      const creds = await apiService.getQAWebRTCCredentials(token);

      const target = `sip:*883${agentExt}@${creds.sip_domain}`;

      // Call target *883<agentExt> (Bidirectional Barge In)
      await user.call(target);
      user.unmute();
      this.isMuted = false;

      if (this.audioElement) {
        this.audioElement.play().catch(() => {});
      }

      this.notify({ state: 'barging', agentExtension: agentExt, isMuted: false });
    } catch (err: any) {
      console.error('Failed to start in-browser WebRTC barge:', err);
      this.notify({ state: 'error', errorMessage: err?.message || 'Failed to barge into call' });
      throw err;
    }
  }

  /**
   * Toggle between Listen (muted) and Barge (unmuted) mid-call without reconnecting
   */
  public toggleMute(): void {
    if (!this.simpleUser || (this.currentState !== 'listening' && this.currentState !== 'barging')) {
      return;
    }

    if (this.isMuted) {
      // Unmute and enter Barge mode
      this.simpleUser.unmute();
      this.simpleUser.sendDTMF('3');
      this.notify({ state: 'barging', isMuted: false });
    } else {
      // Mute and enter Listen mode
      this.simpleUser.mute();
      this.simpleUser.sendDTMF('0');
      this.notify({ state: 'listening', isMuted: true });
    }
  }

  /**
   * Hang up the in-browser WebRTC call
   */
  public async hangup(): Promise<void> {
    if (this.simpleUser) {
      try {
        await this.simpleUser.hangup();
      } catch {}
    }
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.srcObject = null;
      } catch {}
    }
    this.notify({ state: 'idle', isMuted: true, agentExtension: undefined });
  }

  public getState(): WebRTCAudioState {
    return this.currentState;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }
}

export const webrtcService = new QAWebRTCService();
