
export function parseErrorDetail(errData: any, fallback: string): string {
  if (!errData) return fallback;
  const detail = errData.detail || errData.message;
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => {
      const field = d.loc ? d.loc.filter((x: string) => x !== 'body').join('.') : '';
      return field ? `${field}: ${d.msg}` : (d.msg || JSON.stringify(d));
    }).join('; ');
  }
  if (typeof detail === 'object') {
    return JSON.stringify(detail);
  }
  return String(detail);
}

import type { Tenant, Extension, User, SystemStatus } from '../types';

let API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

export const getApiBaseUrl = () => API_BASE_URL;
export const setApiBaseUrl = (url: string) => {
  API_BASE_URL = url.replace(/\/$/, '');
};

const getHeaders = (token?: string | null, isForm = false) => {
  const headers: Record<string, string> = {};
  if (!isForm) {
    headers['Content-Type'] = 'application/json';
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

const customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await globalThis.fetch(input, init);
  if (response.status === 401) {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!urlStr.includes('/auth/login') && !urlStr.includes('/auth/seed-superadmin') && !urlStr.includes('/health')) {
      window.dispatchEvent(new CustomEvent('pbx:session-expired'));
    }
  }
  return response;
};

const fetch = customFetch;

export const apiService = {
  // System Health
  async checkHealth(): Promise<SystemStatus> {
    try {
      const hRes = await fetch(`${API_BASE_URL}/health`);
      const hData = await hRes.json();
      const rRes = await fetch(`${API_BASE_URL}/ready`);
      const rData = await rRes.json();
      return {
        healthy: hRes.ok && hData.status === 'healthy',
        ready: rRes.ok && rData.status === 'ready',
        database: rData.components?.database || 'disconnected',
        redis: rData.components?.redis || 'disconnected',
      };
    } catch {
      return { healthy: false, ready: false, database: 'disconnected', redis: 'disconnected' };
    }
  },

  // Auth
  async seedSuperAdmin(payload: { username: string; email: string; password: string }) {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/seed-superadmin`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to seed super admin' }));
      throw new Error(parseErrorDetail(err, 'Failed to seed super admin'));
    }
    return res.json();
  },

  async login(payload: { username_or_email: string; password: string }) {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Authentication failed');
    }
    return res.json() as Promise<{ access_token: string; user: User }>;
  },

  async getMe(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/me`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Invalid token');
    return res.json() as Promise<User>;
  },

  // Tenants
  async getTenants(token: string): Promise<Tenant[]> {
    const res = await fetch(`${API_BASE_URL}/api/v1/tenants`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch tenants');
    return res.json();
  },

  async createTenant(token: string, payload: { name: string; domain: string; sip_domain: string }) {
    const res = await fetch(`${API_BASE_URL}/api/v1/tenants`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to create tenant');
    }
    return res.json() as Promise<Tenant>;
  },

  async updateTenant(token: string, id: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/tenants/${id}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update tenant' }));
      throw new Error(parseErrorDetail(err, 'Failed to update tenant'));
    }
    return res.json();
  },

  async toggleTenantStatus(token: string, id: string, enabled: boolean) {
    const res = await fetch(`${API_BASE_URL}/api/v1/tenants/${id}/status`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error('Failed to update status');
    return res.json();
  },

  async deleteTenant(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/tenants/${id}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to delete tenant');
    }
  },

  // Extensions
  async getExtensions(token: string): Promise<Extension[]> {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch extensions');
    return res.json();
  },

  async createExtension(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create extension' }));
      throw new Error(parseErrorDetail(err, 'Failed to create extension'));
    }
    return res.json();
  },

  async resetExtensionPassword(token: string, extensionId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/${extensionId}/reset-password`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to reset password' }));
      throw new Error(parseErrorDetail(err, 'Failed to reset password'));
    }
    return res.json();
  },

  async updateExtension(token: string, extensionId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/${extensionId}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update extension' }));
      throw new Error(parseErrorDetail(err, 'Failed to update extension'));
    }
    return res.json();
  },

  async deleteExtension(token: string, extensionId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/${extensionId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to delete extension' }));
      throw new Error(parseErrorDetail(err, 'Failed to delete extension'));
    }
  },

  async deleteVoicemailBox(token: string, extensionId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/${extensionId}/voicemail`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to delete voicemail box' }));
      throw new Error(parseErrorDetail(err, 'Failed to delete voicemail box'));
    }
  },

  async updateExtensionSettings(token: string, extensionId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/${extensionId}/settings`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },

  // DIDs
  async getDids(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/dids`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch DIDs');
    return res.json();
  },

  async createDid(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/dids`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to create DID');
    }
    return res.json();
  },

  async assignDid(token: string, didId: string, tenantId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/dids/${didId}/assign`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    if (!res.ok) throw new Error('Failed to assign DID');
    return res.json();
  },

  async unassignDid(token: string, didId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/dids/${didId}/unassign`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to unassign DID');
    return res.json();
  },

  async updateDid(token: string, didId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/dids/${didId}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update DID' }));
      throw new Error(parseErrorDetail(err, 'Failed to update DID'));
    }
    return res.json();
  },

  async deleteDid(token: string, didId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/dids/${didId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete DID');
  },

  // Routing Rules CRUD
  async getRoutes(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/routing`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch routes');
    return res.json();
  },

  async createRoute(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/routing`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to create route');
    }
    return res.json();
  },

  async updateRoute(token: string, routeId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/routing/${routeId}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to update route');
    }
    return res.json();
  },

  async deleteRoute(token: string, routeId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/routing/${routeId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete route');
  },

  async getInternalRoutingPolicy(token: string, tenantId?: string) {
    const query = tenantId ? `?tenant_id=${tenantId}` : '';
    const res = await fetch(`${API_BASE_URL}/api/v1/routing/internal-policy${query}`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch internal routing policy');
    return res.json();
  },

  async updateInternalRoutingPolicy(token: string, allowInternalCalls: boolean, tenantId?: string) {
    const query = tenantId ? `?tenant_id=${tenantId}` : '';
    const res = await fetch(`${API_BASE_URL}/api/v1/routing/internal-policy${query}`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ allow_internal_calls: allowInternalCalls }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to update internal routing policy');
    }
    return res.json();
  },

  // Queues CRUD
  async getQueues(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/queues`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch queues');
    return res.json();
  },

  async createQueue(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/queues`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to create queue');
    }
    return res.json();
  },

  async updateQueue(token: string, queueId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/queues/${queueId}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update queue');
    return res.json();
  },

  async deleteQueue(token: string, queueId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/queues/${queueId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete queue');
  },

  // Reports Endpoints
  async getCdrReport(token: string, tenantId?: string, startDate?: string, endDate?: string, direction?: string, disposition?: string) {
    const params = new URLSearchParams();
    if (tenantId) params.append('tenant_id', tenantId);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (direction && direction !== 'all') params.append('direction', direction);
    if (disposition && disposition !== 'all') params.append('disposition', disposition);
    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/v1/reports/cdr${queryString ? `?${queryString}` : ''}`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch CDR report');
    return res.json();
  },

  async getDispositionSummaryReport(token: string, tenantId?: string, startDate?: string, endDate?: string, direction?: string) {
    const params = new URLSearchParams();
    if (tenantId) params.append('tenant_id', tenantId);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (direction && direction !== 'all') params.append('direction', direction);
    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/v1/reports/disposition-summary${queryString ? `?${queryString}` : ''}`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch disposition summary');
    return res.json();
  },

  async getInternalReport(token: string, tenantId?: string, startDate?: string, endDate?: string) {
    let url = `${API_BASE_URL}/api/v1/reports/internal?`;
    if (tenantId) url += `&tenant_id=${tenantId}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch internal report');
    return res.json();
  },

  async getOutboundReport(token: string, tenantId?: string, startDate?: string, endDate?: string) {
    let url = `${API_BASE_URL}/api/v1/reports/outbound?`;
    if (tenantId) url += `&tenant_id=${tenantId}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch outbound report');
    return res.json();
  },

  async getRecordingsReport(token: string, tenantId?: string) {
    let url = `${API_BASE_URL}/api/v1/reports/recordings?`;
    if (tenantId) url += `&tenant_id=${tenantId}`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch recordings');
    return res.json();
  },

  async getDashboardMetrics(token: string, tenantId?: string) {
    let url = `${API_BASE_URL}/api/v1/reports/dashboard-metrics`;
    if (tenantId) url += `?tenant_id=${tenantId}`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch dashboard metrics');
    return res.json();
  },

  async getTenantSummaryReport(token: string, startDate?: string, endDate?: string) {
    let url = `${API_BASE_URL}/api/v1/reports/tenant-summary?`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch tenant summary report');
    return res.json();
  },

  getVoicemailAudioUrl(messageId: string): string {
    return `${API_BASE_URL}/api/v1/reports/voicemail/${messageId}/audio`;
  },

  async getVoicemailReport(token: string, extensionNumber?: string, isRead?: boolean, startDate?: string, endDate?: string) {
    let url = `${API_BASE_URL}/api/v1/reports/voicemail?`;
    if (extensionNumber) url += `&extension_number=${extensionNumber}`;
    if (isRead !== undefined) url += `&is_read=${isRead}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch voicemail report');
    return res.json();
  },

  async toggleVoicemailRead(token: string, messageId: string, read: boolean) {
    const res = await fetch(`${API_BASE_URL}/api/v1/reports/voicemail/${messageId}/read?read=${read}`, {
      method: 'PATCH',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to update voicemail read status');
    return res.json();
  },

  async deleteVoicemailMessage(token: string, messageId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/reports/voicemail/${messageId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete voicemail message');
    return res.json();
  },

  async updateExtensionTimeout(token: string, extensionId: string, timeout: number) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/${extensionId}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify({ no_answer_timeout: timeout }),
    });
    if (!res.ok) throw new Error('Failed to update extension timeout');
    return res.json();
  },

  // Audio Files Endpoints
  async getAudioFiles(token: string, tenantId?: string) {
    let url = `${API_BASE_URL}/api/v1/audio?`;
    if (tenantId) url += `&tenant_id=${tenantId}`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch audio files');
    return res.json();
  },

  async deleteAudioFile(token: string, fileId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/audio/${fileId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete audio file');
    return true;
  },

  async uploadAudioFile(token: string, formData: FormData) {
    const res = await fetch(`${API_BASE_URL}/api/v1/audio/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload audio file');
    return res.json();
  },

  // Hunt Groups, IVR, Trunks, Gateways, Users
  async getHuntGroups(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/hunt-groups`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch hunt groups');
    return res.json();
  },
  async updateHuntGroup(token: string, id: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/hunt-groups/${id}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to update hunt group'); }
    return res.json();
  },

  async deleteHuntGroup(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/hunt-groups/${id}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete hunt group');
    return true;
  },

  async createHuntGroup(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/hunt-groups`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to create hunt group'); }
    return res.json();
  },
  async getIvrs(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/ivr`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch IVRs');
    return res.json();
  },
  async getIvrDetails(token: string, ivrId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/ivr/${ivrId}`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch IVR details');
    return res.json();
  },
  async createIvr(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/ivr`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create IVR');
    return res.json();
  },
  async updateIvr(token: string, ivrId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/ivr/${ivrId}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update IVR');
    return res.json();
  },
  async deleteIvr(token: string, ivrId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/ivr/${ivrId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete IVR');
  },
  async getIvrNodes(token: string, ivrId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/ivr/${ivrId}/nodes`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch IVR key nodes');
    return res.json();
  },
  async upsertIvrNode(token: string, ivrId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/ivr/${ivrId}/nodes`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to save DTMF key action');
    return res.json();
  },
  async deleteIvrNode(token: string, ivrId: string, nodeId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/ivr/${ivrId}/nodes/${nodeId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete DTMF key action');
  },
  async getTrunks(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/trunks`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch trunks');
    return res.json();
  },
  async createTrunk(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/trunks`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create trunk');
    return res.json();
  },
  async updateTrunk(token: string, trunkId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/trunks/${trunkId}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update trunk');
    return res.json();
  },
  async deleteTrunk(token: string, trunkId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/trunks/${trunkId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete trunk');
  },
  async getGateways(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/gateways`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error('Failed to fetch gateways');
    return res.json();
  },
  async createGateway(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/gateways`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create gateway');
    return res.json();
  },
  async updateGateway(token: string, gatewayId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/gateways/${gatewayId}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update gateway');
    return res.json();
  },
  async deleteGateway(token: string, gatewayId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/gateways/${gatewayId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete gateway');
  },
  async assignGateway(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/gateways/assign`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to assign gateway');
    return res.json();
  },
  async getUsers(token: string, tenantId?: string): Promise<User[]> {
    const hasValidTenant = tenantId && tenantId !== 'undefined' && tenantId !== 'null' && tenantId.trim().length > 0;
    const url = hasValidTenant ? `${API_BASE_URL}/api/v1/users?tenant_id=${tenantId}` : `${API_BASE_URL}/api/v1/users`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(parseErrorDetail(err, 'Failed to fetch users'));
    }
    return res.json();
  },
  async createUser(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/users`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(parseErrorDetail(err, 'Failed to create user'));
    }
    return res.json();
  },
  async deleteUser(token: string, userId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete user');
  },
  async testXmlCurl(domain: string, user: string): Promise<string> {
    const body = new URLSearchParams();
    body.append('section', 'directory');
    body.append('domain', domain);
    body.append('user', user);
    const res = await fetch(`${API_BASE_URL}/freeswitch/xml`, {
      method: 'POST',
      headers: getHeaders(null, true),
      body: body.toString(),
    });
    return res.text();
  },

  // ─── Call Forwarding ────────────────────────────────────────────────────────
  async getCallForwardingAll(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/call-forwarding/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch call forwarding rules');
    return res.json();
  },

  async getExtensionForwarding(token: string, extensionId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/${extensionId}/forwarding`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch extension forwarding');
    return res.json();
  },

  async updateExtensionForwarding(token: string, extensionId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/${extensionId}/forwarding`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to update extension forwarding'); }
    return res.json();
  },

  async deleteExtensionForwarding(token: string, extensionId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/${extensionId}/forwarding`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to delete call forwarding rule'); }
    return res.json();
  },

  // ─── Voicemail Boxes ────────────────────────────────────────────────────────
  async getVoicemailBoxesAll(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/voicemail-boxes/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch voicemail boxes');
    return res.json();
  },

  async getExtensionVoicemail(token: string, extensionId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/${extensionId}/voicemail`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch extension voicemail');
    return res.json();
  },

  async updateExtensionVoicemail(token: string, extensionId: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/extensions/${extensionId}/voicemail`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to update extension voicemail'); }
    return res.json();
  },

  // ─── Sub-Admin Permissions ──────────────────────────────────────────────────
  async updateUserPermissions(token: string, userId: string, allowed_modules: string[]) {
    const res = await fetch(`${API_BASE_URL}/api/v1/users/${userId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ allowed_modules }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: 'Failed to update user permissions' }));
      throw new Error(errData.detail || 'Failed to update user permissions');
    }
    return res.json();
  },

  // ─── Conferences ─────────────────────────────────────────────────────────────
  async getConferences(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/conferences`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch conferences');
    return res.json();
  },

  async createConference(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/conferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create conference');
    }
    return res.json();
  },

  async updateConference(token: string, id: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/conferences/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update conference');
    }
    return res.json();
  },

  async deleteConference(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/conferences/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) throw new Error('Failed to delete conference');
    return true;
  },

  async getLiveConferences(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/conferences/live`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch live conference status');
    return res.json();
  },

  async getConferenceLive(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/conferences/${id}/live`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch conference live status');
    return res.json();
  },

  async terminateConference(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/conferences/${id}/terminate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to terminate conference');
    }
    return res.json();
  },

  async kickConferenceMember(token: string, id: string, memberId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/conferences/${id}/kick/${memberId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to drop participant');
    }
    return res.json();
  },

  // ─── Call Block (Blacklist) ──────────────────────────────────────────────────
  async getCallBlocks(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/call-block`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch call block entries');
    return res.json();
  },

  async createCallBlock(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/call-block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to add call block entry');
    }
    return res.json();
  },

  async updateCallBlock(token: string, id: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/call-block/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update call block entry');
    }
    return res.json();
  },

  async deleteCallBlock(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/call-block/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) throw new Error('Failed to delete call block entry');
    return true;
  },

  // ─── Contacts Directory ─────────────────────────────────────────────────────
  async getContacts(token: string, search?: string) {
    const url = search 
      ? `${API_BASE_URL}/api/v1/contacts?search=${encodeURIComponent(search)}`
      : `${API_BASE_URL}/api/v1/contacts`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch contacts');
    return res.json();
  },

  async createContact(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create contact');
    }
    return res.json();
  },

  async updateContact(token: string, id: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/contacts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update contact');
    }
    return res.json();
  },

  async deleteContact(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/contacts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) throw new Error('Failed to delete contact');
    return true;
  },

  // Business Hours & Time Conditions API
  async getBusinessHours(token: string, tenantId?: string) {
    const url = tenantId
      ? `${API_BASE_URL}/api/v1/business-hours?tenant_id=${tenantId}`
      : `${API_BASE_URL}/api/v1/business-hours`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch business hours');
    return res.json();
  },

  async getBusinessHoursDetails(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/business-hours/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch business hours details');
    return res.json();
  },

  async createBusinessHours(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/business-hours`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create business hours schedule');
    }
    return res.json();
  },

  async updateBusinessHours(token: string, id: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/business-hours/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update business hours schedule');
    }
    return res.json();
  },

  async deleteBusinessHours(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/business-hours/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to delete business hours schedule');
    }
    return true;
  },

  async getBusinessHoursStatus(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/business-hours/${id}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch live business hours status');
    return res.json();
  },

  async addHoliday(token: string, id: string, payload: { name: string; holiday_date: string }) {
    const res = await fetch(`${API_BASE_URL}/api/v1/business-hours/${id}/holidays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to add holiday date');
    }
    return res.json();
  },

  async deleteHoliday(token: string, id: string, holidayId: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/business-hours/${id}/holidays/${holidayId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) throw new Error('Failed to delete holiday date');
    return true;
  },

  // ─── SMTP Email Settings ──────────────────────────────────────────────────
  async getSmtpSettings(token: string, tenantId?: string) {
    let url = `${API_BASE_URL}/api/v1/settings/smtp`;
    if (tenantId) url += `?tenant_id=${tenantId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch SMTP settings');
    }
    return res.json();
  },

  async updateSmtpSettings(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/settings/smtp`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update SMTP settings');
    }
    return res.json();
  },

  async deleteSmtpSettings(token: string, tenantId?: string) {
    let url = `${API_BASE_URL}/api/v1/settings/smtp`;
    if (tenantId) url += `?tenant_id=${tenantId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to reset SMTP settings');
    }
    return res.json();
  },

  async testSmtpConnection(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/settings/smtp/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  // Virtual QA & Monitoring
  async getQAConfigs(token: string, tenantId?: string) {
    const query = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
    const res = await fetch(`${API_BASE_URL}/api/v1/qa/configs${query}`, {
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to fetch Virtual QA configs');
    return res.json();
  },

  async createQAConfig(token: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/qa/configs`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create Virtual QA config');
    }
    return res.json();
  },

  async updateQAConfig(token: string, id: string, payload: any) {
    const res = await fetch(`${API_BASE_URL}/api/v1/qa/configs/${id}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update Virtual QA config');
    }
    return res.json();
  },

  async deleteQAConfig(token: string, id: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/qa/configs/${id}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to delete Virtual QA config');
    return res.json();
  },

  async getQAActiveCalls(token: string, tenantId?: string) {
    const query = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
    const res = await fetch(`${API_BASE_URL}/api/v1/qa/active-calls${query}`, {
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to fetch active monitored calls');
    return res.json();
  },

  async interveneQACall(token: string, callUuid: string, mode: 'listen' | 'whisper' | 'barge' = 'whisper') {
    const res = await fetch(`${API_BASE_URL}/api/v1/qa/calls/${callUuid}/intervene?mode=${mode}`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to initiate intervention');
    }
    return res.json();
  },

  async startQADemoCall(token: string, payload?: { tenant_id?: string; agent_extension?: string; customer_extension?: string }) {
    const res = await fetch(`${API_BASE_URL}/api/v1/qa/calls/start-demo`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to start demo call');
    }
    return res.json();
  },

  async simulateQAViolation(token: string, callUuid: string, utterance?: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/qa/calls/${callUuid}/simulate-violation`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ utterance }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to simulate QA violation');
    }
    return res.json();
  },

  async getQAEvents(token: string, params?: { call_uuid?: string; event_type?: string; tenant_id?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (params?.call_uuid) query.append('call_uuid', params.call_uuid);
    if (params?.event_type) query.append('event_type', params.event_type);
    if (params?.tenant_id) query.append('tenant_id', params.tenant_id);
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.offset) query.append('offset', String(params.offset));

    const res = await fetch(`${API_BASE_URL}/api/v1/qa/events?${query.toString()}`, {
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to fetch QA events');
    return res.json();
  },
};

