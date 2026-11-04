import React, { useState, useEffect } from 'react';
import {
  Bot, PhoneCall, ShieldAlert, AlertTriangle, Eye, Mic, PhoneForwarded,
  Plus, Edit2, Trash2, RefreshCw, Sparkles, Building2, CheckCircle2, Volume2, Send
} from 'lucide-react';
import {
  PageContainer, PageHeader, Card,
  Button, Badge, Modal, Input, FormField, Stack, Grid, Table, TableHeader,
  TableBody, TableRow, TableCell, Select
} from './ui';
import { apiService } from '../services/api';
import type { User, Tenant, VirtualQAConfig, QAActiveCall, QAEvent } from '../types';

interface VirtualQAViewProps {
  token: string;
  user: User | null;
}

export const VirtualQAView: React.FC<VirtualQAViewProps> = ({ token, user }) => {
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'SUPERADMIN';
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(
    isSuperAdmin ? '' : (user?.tenant_id || '')
  );

  const [activeSubTab, setActiveSubTab] = useState<'live' | 'configs' | 'audit'>('live');
  const [configs, setConfigs] = useState<VirtualQAConfig[]>([]);
  const [activeCalls, setActiveCalls] = useState<QAActiveCall[]>([]);
  const [events, setEvents] = useState<QAEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<VirtualQAConfig | null>(null);

  // Demo & Speech Simulation Modal State
  const [isDemoStarting, setIsDemoStarting] = useState(false);
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);
  const [simCall, setSimCall] = useState<QAActiveCall | null>(null);
  const [simUtterance, setSimUtterance] = useState('chal be hatt chutiye');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    tenant_id: '',
    qa_extension_number: '8999',
    max_warn_retries: 3,
    cooldown_seconds: 10,
    supervisor_extension: '9001',
    monitored_agents: '1001, 1002',
    monitored_callers: '*',
    policy_prompt: 'Agent must be courteous, empathetic, and professional at all times. Never use profanity, rude tone, or unauthorized guarantees.',
    banned_keywords: 'hell, damn, stupid, scam, shut up',
    enabled: true,
  });

  // Load Tenants for Superadmin
  useEffect(() => {
    if (isSuperAdmin && token) {
      apiService.getTenants(token)
        .then((tnts) => {
          setTenants(tnts || []);
        })
        .catch((err) => console.error('Failed to load tenants for QA:', err));
    }
  }, [isSuperAdmin, token]);

  useEffect(() => {
    if (!isSuperAdmin && user?.tenant_id && selectedTenantId !== user.tenant_id) {
      setSelectedTenantId(user.tenant_id);
    }
  }, [isSuperAdmin, user?.tenant_id]);

  // Fetch Data
  const loadData = async (tenantIdToQuery?: string) => {
    setLoading(true);
    try {
      const activeTenant = tenantIdToQuery !== undefined ? tenantIdToQuery : selectedTenantId;
      const tid = activeTenant || undefined;
      const [cfgs, calls, evts] = await Promise.all([
        apiService.getQAConfigs(token, tid).catch(() => []),
        apiService.getQAActiveCalls(token, tid).catch(() => []),
        apiService.getQAEvents(token, { limit: 50, tenant_id: tid }).catch(() => [])
      ]);
      setConfigs(cfgs || []);
      setActiveCalls(calls || []);
      setEvents(evts || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedTenantId);
  }, [token, selectedTenantId]);

  // Polling for live calls
  useEffect(() => {
    const interval = setInterval(() => {
      apiService.getQAActiveCalls(token, selectedTenantId || undefined)
        .then(setActiveCalls)
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [token, selectedTenantId]);

  // WebSocket for Real-Time QA Events
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/events?token=${encodeURIComponent(token)}`;
    let ws: WebSocket | null = null;
    let pingInterval: any = null;

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        pingInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 20000);
      };
      ws.onmessage = (msg) => {
        try {
          if (msg.data === 'pong') return;
          const payload = JSON.parse(msg.data);
          if (payload.event_type === 'qa.warning' || payload.event_type === 'qa.escalation') {
            apiService.getQAActiveCalls(token, selectedTenantId || undefined).then(setActiveCalls).catch(() => {});
            apiService.getQAEvents(token, { limit: 50, tenant_id: selectedTenantId || undefined }).then(setEvents).catch(() => {});
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      if (ws) ws.close();
    };
  }, [token, selectedTenantId]);

  // Handlers
  const handleOpenCreate = () => {
    setEditingConfig(null);
    const defaultTenant = selectedTenantId || (tenants.length > 0 ? tenants[0].id : (user?.tenant_id || ''));
    setFormData({
      tenant_id: defaultTenant,
      qa_extension_number: '8999',
      max_warn_retries: 3,
      cooldown_seconds: 10,
      supervisor_extension: '9001',
      monitored_agents: '1001, 1002',
      monitored_callers: '*',
      policy_prompt: 'Agent must be courteous, empathetic, and professional at all times. Never use profanity, rude tone, or unauthorized guarantees.',
      banned_keywords: 'hell, damn, stupid, scam, shut up',
      enabled: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cfg: VirtualQAConfig) => {
    setEditingConfig(cfg);
    setFormData({
      tenant_id: cfg.tenant_id || '',
      qa_extension_number: cfg.qa_extension_number || '8999',
      max_warn_retries: cfg.max_warn_retries || 3,
      cooldown_seconds: cfg.cooldown_seconds || 10,
      supervisor_extension: cfg.supervisor_extension || '',
      monitored_agents: (cfg.monitored_agents || []).join(', '),
      monitored_callers: (cfg.monitored_callers || ['*']).join(', '),
      policy_prompt: cfg.policy_prompt || '',
      banned_keywords: (cfg.banned_keywords || []).join(', '),
      enabled: cfg.enabled,
    });
    setIsModalOpen(true);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('save');
    try {
      const targetTenantId = isSuperAdmin
        ? (formData.tenant_id || selectedTenantId || (tenants.length > 0 ? tenants[0].id : undefined))
        : (user?.tenant_id || undefined);

      if (isSuperAdmin && !targetTenantId) {
        alert('Please select a target tenant for this Virtual QA bot policy.');
        setActionLoading(null);
        return;
      }

      const payload = {
        tenant_id: targetTenantId,
        qa_extension_number: formData.qa_extension_number.trim(),
        max_warn_retries: Number(formData.max_warn_retries),
        cooldown_seconds: Number(formData.cooldown_seconds),
        supervisor_extension: formData.supervisor_extension.trim() || undefined,
        monitored_agents: formData.monitored_agents.split(',').map((s) => s.trim()).filter(Boolean),
        monitored_callers: formData.monitored_callers.split(',').map((s) => s.trim()).filter(Boolean),
        policy_prompt: formData.policy_prompt.trim(),
        banned_keywords: formData.banned_keywords.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
        enabled: formData.enabled,
      };

      if (editingConfig) {
        await apiService.updateQAConfig(token, editingConfig.id, payload);
      } else {
        await apiService.createQAConfig(token, payload);
      }
      setIsModalOpen(false);
      loadData(selectedTenantId);
    } catch (err: any) {
      alert(err.message || 'Failed to save configuration');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteConfig = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this Virtual QA configuration?')) return;
    try {
      await apiService.deleteQAConfig(token, id);
      loadData(selectedTenantId);
    } catch (err: any) {
      alert(err.message || 'Failed to delete configuration');
    }
  };

  const handleIntervene = async (callUuid: string, mode: 'listen' | 'whisper' | 'barge') => {
    setActionLoading(`${callUuid}-${mode}`);
    try {
      const res = await apiService.interveneQACall(token, callUuid, mode);
      alert(`Intervention (${mode.toUpperCase()}) dispatched to supervisor extension ${res.supervisor_extension || '9001'}!`);
      loadData(selectedTenantId);
    } catch (err: any) {
      alert(err.message || `Failed to initiate ${mode} intervention`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartDemoCall = async () => {
    setIsDemoStarting(true);
    try {
      const targetTenantId = selectedTenantId || (tenants.length > 0 ? tenants[0].id : (user?.tenant_id || undefined));
      const res = await apiService.startQADemoCall(token, {
        tenant_id: targetTenantId,
        agent_extension: '1001',
        customer_extension: '2001',
      });
      await loadData(selectedTenantId);
      setSimCall({
        call_uuid: res.call_uuid,
        tenant_id: res.tenant_id,
        agent_extension: res.agent_extension,
        customer_extension: res.customer_extension,
        agent_leg: res.agent_leg,
        warn_count: res.warn_count,
        escalated: res.escalated,
        started_at: res.started_at || Date.now() / 1000,
      });
      setSimUtterance('chal be hatt chutiye');
      setSimResult(null);
      setIsSimModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Failed to start demo call');
    } finally {
      setIsDemoStarting(false);
    }
  };

  const handleOpenSimModal = (call: QAActiveCall) => {
    setSimCall(call);
    setSimUtterance('chal be hatt chutiye');
    setSimResult(null);
    setIsSimModalOpen(true);
  };

  const handleExecuteSimulation = async () => {
    if (!simCall) return;
    setSimLoading(true);
    try {
      const res = await apiService.simulateQAViolation(token, simCall.call_uuid, simUtterance);
      setSimResult(res);
      await loadData(selectedTenantId);
    } catch (err: any) {
      alert(err.message || 'Speech evaluation failed');
    } finally {
      setSimLoading(false);
    }
  };

  const getTenantBadgeLabel = (tid?: string | null) => {
    if (!tid) return 'Global / None';
    const found = tenants.find((t) => t.id === tid);
    return found ? `${found.name} (${found.domain})` : String(tid).slice(0, 8);
  };

  return (
    <PageContainer>
      <Stack gap="6">
        {/* Header */}
        <PageHeader
          title="Virtual QA & Real-Time Supervisor Coaching"
          subtitle="Real-time agent audio tailing, automated AI whispers, and instant supervisor eavesdrop & barge."
          actions={
            <div className="flex items-center gap-3">
              {isSuperAdmin && (
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-text-muted hidden sm:inline" />
                  <Select
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(e.target.value)}
                    className="w-56"
                  >
                    <option value="">All Tenants (Global)</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.domain})
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <Button
                variant="secondary"
                onClick={handleStartDemoCall}
                isLoading={isDemoStarting}
                leftIcon={<Sparkles size={14} className="text-primary" />}
                title="Launch a simulated agent-customer call to test live AI compliance"
              >
                Launch Demo Call
              </Button>
              <Button
                variant="secondary"
                onClick={() => loadData(selectedTenantId)}
                leftIcon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
              >
                Refresh
              </Button>
              <Button variant="primary" onClick={handleOpenCreate} leftIcon={<Plus size={16} />}>
                Create QA Bot Policy
              </Button>
            </div>
          }
        />

        {/* Navigation Tabs */}
        <div className="flex border-b border-border gap-2">
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
              activeSubTab === 'live' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setActiveSubTab('live')}
          >
            <PhoneCall size={16} /> Monitored Live Calls ({activeCalls.length})
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
              activeSubTab === 'configs' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setActiveSubTab('configs')}
          >
            <Bot size={16} /> QA Bot Policies ({configs.length})
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
              activeSubTab === 'audit' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setActiveSubTab('audit')}
          >
            <ShieldAlert size={16} /> Violation Audit Trail ({events.length})
          </button>
        </div>

        {/* TAB 1: LIVE MONITORED CALLS */}
        {activeSubTab === 'live' && (
          <Card
            title="Active Monitored Calls"
            subtitle="Real-time calls undergoing AI policy tailing and agent whisper checks."
          >
            {activeCalls.length === 0 ? (
              <div className="text-center py-12 text-text-muted">
                <Bot size={40} className="mx-auto mb-3 opacity-40" />
                <p className="text-base font-medium">No calls currently being monitored</p>
                <p className="text-sm mb-4">
                  Initiate an internal or inbound call involving a monitored agent extension, or launch a demo call to test AI coaching live on the platform.
                </p>
                <Button
                  variant="primary"
                  onClick={handleStartDemoCall}
                  isLoading={isDemoStarting}
                  leftIcon={<Sparkles size={16} />}
                >
                  Launch Demo Monitored Call
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell header>Call UUID</TableCell>
                    {isSuperAdmin && <TableCell header>Tenant</TableCell>}
                    <TableCell header>Agent Ext</TableCell>
                    <TableCell header>Customer Ext</TableCell>
                    <TableCell header>Agent Channel Leg</TableCell>
                    <TableCell header>Warning Count</TableCell>
                    <TableCell header>Intervention Actions</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeCalls.map((call) => (
                    <TableRow key={call.call_uuid || Math.random()}>
                      <TableCell className="font-mono text-xs">{(call.call_uuid || '').slice(0, 8)}...</TableCell>
                      {isSuperAdmin && (
                        <TableCell>
                          <Badge variant="neutral">
                            {getTenantBadgeLabel(call.tenant_id)}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell className="font-semibold text-primary">{call.agent_extension}</TableCell>
                      <TableCell>{call.customer_extension || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant="neutral">{(call.agent_leg || 'bleg').toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell>
                        {call.escalated ? (
                          <Badge variant="danger" className="animate-pulse">
                            <AlertTriangle size={12} className="mr-1 inline" /> ESCALATED
                          </Badge>
                        ) : call.warn_count > 0 ? (
                          <Badge variant="warning">{call.warn_count} Warning{call.warn_count > 1 ? 's' : ''}</Badge>
                        ) : (
                          <Badge variant="success">Normal (0)</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleIntervene(call.call_uuid, 'listen')}
                            title="Listen (Silent Spy) - Short dial *880<agent>"
                            leftIcon={<Eye size={13} />}
                          >
                            Listen
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleIntervene(call.call_uuid, 'whisper')}
                            title="Whisper (Agent Ear Only) - Short dial *881<agent>"
                            leftIcon={<Mic size={13} />}
                          >
                            Whisper
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleIntervene(call.call_uuid, 'barge')}
                            title="Barge (Three-way Talk) - Short dial *883<agent>"
                            leftIcon={<PhoneForwarded size={13} />}
                          >
                            Barge
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenSimModal(call)}
                            title="Test Agent Speech / AI Compliance with Gemini & ElevenLabs"
                            leftIcon={<Sparkles size={13} className="text-primary" />}
                          >
                            Test Speech
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        )}

        {/* TAB 2: CONFIGURATIONS */}
        {activeSubTab === 'configs' && (
          <Grid cols={3} gap="6">
            {configs.map((cfg) => (
              <Card
                key={cfg.id}
                title={`Bot Ext: ${cfg.qa_extension_number || 'Virtual'}`}
                subtitle={`Supervisor: ${cfg.supervisor_extension || '9001'}`}
                actions={
                  <div className="flex items-center gap-1.5">
                    {cfg.tenant_name && (
                      <Badge variant="neutral" title={`Domain: ${cfg.tenant_domain || ''}`}>
                        {cfg.tenant_name}
                      </Badge>
                    )}
                    <Badge variant={cfg.enabled ? 'success' : 'neutral'}>
                      {cfg.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                }
              >
                <Stack gap="3" className="text-sm">
                  <div>
                    <span className="text-text-muted block text-xs">Monitored Agents:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {cfg.monitored_agents && cfg.monitored_agents.length > 0 ? (
                        cfg.monitored_agents.map((ag) => (
                          <Badge key={ag} variant="neutral">{ag}</Badge>
                        ))
                      ) : (
                        <span className="text-xs text-text-muted">None specified</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-text-muted block">Max Warnings:</span>
                      <span className="font-semibold">{cfg.max_warn_retries} Retries</span>
                    </div>
                    <div>
                      <span className="text-text-muted block">Cooldown:</span>
                      <span className="font-semibold">{cfg.cooldown_seconds}s Lockout</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-text-muted block text-xs">Banned Keywords:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(cfg.banned_keywords || []).slice(0, 5).map((kw) => (
                        <Badge key={kw} variant="danger">{kw}</Badge>
                      ))}
                      {(cfg.banned_keywords || []).length > 5 && (
                        <span className="text-xs text-text-muted">+{cfg.banned_keywords.length - 5} more</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                    <Button size="sm" variant="secondary" onClick={() => handleOpenEdit(cfg)} leftIcon={<Edit2 size={13} />}>
                      Edit
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDeleteConfig(cfg.id)} leftIcon={<Trash2 size={13} />}>
                      Delete
                    </Button>
                  </div>
                </Stack>
              </Card>
            ))}
          </Grid>
        )}

        {/* TAB 3: AUDIT TRAIL */}
        {activeSubTab === 'audit' && (
          <Card
            title="Violation & Intervention Audit History"
            subtitle="Chronological log of speech warnings, supervisor escalations, and eavesdrop actions."
          >
            {events.length === 0 ? (
              <div className="text-center py-12 text-text-muted">No audit events recorded yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell header>Time</TableCell>
                    {isSuperAdmin && <TableCell header>Tenant</TableCell>}
                    <TableCell header>Type</TableCell>
                    <TableCell header>Agent Ext</TableCell>
                    <TableCell header>Warning Count</TableCell>
                    <TableCell header>Transcript / Coaching</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="text-xs text-text-muted">{new Date(ev.created_at).toLocaleTimeString()}</TableCell>
                      {isSuperAdmin && (
                        <TableCell>
                          <Badge variant="neutral">
                            {getTenantBadgeLabel(ev.tenant_id)}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge
                          variant={
                            ev.event_type === 'escalation'
                              ? 'danger'
                              : ev.event_type === 'warning'
                              ? 'warning'
                              : 'info'
                          }
                        >
                          {(ev.event_type || 'warning').toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{ev.agent_extension || 'N/A'}</TableCell>
                      <TableCell>{ev.warn_count !== undefined ? `${ev.warn_count}` : '-'}</TableCell>
                      <TableCell className="text-sm max-w-md">
                        <p className="font-medium text-text-primary">{ev.coaching_message}</p>
                        {ev.transcript && (
                          <p className="text-xs text-text-muted italic mt-0.5">"{ev.transcript}"</p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        )}

        {/* Modal: Create / Edit Policy */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingConfig ? 'Edit Virtual QA Policy' : 'Create Virtual QA Bot Policy'}
          subtitle="Configure headless virtual extension, AI policy prompt, and warning thresholds."
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSaveConfig} isLoading={actionLoading === 'save'}>
                Save Policy
              </Button>
            </div>
          }
        >
          <form onSubmit={handleSaveConfig} className="space-y-4">
            {isSuperAdmin && (
              <FormField
                label="Assign to Tenant"
                required
                hint={
                  editingConfig
                    ? 'Tenant organization cannot be modified after policy creation'
                    : 'Select which tenant organization this QA Bot policy is provisioned for'
                }
              >
                {editingConfig ? (
                  <div className="px-3 py-2 bg-bg-surface-hover rounded-md border border-border text-sm font-medium flex items-center justify-between">
                    <span>
                      {editingConfig.tenant_name
                        ? `${editingConfig.tenant_name} (${editingConfig.tenant_domain})`
                        : getTenantBadgeLabel(editingConfig.tenant_id)}
                    </span>
                    <Badge variant="neutral">Assigned</Badge>
                  </div>
                ) : (
                  <Select
                    value={formData.tenant_id}
                    onChange={(e) => setFormData({ ...formData, tenant_id: e.target.value })}
                    required
                  >
                    <option value="" disabled>-- Select Target Tenant --</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.domain})
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
            )}

            <Grid cols={2} gap="4">
              <FormField label="Virtual QA Extension Number" required hint="Converted to headless virtual extension">
                <Input
                  value={formData.qa_extension_number}
                  onChange={(e) => setFormData({ ...formData, qa_extension_number: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="Supervisor Extension" hint="Short eavesdrop target (e.g. 9001)">
                <Input
                  value={formData.supervisor_extension}
                  onChange={(e) => setFormData({ ...formData, supervisor_extension: e.target.value })}
                  placeholder="9001"
                />
              </FormField>
            </Grid>

            <Grid cols={2} gap="4">
              <FormField label="Max Warning Retries" hint="Warnings before supervisor escalation">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={formData.max_warn_retries}
                  onChange={(e) => setFormData({ ...formData, max_warn_retries: Number(e.target.value) })}
                />
              </FormField>
              <FormField label="Cooldown Seconds" hint="Minimum lockout between warnings">
                <Input
                  type="number"
                  min={3}
                  max={120}
                  value={formData.cooldown_seconds}
                  onChange={(e) => setFormData({ ...formData, cooldown_seconds: Number(e.target.value) })}
                />
              </FormField>
            </Grid>

            <FormField label="Monitored Agent Extensions (Comma-separated)">
              <Input
                value={formData.monitored_agents}
                onChange={(e) => setFormData({ ...formData, monitored_agents: e.target.value })}
                placeholder="1001, 1002, 1003"
              />
            </FormField>

            <FormField label="Banned Keywords (Comma-separated)" hint="Strict word-boundary matching prevents substring false positives">
              <Input
                value={formData.banned_keywords}
                onChange={(e) => setFormData({ ...formData, banned_keywords: e.target.value })}
                placeholder="hell, damn, stupid, scam"
              />
            </FormField>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                AI Professional Policy Prompt (Google Gemini)
              </label>
              <textarea
                className="w-full rounded-md border border-border bg-bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                rows={3}
                value={formData.policy_prompt}
                onChange={(e) => setFormData({ ...formData, policy_prompt: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="qa_enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="qa_enabled" className="text-sm font-medium text-text-primary">
                Enable this Virtual QA bot policy
              </label>
            </div>
          </form>
        </Modal>

        {/* Modal: Interactive Speech Test & AI Compliance */}
        <Modal
          isOpen={isSimModalOpen}
          onClose={() => setIsSimModalOpen(false)}
          title="Test Agent Speech & Real-Time AI Coaching"
          subtitle={
            simCall
              ? `Call UUID: ${(simCall.call_uuid || '').slice(0, 8)}... | Agent: ${simCall.agent_extension} ↔ Customer: ${simCall.customer_extension || '2001'}`
              : 'Evaluate agent utterances against Gemini LLM and trigger live ElevenLabs whisper audio.'
          }
          footer={
            <div className="flex justify-between w-full items-center">
              <span className="text-xs text-text-muted">
                Current Warnings: <span className="font-semibold text-text-primary">{simCall?.warn_count ?? 0}</span>
                {simCall?.escalated && <span className="ml-1 text-danger font-semibold">(Escalated)</span>}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setIsSimModalOpen(false)}>Close</Button>
                <Button
                  variant="primary"
                  onClick={handleExecuteSimulation}
                  isLoading={simLoading}
                  leftIcon={<Send size={14} />}
                >
                  Evaluate with Gemini
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                Simulated Agent Utterance
              </label>
              <textarea
                className="w-full rounded-md border border-border bg-bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                rows={3}
                value={simUtterance}
                onChange={(e) => setSimUtterance(e.target.value)}
                placeholder="Enter what the agent says during the live call..."
              />
            </div>

            <div>
              <span className="text-xs text-text-muted block mb-1.5">Quick Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="px-2.5 py-1 text-xs rounded-full border border-border bg-bg-surface hover:bg-bg-surface-hover text-text-secondary transition-colors"
                  onClick={() => setSimUtterance('chal be hatt chutiye')}
                >
                  🤬 "chal be hatt chutiye" (Profanity / Insult)
                </button>
                <button
                  type="button"
                  className="px-2.5 py-1 text-xs rounded-full border border-border bg-bg-surface hover:bg-bg-surface-hover text-text-secondary transition-colors"
                  onClick={() => setSimUtterance('Deal with it yourself, I do not care about your problem.')}
                >
                  😤 "I do not care about your problem" (Rude)
                </button>
                <button
                  type="button"
                  className="px-2.5 py-1 text-xs rounded-full border border-border bg-bg-surface hover:bg-bg-surface-hover text-text-secondary transition-colors"
                  onClick={() => setSimUtterance('I guarantee 100% money back instantly within 5 minutes, no questions asked.')}
                >
                  ⚠️ "100% money back guaranteed" (Unauthorized Promise)
                </button>
                <button
                  type="button"
                  className="px-2.5 py-1 text-xs rounded-full border border-border bg-bg-surface hover:bg-bg-surface-hover text-text-secondary transition-colors"
                  onClick={() => setSimUtterance('Thank you for calling support! My name is John, how may I assist you today?')}
                >
                  ✅ "Thank you for calling support..." (Compliant)
                </button>
              </div>
            </div>

            {simResult && (
              <div
                className={`p-4 rounded-lg border text-sm space-y-2.5 ${
                  simResult.violation
                    ? 'border-danger/40 bg-danger/5'
                    : 'border-success/40 bg-success/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {simResult.violation ? (
                      <>
                        <AlertTriangle size={18} className="text-danger" />
                        <span className="font-semibold text-danger">Policy Violation Detected</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={18} className="text-success" />
                        <span className="font-semibold text-success">Compliant Utterance</span>
                      </>
                    )}
                  </div>
                  {simResult.result?.warn_count !== undefined && (
                    <Badge variant={simResult.result.escalated ? 'danger' : 'warning'}>
                      {simResult.result.escalated ? 'ESCALATED' : `Warning #${simResult.result.warn_count}`}
                    </Badge>
                  )}
                </div>

                <div>
                  <span className="text-xs text-text-muted block font-medium">Gemini Evaluation:</span>
                  <p className="text-text-primary text-xs mt-0.5">{simResult.reason || 'Evaluation completed'}</p>
                </div>

                {simResult.coaching && (
                  <div className="p-2.5 rounded bg-bg-surface border border-border text-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-primary font-medium">
                      <Volume2 size={14} />
                      <span>ElevenLabs Whisper Coaching Dispatched to Agent:</span>
                    </div>
                    <p className="text-text-primary italic">"{simResult.coaching}"</p>
                  </div>
                )}

                {simResult.result?.escalated && (
                  <div className="p-2 rounded bg-danger/10 border border-danger/30 text-xs text-danger font-medium flex items-center gap-1.5">
                    <PhoneForwarded size={14} />
                    <span>Supervisor extension {simResult.result?.action_data?.supervisor_ext || '9001'} notified for immediate call barge.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      </Stack>
    </PageContainer>
  );
};
