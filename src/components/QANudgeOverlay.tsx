import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, ShieldAlert, Headphones, Radio, X, ExternalLink, Volume2, Check, Mic, MicOff, PhoneOff } from 'lucide-react';
import { apiService } from '../services/api';
import { webrtcService, type WebRTCStateChange } from '../services/webrtcService';
import type { User } from '../types';

export interface QANudgeEvent {
  id: string; // call_uuid to update in-place per active call
  event_type: 'qa.warning' | 'qa.escalation';
  call_uuid: string;
  tenant_id: string;
  agent_extension: string;
  customer_extension: string;
  supervisor_extension?: string;
  warn_count: number;
  max_warn_retries: number;
  reason: string;
  coaching?: string;
  whisper_text?: string;
  transcript: string;
  timestamp: number | string;
}

interface QANudgeOverlayProps {
  token: string | null;
  user: User | null;
  onNavigateToQA?: () => void;
}

// ── Web Audio Synthesized Chime ──────────────────────────────────────────────
const playNudgeChime = (isEscalation: boolean) => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (isEscalation) {
      // Urgent, attention-demanding escalation double-tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else {
      // Soft, professional two-tone compliance chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    // AudioContext might be silenced if user hasn't clicked on the document yet
  }
};

export const QANudgeOverlay: React.FC<QANudgeOverlayProps> = ({
  token,
  user,
  onNavigateToQA
}) => {
  const [nudges, setNudges] = useState<QANudgeEvent[]>([]);
  const [actionStatus, setActionStatus] = useState<{ [key: string]: 'loading' | 'success' | 'error' }>({});
  const [webrtcState, setWebrtcState] = useState<WebRTCStateChange>({
    state: 'idle',
    isMuted: true,
  });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return webrtcService.subscribe((state) => {
      setWebrtcState(state);
    });
  }, []);

  useEffect(() => {
    if (!token || !user) return;

    // Strict Role Guard: Only Supervisors & Admins receive compliance nudges
    const userRole = (user.role || '').toUpperCase();
    if (!['TENANT_ADMIN', 'SUPERVISOR', 'SUPER_ADMIN', 'SUB_ADMIN'].includes(userRole)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/events?token=${encodeURIComponent(token)}`;

    let reconnectTimer: any = null;
    let pingInterval: any = null;

    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, 20000);
        };

        ws.onmessage = (event) => {
          try {
            if (event.data === 'pong') return;
            const payload = JSON.parse(event.data);
            if (payload.event_type !== 'qa.warning' && payload.event_type !== 'qa.escalation') {
              return;
            }

            // ── Strict Tenant Isolation Guard ──────────────────────────────
            // If user is a Tenant Admin or Supervisor, they MUST ONLY see
            // events belonging to their exact tenant_id!
            if (userRole !== 'SUPER_ADMIN') {
              const userTid = String(user.tenant_id || '');
              const eventTid = String(payload.tenant_id || '');
              if (!userTid || !eventTid || userTid !== eventTid) {
                return; // Strictly ignore events from other tenants
              }
            }

            // ── Final Warning & Escalation Filter ─────────────────────────
            // Early warnings (e.g. 1/3, 2/3) only whisper to the agent softphone.
            // The tenant admin is only nudged on the FINAL warning or escalation!
            const isEscalation = payload.event_type === 'qa.escalation';
            const warnCount = Number(payload.warn_count || 1);
            const maxRetries = Number(payload.max_warn_retries || 3);
            const isFinalWarning = warnCount >= maxRetries;

            if (!isFinalWarning && !isEscalation) {
              return; // Do NOT pop up the nudge for early warnings
            }

            const callUuid = payload.call_uuid || String(Date.now());
            const nudge: QANudgeEvent = {
              id: callUuid, // Keyed by call_uuid so warnings update in-place without stacking duplicate cards!
              event_type: payload.event_type,
              call_uuid: callUuid,
              tenant_id: payload.tenant_id,
              agent_extension: payload.agent_extension || 'Unknown',
              customer_extension: payload.customer_extension || 'Customer',
              supervisor_extension: payload.supervisor_extension,
              warn_count: warnCount,
              max_warn_retries: maxRetries,
              reason: payload.reason || (isEscalation ? 'Max warnings exceeded' : 'Final compliance warning'),
              coaching: payload.coaching,
              whisper_text: payload.whisper_text,
              transcript: payload.transcript || '',
              timestamp: payload.timestamp || Date.now()
            };

            // Play auditory chime
            playNudgeChime(isEscalation);

            // Update in-place if card for this call already exists, otherwise add to top (max 2 calls)
            setNudges((prev) => {
              const remaining = prev.filter((n) => n.id !== nudge.id);
              return [nudge, ...remaining].slice(0, 2);
            });
          } catch (err) {
            console.debug('Failed to parse incoming WebSocket QA event:', err);
          }
        };

        ws.onclose = () => {
          if (pingInterval) clearInterval(pingInterval);
          reconnectTimer = setTimeout(connectWebSocket, 4000);
        };

        ws.onerror = () => {
          try { ws.close(); } catch {}
        };
      } catch {
        reconnectTimer = setTimeout(connectWebSocket, 5000);
      }
    };

    connectWebSocket();

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
    };
  }, [token, user]);

  const handleDismiss = (id: string) => {
    setNudges((prev) => prev.filter((n) => n.id !== id));
  };

  const handleIntervene = async (nudge: QANudgeEvent, mode: 'listen' | 'whisper' | 'barge') => {
    if (!token) return;
    const actionKey = `${nudge.id}-${mode}`;
    setActionStatus((prev) => ({ ...prev, [actionKey]: 'loading' }));

    try {
      // Connect In-Browser WebRTC audio directly to FreeSWITCH!
      if (mode === 'listen') {
        await webrtcService.listen(token, nudge.agent_extension);
      } else if (mode === 'barge') {
        await webrtcService.barge(token, nudge.agent_extension);
      } else {
        await apiService.interveneQACall(token, nudge.call_uuid, mode);
      }
      setActionStatus((prev) => ({ ...prev, [actionKey]: 'success' }));
    } catch (webrtcErr) {
      console.warn('In-browser WebRTC audio connection error, trying PBX softphone originate:', webrtcErr);
      try {
        await apiService.interveneQACall(token, nudge.call_uuid, mode);
        setActionStatus((prev) => ({ ...prev, [actionKey]: 'success' }));
      } catch {
        setActionStatus((prev) => ({ ...prev, [actionKey]: 'error' }));
      }
    }
  };

  if (nudges.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '80px',
        right: '24px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '430px',
        width: 'calc(100vw - 48px)',
        pointerEvents: 'none',
      }}
    >
      {nudges.map((nudge) => {
        const isEscalation = nudge.event_type === 'qa.escalation';
        const listenKey = `${nudge.id}-listen`;
        const bargeKey = `${nudge.id}-barge`;
        const listenStatus = actionStatus[listenKey];
        const bargeStatus = actionStatus[bargeKey];

        return (
          <div
            key={nudge.id}
            style={{
              pointerEvents: 'auto',
              background: isEscalation ? '#17090B' : '#141416',
              border: isEscalation ? '1.5px solid #EF4444' : '1.5px solid #F59E0B',
              borderRadius: '14px',
              padding: '16px',
              boxShadow: isEscalation
                ? '0 16px 40px rgba(239, 68, 68, 0.4), 0 4px 12px rgba(0,0,0,0.85)'
                : '0 16px 40px rgba(245, 158, 11, 0.28), 0 4px 12px rgba(0,0,0,0.85)',
              color: '#FFFFFF',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Top Glowing Accent Line */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: isEscalation
                  ? 'linear-gradient(90deg, #EF4444, #B91C1C)'
                  : 'linear-gradient(90deg, #F59E0B, #D97706)',
              }}
            />

            {/* Header: Badge & Close Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isEscalation ? (
                  <span
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#F87171',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <ShieldAlert size={13} /> CALL ESCALATED
                  </span>
                ) : (
                  <span
                    style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#FBBF24',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <AlertTriangle size={13} /> FINAL COMPLIANCE WARNING
                  </span>
                )}
                <span style={{ fontSize: '12px', color: '#F59E0B', fontWeight: 700 }}>
                  Final Warning ({nudge.warn_count}/{nudge.max_warn_retries})
                </span>
              </div>

              <button
                onClick={() => handleDismiss(nudge.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9CA3AF',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px',
                }}
                title="Dismiss"
              >
                <X size={16} />
              </button>
            </div>

            {/* Agent / Customer Call Details */}
            <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#9CA3AF' }}>Agent: </span>
                <strong style={{ color: '#F3F4F6' }}>Ext {nudge.agent_extension}</strong>
                <span style={{ color: '#6B7280', margin: '0 6px' }}>↔</span>
                <span style={{ color: '#9CA3AF' }}>Customer: </span>
                <strong style={{ color: '#F3F4F6' }}>Ext {nudge.customer_extension}</strong>
              </div>
              <span style={{ fontSize: '11px', color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                Live
              </span>
            </div>

            {/* Violation Reason */}
            <div style={{ fontSize: '12px', color: isEscalation ? '#FCA5A5' : '#FDE68A', marginBottom: '8px', fontWeight: 500 }}>
              {nudge.reason}
            </div>

            {/* Live Transcript Snippet */}
            {nudge.transcript && (
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: '#D1D5DB',
                  fontStyle: 'italic',
                  marginBottom: '10px',
                  lineHeight: '1.4',
                }}
              >
                &ldquo;{nudge.transcript}&rdquo;
              </div>
            )}

            {/* Coaching Whisper Injected Status */}
            {(nudge.whisper_text || nudge.coaching) && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', color: '#60A5FA', marginBottom: '12px' }}>
                <Volume2 size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  <strong>Whispered:</strong> &ldquo;{nudge.whisper_text || nudge.coaching}&rdquo;
                </span>
              </div>
            )}

            {/* In-Browser WebRTC Live Audio Banner */}
            {webrtcState.agentExtension === nudge.agent_extension && (webrtcState.state === 'listening' || webrtcState.state === 'barging') && (
              <div
                style={{
                  background: webrtcState.state === 'barging' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  border: webrtcState.state === 'barging' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {webrtcState.state === 'barging' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#EF4444', fontWeight: 700, fontSize: '11px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
                      Microphone Live (Barged In)
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#10B981', fontWeight: 700, fontSize: '11px' }}>
                      <Headphones size={13} className="text-emerald-400" />
                      Audio Playing in Browser
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => webrtcService.toggleMute()}
                    style={{
                      background: webrtcState.state === 'barging' ? '#374151' : '#991B1B',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '5px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title={webrtcState.state === 'barging' ? 'Mute microphone (Listen Only)' : 'Unmute microphone (Barge In)'}
                  >
                    {webrtcState.state === 'barging' ? <MicOff size={12} /> : <Mic size={12} />}
                    {webrtcState.state === 'barging' ? 'Mute Mic' : 'Barge In'}
                  </button>

                  <button
                    onClick={() => webrtcService.hangup()}
                    style={{
                      background: '#1F2937',
                      color: '#9CA3AF',
                      border: '1px solid #374151',
                      borderRadius: '5px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                    title="Stop in-browser listening"
                  >
                    <PhoneOff size={12} />
                    Leave
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons: In-Browser WebRTC Listen & Barge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {!(webrtcState.agentExtension === nudge.agent_extension && (webrtcState.state === 'listening' || webrtcState.state === 'barging')) && (
                <>
                  <button
                    onClick={() => handleIntervene(nudge, 'listen')}
                    disabled={listenStatus === 'loading' || webrtcState.state === 'connecting'}
                    style={{
                      background: listenStatus === 'success' ? '#065F46' : '#27272A',
                      color: '#E4E4E7',
                      border: '1px solid #3F3F46',
                      borderRadius: '6px',
                      padding: '6px 11px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.15s ease',
                    }}
                    title="Listen live inside browser (*880)"
                  >
                    {listenStatus === 'success' ? <Check size={13} className="text-emerald-400" /> : <Headphones size={13} className="text-amber-400" />}
                    {listenStatus === 'loading' || (webrtcState.state === 'connecting' && webrtcState.agentExtension === nudge.agent_extension)
                      ? 'Connecting Audio...'
                      : listenStatus === 'success'
                      ? 'Connected'
                      : `Listen (*880${nudge.agent_extension})`}
                  </button>

                  <button
                    onClick={() => handleIntervene(nudge, 'barge')}
                    disabled={bargeStatus === 'loading' || webrtcState.state === 'connecting'}
                    style={{
                      background: bargeStatus === 'success' ? '#065F46' : isEscalation ? '#991B1B' : '#78350F',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 11px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.15s ease',
                    }}
                    title="Barge into call with your browser microphone (*883)"
                  >
                    {bargeStatus === 'success' ? <Check size={13} /> : <Radio size={13} />}
                    {bargeStatus === 'loading' ? 'Barging...' : bargeStatus === 'success' ? 'Barged In' : `Barge In (*883${nudge.agent_extension})`}
                  </button>
                </>
              )}

              {onNavigateToQA && (
                <button
                  onClick={() => {
                    handleDismiss(nudge.id);
                    onNavigateToQA();
                  }}
                  style={{
                    background: 'transparent',
                    color: '#9CA3AF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginLeft: 'auto',
                  }}
                >
                  <ExternalLink size={13} /> Open QA
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
