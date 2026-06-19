import { useState, useEffect, useRef } from 'react'
import { LayoutDashboard, Users, Package, ScanLine, LogOut, Boxes, CalendarDays, CheckCircle2, Ship } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { TopNav, BottomNav, SectionHeader, StatusPill, TypePill, SkeletonList, EmptyState, Modal, ShippingLabel, PhotoGallery, fmtDate, fmtDateTime, ScannerModal } from '../../components/UI'
import RecordGoods from './RecordGoods'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { DEFAULT_NIGERIA_STATE, NIGERIA_COUNTRY, NIGERIA_STATES } from '../../lib/nigeria'

export default function StaffApp() {
  const { profile, signOut } = useAuth()
  const [tab, setTab] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [clients, setClients] = useState([])
  const [goods, setGoods] = useState([])
  const [loading, setLoading] = useState(true)
  const [showRecord, setShowRecord] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [settings, setSettings] = useState({})
  const [scanOpen, setScanOpen] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [showAddClient, setShowAddClient] = useState(false)
  const [newClient, setNewClient] = useState({ full_name: '', phone: '', country: NIGERIA_COUNTRY, state: DEFAULT_NIGERIA_STATE, password_hash: '' })
  const reloadTimer = useRef(null)

  useEffect(() => {
    loadAll()

    const scheduleReload = () => {
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(() => loadAll(false), 250)
    }

    const channel = supabase.channel('staff-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goods' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'containers' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, scheduleReload)
      .subscribe()

    return () => {
      clearTimeout(reloadTimer.current)
      supabase.removeChannel(channel)
    }
  }, [])

  const loadAll = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    const [{ data: s }, { data: g }, { data: cfg }] = await Promise.all([
      supabase.from('clients').select('id,full_name,phone,shipping_mark,country,state,created_at').order('created_at', { ascending: false }),
      supabase.from('goods').select('*,client:clients(full_name,shipping_mark)').order('created_at', { ascending: false }),
      supabase.from('settings').select('key,value'),
    ])
    setClients(s || [])
    setGoods(g || [])
    if (cfg) setSettings(Object.fromEntries(cfg.map(r => [r.key, r.value])))

    // compute stats
    const goodsArr = g || []
    const clientsArr = s || []
    const totalCbm = goodsArr.reduce((sum, x) => sum + (x.cbm || 0), 0)
    const today = goodsArr.filter(x => new Date(x.created_at).toDateString() === new Date().toDateString())
    setStats({ totalClients: clientsArr.length, totalGoods: goodsArr.length, totalCbm: totalCbm.toFixed(2), todayGoods: today.length, inTransit: goodsArr.filter(x=>x.status==='in_transit').length, delivered: goodsArr.filter(x=>x.status==='delivered').length })
    if (showLoader) setLoading(false)
  }

  const handleScanForGoods = async (val) => {
    // Look up goods by tracking no
    const { data } = await supabase.from('goods').select('*,client:clients(full_name,shipping_mark,phone)').eq('tracking_no', val).single()
    if (data) {
      setScanResult(data)
    } else {
      toast('No goods found with that tracking number')
    }
  }

  const updateScanStatus = async (goodsId, status) => {
    const { error } = await supabase.from('goods').update({ status, updated_at: new Date().toISOString() }).eq('id', goodsId)
    if (error) { toast.error('Update failed'); return }
    toast.success('Status updated!')
    setScanResult(null)
    loadAll()
  }

  const registerClient = async () => {
    if (!newClient.full_name || !newClient.phone || !newClient.password_hash) { toast.error('Fill all required fields'); return }
    try {
      const { data: mark } = await supabase.rpc('generate_shipping_mark', { client_name: newClient.full_name })
      const { error } = await supabase.from('clients').insert({ ...newClient, shipping_mark: mark, created_by: profile?.id })
      if (error) throw error
      toast.success('Client registered! Mark: ' + mark)
      setShowAddClient(false)
      setNewClient({ full_name: '', phone: '', country: NIGERIA_COUNTRY, state: DEFAULT_NIGERIA_STATE, password_hash: '' })
      loadAll()
    } catch (e) { toast.error(e.message) }
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'clients', label: 'Clients', Icon: Users },
    { id: 'goods', label: 'Goods', Icon: Package },
    { id: 'scan', label: 'Scan', Icon: ScanLine },
  ]

  return (
    <div className="app-shell">
      <TopNav role="Staff" title={tab === 'dashboard' ? 'Dashboard' : tab === 'clients' ? 'Clients' : tab === 'goods' ? 'Goods Records' : 'Quick Scan'}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--teal)', color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
              {profile?.full_name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--white)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontSize: 12 }}>
              <LogOut size={14} style={{ display: 'inline', marginRight: 4 }} />Logout
            </button>
          </div>
        }
      />

      <div className="page">

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif', color: 'var(--text)' }}>
                Hello, {profile?.full_name?.split(' ')[0]} 👋
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{format(new Date(), 'EEEE, d MMMM yyyy')}</div>
            </div>

            {loading ? <SkeletonList n={4} /> : (
              <>
                <div className="stat-grid">
                  {[
                    { label: 'Total Clients', value: stats?.totalClients, Icon: Users, color: 'var(--blue)' },
                    { label: 'Total Goods', value: stats?.totalGoods, Icon: Package, color: 'var(--teal)' },
                    { label: 'Total CBM', value: stats?.totalCbm + ' m³', Icon: Boxes, color: 'var(--amber)' },
                    { label: 'Recorded Today', value: stats?.todayGoods, Icon: CalendarDays, color: 'var(--green)' },
                    { label: 'In Transit', value: stats?.inTransit, Icon: Ship, color: 'var(--amber)' },
                    { label: 'Delivered', value: stats?.delivered, Icon: CheckCircle2, color: 'var(--green)' },
                  ].map((s, i) => (
                    <div key={i} className="stat-card">
                      <div className="stat-icon" style={{ background: 'color-mix(in srgb, ' + s.color + ' 12%, transparent)' }}><s.Icon size={17} color={s.color} /></div>
                      <div className="stat-value">{s.value ?? '—'}</div>
                      <div className="stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>

                <SectionHeader title="Recent Goods" action={<button className="btn btn-sm btn-primary" onClick={() => setShowRecord(true)}>+ Record</button>} />
                {goods.slice(0, 5).map(g => (
                  <div key={g.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, flex: 1, paddingRight: 8 }}>{g.description}</div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <TypePill type={g.type} />
                        <StatusPill status={g.status} />
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {g.client?.full_name} · {g.type === 'sea' && g.cbm ? `${g.cbm} CBM · ` : ''}{g.weight_kg} kg
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{fmtDate(g.created_at)}</div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* CLIENTS */}
        {tab === 'clients' && (
          <>
            <SectionHeader title={`Clients (${clients.length})`} action={<button className="btn btn-sm btn-primary" onClick={() => setShowAddClient(true)}>+ Register</button>} />
            {loading ? <SkeletonList /> : clients.length === 0 ? <EmptyState icon="users" title="No clients yet" text="Register your first client to get started." /> : (
              clients.map(c => (
                <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setSelectedClient(c)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--navy)', color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                      {c.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{c.full_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.phone} · {c.state || c.country}</div>
                      <div style={{ fontSize: 12, color: 'var(--teal-dark)', fontWeight: 600, marginTop: 2 }}>{c.shipping_mark}</div>
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>{fmtDate(c.created_at)}</div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* GOODS */}
        {tab === 'goods' && (
          <>
            <SectionHeader title={`All Goods (${goods.length})`} action={<button className="btn btn-sm btn-primary" onClick={() => setShowRecord(true)}>+ Record</button>} />
            {loading ? <SkeletonList /> : goods.length === 0 ? <EmptyState icon="box" title="No goods recorded" text="Tap + Record to log new goods." /> : (
              goods.map(g => (
                <div key={g.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, flex: 1, paddingRight: 8 }}>{g.description}</div>
                    <StatusPill status={g.status} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <TypePill type={g.type} />
                    {g.type === 'sea' && g.cbm && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{g.cbm} CBM</span>}
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{g.weight_kg} kg</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{g.client?.full_name} · <span style={{ color: 'var(--teal-dark)', fontWeight: 600 }}>{g.client?.shipping_mark}</span></span>
                    <span>{fmtDate(g.created_at)}</span>
                  </div>
                  {g.tracking_no && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{g.tracking_no}</div>}
                  {/* Photos */}
                  <PhotoGallery photos={g.photos?.slice(0, 4)} compact />
                  {/* Quick status update */}
                  <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
                    {['in_warehouse','in_transit','delivered'].map(s => (
                      <button key={s} onClick={async () => {
                        await supabase.from('goods').update({ status: s }).eq('id', g.id)
                        toast.success('Status updated')
                        loadAll()
                      }} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: g.status === s ? 'var(--teal)' : 'var(--surface)', color: g.status === s ? 'var(--navy)' : 'var(--muted)', cursor: 'pointer', fontWeight: g.status === s ? 700 : 400 }}>
                        {s === 'in_warehouse' ? 'Warehouse' : s === 'in_transit' ? 'Transit' : 'Delivered'}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* SCAN TAB */}
        {tab === 'scan' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Quick Scan</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Scan a package barcode (快递号) to look up and update goods status</div>
            </div>

            <button onClick={() => setScanOpen(true)} style={{ width: '100%', background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))', border: '2px solid var(--teal)', borderRadius: 20, padding: '28px 20px', cursor: 'pointer', marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: 'var(--white)' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ScanLine size={30} color="var(--navy)" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18 }}>Tap to Scan</div>
                <div style={{ fontSize: 13, color: 'var(--teal)', marginTop: 4 }}>Camera scan or manual entry</div>
              </div>
            </button>

            {scanResult && (
              <div className="card" style={{ border: '2px solid var(--teal)' }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--navy)' }}>Goods Found</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{scanResult.description}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{scanResult.client?.full_name} · {scanResult.client?.shipping_mark}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>{scanResult.tracking_no}</div>
                <StatusPill status={scanResult.status} />
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>UPDATE STATUS TO:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['in_warehouse','in_transit','delivered'].map(s => (
                      <button key={s} onClick={() => updateScanStatus(scanResult.id, s)} style={{ flex: 1, padding: '10px 6px', borderRadius: 10, border: '1.5px solid var(--border)', background: scanResult.status === s ? 'var(--teal)' : 'var(--white)', color: scanResult.status === s ? 'var(--navy)' : 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                        {s === 'in_warehouse' ? 'Warehouse' : s === 'in_transit' ? 'Transit' : 'Delivered'}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => setScanResult(null)} className="btn btn-secondary btn-full" style={{ marginTop: 12 }}>Clear</button>
              </div>
            )}

            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginTop: 12 }}>Scan history appears here after each scan</div>
          </>
        )}

      </div>

      <BottomNav tabs={tabs} active={tab} onChange={setTab} />

      {/* Record Goods modal */}
      <Modal open={showRecord} title="Record New Goods" onClose={() => setShowRecord(false)}>
        <RecordGoods onDone={() => { setShowRecord(false); loadAll() }} />
      </Modal>

      {/* Client detail modal */}
      <Modal open={!!selectedClient} title="Client Details" onClose={() => setSelectedClient(null)}>
        {selectedClient && (
          <>
            <ShippingLabel client={selectedClient} settings={settings} />
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Goods History</div>
              {goods.filter(g => g.client_id === selectedClient.id).map(g => (
                <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{g.description}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(g.created_at)} · {g.type === 'sea' && g.cbm ? g.cbm + ' CBM · ' : ''}{g.weight_kg} kg</div>
                  </div>
                  <StatusPill status={g.status} />
                </div>
              ))}
              {goods.filter(g => g.client_id === selectedClient.id).length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>No goods recorded for this client yet.</div>}
            </div>
          </>
        )}
      </Modal>

      {/* Add Client modal */}
      <Modal open={showAddClient} title="Register New Client" onClose={() => setShowAddClient(false)}>
        <div className="input-group">
          <label className="input-label">Full Name *</label>
          <input className="input-field" placeholder="e.g. Ahmad bin Ali" value={newClient.full_name} onChange={e => setNewClient(p=>({...p, full_name: e.target.value}))} />
        </div>
        <div className="input-group">
          <label className="input-label">Phone Number *</label>
          <input className="input-field" placeholder="601xxxxxxxx" value={newClient.phone} onChange={e => setNewClient(p=>({...p, phone: e.target.value}))} />
        </div>
        <div className="input-group">
          <label className="input-label">Country</label>
          <input className="input-field" value={NIGERIA_COUNTRY} readOnly />
        </div>
        <div className="input-group">
          <label className="input-label">State</label>
          <select className="input-field" value={newClient.state} onChange={e => setNewClient(p=>({...p, country: NIGERIA_COUNTRY, state: e.target.value}))}>
            {NIGERIA_STATES.map(state => <option key={state} value={state}>{state}</option>)}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Client Password *</label>
          <input className="input-field" placeholder="Set a login password for this client" value={newClient.password_hash} onChange={e => setNewClient(p=>({...p, password_hash: e.target.value}))} />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Shipping mark will be auto-generated</div>
        </div>
        {newClient.full_name && <div className="banner banner-info" style={{ marginBottom: 14 }}>Shipping mark will be auto-generated based on name and sequence number.</div>}
        <button className="btn btn-primary btn-full" onClick={registerClient} style={{ padding: 13 }}>Register Client</button>
      </Modal>

      {/* Scan modal */}
      <ScannerModal open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleScanForGoods} title="Scan Package Barcode (快递号)" />
    </div>
  )
}
