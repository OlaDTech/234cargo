import { useEffect, useRef, useState, useMemo } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { format, formatDistanceToNow } from 'date-fns'
import { Icons } from './Icons'
import { generateQR } from '../lib/qr'

// Re-export the icon set so pages can import from one place
export { Icons } from './Icons'

const STATUS_META = {
  in_warehouse: { label: 'In Warehouse', cls: 'pill-warehouse', Icon: Icons.warehouse, color: 'var(--blue)' },
  in_transit:   { label: 'In Transit',   cls: 'pill-transit',   Icon: Icons.ship,      color: 'var(--amber)' },
  delivered:    { label: 'Delivered',    cls: 'pill-delivered',  Icon: Icons.check,     color: 'var(--green)' },
  loading:      { label: 'Loading',      cls: 'pill-loading',    Icon: Icons.box,       color: 'var(--violet)' },
}
// Backward-compatible STATUS export (keeps .label/.cls; adds .Icon)
export const STATUS = STATUS_META

export function StatusPill({ status }) {
  const s = STATUS_META[status] || { label: status, cls: '', Icon: null, color: 'var(--t2)' }
  return <span className={`pill ${s.cls}`}>{s.Icon && <s.Icon size={12} color={s.color} />}{s.label}</span>
}
export function TypePill({ type }) {
  const air = type === 'air'
  const Icon = air ? Icons.plane : Icons.ship
  return <span className={`pill ${air ? 'pill-air' : 'pill-sea'}`}><Icon size={12} color={air ? 'var(--violet)' : 'var(--blue)'} />{air ? 'Air' : 'Sea'}</span>
}

// Real scannable QR code (no dependency)
export function QRCode({ value, size = 96, fg = '#0A1628', bg = '#FFFFFF', quiet = 2 }) {
  const matrix = useMemo(() => generateQR(value || '—'), [value])
  if (!matrix) return null
  const n = matrix.length, total = n + quiet * 2, cell = size / total
  const rects = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (matrix[r][c])
    rects.push(<rect key={`${r}-${c}`} x={(c + quiet) * cell} y={(r + quiet) * cell} width={cell + 0.5} height={cell + 0.5} fill={fg} />)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" style={{ display: 'block', borderRadius: 6 }}>
      <rect width={size} height={size} fill={bg} />{rects}
    </svg>
  )
}

export function Avatar({ name = '', size = 36, style = {} }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.36, ...style }}>
      {initials || '?'}
    </div>
  )
}

export function Modal({ open, title, onClose, children }) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-handle" />
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Input({ label, error, ...props }) {
  return (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <input className={`input-field ${error ? 'error' : ''}`} {...props} />
      {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  )
}
export function Textarea({ label, ...props }) {
  return (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <textarea className="input-field" {...props} />
    </div>
  )
}
export function Select({ label, children, ...props }) {
  return (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <select className="input-field" {...props}>{children}</select>
    </div>
  )
}

export function InputWithScan({ label, onScanClick, inputRef, ...props }) {
  return (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <div className="input-scan-row">
        <input ref={inputRef} className="input-field" style={{ margin: 0 }} {...props} />
        <button type="button" className="scan-trigger" onClick={onScanClick} title="Scan barcode / QR">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/>
            <rect x="7" y="7" width="3" height="10" rx="1"/>
            <rect x="14" y="7" width="3" height="10" rx="1"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

export function ScannerModal({ open, onClose, onResult, title = 'Scan QR or Barcode' }) {
  const [manual, setManual] = useState('')
  const [camError, setCamError] = useState('')
  const [scanning, setScanning] = useState(false)
  const html5Ref = useRef(null)

  useEffect(() => {
    if (!open) return
    setManual(''); setCamError(''); setScanning(false)
    let scanner
    const start = async () => {
      try {
        scanner = new Html5Qrcode('oa-qr-box')
        html5Ref.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decoded) => { stopScan(); onResult(decoded.trim()); onClose() },
          () => {}
        )
        setScanning(true)
      } catch {
        setCamError('Camera not available — type or paste below.')
      }
    }
    const t = setTimeout(start, 300)
    return () => { clearTimeout(t); stopScan() }
  }, [open])

  const stopScan = async () => {
    try {
      if (html5Ref.current?.isScanning) { await html5Ref.current.stop(); html5Ref.current.clear() }
    } catch {}
  }
  const handleClose = () => { stopScan(); onClose() }
  const confirm = () => { if (!manual.trim()) return; stopScan(); onResult(manual.trim()); onClose() }

  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="modal-sheet">
        <div className="modal-handle" />
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={handleClose}>✕</button>
        </div>
        <div style={{ borderRadius: 12, overflow: 'hidden', background: '#111', minHeight: 180, marginBottom: 16, position: 'relative' }}>
          <div id="oa-qr-box" style={{ width: '100%' }} />
          {!scanning && !camError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
              Starting camera…
            </div>
          )}
        </div>
        {camError && <div className="banner banner-warn">{camError}</div>}
        <div className="divider-text">or enter manually</div>
        <div className="input-group">
          <label className="input-label">Tracking No / Shipping Mark / Phone</label>
          <input className="input-field" placeholder="Paste or type here…" value={manual}
            onChange={e => setManual(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirm()} autoFocus />
        </div>
        <button className="btn btn-primary btn-full" onClick={confirm} disabled={!manual.trim()}>Confirm</button>
      </div>
    </div>
  )
}

export function CBMCalculator({ value, onChange }) {
  const l = parseFloat(value.length_cm) || 0
  const w = parseFloat(value.width_cm) || 0
  const h = parseFloat(value.height_cm) || 0
  const cbm = l && w && h ? (l * w * h / 1_000_000).toFixed(4) : null
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="input-label">Measurements (cm) — CBM auto-calculated</label>
      <div className="measure-row" style={{ marginBottom: 8 }}>
        {[['length_cm','L'],['width_cm','W'],['height_cm','H']].map(([f, lbl]) => (
          <div key={f}>
            <label className="input-label" style={{ fontSize: 10, textAlign: 'center', display: 'block' }}>{lbl} (cm)</label>
            <input className="input-field" type="number" min="0" step="0.1" placeholder="0"
              value={value[f] || ''} onChange={e => onChange({ ...value, [f]: e.target.value })}
              style={{ textAlign: 'center', padding: '10px 6px' }} />
          </div>
        ))}
      </div>
      {cbm && (
        <div className="cbm-result">
          <div className="cbm-result-value">{cbm} m³</div>
          <div className="cbm-result-label">= {l} × {w} × {h} ÷ 1,000,000</div>
        </div>
      )}
    </div>
  )
}

export function PhotoUploader({ photos = [], onAdd, onRemove, uploading }) {
  const ref = useRef()
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="input-label">Photos</label>
      <div className="photo-grid">
        {photos.map((url, i) => (
          <div key={i} className="photo-thumb">
            {url.startsWith('http') || url.startsWith('blob')
              ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 28 }}>{url}</span>}
            <button onClick={() => onRemove(i)} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        ))}
        <div className="photo-add" onClick={() => ref.current?.click()}>
          {uploading ? '⏳' : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14"/></svg>}
        </div>
        <input ref={ref} type="file" accept="image/*" multiple capture="environment" style={{ display: 'none' }}
          onChange={e => { onAdd(Array.from(e.target.files)); e.target.value = '' }} />
      </div>
    </div>
  )
}

export function PhotoGallery({ photos = [], compact = false }) {
  const [active, setActive] = useState(null)
  const list = (photos || []).filter(Boolean)
  if (list.length === 0) return null

  return (
    <>
      <div className={compact ? 'photo-strip' : 'photo-gallery'}>
        {list.map((url, i) => (
          <button key={`${url}-${i}`} className={compact ? 'photo-strip-item' : 'photo-gallery-item'} onClick={() => setActive(url)}>
            <img src={url} alt={`Goods photo ${i + 1}`} loading="lazy" />
          </button>
        ))}
      </div>
      <Modal open={!!active} title="Goods Photo" onClose={() => setActive(null)}>
        {active && <img src={active} alt="Goods" className="photo-preview-img" />}
      </Modal>
    </>
  )
}

export function ShippingLabel({ client, settings = {}, shipmentType }) {
  if (!client) return null
  const method = shipmentType === 'air' || shipmentType === 'sea' ? shipmentType : 'general'
  const payload = `234:${client.shipping_mark || ''}:${method}`
  return (
    <div className="shipping-label">
      {/* Brand header bar */}
      <div style={{ background: 'var(--teal)', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 11, fontFamily: 'Space Grotesk,sans-serif' }}>
            {(settings.company_name || 'OceanAir').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'Space Grotesk,sans-serif', letterSpacing: -0.2 }}>{settings.company_name || 'OceanAir Logistics'}</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9.5, letterSpacing: 0.3 }}>FREIGHT FORWARDING</div>
        </div>
        <Icons.box size={18} color="rgba(255,255,255,0.85)" />
      </div>
      <div style={{ padding: 16 }}>
        {method !== 'general' && <div className={`shipping-method-badge shipping-method-${method}`}>{method === 'air' ? 'AIR FREIGHT' : 'SEA FREIGHT'}</div>}
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Consignee</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)', marginTop: 2 }}>{client.full_name}</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 1 }}>{client.state || client.country}</div>
            <div style={{ fontSize: 12, color: 'var(--t2)' }}>{client.phone}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ padding: 5, background: '#fff', border: '1px solid var(--line)', borderRadius: 8 }}>
              <QRCode value={payload} size={84} fg="#0A1628" />
            </div>
            <div style={{ fontSize: 8.5, color: 'var(--t3)', marginTop: 4, letterSpacing: 0.4 }}>SCAN TO TRACK</div>
            <div style={{ fontSize: 8.5, color: 'var(--teal-d)', marginTop: 2, fontWeight: 700 }}>{client.shipping_mark}</div>
          </div>
        </div>
        {shipmentType && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}><TypePill type={shipmentType} /></div>}
        <div className="shipping-label-mark">
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Shipping Mark</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 4, color: '#fff', fontFamily: 'Space Grotesk,sans-serif', marginTop: 3 }}>{client.shipping_mark}</div>
        </div>
        <div style={{ borderTop: '1px dashed var(--line2)', marginTop: 14, paddingTop: 12 }}>
          <div style={{ fontSize: 9.5, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>Origin Warehouse</div>
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t1)' }}>{settings.china_warehouse_name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 1 }}>{settings.china_warehouse_address}</div>
          <div style={{ fontSize: 11.5, color: 'var(--teal-d)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><Icons.phone size={12} color="var(--teal-d)" />{settings.china_warehouse_phone}</div>
        </div>
      </div>
    </div>
  )
}

export function ReceiptView({ receipt, client, companyName = '234 Cargo' }) {
  if (!receipt) return null
  const items = typeof receipt.items === 'string' ? JSON.parse(receipt.items) : (receipt.items || [])
  const currency = receipt.currency || 'NGN'
  return (
    <div className="receipt-document">
      <header className="receipt-header">
        <div>
          <div className="receipt-company">{companyName}</div>
          <div className="receipt-company-note">Freight forwarding and logistics</div>
        </div>
        <div className="receipt-title-block">
          <div className="receipt-title">RECEIPT</div>
          <div className="receipt-number">{receipt.receipt_no}</div>
        </div>
      </header>
      <div className="receipt-rule" />
      <div className="receipt-details-grid">
        <div className="receipt-bill-to">
          <div className="receipt-kicker">BILL TO</div>
          <div className="receipt-client-name">{client?.full_name || receipt.client?.full_name}</div>
          <div>{client?.phone || receipt.client?.phone || 'Phone not supplied'}</div>
          <div className="receipt-mark">{client?.shipping_mark || receipt.client?.shipping_mark}</div>
        </div>
        <div className="receipt-meta">
          <div><span>Issued</span><strong>{receipt.issued_at && format(new Date(receipt.issued_at), 'dd MMM yyyy')}</strong></div>
          <div><span>Status</span><strong className={receipt.status === 'paid' ? 'receipt-paid' : 'receipt-unpaid'}>{receipt.status === 'paid' ? 'Paid' : 'Unpaid'}</strong></div>
        </div>
      </div>
      <table className="receipt-items-table">
        <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>{items.map((item, i) => (
          <tr key={i}>
            <td>{item.desc}</td><td>{item.qty || 1}</td><td>{formatMoney(item.unit_price, currency)}</td><td>{formatMoney((item.qty || 1) * item.unit_price, currency)}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="receipt-summary">
        {receipt.discount > 0 && <div><span>Discount</span><strong>- {formatMoney(receipt.discount, currency)}</strong></div>}
        <div className="receipt-total"><span>Total Due</span><strong>{formatMoney(receipt.total, currency)}</strong></div>
      </div>
      <footer className="receipt-footer">Thank you for choosing {companyName}. Keep this receipt for your records.</footer>
    </div>
  )
}

export function EmptyState({ icon = 'box', title = 'Nothing here', text = '' }) {
  const IconComp = typeof icon === 'string' && Icons[icon] ? Icons[icon] : null
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {IconComp ? <IconComp size={26} color="var(--t3)" /> : icon}
      </div>
      <div className="empty-state-title">{title}</div>
      {text && <div className="empty-state-text">{text}</div>}
    </div>
  )
}

export function SkeletonList({ n = 3 }) {
  return <>{Array.from({ length: n }).map((_, i) => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 12 }} />)}</>
}

export function TopNav({ role, title, right }) {
  return (
    <div className="topnav">
      <div>
        <div className="topnav-sub">{role}</div>
        <div className="topnav-title">{title}</div>
      </div>
      {right}
    </div>
  )
}

export function BottomNav({ tabs, active, onChange }) {
  return (
    <nav className="bottomnav">
      {tabs.map(t => {
        const on = active === t.id
        // Icon can be a function component OR a lucide object component (forwardRef/memo).
        // Render it as a component when it's a function or object; only treat strings/emoji as text.
        const Icon = t.Icon
        const isComponent = typeof Icon === 'function' || (typeof Icon === 'object' && Icon !== null)
        return (
          <button key={t.id} className={`bottomnav-item ${on ? 'active' : ''}`} onClick={() => onChange(t.id)}>
            <span className="nav-icon-wrap">
              {isComponent
                ? <Icon size={20} color={on ? 'var(--teal-d)' : 'var(--t3)'} />
                : <span style={{ fontSize: 18 }}>{Icon || t.icon}</span>}
            </span>
            <span className="bottomnav-label">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function SectionHeader({ title, action }) {
  return (
    <div className="section-header">
      <span className="section-title">{title}</span>
      {action}
    </div>
  )
}

export function TabRow({ tabs, active, onChange }) {
  return (
    <div className="tab-row">
      {tabs.map(t => (
        <button key={t.id} className={`tab-btn ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Confirm({ open, title, message, onConfirm, onCancel, danger }) {
  if (!open) return null
  return (
    <div className="modal-overlay">
      <div className="modal-sheet">
        <div className="modal-handle" />
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>{danger ? '⚠️' : '❓'}</div>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 22 }}>{message}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary btn-full" onClick={onCancel}>Cancel</button>
            <button className={`btn btn-full ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>Confirm</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export const fmtDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—'
export const fmtDateTime = (d) => d ? format(new Date(d), 'dd MMM yyyy, HH:mm') : '—'
export const fmtAgo = (d) => d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : ''
export const formatMoney = (amount, currency = 'NGN') => {
  const value = Number(amount || 0)
  if (currency === 'NGN' || currency === '₦') {
    return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
