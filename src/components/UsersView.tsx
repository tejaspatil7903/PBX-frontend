import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import type { User as UserType } from '../types';
import { normalizeModuleId } from '../types';
import { UserPlus, RefreshCw, Trash2, Settings } from 'lucide-react';

// Design System imports
import { ListPageLayout } from './layout';
import { Stack, Inline, Grid } from './layout/Stack';
import { Button, Badge, Alert, Modal, FormField, Input, Select, Checkbox } from './ui';
import { DataTable, FilterBar } from './patterns';
import type { Column } from './patterns';

const AVAILABLE_MODULES = [
  { id: 'dashboard', label: 'Dashboard Overview', desc: 'KPI metrics & status' },
  { id: 'tenant-users', label: 'Admins & Users', desc: 'Tenant user administration' },
  { id: 'extensions', label: 'SIP Extensions', desc: 'Extension provisioning' },
  { id: 'tenant-dids', label: 'Assigned Inbound DIDs', desc: 'Inbound phone numbers' },
  { id: 'tenant-trunks', label: 'Gateways / Trunks', desc: 'Upstream gateway routing' },
  { id: 'call-routing', label: 'Call Routing & Outbound', desc: 'Dialplan and routing' },
  { id: 'queues', label: 'Call Queues & ACD', desc: 'Queue distribution' },
  { id: 'hunt-groups', label: 'Ring / Hunt Groups', desc: 'Multi-extension ringing' },
  { id: 'ivr', label: 'IVR Flows & Auto-Attendant', desc: 'Interactive voice response' },
  { id: 'voicemail', label: 'Voicemail & Recording', desc: 'Voicemail boxes' },
  { id: 'call-forwarding', label: 'Call Forwarding Rules', desc: 'Call redirection rules' },
  { id: 'audio-prompts', label: 'Audio Prompts Library', desc: 'WAV prompts & greetings' },
  { id: 'conferences', label: 'Conference Bridges', desc: 'Multi-party conferencing' },
  { id: 'call-block', label: 'Call Blocking / Blacklist', desc: 'Inbound spam rejection' },
  { id: 'business-hours', label: 'Business Hours & Time', desc: 'Schedule-based rules' },
  { id: 'contacts', label: 'Phonebook Contacts', desc: 'Shared contacts directory' },
  { id: 'email-settings', label: 'SMTP & Notifications', desc: 'Email alerts configuration' },
  { id: 'virtual-qa', label: 'Virtual QA & Coaching', desc: 'Real-time AI monitoring & agent coaching' },
  { id: 'reports', label: 'CDR & Analytics', desc: 'Call detail records & analytics' },
  // Global only modules (Super Admin)
  { id: 'tenants', label: 'Tenants Registry (Global)', desc: 'Platform tenant provisioning', globalOnly: true },
  { id: 'users', label: 'Global Platform Users', desc: 'Superadmin user management', globalOnly: true },
  { id: 'trunks', label: 'Global SIP Trunks', desc: 'Global trunk inventory', globalOnly: true },
  { id: 'dids', label: 'Global DID Inventory', desc: 'Global DID pool management', globalOnly: true },
  { id: 'xmlcurl', label: 'FreeSWITCH Console', desc: 'FreeSWITCH XML Debugger', globalOnly: true },
];

interface UsersViewProps {
  token: string;
  currentUser?: UserType | null;
  tenantScoped?: boolean;
}

export const UsersView: React.FC<UsersViewProps> = ({ token, currentUser, tenantScoped = false }) => {
  const [users, setUsers] = useState<UserType[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [tenantFilter, setTenantFilter] = useState<string>('');

  // Create User Form
  const [showModal, setShowModal] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState(tenantScoped ? 'SUB_ADMIN' : 'TENANT_ADMIN');
  const [targetTenantId, setTargetTenantId] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);

  // Permissions Modal
  const [permModalUser, setPermModalUser] = useState<UserType | null>(null);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const modulesList = tenantScoped
    ? AVAILABLE_MODULES.filter((m) => !(m as any).globalOnly)
    : AVAILABLE_MODULES;

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [uRes, tRes] = await Promise.allSettled([
        apiService.getUsers(token),
        currentUser?.role === 'SUPER_ADMIN' ? apiService.getTenants(token) : Promise.resolve([])
      ]);
      if (uRes.status === 'fulfilled') setUsers(uRes.value);
      if (tRes.status === 'fulfilled') setTenants(tRes.value);
    } catch (err: any) {
      setError(err.message || 'Failed to load user accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    if (newRole === 'SUPER_ADMIN') {
      setTargetTenantId('');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      if (!tenantScoped && currentUser?.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN' && !targetTenantId) {
        throw new Error('Please select an assigned tenant for this user account.');
      }

      const payload: any = {
        username,
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        role,
      };

      if (!tenantScoped && currentUser?.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN' && targetTenantId) {
        payload.tenant_id = targetTenantId;
      } else {
        const resolvedTenantId = currentUser?.tenant_id || (currentUser as any)?.tenant?.id;
        if (resolvedTenantId) {
          payload.tenant_id = resolvedTenantId;
        }
      }

      if (role === 'SUB_ADMIN') {
        payload.allowed_modules = selectedModules;
      }

      await apiService.createUser(token, payload);
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create user account');
      setLoading(false);
    }
  };

  const resetForm = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setFirstName('');
    setLastName('');
    setRole(tenantScoped ? 'SUB_ADMIN' : 'TENANT_ADMIN');
    setTargetTenantId('');
    setSelectedModules([]);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to deactivate/delete this user?')) return;
    try {
      setLoading(true);
      await apiService.deleteUser(token, id);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
      setLoading(false);
    }
  };

  const openPermModal = (user: UserType) => {
    setPermModalUser(user);
    const existing = user.allowed_modules || [];
    const normalized = existing.map(normalizeModuleId);
    setEditModules(Array.from(new Set(normalized)));
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permModalUser) return;
    setSavingPerms(true);
    try {
      await apiService.updateUserPermissions(token, permModalUser.id, editModules);
      setPermModalUser(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update permissions');
    } finally {
      setSavingPerms(false);
    }
  };

  const toggleModule = (id: string) => {
    setSelectedModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const toggleEditModule = (id: string) => {
    setEditModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const filteredUsers = users.filter((u) => {
    if (tenantScoped && currentUser?.tenant_id && u.tenant_id !== currentUser.tenant_id) {
      return false;
    }
    const matchesSearch =
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.first_name && u.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.last_name && u.last_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRole = roleFilter ? u.role === roleFilter : true;
    const matchesTenant = tenantFilter
      ? (tenantFilter === 'global' ? (!u.tenant_id || u.tenant_id === 'global') : u.tenant_id === tenantFilter)
      : true;
    return matchesSearch && matchesRole && matchesTenant;
  });

  const columns: Column<UserType>[] = [
    {
      key: 'username',
      header: 'Username',
      sortable: true,
      render: (u) => (
        <div>
          <strong className="font-semibold text-[var(--pbx-text-primary)]">{u.username}</strong>
          {(u.first_name || u.last_name) && (
            <div className="text-xs text-[var(--pbx-text-muted)]">
              {u.first_name} {u.last_name}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (u) => u.email,
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      render: (u) => {
        const variants: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'neutral'> = {
          SUPER_ADMIN: 'danger' as any,
          TENANT_ADMIN: 'primary',
          SUB_ADMIN: 'info',
          SUPERVISOR: 'warning',
          AGENT: 'neutral',
        };
        return <Badge variant={variants[u.role] || 'neutral'}>{u.role}</Badge>;
      },
    },
    ...(currentUser?.role === 'SUPER_ADMIN'
      ? [
          {
            key: 'tenant',
            header: 'Tenant',
            render: (u: UserType) => {
              if (u.role === 'SUPER_ADMIN' || !u.tenant_id) return <span className="text-[var(--pbx-text-muted)]">Global</span>;
              const t = tenants.find((tnt) => tnt.id === u.tenant_id);
              return t ? t.name : u.tenant_domain || u.tenant_id;
            },
          },
        ]
      : []),
    {
      key: 'modules',
      header: 'Access Scope',
      render: (u) => {
        if (u.role === 'SUPER_ADMIN') return <span className="text-xs text-[var(--pbx-text-muted)]">Full System Access</span>;
        if (u.role === 'TENANT_ADMIN') return <span className="text-xs text-[var(--pbx-text-muted)]">Full Tenant Suite</span>;
        if (u.role === 'SUB_ADMIN') {
          const count = u.allowed_modules?.length || 0;
          return <span className="text-xs text-[var(--pbx-action-primary)] font-medium">{count} module(s) granted</span>;
        }
        return <span className="text-xs text-[var(--pbx-text-muted)]">Standard Access</span>;
      },
    },
  ];

  return (
    <ListPageLayout
      title={tenantScoped ? 'Tenant Admins & Users' : 'Global User Administration'}
      subtitle={
        tenantScoped
          ? 'Manage sub-administrators, supervisors, and extension agents for your tenant'
          : 'Provision platform super admins, tenant master administrators, and configure RBAC policies'
      }
      eyebrow={tenantScoped ? 'TENANT USER DIRECTORY' : 'PLATFORM RBAC MANAGEMENT'}
      actions={
        <Inline gap="3">
          <Button variant="secondary" onClick={fetchData} isLoading={loading} leftIcon={<RefreshCw size={14} />}>
            Refresh List
          </Button>
          <Button variant="primary" onClick={() => setShowModal(true)} leftIcon={<UserPlus size={16} />}>
            Provision User Account
          </Button>
        </Inline>
      }
      alert={error ? <Alert variant="danger" title="User Management Notice">{error}</Alert> : undefined}
      filterBar={
        <FilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search username, email, name..."
          filters={
            <Inline gap="3">
              <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-40">
                <option value="">All Roles</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                <option value="TENANT_ADMIN">TENANT_ADMIN</option>
                <option value="SUB_ADMIN">SUB_ADMIN</option>
                <option value="SUPERVISOR">SUPERVISOR</option>
                <option value="AGENT">AGENT</option>
              </Select>

              {!tenantScoped && currentUser?.role === 'SUPER_ADMIN' && tenants.length > 0 && (
                <Select value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} className="w-48">
                  <option value="">All Tenants & Global</option>
                  <option value="global">Global (No Tenant)</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              )}
            </Inline>
          }
        />
      }
    >
      <DataTable
        columns={columns}
        data={filteredUsers}
        isLoading={loading}
        emptyTitle="No user accounts found"
        emptyDescription="Click 'Provision User Account' to create a new user profile."
        actions={(u) => (
          <Inline gap="2" justify="center" wrap={false}>
            {u.role === 'SUB_ADMIN' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openPermModal(u)}
                title="Configure Accessible Modules"
              >
                <Settings size={14} />
              </Button>
            )}
            {currentUser?.id !== u.id && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(u.id)}
                title="Deactivate Account"
              >
                <Trash2 size={14} />
              </Button>
            )}
          </Inline>
        )}
      />

      {/* Create User Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title="Provision User Account"
        subtitle="Create a new authentication profile and assign RBAC permissions"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }}>
              Cancel
            </Button>
            <Button type="submit" form="create-user-form" variant="primary" isLoading={loading}>
              Create User Account
            </Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={handleCreate}>
          <Stack gap="4">
            <Grid cols={2} gap="4">
              <FormField label="First Name">
                <Input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" />
              </FormField>
              <FormField label="Last Name">
                <Input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
              </FormField>
            </Grid>

            <FormField label="Username" required>
              <Input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="johndoe" required />
            </FormField>

            <FormField label="Email Address" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@company.com" required />
            </FormField>

            <FormField label="Password" required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="SecretPassword123!" required />
            </FormField>

            <FormField label="Role" required>
              <Select value={role} onChange={(e) => handleRoleChange(e.target.value)}>
                {!tenantScoped && currentUser?.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">SUPER_ADMIN</option>}
                <option value="TENANT_ADMIN">TENANT_ADMIN</option>
                <option value="SUB_ADMIN">SUB_ADMIN (Custom Modules)</option>
                <option value="SUPERVISOR">SUPERVISOR</option>
                <option value="AGENT">AGENT</option>
              </Select>
            </FormField>

            {!tenantScoped && currentUser?.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN' && (
              <FormField label="Assign to Tenant" required hint="Select which tenant organization this account belongs to">
                <Select
                  value={targetTenantId}
                  onChange={(e) => setTargetTenantId(e.target.value)}
                  required
                >
                  <option value="">-- Select Target Tenant --</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.domain})
                    </option>
                  ))}
                </Select>
              </FormField>
            )}

            {role === 'SUB_ADMIN' && (
              <FormField label="Allowed Modules">
                <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto">
                  {modulesList.map((m) => (
                    <Checkbox
                      key={m.id}
                      label={m.label}
                      checked={selectedModules.includes(m.id)}
                      onChange={() => toggleModule(m.id)}
                    />
                  ))}
                </div>
              </FormField>
            )}
          </Stack>
        </form>
      </Modal>

      {/* Edit Permissions Modal */}
      <Modal
        isOpen={!!permModalUser}
        onClose={() => setPermModalUser(null)}
        title={`Configure Sub-Admin Permissions: ${permModalUser?.username}`}
        subtitle="Select accessible modules for this sub-admin"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPermModalUser(null)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-perms-form" variant="primary" isLoading={savingPerms}>
              Save Permissions
            </Button>
          </>
        }
      >
        <form id="edit-perms-form" onSubmit={handleSavePermissions}>
          <Stack gap="3">
            <div className="grid grid-cols-2 gap-2">
              {modulesList.map((m) => (
                <Checkbox
                  key={m.id}
                  label={m.label}
                  checked={editModules.includes(m.id)}
                  onChange={() => toggleEditModule(m.id)}
                />
              ))}
            </div>
          </Stack>
        </form>
      </Modal>
    </ListPageLayout>
  );
};
