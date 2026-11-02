import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import type { SystemStatus, User, QAEscalationPayload } from '../types';
import {
  Building2,
  Phone,
  ArrowLeftRight,
  Server,
  Hash,
  GitBranch,
  CheckCircle,
  AlertCircle,
  Activity,
  Cpu,
  HardDrive,
  TrendingUp,
  PhoneIncoming,
  PhoneOutgoing,
  ShieldAlert,
  Eye,
  Mic,
  PhoneForwarded
} from 'lucide-react';

import { PageContainer, PageHeader } from './layout/PageContainer';
import { Stack, Grid, Inline } from './layout/Stack';
import { Card, StatCard, Heading, Text, Badge, IconTile, ProgressBar, Button } from './ui';

interface DashboardMetrics {
  system_utilization: {
    cpu_percent: number;
    memory_percent: number;
    disk_percent: number;
  };
  counts: {
    tenants: number;
    carriers: number;
    extensions: number;
    dids: number;
    queues_and_ivrs: number;
  };
  live_calls: number;
  traffic_summary: {
    inbound: { total: number; answered: number; unanswered: number; failed: number };
    outbound: { total: number; answered: number; unanswered: number; failed: number };
  };
  traffic_peak: {
    inbound_peak: number;
    outbound_peak: number;
  };
}

interface DashboardViewProps {
  token: string;
  user?: User | null;
  tenantCount?: number;
  extensionCount?: number;
  didCount?: number;
  gatewayCount?: number;
  trunkCount?: number;
  setActiveTab: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ token, user, setActiveTab }) => {
  const [status, setStatus] = useState<SystemStatus>({
    healthy: false,
    ready: false,
    database: 'disconnected',
    redis: 'disconnected'
  });
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activeEscalations, setActiveEscalations] = useState<QAEscalationPayload[]>([]);

  // Hydrate active escalations on mount
  useEffect(() => {
    if (token) {
      apiService.getQAActiveCalls(token).then((calls) => {
        if (!Array.isArray(calls)) return;
        const escalated = calls.filter((c: any) => c && c.escalated && c.call_uuid).map((c: any) => ({
          event_type: 'qa.escalation' as const,
          call_uuid: String(c.call_uuid),
          tenant_id: c.tenant_id,
          agent_extension: c.agent_extension || 'N/A',
          customer_extension: c.customer_extension || 'N/A',
          warn_count: c.warn_count || 0,
          max_warn_retries: 3,
          timestamp: c.started_at
        }));
        setActiveEscalations(escalated);
      }).catch(() => {});
    }
  }, [token]);

  const handleIntervene = async (callUuid: string, mode: 'listen' | 'whisper' | 'barge') => {
    try {
      await apiService.interveneQACall(token, callUuid, mode);
      alert(`Intervention (${mode.toUpperCase()}) initiated to supervisor!`);
    } catch (err: any) {
      alert(err.message || 'Intervention failed');
    }
  };

  const dismissEscalation = (callUuid: string) => {
    setActiveEscalations((prev) => prev.filter((e) => e.call_uuid !== callUuid));
  };

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await apiService.checkHealth();
        setStatus(data);
      } catch {
        setStatus({ healthy: false, ready: false, database: 'disconnected', redis: 'disconnected' });
      }
    };

    const fetchMetrics = async () => {
      try {
        const data = await apiService.getDashboardMetrics(token);
        setMetrics(data);
      } catch (err) {
        console.error('Failed to fetch dashboard metrics:', err);
      }
    };

    fetchStatus();
    fetchMetrics();

    // WebSocket auto-refresh for real-time live telemetry
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/reports?token=${encodeURIComponent(token)}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            if (event.data === 'pong') return;
            const payload = JSON.parse(event.data);
            if (payload.event === 'cdr.created' || payload.type === 'cdr.created') {
              fetchMetrics();
            } else if ((payload.event_type === 'qa.escalation' || payload.event === 'qa.escalation') && payload.call_uuid) {
              setActiveEscalations((prev) => {
                if (prev.some((e) => e.call_uuid === payload.call_uuid)) return prev;
                return [payload, ...prev];
              });
            } else if (payload.event_type === 'qa.call_ended' || payload.event === 'call.ended') {
              if (payload.call_uuid) {
                setActiveEscalations((prev) => prev.filter((e) => e.call_uuid !== payload.call_uuid));
              }
            }
          } catch {}
        };
        ws.onclose = () => {
          reconnectTimer = setTimeout(connectWs, 5000);
        };
      } catch {}
    };

    connectWs();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [token]);

  const isSuper = user?.role === 'SUPER_ADMIN';

  return (
    <PageContainer>
      <Stack gap="6">
        {/* ── HEADER ───────────────────────────────────────────────────────────── */}
        <PageHeader
          title={isSuper ? 'Global System Administration' : `Tenant Dashboard (${(user as any)?.tenant_name || user?.tenant_domain || 'Tenant Domain'})`}
          subtitle="Platform health, real-time telephony status, and resource usage overview."
          actions={
            <Badge variant={status.database === 'connected' ? 'success' : 'danger'}>
              {status.database === 'connected' ? (
                <span className="flex items-center gap-1.5"><CheckCircle size={14} /> PBX Engine Online</span>
              ) : (
                <span className="flex items-center gap-1.5"><AlertCircle size={14} /> PBX Engine Offline</span>
              )}
            </Badge>
          }
        />

        {/* ── SUPERVISOR ESCALATION BANNER ────────────────────────────────────────── */}
        {activeEscalations.filter((esc) => esc && esc.call_uuid).length > 0 && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 shadow-xl backdrop-blur-md space-y-4">
            {activeEscalations.filter((esc) => esc && esc.call_uuid).map((esc) => (
              <div key={esc.call_uuid} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-full bg-red-500/20 text-red-500 animate-pulse">
                    <ShieldAlert size={26} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-red-500 uppercase tracking-wider text-xs">Live QA Escalation</span>
                      <span className="text-xs text-text-muted font-mono">{(esc.call_uuid || '').slice(0, 8)}...</span>
                    </div>
                    <p className="font-semibold text-text-primary mt-1 text-sm md:text-base">
                      Agent <span className="text-red-400 font-bold">{esc.agent_extension}</span> exceeded max warnings ({esc.warn_count}/{esc.max_warn_retries}) on call with Customer {esc.customer_extension}!
                    </p>
                    {esc.reason && <p className="text-xs text-text-secondary mt-0.5 font-medium">{esc.reason}</p>}
                    {esc.coaching && <p className="text-xs text-text-muted italic mt-0.5">"{esc.coaching}"</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleIntervene(esc.call_uuid, 'listen')}
                    title="Listen (*880<agent>)"
                    leftIcon={<Eye size={14} />}
                  >
                    Listen (*880)
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleIntervene(esc.call_uuid, 'whisper')}
                    title="Whisper (*881<agent>)"
                    leftIcon={<Mic size={14} />}
                  >
                    Whisper (*881)
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleIntervene(esc.call_uuid, 'barge')}
                    title="Barge (*883<agent>)"
                    leftIcon={<PhoneForwarded size={14} />}
                  >
                    Barge (*883)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => dismissEscalation(esc.call_uuid)}
                  >
                    Acknowledge
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TOP STAT CARDS ────────────────────────────────────────────────────── */}
        <Grid cols={4} gap="6">
          {isSuper ? (
            <>
              <div className="cursor-pointer h-full" onClick={() => setActiveTab('tenants')}>
                <StatCard
                  title="Number of Tenants"
                  value={metrics?.counts.tenants ?? 0}
                  icon={<Building2 size={20} />}
                  trend="Multi-Tenant Organizations"
                />
              </div>

              <div className="cursor-pointer h-full" onClick={() => setActiveTab('trunks')}>
                <StatCard
                  title="Number of Carriers"
                  value={metrics?.counts.carriers ?? 0}
                  icon={<ArrowLeftRight size={20} />}
                  trend="Sofia Gateways + SIP Trunks"
                />
              </div>

              <StatCard
                title="Live Calls on Platform"
                value={metrics?.live_calls ?? 0}
                icon={<Activity size={20} />}
                trend="Active Real-Time Channels"
              />

              <StatCard
                title="PBX Engine Status"
                value={status.database === 'connected' ? 'Connected' : 'Offline'}
                icon={<Server size={20} />}
                trend="FreeSWITCH 1.10 Core Active"
              />
            </>
          ) : (
            <>
              <div className="cursor-pointer h-full" onClick={() => setActiveTab('extensions')}>
                <StatCard
                  title="Number of Extensions"
                  value={metrics?.counts.extensions ?? 0}
                  icon={<Phone size={20} />}
                  trend="SIP & WebRTC Endpoints"
                />
              </div>

              <div className="cursor-pointer h-full" onClick={() => setActiveTab('dids')}>
                <StatCard
                  title="Assigned DIDs"
                  value={metrics?.counts.dids ?? 0}
                  icon={<Hash size={20} />}
                  trend="Inbound Numbers Pool"
                />
              </div>

              <div className="cursor-pointer h-full" onClick={() => setActiveTab('queues')}>
                <StatCard
                  title="Queues & IVRs"
                  value={metrics?.counts.queues_and_ivrs ?? 0}
                  icon={<GitBranch size={20} />}
                  trend="Call Queues & Auto-Attendants"
                />
              </div>

              <StatCard
                title="Active Tenant Calls"
                value={metrics?.live_calls ?? 0}
                icon={<Activity size={20} />}
                trend="Current Live Sessions"
              />
            </>
          )}
        </Grid>

        {/* ── SYSTEM UTILIZATION WIDGET (Superadmin) ──────────────────────────── */}
        {isSuper && (
          <Card className="p-6">
            <Stack gap="4">
              <Inline justify="between" align="center">
                <div>
                  <Heading level={3}>System Utilization</Heading>
                  <Text size="sm" variant="secondary">Live CPU, RAM, and storage health telemetry</Text>
                </div>
                <Badge variant="info">Host Node Performance</Badge>
              </Inline>
              <Grid cols={3} gap="6">
                <div className="p-4 rounded-lg bg-[var(--pbx-bg-subtle)] border border-[var(--pbx-border-default)]">
                  <Inline justify="between" align="center" className="mb-2">
                    <span className="text-sm font-semibold text-[var(--pbx-text-primary)] flex items-center gap-2">
                      <Cpu size={16} /> CPU Utilization
                    </span>
                    <Badge variant={(metrics?.system_utilization.cpu_percent ?? 0) > 85 ? 'danger' : 'success'}>
                      {metrics?.system_utilization.cpu_percent ?? 0}%
                    </Badge>
                  </Inline>
                  <ProgressBar value={metrics?.system_utilization.cpu_percent ?? 0} color="accent" />
                </div>

                <div className="p-4 rounded-lg bg-[var(--pbx-bg-subtle)] border border-[var(--pbx-border-default)]">
                  <Inline justify="between" align="center" className="mb-2">
                    <span className="text-sm font-semibold text-[var(--pbx-text-primary)] flex items-center gap-2">
                      <Activity size={16} /> Memory Utilization
                    </span>
                    <Badge variant={(metrics?.system_utilization.memory_percent ?? 0) > 85 ? 'danger' : 'info'}>
                      {metrics?.system_utilization.memory_percent ?? 0}%
                    </Badge>
                  </Inline>
                  <ProgressBar value={metrics?.system_utilization.memory_percent ?? 0} color="primary" />
                </div>

                <div className="p-4 rounded-lg bg-[var(--pbx-bg-subtle)] border border-[var(--pbx-border-default)]">
                  <Inline justify="between" align="center" className="mb-2">
                    <span className="text-sm font-semibold text-[var(--pbx-text-primary)] flex items-center gap-2">
                      <HardDrive size={16} /> Disk Space
                    </span>
                    <Badge variant={(metrics?.system_utilization.disk_percent ?? 0) > 85 ? 'danger' : 'neutral'}>
                      {metrics?.system_utilization.disk_percent ?? 0}%
                    </Badge>
                  </Inline>
                  <ProgressBar value={metrics?.system_utilization.disk_percent ?? 0} color="accent" />
                </div>
              </Grid>
            </Stack>
          </Card>
        )}

        {/* ── TRAFFIC SUMMARY & TRAFFIC PEAK WIDGETS ──────────────────────────── */}
        <Grid cols={2} gap="6">
          {/* Traffic Summary */}
          <Card className="p-6">
            <Stack gap="4">
              <Inline justify="between" align="center">
                <div>
                  <Heading level={3}>Traffic Summary</Heading>
                  <Text size="sm" variant="secondary">Inbound and Outbound answered, failed & unanswered breakdown</Text>
                </div>
                <Badge variant="primary">Call Telemetry</Badge>
              </Inline>

              <Grid cols={2} gap="4">
                {/* Inbound Summary */}
                <div className="p-4 rounded-lg bg-[var(--pbx-bg-subtle)] border border-[var(--pbx-border-default)]">
                  <div className="flex items-center gap-2 mb-3">
                    <IconTile icon={<PhoneIncoming size={16} />} />
                    <span className="font-bold text-sm text-[var(--pbx-text-primary)]">Inbound Calls</span>
                  </div>
                  <div className="text-2xl font-bold text-[var(--pbx-text-primary)] mb-3">
                    {metrics?.traffic_summary.inbound.total ?? 0}
                  </div>
                  <Stack gap="1">
                    <Inline justify="between" className="text-xs">
                      <span className="text-[var(--pbx-text-secondary)]">Answered:</span>
                      <Badge variant="success">{metrics?.traffic_summary.inbound.answered ?? 0}</Badge>
                    </Inline>
                    <Inline justify="between" className="text-xs">
                      <span className="text-[var(--pbx-text-secondary)]">Unanswered:</span>
                      <Badge variant="warning">{metrics?.traffic_summary.inbound.unanswered ?? 0}</Badge>
                    </Inline>
                    <Inline justify="between" className="text-xs">
                      <span className="text-[var(--pbx-text-secondary)]">Failed:</span>
                      <Badge variant="danger">{metrics?.traffic_summary.inbound.failed ?? 0}</Badge>
                    </Inline>
                  </Stack>
                </div>

                {/* Outbound Summary */}
                <div className="p-4 rounded-lg bg-[var(--pbx-bg-subtle)] border border-[var(--pbx-border-default)]">
                  <div className="flex items-center gap-2 mb-3">
                    <IconTile icon={<PhoneOutgoing size={16} />} />
                    <span className="font-bold text-sm text-[var(--pbx-text-primary)]">Outbound Calls</span>
                  </div>
                  <div className="text-2xl font-bold text-[var(--pbx-text-primary)] mb-3">
                    {metrics?.traffic_summary.outbound.total ?? 0}
                  </div>
                  <Stack gap="1">
                    <Inline justify="between" className="text-xs">
                      <span className="text-[var(--pbx-text-secondary)]">Answered:</span>
                      <Badge variant="success">{metrics?.traffic_summary.outbound.answered ?? 0}</Badge>
                    </Inline>
                    <Inline justify="between" className="text-xs">
                      <span className="text-[var(--pbx-text-secondary)]">Unanswered:</span>
                      <Badge variant="warning">{metrics?.traffic_summary.outbound.unanswered ?? 0}</Badge>
                    </Inline>
                    <Inline justify="between" className="text-xs">
                      <span className="text-[var(--pbx-text-secondary)]">Failed:</span>
                      <Badge variant="danger">{metrics?.traffic_summary.outbound.failed ?? 0}</Badge>
                    </Inline>
                  </Stack>
                </div>
              </Grid>
            </Stack>
          </Card>

          {/* Traffic Peak */}
          <Card className="p-6">
            <Stack gap="4">
              <Inline justify="between" align="center">
                <div>
                  <Heading level={3}>Traffic Peak</Heading>
                  <Text size="sm" variant="secondary">Peak hourly channel concurrency limits</Text>
                </div>
                <Badge variant="neutral">30-Day Analysis</Badge>
              </Inline>

              <Grid cols={2} gap="4">
                <div className="p-4 rounded-lg bg-[var(--pbx-bg-subtle)] border border-[var(--pbx-border-default)] flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <IconTile icon={<TrendingUp size={16} />} />
                      <span className="font-bold text-sm text-[var(--pbx-text-primary)]">Inbound Peak</span>
                    </div>
                    <div className="text-3xl font-extrabold text-[var(--pbx-text-primary)] my-2">
                      {metrics?.traffic_peak.inbound_peak ?? 0}
                      <span className="text-xs font-normal text-[var(--pbx-text-muted)] ml-1.5">concurrent calls</span>
                    </div>
                  </div>
                  <Text size="xs" variant="secondary">Highest simultaneous inbound call spike</Text>
                </div>

                <div className="p-4 rounded-lg bg-[var(--pbx-bg-subtle)] border border-[var(--pbx-border-default)] flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <IconTile icon={<TrendingUp size={16} />} />
                      <span className="font-bold text-sm text-[var(--pbx-text-primary)]">Outbound Peak</span>
                    </div>
                    <div className="text-3xl font-extrabold text-[var(--pbx-text-primary)] my-2">
                      {metrics?.traffic_peak.outbound_peak ?? 0}
                      <span className="text-xs font-normal text-[var(--pbx-text-muted)] ml-1.5">concurrent calls</span>
                    </div>
                  </div>
                  <Text size="xs" variant="secondary">Highest simultaneous outbound channel spike</Text>
                </div>
              </Grid>
            </Stack>
          </Card>
        </Grid>
      </Stack>
    </PageContainer>
  );
};
