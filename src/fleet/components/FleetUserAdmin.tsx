import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { F } from '../lib/fleetColors'
import type { FleetUser, FleetRole } from '../lib/fleetTypes'

const ROLES: FleetRole[] = ['admin', 'manager', 'remover', 'installer', 'qc']
const ROLE_COLOR: Record<FleetRole, string> = {
  admin: F.yellow, manager: F.accentLight, remover: F.orange, installer: F.cyan, qc: F.purple,
}

function UserModal({ user, onClose, onSave }: {
  user: Partial<FleetUser> | null
  onClose: () => void
  onSave: (u: FleetUser) => void
}) {
  const isEdit = !!user?.id
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    role: (user?.role ?? 'remover') as FleetRole,
    active: user?.active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      role: form.role,
      active: form.active,
    }

    let data: FleetUser | null = null
    let err: { message: string } | null = null

    if (isEdit) {
      const res = await supabase.from('fleet_users').update(payload).eq('id', user!.id!).select('*').single()
      data = res.data as FleetUser
      err = res.error
    } else {
      const res = await supabase.from('fleet_users').insert({ ...payload, user_id: null }).select('*').single()
      data = res.data as FleetUser
      err = res.error
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    onSave(data!)
    onClose()
  }

  const inp: React.CSSProperties = {
    padding: '14px 16px', fontSize: 15, borderRadius: 12, width: '100%',
    background: F.surface2, color: F.text, border: `1px solid ${F.border}`,
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}>
      <div style={{ background: F.surface, borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: F.text, marginBottom: 20 }}>
          {isEdit ? 'Edit User' : 'Add Fleet User'}
        </div>
        <form onSubmit={save}>
          <div style={{ marginBottom: 10 }}>
            <input type="text" placeholder="Full name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <input type="email" placeholder="Email (used to auto-link account)" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inp} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <input type="tel" placeholder="Phone (optional)" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inp} />
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: F.textSec, marginBottom: 8 }}>Role</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ROLES.map(r => (
                <button key={r} type="button" onClick={() => setForm(f => ({ ...f, role: r }))}
                  style={{ padding: '10px 16px', borderRadius: 10, border: `2px solid ${form.role === r ? ROLE_COLOR[r] : F.border}`, background: form.role === r ? ROLE_COLOR[r] + '22' : F.surface2, color: form.role === r ? ROLE_COLOR[r] : F.textSec, fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {isEdit && (
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                style={{ width: 44, height: 24, borderRadius: 12, background: form.active ? F.green : F.surface3, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: 3, left: form.active ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
              <span style={{ fontSize: 14, color: form.active ? F.green : F.textSec }}>{form.active ? 'Active' : 'Inactive'}</span>
            </div>
          )}

          {error && <div style={{ color: F.red, fontSize: 13, marginBottom: 12, padding: '10px 14px', background: F.red + '18', borderRadius: 10 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 18, borderRadius: 14, background: F.surface2, color: F.textSec, border: `1px solid ${F.border}`, fontSize: 16, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving || !form.name}
              style={{ flex: 2, padding: 18, borderRadius: 14, background: saving || !form.name ? F.surface2 : F.accent, color: saving || !form.name ? F.textTer : '#fff', border: 'none', fontSize: 16, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function FleetUserAdmin() {
  const [users, setUsers] = useState<FleetUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<FleetUser> | null | false>(false)

  async function load() {
    const { data } = await supabase.from('fleet_users').select('*').order('name')
    setUsers((data ?? []) as FleetUser[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function handleSave(u: FleetUser) {
    setUsers(prev => {
      const idx = prev.findIndex(x => x.id === u.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = u; return next }
      return [...prev, u]
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: F.text }}>Fleet Users</div>
        <button onClick={() => setEditing({})}
          style={{ background: F.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          + Add User
        </button>
      </div>

      <div style={{ marginBottom: 16, padding: '12px 16px', background: F.surface2, borderRadius: 12, border: `1px solid ${F.border}` }}>
        <div style={{ fontSize: 12, color: F.textSec, lineHeight: 1.6 }}>
          <strong style={{ color: F.text }}>How it works:</strong> Add users with their email address. When they sign in to /fleet with a matching Supabase account, they'll be auto-linked. If they don't have an account yet, create one first at Supabase → Authentication → Users.
        </div>
      </div>

      {loading ? (
        <div style={{ color: F.textSec, textAlign: 'center', padding: 32 }}>Loading…</div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: F.textSec }}>No fleet users yet. Add the first one.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map(u => (
            <button key={u.id} onClick={() => setEditing(u)}
              style={{ background: F.surface, border: `1px solid ${u.active ? F.border : F.border + '44'}`, borderRadius: 14, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', width: '100%', opacity: u.active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: ROLE_COLOR[u.role] + '22', border: `2px solid ${ROLE_COLOR[u.role]}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: ROLE_COLOR[u.role], flexShrink: 0 }}>
                  {u.name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: F.text }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: F.textSec }}>{u.email ?? 'No email'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ROLE_COLOR[u.role], textTransform: 'uppercase', letterSpacing: '0.08em' }}>{u.role}</div>
                  {!u.active && <div style={{ fontSize: 10, color: F.red }}>Inactive</div>}
                  {u.user_id && <div style={{ fontSize: 10, color: F.green }}>Linked ✓</div>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {editing !== false && (
        <UserModal
          user={editing}
          onClose={() => setEditing(false)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
