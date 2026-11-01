export interface Tenant {
  id: string;
  name: string;
  domain: string;
  sip_domain: string;
  timezone: string;
  enabled: boolean;
  max_extensions: number;
  max_concurrent_calls: number;
  created_at: string;
}

export interface Extension {
  id: string;
  tenant_id: string;
  extension_number: string;
  display_name: string;
  email?: string;
  caller_id_name?: string;
  caller_id_number?: string;
  outbound_caller_id?: string;
  enabled: boolean;
  webrtc_enabled: boolean;
  no_answer_timeout: number;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  tenant_id?: string;
  tenant_domain?: string;
  sip_domain?: string;
  allowed_modules?: string[];
  tenant?: {
    id?: string;
    name?: string;
    domain?: string;
    sip_domain?: string;
  };
}

export const MODULE_ALIASES: Record<string, string[]> = {
  'call-routing': ['call-routing', 'routing'],
  'ivr': ['ivr', 'ivrs'],
  'hunt-groups': ['hunt-groups', 'huntgroups'],
  'audio-prompts': ['audio-prompts', 'audio'],
  'call-forwarding': ['call-forwarding', 'callforwarding'],
  'call-block': ['call-block', 'callblock'],
  'business-hours': ['business-hours', 'businesshours'],
  'email-settings': ['email-settings', 'emailsettings'],
  'tenant-dids': ['tenant-dids', 'dids'],
  'tenant-trunks': ['tenant-trunks', 'trunks'],
  'tenant-users': ['tenant-users', 'users'],
};

export function isModuleAllowed(tab: string, allowedModules: string[] = []): boolean {
  if (!allowedModules || allowedModules.length === 0) return false;
  if (allowedModules.includes(tab) || allowedModules.includes('*')) return true;
  const aliases = MODULE_ALIASES[tab] || [];
  return aliases.some(alias => allowedModules.includes(alias));
}

export const normalizeModuleId = (mod: string): string => {
  for (const [stdId, aliases] of Object.entries(MODULE_ALIASES)) {
    if (aliases.includes(mod)) return stdId;
  }
  return mod;
};

export interface AuthState {
  token: string | null;
  user: User | null;
}

export interface SystemStatus {
  healthy: boolean;
  ready: boolean;
  database: 'connected' | 'disconnected' | 'unknown';
  redis: 'connected' | 'disconnected' | 'unknown';
}


export interface DaySchedule {
  enabled: boolean;
  open: string;
  close: string;
}

export interface WeeklySchedule {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
  [key: string]: DaySchedule;
}

export interface Holiday {
  id: string;
  business_hours_id: string;
  name: string;
  holiday_date: string;
  created_at?: string;
}

export interface BusinessHoursLiveStatus {
  status: 'OPEN' | 'CLOSED' | 'HOLIDAY';
  holiday_name?: string;
  current_time: string;
  current_date: string;
  timezone: string;
  active_destination: {
    type: string;
    target: string;
  };
}

export interface BusinessHours {
  id: string;
  tenant_id: string;
  name: string;
  timezone: string;
  schedule: WeeklySchedule;
  open_destination_type: string;
  open_destination_target: string;
  closed_destination_type: string;
  closed_destination_target: string;
  holiday_destination_type?: string;
  holiday_destination_target?: string;
  created_at: string;
  updated_at: string;
  tenant_name?: string;
  holiday_count?: number;
  holidays?: Holiday[];
  live_status?: BusinessHoursLiveStatus;
}


export interface SmtpSettings {
  id?: string;
  tenant_id?: string | null;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  from_email?: string;
  from_name?: string;
  use_tls?: boolean;
  configured: boolean;
  is_using_global_fallback: boolean;
  updated_at?: string;
}

export interface SmtpTestPayload {
  to_email: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  from_email?: string;
  from_name?: string;
  use_tls?: boolean;
  tenant_id?: string;
}

export interface VirtualQAConfig {
  id: string;
  tenant_id: string;
  qa_extension_id: string;
  qa_extension_number?: string;
  qa_extension_name?: string;
  max_warn_retries: number;
  cooldown_seconds: number;
  supervisor_extension?: string;
  monitored_agents: string[];
  monitored_callers: string[];
  policy_prompt?: string;
  banned_keywords: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface QAActiveCall {
  call_uuid: string;
  tenant_id: string;
  agent_extension: string;
  customer_extension: string;
  agent_leg: string;
  warn_count: number;
  escalated: boolean;
  started_at: number;
}

export interface QAEvent {
  id: string;
  tenant_id: string;
  call_uuid: string;
  event_type: 'warning' | 'escalation' | 'intervention';
  agent_extension?: string;
  warn_count?: number;
  transcript?: string;
  coaching_message?: string;
  audio_file_path?: string;
  details?: any;
  created_at: string;
}

export interface QAEscalationPayload {
  event_type: 'qa.escalation';
  call_uuid: string;
  tenant_id: string;
  agent_extension: string;
  customer_extension: string;
  supervisor_extension?: string;
  warn_count: number;
  max_warn_retries: number;
  reason?: string;
  coaching?: string;
  transcript?: string;
  timestamp: number | string;
}
