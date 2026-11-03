import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, ShieldAlert, Headphones, Radio, X, ExternalLink, Volume2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import { apiService } from '../services/api';
import type { User } from '../types';

export interface QANudgeEvent {
  id: string;
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
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else {
      // Soft, professional two-tone compliance chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    // AudioContext might be silenced if no user interaction yet
  }
};

export const QANudgeOverlay: React.FC<QANudgeOverlayProps> = ({
  token,
  user,
  onNavigateToQA
}) => {
  const [nudges, setNudges] = useState<QANudgeEvent[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toastWarning, toastError, toastSuccess } = useToast();
  const wsRef = useRef<WebSocket | null>(null);

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

    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
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
                return; // Strictly ignore other tenants!
              }
            }

            const nudge: QANudgeEvent = {
              id: `${payload.call_uuid}-${payload.warn_count || Date.now()}`,
              event_type: payload.event_type,
              call_uuid: payload.call_uuid,
              tenant_id: payload.tenant_id,
              agent_extension: payload.agent_extension || 'Unknown',
              customer_extension: payload.customer_extension || 'Customer',
              supervisor_extension: payload.supervisor_extension,
              warn_count: payload.warn_count || 1,
              max_warn_retries: payload.max_warn_retries || 3,
              reason: payload.reason || 'Agent policy violation detected',
              coaching: payload.coaching,
              whisper_text: payload.whisper_text,
              transcript: payload.transcript || '',
              timestamp: payload.timestamp || Date.now()
            };

            // Play auditory chime
            playNudgeChime(nudge.event_type === 'qa.escalation');

            // Add to active nudges queue (limit max 3 simultaneous cards)
            setNudges((prev) => [nudge, ...prev.filter((n) => n.id !== nudge.id)].slice(0, 3));

            // Surface toast summary
            if (nudge.event_type === 'qa.escalation') {
              toastError(
                `🚨 Call Escalated: Agent ${nudge.agent_extension}`,
                `Max warnings exceeded (${nudge.warn_count}/${nudge.max_warn_retries}). Immediate supervisor action required.`
              );
            } else {
              toastWarning(
                `⚠️ QA Nudge: Agent ${nudge.agent_extension} (Warning ${nudge.warn_count}/${nudge.max_warn_retries})`,
                `"${nudge.reason}". AI coaching whisper injected into softphone.`
              );
            }

            // Auto-dismiss warnings after 18 seconds (escalations stay until dismissed)
            if (nudge.event_type === 'qa.warning') {
              setTimeout(() => {
                setNudges((current) => current.filter((item) => item.id !== nudge.id));
              }, 18000);
            }
          } catch (err) {
            console.debug('Failed to parse incoming WebSocket QA event:', err);
          }
        };

        ws.onclose = () => {
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
    setActionLoading(actionKey);
    try {
      const res = await apiService.interveneQACall(token, nudge.call_uuid, mode);
      toastSuccess(
        `Intervention Dispatched (${mode.toUpperCase()})`,
        `Connected to Agent ${nudge.agent_extension} via supervisor extension ${res.supervisor_extension || '9001'}.`
      );
    } catch (err: any) {
      toastError('Intervention Failed', err.message || `Could not initiate ${mode} intervention`);
    } finally {
      setActionLoading(null);
    }
  };

  if (nudges.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '76px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '460px',
        width: 'calc(100vw - 48px)',
        pointerEvents: 'none',
      }}
    >
      {nudges.map((nudge) => {
        const isEscalation = nudge.event_type === 'qa.escalation';
        return (
          <div
            key={nudge.id}
            style={{
              pointerEvents: 'auto',
              background: isEscalation ? '#180B0D' : '#141416',
              border: isEscalation ? '1.5px solid #EF4444' : '1.5px solid #F59E0B',
              borderRadius: '14px',
              padding: '16px',
              boxShadow: isEscalation
                ? '0 12px 32px rgba(239, 68, 68, 0.35), 0 2px 8px rgba(0,0,0,0.8)'
                : '0 12px 32px rgba(245, 158, 11, 0.25), 0 2px 8px rgba(0,0,0,0.8)',
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
                  ? 'linear-gradient(90deg, #EF4444, #DC2626)'
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
                    <AlertTriangle size={13} /> COMPLIANCE NUDGE
                  </span>
                )}
                <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>
                  Warning {nudge.warn_count}/{nudge.max_warn_retries}
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
                title="Dismiss nudge"
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
              <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Live Call</span>
            </div>

            {/* Violation Reason */}
            <div style={{ fontSize: '12px', color: isEscalation ? '#FCA5A5' : '#FDE68A', marginBottom: '8px', fontWeight: 500 }}>
              {nudge.reason}
            </div>

            {/* Live Transcript Snippet */}
            {nudge.transcript && (
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.45)',
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
                  <strong>Whispered to Agent:</strong> &ldquo;{nudge.whisper_text || nudge.coaching}&rdquo;
                </span>
              </div>
            )}

            {/* Action Buttons: 1-Click Supervisor Intervention */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleIntervene(nudge, 'listen')}
                disabled={actionLoading === `${nudge.id}-listen`}
                style={{
                  background: '#27272A',
                  color: '#E4E4E7',
                  border: '1px solid #3F3F46',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'background 0.15s ease',
                }}
                title="Eavesdrop on call (*881 + agent extension)"
              >
                <Headphones size={13} className="text-primary" />
                {actionLoading === `${nudge.id}-listen` ? 'Connecting...' : `Listen (*881${nudge.agent_extension})`}
              </button>

              <button
                onClick={() => handleIntervene(nudge, 'barge')}
                disabled={actionLoading === `${nudge.id}-barge`}
                style={{
                  background: isEscalation ? '#991B1B' : '#78350F',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
                title="Barge into call (*883 + agent extension)"
              >
                <Radio size={13} />
                {actionLoading === `${nudge.id}-barge` ? 'Barging...' : 'Barge In'}
              </button>

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
