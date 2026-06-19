import { useState, useEffect } from 'react'
import { supabase, uploadGoodsPhoto } from '../../lib/supabase'
import { ScannerModal, CBMCalculator, PhotoUploader, Input, Select, Textarea, InputWithScan, TabRow, Modal, ShippingLabel } from '../../components/UI'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'

const EMPTY_SEA = { description: '', length_cm: '', width_cm: '', height_cm: '', quantity: '1', weight_kg: '', tracking_no: '', notes: '', status: 'in_warehouse' }
const EMPTY_AIR = { description: '', quantity: '1', weight_kg: '', tracking_no: '', notes: '', status: 'in_warehouse' }

function parseClientScan(value) {
  const raw = String(value || '').trim()
  if (!raw) return { identifier: '', shipmentType: null }
  const parts = raw.split(':')
  if ((parts[0] === '234' || parts[0] === 'OA') && parts[1]) {
    return { identifier: parts[1].trim(), shipmentType: ['sea', 'air'].includes(parts[2]) ? parts[2] : null }
  }
  try {
    const parsed = JSON.parse(raw)
    return { identifier: parsed.shipping_mark || parsed.shippingMark || parsed.phone || raw, shipmentType: parsed.shipment_type || parsed.shipmentType || null }
  } catch {
    return { identifier: raw, shipmentType: null }
  }
}

export default function RecordGoods({ onDone }) {
  const { profile } = useAuth()
  const [step, setStep] = useState('find') // 'find' | 'form'
  const [goodsType, setGoodsType] = useState('sea')
  const [scanOpen, setScanOpen] = useState(false)
  const [trackScanOpen, setTrackScanOpen] = useState(false)
  const [clientQuery, setClientQuery] = useState('')
  const [client, setClient] = useState(null)
  const [clientSuggestions, setClientSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [sea, setSea] = useState(EMPTY_SEA)
  const [air, setAir] = useState(EMPTY_AIR)
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showLabel, setShowLabel] = useState(false)
  const [settings, setSettings] = useState({})

  useEffect(() => {
    supabase.from('settings').select('key,value').then(({ data }) => {
      if (data) setSettings(Object.fromEntries(data.map(r => [r.key, r.value])))
    })
  }, [])

  // Live search clients as user types
  useEffect(() => {
    if (!clientQuery.trim() || client) { setClientSuggestions([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase.from('clients').select('id,full_name,phone,shipping_mark,country,state')
        .or(`phone.ilike.%${clientQuery}%,shipping_mark.ilike.%${clientQuery}%,full_name.ilike.%${clientQuery}%`)
        .limit(5)
      setClientSuggestions(data || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [clientQuery, client])

  const handleScanResult = async (val) => {
    const { identifier: scanned, shipmentType } = parseClientScan(val)
    setClientQuery(scanned)
    if (shipmentType) setGoodsType(shipmentType)
    // Try exact match first
    const { data } = await supabase.from('clients').select('*')
      .or(`phone.eq.${scanned},shipping_mark.eq.${scanned}`)
      .single()
    if (data) { setClient(data); setClientQuery(data.full_name); setStep('form') }
    else toast('No exact match — select from suggestions below')
  }

  const selectClient = (c) => { setClient(c); setClientQuery(c.full_name); setClientSuggestions([]); setStep('form') }

  const handlePhotos = async (files) => {
    setUploading(true)
    try {
      const next = files.map(file => ({ file, preview: URL.createObjectURL(file) }))
      setPhotos(prev => [...prev, ...next])
    } finally { setUploading(false) }
  }

  const removePhoto = (index) => {
    setPhotos(prev => {
      const removed = prev[index]
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleSave = async () => {
    const form = goodsType === 'sea' ? sea : air
    if (!client) { toast.error('No client selected'); return }
    if (!form.description.trim()) { toast.error('Description is required'); return }
    if (!form.weight_kg) { toast.error('Weight is required'); return }
    if (goodsType === 'sea' && (!sea.length_cm || !sea.width_cm || !sea.height_cm)) {
      toast.error('Enter all 3 measurements for sea goods'); return
    }
    setSaving(true)
    try {
      // First create goods record to get ID
      const payload = {
        client_id: client.id,
        type: goodsType,
        recorded_by: profile?.id,
        ...(goodsType === 'sea'
          ? { description: sea.description, length_cm: parseFloat(sea.length_cm), width_cm: parseFloat(sea.width_cm), height_cm: parseFloat(sea.height_cm), quantity: parseInt(sea.quantity, 10) || 1, weight_kg: parseFloat(sea.weight_kg), tracking_no: sea.tracking_no || null, notes: sea.notes, status: sea.status }
          : { description: air.description, quantity: parseInt(air.quantity, 10) || 1, weight_kg: parseFloat(air.weight_kg), tracking_no: air.tracking_no || null, notes: air.notes, status: air.status }
        )
      }
      const { data: newGoods, error } = await supabase.from('goods').insert(payload).select().single()
      if (error) throw error

      // Upload photos
      let photoUrls = []
      const pending = photos.map(p => p.file).filter(Boolean)
      if (pending.length > 0) {
        photoUrls = await Promise.all(pending.map(f => uploadGoodsPhoto(f, newGoods.id)))
        if (photoUrls.length > 0) {
          await supabase.from('goods').update({ photos: photoUrls }).eq('id', newGoods.id)
        }
      }
      toast.success('Goods recorded successfully!')
      // Reset
      photos.forEach(p => p.preview && URL.revokeObjectURL(p.preview))
      setStep('find'); setClient(null); setClientQuery(''); setSea(EMPTY_SEA); setAir(EMPTY_AIR); setPhotos([])
      onDone?.()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <ScannerModal open={scanOpen} onClose={() => setScanOpen(false)} onResult={handleScanResult} title="Scan Client QR / Shipping Mark" />
      <ScannerModal open={trackScanOpen} onClose={() => setTrackScanOpen(false)}
        onResult={val => { goodsType === 'sea' ? setSea(p => ({...p, tracking_no: val})) : setAir(p => ({...p, tracking_no: val})) }}
        title="Scan Package Barcode (快递号)" />
      <Modal open={showLabel} title="Client Shipping Label" onClose={() => setShowLabel(false)}>
        <ShippingLabel client={client} settings={settings} shipmentType={goodsType} />
      </Modal>

      {/* Step 1 — Find Client */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          {step === 'find' ? 'Step 1 — Find the client by scanning their QR code or searching' : `Step 2 — Recording goods for ${client?.full_name}`}
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {['Find Client', 'Record Goods'].map((s, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: (step === 'form' || i === 0) ? 'var(--teal)' : 'var(--border)' }} />
          ))}
        </div>

        {step === 'find' && (
          <>
            {/* Scan button — big CTA */}
            <button onClick={() => setScanOpen(true)} style={{ width: '100%', background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))', border: '2px solid var(--teal)', borderRadius: 16, padding: '22px 20px', cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, color: 'var(--white)' }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth={2.5}>
                  <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/>
                  <rect x="7" y="7" width="3" height="10" rx="1"/><rect x="14" y="7" width="3" height="10" rx="1"/>
                </svg>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--white)' }}>Scan Client QR Code</div>
                <div style={{ fontSize: 13, color: 'var(--teal)', marginTop: 2 }}>Scan shipping mark or enter manually</div>
              </div>
            </button>

            <div className="divider-text">or search by name, phone, shipping mark</div>

            <div style={{ position: 'relative' }}>
              <div className="input-group" style={{ marginBottom: clientSuggestions.length ? 0 : 14 }}>
                <label className="input-label">Search Client</label>
                <input className="input-field" placeholder="Name, phone or shipping mark…"
                  value={clientQuery} onChange={e => { setClientQuery(e.target.value); setClient(null) }} autoComplete="off" />
              </div>
              {(clientSuggestions.length > 0 || searching) && (
                <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-md)', marginBottom: 14, marginTop: 2 }}>
                  {searching && <div style={{ padding: 12, fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>Searching…</div>}
                  {clientSuggestions.map(c => (
                    <button key={c.id} onClick={() => selectClient(c)} style={{ width: '100%', padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--navy)', color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                        {c.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{c.full_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.phone} · <span style={{ color: 'var(--teal-dark)', fontWeight: 600 }}>{c.shipping_mark}</span></div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Step 2 — Goods form */}
        {step === 'form' && client && (
          <>
            {/* Client summary card */}
            <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))', borderRadius: 14, padding: '14px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--teal)', color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                  {client.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{ color: 'var(--white)', fontWeight: 700, fontSize: 15 }}>{client.full_name}</div>
                  <div style={{ color: 'var(--teal)', fontSize: 12, fontWeight: 600 }}>{client.shipping_mark}</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{client.phone} · {client.state || client.country}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={() => setShowLabel(true)} style={{ background: 'rgba(0,201,167,0.15)', border: '1px solid var(--teal)', borderRadius: 8, padding: '5px 10px', color: 'var(--teal)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Label</button>
                <button onClick={() => { setStep('find'); setClient(null); setClientQuery('') }} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, padding: '5px 10px', color: 'rgba(255,255,255,0.6)', fontSize: 11, cursor: 'pointer' }}>Change</button>
              </div>
            </div>

            {/* Sea / Air toggle */}
            <TabRow tabs={[{ id: 'sea', label: 'Sea Freight' }, { id: 'air', label: 'Air Freight' }]} active={goodsType} onChange={setGoodsType} />

            <div className="input-group">
              <label className="input-label">Description of Goods</label>
              <input className="input-field" placeholder="e.g. Electronic components, clothing, furniture…"
                value={goodsType === 'sea' ? sea.description : air.description}
                onChange={e => goodsType === 'sea' ? setSea(p=>({...p, description: e.target.value})) : setAir(p=>({...p, description: e.target.value}))} />
            </div>

            <div className="input-group">
              <label className="input-label">Number of Packages</label>
              <input className="input-field" type="number" min="1" step="1" value={goodsType === 'sea' ? sea.quantity : air.quantity}
                onChange={e => goodsType === 'sea' ? setSea(p => ({ ...p, quantity: e.target.value })) : setAir(p => ({ ...p, quantity: e.target.value }))} />
            </div>

            {goodsType === 'sea' ? (
              <>
                <CBMCalculator value={sea} onChange={setSea} />
                <div className="input-group">
                  <label className="input-label">Weight (kg)</label>
                  <input className="input-field" type="number" min="0" step="0.1" placeholder="0.00"
                    value={sea.weight_kg} onChange={e => setSea(p=>({...p, weight_kg: e.target.value}))} />
                </div>
              </>
            ) : (
              <div className="input-group">
                <label className="input-label">Weight (kg) — Air freight is charged by weight only</label>
                <input className="input-field" type="number" min="0" step="0.1" placeholder="0.00"
                  value={air.weight_kg} onChange={e => setAir(p=>({...p, weight_kg: e.target.value}))} />
              </div>
            )}

            {/* Tracking number with scan */}
            <div className="input-group">
              <label className="input-label">Tracking Number (快递号)</label>
              <div className="input-scan-row">
                <input className="input-field" style={{ margin: 0 }} placeholder="Scan or type package barcode"
                  value={goodsType === 'sea' ? sea.tracking_no : air.tracking_no}
                  onChange={e => goodsType === 'sea' ? setSea(p=>({...p, tracking_no: e.target.value})) : setAir(p=>({...p, tracking_no: e.target.value}))} />
                <button type="button" className="scan-trigger" onClick={() => setTrackScanOpen(true)} title="Scan barcode">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20} height={20}>
                    <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/>
                    <rect x="7" y="7" width="3" height="10" rx="1"/><rect x="14" y="7" width="3" height="10" rx="1"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Status</label>
              <select className="input-field"
                value={goodsType === 'sea' ? sea.status : air.status}
                onChange={e => goodsType === 'sea' ? setSea(p=>({...p, status: e.target.value})) : setAir(p=>({...p, status: e.target.value}))}>
                <option value="in_warehouse">In Warehouse</option>
                <option value="in_transit">In Transit</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>

            <PhotoUploader photos={photos.map(p => p.preview)} uploading={uploading}
              onAdd={handlePhotos} onRemove={removePhoto} />

            <div className="input-group">
              <label className="input-label">Notes (optional)</label>
              <textarea className="input-field" rows={3} placeholder="Handle with care, fragile, special instructions…"
                value={goodsType === 'sea' ? sea.notes : air.notes}
                onChange={e => goodsType === 'sea' ? setSea(p=>({...p, notes: e.target.value})) : setAir(p=>({...p, notes: e.target.value}))} />
            </div>

            <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving} style={{ padding: 14, fontSize: 16, marginTop: 4 }}>
              {saving ? 'Saving…' : 'Save Goods Record'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
