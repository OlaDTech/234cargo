import { useState, useEffect, useRef } from 'react'
import { Home, Package, Tag, ShoppingBag, MessageCircle, LogOut, Warehouse, Ship, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { TopNav, BottomNav, SectionHeader, StatusPill, TypePill, SkeletonList, EmptyState, Modal, ShippingLabel, ReceiptView, PhotoGallery, fmtDate, fmtDateTime, fmtAgo } from '../../components/UI'
import toast from 'react-hot-toast'

export default function ClientApp() {
  const { clientUser, signOut } = useAuth()
  const [tab, setTab] = useState('home')
  const [goods, setGoods] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [messages, setMessages] = useState([])
  const [receipts, setReceipts] = useState([])
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [msgText, setMsgText] = useState('')
  const [selectedGoods, setSelectedGoods] = useState(null)
  const [selectedReceipt, setSelectedReceipt] = useState(null)
  const [showLabel, setShowLabel] = useState(false)
  const reloadTimer = useRef(null)

  useEffect(() => { loadAll() }, [clientUser.id])

  useEffect(() => {
    const scheduleReload = () => {
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(() => loadAll(false), 250)
    }

    const sub = supabase.channel('client-live-' + clientUser.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goods', filter: `client_id=eq.${clientUser.id}` }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts', filter: `client_id=eq.${clientUser.id}` }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `client_id=eq.${clientUser.id}` }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, scheduleReload)
      .subscribe()

    return () => {
      clearTimeout(reloadTimer.current)
      supabase.removeChannel(sub)
    }
  }, [clientUser.id])

  const loadAll = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    const [{ data: g }, { data: a }, { data: s }, { data: m }, { data: r }, { data: cfg }] = await Promise.all([
      supabase.from('goods').select('*').eq('client_id', clientUser.id).order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('messages').select('*').eq('client_id', clientUser.id).order('created_at'),
      supabase.from('receipts').select('*').eq('client_id', clientUser.id).order('issued_at', { ascending: false }),
      supabase.from('settings').select('key,value'),
    ])
    setGoods(g || []); setAnnouncements(a || []); setSuppliers(s || [])
    setMessages(m || []); setReceipts(r || [])
    if (cfg) setSettings(Object.fromEntries(cfg.map(r => [r.key, r.value])))
    if (showLoader) setLoading(false)
  }

  const sendMsg = async () => {
    if (!msgText.trim()) return
    const { data, error } = await supabase.from('messages').insert({ client_id: clientUser.id, sender: 'client', message: msgText.trim() }).select().single()
    if (!error) { setMessages(prev => [...prev, data]); setMsgText('') }
    else toast.error('Failed to send message')
  }

  const tabs = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'goods', label: 'My Goods', Icon: Package },
    { id: 'label', label: 'Label', Icon: Tag },
    { id: 'suppliers', label: 'Suppliers', Icon: ShoppingBag },
    { id: 'chat', label: 'Messages', Icon: MessageCircle },
  ]

  const inWarehouse = goods.filter(g => g.status === 'in_warehouse').length
  const inTransit = goods.filter(g => g.status === 'in_transit').length
  const delivered = goods.filter(g => g.status === 'delivered').length
  const unreadMsgs = messages.filter(m => m.sender !== 'client').length

  return (
    <div className="app-shell">
      <TopNav role="Client Portal" title="OceanAir Logistics"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--teal)', color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
              {clientUser.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--white)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontSize: 12 }}>
              <LogOut size={14} style={{ display: 'inline', marginRight: 4 }} />Out
            </button>
          </div>
        }
      />

      <div className="page">

        {/* HOME */}
        {tab === 'home' && (
          <>
            {/* Profile hero */}
            <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))', borderRadius: 20, padding: '20px 18px', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--teal)', color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                  {clientUser.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{ color: 'var(--white)', fontWeight: 700, fontSize: 18, fontFamily: 'Space Grotesk, sans-serif' }}>{clientUser.full_name}</div>
                  <div style={{ color: 'var(--teal)', fontSize: 13 }}>{clientUser.phone}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{clientUser.state || clientUser.country}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 14px' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Shipping Mark</div>
                  <div style={{ color: 'var(--white)', fontWeight: 800, fontSize: 18, letterSpacing: 2, marginTop: 2 }}>{clientUser.shipping_mark}</div>
                </div>
                <button onClick={() => setShowLabel(true)} style={{ background: 'var(--teal)', border: 'none', borderRadius: 10, padding: '8px 14px', color: 'var(--navy)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>View Label</button>
              </div>
            </div>

            {/* Shipment stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
              {[
                { label: 'In Warehouse', value: inWarehouse, color: 'var(--blue)', Icon: Warehouse },
                { label: 'In Transit', value: inTransit, color: 'var(--amber)', Icon: Ship },
                { label: 'Delivered', value: delivered, color: 'var(--green)', Icon: CheckCircle2 },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--white)', borderRadius: 14, border: '1px solid var(--line)', padding: '13px 8px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: 'color-mix(in srgb, ' + s.color + ' 12%, transparent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}><s.Icon size={16} color={s.color} /></div>
                  <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--t1)', fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Announcements */}
            <SectionHeader title="Announcements" />
            {loading ? <SkeletonList n={2} /> : announcements.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>No announcements</div>
            ) : announcements.map(a => (
              <div key={a.id} className="card" style={{ borderLeft: `4px solid ${a.is_important ? 'var(--danger)' : 'var(--teal)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                  {a.is_important && <span style={{ background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, flexShrink: 0 }}>Important</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{a.body}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{fmtAgo(a.created_at)}</div>
              </div>
            ))}
          </>
        )}

        {/* MY GOODS */}
        {tab === 'goods' && (
          <>
            <SectionHeader title={`My Goods (${goods.length})`} />
            {loading ? <SkeletonList /> : goods.length === 0 ? (
              <EmptyState icon="box" title="No shipments yet" text="Your goods will appear here once recorded by our warehouse team in China." />
            ) : goods.map(g => (
              <div key={g.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setSelectedGoods(g)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, flex: 1, paddingRight: 8 }}>{g.description}</div>
                  <StatusPill status={g.status} />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <TypePill type={g.type} />
                  {g.type === 'sea' && g.cbm && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{g.cbm} m³</span>}
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{g.weight_kg} kg</span>
                </div>
                <PhotoGallery photos={g.photos?.slice(0, 4)} compact />
                <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{g.tracking_no || ''}</span>
                  <span>{fmtDate(g.created_at)}</span>
                </div>
                {/* Receipt button */}
                {receipts.find(r => r.goods_id === g.id) && (
                  <button onClick={e => { e.stopPropagation(); setSelectedReceipt(receipts.find(r => r.goods_id === g.id)) }} style={{ marginTop: 10, background: 'none', border: '1px solid var(--teal)', borderRadius: 8, padding: '5px 12px', color: 'var(--teal-dark)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    View Receipt
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        {/* LABEL */}
        {tab === 'label' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Your Shipping Label</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Show or print this label for your supplier to attach to your goods</div>
            </div>
            <ShippingLabel client={clientUser} settings={settings} />
            <button onClick={() => window.print()} className="btn btn-navy btn-full" style={{ marginTop: 16, padding: 14 }}>
              Print / Download Label
            </button>
            <div className="banner banner-info" style={{ marginTop: 12 }}>
              Share your shipping mark <strong>{clientUser.shipping_mark}</strong> with your supplier. They must write or attach it clearly on all your packages.
            </div>
          </>
        )}

        {/* SUPPLIERS */}
        {tab === 'suppliers' && (
          <>
            <SectionHeader title="Supplier Directory" />
            <div className="banner banner-info" style={{ marginBottom: 16 }}>These are trusted suppliers in China. Share your shipping mark with them when ordering.</div>
            {loading ? <SkeletonList /> : suppliers.length === 0 ? <EmptyState icon="store" title="No suppliers listed yet" /> : (
              suppliers.map(s => (
                <div key={s.id} className="card">
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{s.name}</div>
                  <span style={{ background: 'var(--info-bg)', color: 'var(--info)', fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 600 }}>{s.category}</span>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{s.address}</div>
                  <div style={{ fontSize: 13, color: 'var(--teal-dark)', marginTop: 4, fontWeight: 500 }}>{s.contact}</div>
                  {s.notes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>{s.notes}</div>}
                </div>
              ))
            )}
          </>
        )}

        {/* CHAT */}
        {tab === 'chat' && (
          <div className="chat-layout">
            <SectionHeader title="Messages" />
            <div className="chat-list">
              {loading ? <SkeletonList n={3} /> : messages.length === 0 ? (
                <EmptyState icon="chat" title="No messages yet" text="Send us a message and our team will get back to you." />
              ) : messages.map(m => (
                <div key={m.id} className={`chat-row ${m.sender === 'client' ? 'chat-row-out' : 'chat-row-in'}`}>
                  <div className="chat-message">
                    <div className={`chat-meta ${m.sender === 'client' ? 'chat-meta-out' : ''}`}>
                      {m.sender === 'client' ? 'You' : 'OceanAir Team'} · {fmtAgo(m.created_at)}
                    </div>
                    <div className={`chat-bubble ${m.sender === 'client' ? 'bubble-client' : 'bubble-admin'}`}>
                      {m.message}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="chat-composer">
              <input className="input-field" style={{ margin: 0 }} placeholder="Type a message…" value={msgText}
                onChange={e => setMsgText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()} />
              <button className="btn btn-primary chat-send" onClick={sendMsg}>Send</button>
            </div>
          </div>
        )}

      </div>

      <BottomNav tabs={tabs} active={tab} onChange={setTab} />

      {/* Goods detail modal */}
      <Modal open={!!selectedGoods} title="Shipment Details" onClose={() => setSelectedGoods(null)}>
        {selectedGoods && (
          <>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>{selectedGoods.description}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <TypePill type={selectedGoods.type} />
              <StatusPill status={selectedGoods.status} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                selectedGoods.type === 'sea' && selectedGoods.cbm ? ['CBM', selectedGoods.cbm + ' m³'] : null,
                selectedGoods.type === 'sea' && selectedGoods.length_cm ? ['Dimensions', `${selectedGoods.length_cm}×${selectedGoods.width_cm}×${selectedGoods.height_cm} cm`] : null,
                ['Weight', selectedGoods.weight_kg + ' kg'],
                ['Received', fmtDate(selectedGoods.created_at)],
                ['Updated', fmtDate(selectedGoods.updated_at)],
                selectedGoods.tracking_no ? ['Tracking', selectedGoods.tracking_no] : null,
              ].filter(Boolean).map(([k, v]) => (
                <div key={k} style={{ background: 'var(--surface)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{k}</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2, wordBreak: 'break-all' }}>{v}</div>
                </div>
              ))}
            </div>
            {selectedGoods.photos?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Photos</div>
                <PhotoGallery photos={selectedGoods.photos} />
              </div>
            )}
            {selectedGoods.notes && (
              <div className="banner banner-warn">{selectedGoods.notes}</div>
            )}
          </>
        )}
      </Modal>

      {/* Receipt modal */}
      <Modal open={!!selectedReceipt} title="Receipt" onClose={() => setSelectedReceipt(null)}>
        <ReceiptView receipt={selectedReceipt} client={clientUser} />
        <button onClick={() => window.print()} className="btn btn-secondary btn-full" style={{ marginTop: 12 }}>Print Receipt</button>
      </Modal>

      {/* Shipping label modal */}
      <Modal open={showLabel} title="Shipping Label" onClose={() => setShowLabel(false)}>
        <ShippingLabel client={clientUser} settings={settings} />
        <button onClick={() => window.print()} className="btn btn-navy btn-full" style={{ marginTop: 12 }}>Print Label</button>
      </Modal>
    </div>
  )
}
