import { useState, useEffect, useRef } from 'react'
import { LayoutDashboard, Users, Package, Ship, Settings, MessageCircle, LogOut, FileText, Boxes, CheckCircle2, ReceiptText, Container, Wallet, Pencil, Search, Download, Trash2, Barcode, QrCode, MoreHorizontal, ArrowLeft, Copy, Clipboard, RefreshCw } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { TopNav, BottomNav, SectionHeader, StatusPill, TypePill, SkeletonList, EmptyState, Modal, ShippingLabel, ReceiptView, PhotoGallery, TabRow, ScannerModal, fmtDate, fmtDateTime, fmtAgo, formatMoney } from '../../components/UI'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import RecordGoods from '../staff/RecordGoods'
import { DEFAULT_PERMISSIONS_BY_ROLE, PERMISSIONS, ROLE_OPTIONS, roleLabel } from '../../lib/roles'

export default function AdminApp() {
  const { profile, signOut, isAdmin, hasPermission } = useAuth()
  const [tab, setTab] = useState('dashboard')
  const [stats, setStats] = useState({ totalCbm: '0.00' })
  const [clients, setClients] = useState([])
  const [goods, setGoods] = useState([])
  const [containers, setContainers] = useState([])
  const [receipts, setReceipts] = useState([])
  const [expenses, setExpenses] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [messages, setMessages] = useState([])
  const [settings, setSettings] = useState({})
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Modal states
  const [showContainerDetail, setShowContainerDetail] = useState(null)
  const [showReceiptGen, setShowReceiptGen] = useState(null)
  const [showReceiptView, setShowReceiptView] = useState(null)
  const [showReceiptEdit, setShowReceiptEdit] = useState(null)
  const [showMsgThread, setShowMsgThread] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [showAddAnn, setShowAddAnn] = useState(false)
  const [showAddSup, setShowAddSup] = useState(false)
  const [showAddCont, setShowAddCont] = useState(false)
  const [showEditClient, setShowEditClient] = useState(null)
  const [showEditGoods, setShowEditGoods] = useState(null)
  const [showRecordGoods, setShowRecordGoods] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(null)
  const [showClientLabel, setShowClientLabel] = useState(null)
  const [clientScanOpen, setClientScanOpen] = useState(false)
  const [trackingScanOpen, setTrackingScanOpen] = useState(false)
  const [trackingScanResult, setTrackingScanResult] = useState(null)

  const [newAnn, setNewAnn] = useState({ title: '', body: '', is_important: false })
  const [newSup, setNewSup] = useState({ name: '', contact: '', category: '', address: '', notes: '' })
  const [newCont, setNewCont] = useState({ container_no: '', type: '20ft', route: 'Guangzhou → Port Klang', status: 'loading', departure_date: '', arrival_date: '' })
  const [receiptForm, setReceiptForm] = useState({ discount: 0 })
  const [receiptEditForm, setReceiptEditForm] = useState({ subtotal: '', discount: '', status: 'unpaid' })
  const [settingsForm, setSettingsForm] = useState({})
  const [expenseForm, setExpenseForm] = useState({ title: '', category: 'Operations', amount: '', expense_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [goodsQuery, setGoodsQuery] = useState('')
  const [goodsTypeFilter, setGoodsTypeFilter] = useState('all')
  const [goodsStatusFilter, setGoodsStatusFilter] = useState('all')
  const [goodsSort, setGoodsSort] = useState('newest')
  const [trackingQuery, setTrackingQuery] = useState('')
  const [clientQuery, setClientQuery] = useState('')
  const [adminLabelType, setAdminLabelType] = useState('sea')
  const reloadTimer = useRef(null)
  const messageListRef = useRef(null)

  useEffect(() => {
    loadAll()

    const scheduleReload = () => {
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(() => loadAll(false, false), 250)
    }

    const channel = supabase.channel('admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goods' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'containers' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleReload)
      .subscribe()

    return () => {
      clearTimeout(reloadTimer.current)
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!showMsgThread || !messageListRef.current) return
    const frame = requestAnimationFrame(() => { messageListRef.current.scrollTop = messageListRef.current.scrollHeight })
    return () => cancelAnimationFrame(frame)
  }, [messages, showMsgThread])

  const loadAll = async (showLoader = true, syncForms = true) => {
    if (showLoader) setLoading(true)
    const results = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('goods').select('*,client:clients(full_name,phone,shipping_mark)').order('created_at', { ascending: false }),
      supabase.from('containers').select('*').order('created_at', { ascending: false }),
      supabase.from('receipts').select('*,client:clients(full_name,phone,shipping_mark),goods:goods(description,type)').order('issued_at', { ascending: false }),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('messages').select('*,client:clients(full_name)').order('created_at'),
      supabase.from('settings').select('key,value'),
      supabase.from('profiles').select('*').order('full_name'),
    ])
    const [c, g, cont, rec, exp, ann, sup, msg, cfg, staff] = results.map(r => r.data || [])
    setClients(c); setGoods(g); setContainers(cont); setReceipts(rec)
    setExpenses(exp)
    setAnnouncements(ann); setSuppliers(sup); setMessages(msg)
    setStaffList(staff)
    const cfgMap = Object.fromEntries(cfg.map(r => [r.key, r.value]))
    setSettings(cfgMap)
    if (syncForms) setSettingsForm(cfgMap)
    const totalCbm = g.reduce((s, x) => s + (parseFloat(x.cbm) || 0), 0)
    const paidIncome = rec.filter(r => r.status === 'paid').reduce((s, r) => s + (parseFloat(r.total) || 0), 0)
    const totalExpenses = exp.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0)
    setStats({ clients: c.length, goods: g.length, totalCbm: totalCbm.toFixed(2), inTransit: g.filter(x=>x.status==='in_transit').length, delivered: g.filter(x=>x.status==='delivered').length, receipts: rec.length, containers: cont.length, messages: msg.filter(m=>m.sender==='client').length, paidIncome, totalExpenses, netBalance: paidIncome - totalExpenses })
    setShowContainerDetail(prev => prev ? (cont.find(x => x.id === prev.id) || prev) : prev)
    setShowReceiptView(prev => prev ? (rec.find(x => x.id === prev.id) || prev) : prev)
    setShowReceiptEdit(prev => prev ? (rec.find(x => x.id === prev.id) || prev) : prev)
    setShowMsgThread(prev => prev ? (c.find(x => x.id === prev.id) || prev) : prev)
    if (showLoader) setLoading(false)
  }

  const saveSettings = async () => {
    try {
      await Promise.all(Object.entries(settingsForm).map(([key, value]) =>
        supabase.from('settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
      ))
      setSettings(settingsForm)
      toast.success('Settings saved — all shipping labels updated!')
    } catch { toast.error('Failed to save settings') }
  }

  const generateReceipt = async () => {
    if (!showReceiptGen) return
    const g = goods.find(x => x.id === showReceiptGen.goods_id)
    const ratesCbm = parseFloat(settings.sea_rate_cbm || 150000)
    const ratesKg = g?.type === 'air' ? parseFloat(settings.air_rate_kg || 18000) : parseFloat(settings.sea_rate_kg || 1200)
    const items = g?.type === 'sea'
      ? [{ desc: 'Sea Freight (CBM)', qty: parseFloat(g.cbm) || 0, unit_price: ratesCbm }, { desc: 'Weight Surcharge', qty: parseFloat(g.weight_kg) || 0, unit_price: ratesKg }]
      : [{ desc: 'Air Freight (kg)', qty: parseFloat(g.weight_kg) || 0, unit_price: ratesKg }]
    const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
    const discount = parseFloat(receiptForm.discount) || 0
    const total = subtotal - discount
    const { data: recNo } = await supabase.rpc('generate_receipt_no')
    const { error } = await supabase.from('receipts').insert({ receipt_no: recNo, client_id: showReceiptGen.client_id, goods_id: showReceiptGen.goods_id, items: JSON.stringify(items), subtotal, discount, total, currency: 'NGN', issued_by: profile?.id })
    if (error) { toast.error(error.message); return }
    toast.success('Receipt ' + recNo + ' generated!')
    setShowReceiptGen(null); setReceiptForm({ discount: 0 }); loadAll()
  }

  const refreshData = async () => {
    setRefreshing(true)
    await loadAll(false)
    setRefreshing(false)
    toast.success('Data refreshed')
  }

  const openReceiptEdit = receipt => {
    setShowReceiptEdit(receipt)
    setReceiptEditForm({
      subtotal: String(receipt.subtotal ?? 0),
      discount: String(receipt.discount ?? 0),
      status: receipt.status || 'unpaid',
    })
  }

  const saveReceiptEdit = async () => {
    if (!showReceiptEdit) return
    const subtotal = Math.max(0, parseFloat(receiptEditForm.subtotal) || 0)
    const discount = Math.max(0, parseFloat(receiptEditForm.discount) || 0)
    const status = receiptEditForm.status === 'paid' ? 'paid' : 'unpaid'
    const { error } = await supabase.from('receipts').update({
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount),
      status,
      paid_at: status === 'paid' ? (showReceiptEdit.paid_at || new Date().toISOString()) : null,
    }).eq('id', showReceiptEdit.id)
    if (error) { toast.error(error.message); return }
    toast.success('Receipt updated')
    setShowReceiptEdit(null)
    setShowReceiptView(null)
    loadAll()
  }

  const sendReply = async () => {
    if (!replyText.trim() || !showMsgThread) return
    await supabase.from('messages').insert({ client_id: showMsgThread.id, sender: 'admin', message: replyText.trim() })
    setReplyText('')
    loadAll()
  }

  const copyMessage = async text => {
    try { await navigator.clipboard.writeText(text); toast.success('Message copied') }
    catch { toast.error('Could not copy this message') }
  }

  const pasteReply = async () => {
    try { setReplyText(await navigator.clipboard.readText()) }
    catch { toast.error('Allow clipboard access to paste') }
  }

  const deleteMessage = async id => {
    if (!window.confirm('Delete this message?')) return
    const { error } = await supabase.from('messages').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Message deleted')
    loadAll()
  }

  const updateContainerStatus = async (id, status) => {
    await supabase.from('containers').update({ status }).eq('id', id)
    // If delivered, update all goods in this container
    if (status === 'delivered') {
      await supabase.from('goods').update({ status: 'delivered', updated_at: new Date().toISOString() }).eq('container_id', id)
    }
    toast.success('Container updated')
    loadAll()
  }

  const togglePermission = async (staffId, perm, current) => {
    const updated = current.includes(perm) ? current.filter(p => p !== perm) : [...current, perm]
    const { error } = await supabase.from('profiles').update({ permissions: updated }).eq('id', staffId)
    if (error) { toast.error(error.message); return }
    toast.success(`Staff ${perm} access updated`)
    loadAll()
  }

  const updateTeamRole = async (member, role) => {
    if (member.id === profile?.id) {
      toast.error('You cannot change your own administrator role')
      return
    }
    const { error } = await supabase
      .from('profiles')
      .update({ role, permissions: DEFAULT_PERMISSIONS_BY_ROLE[role] })
      .eq('id', member.id)
    if (error) { toast.error(error.message); return }
    toast.success(`${member.full_name} is now ${roleLabel(role)}`)
    loadAll()
  }

  const openExpenseForm = (expense = null) => {
    setShowExpenseForm(expense || {})
    setExpenseForm(expense ? {
      title: expense.title || '',
      category: expense.category || 'Operations',
      amount: expense.amount || '',
      expense_date: expense.expense_date || new Date().toISOString().slice(0, 10),
      notes: expense.notes || '',
    } : { title: '', category: 'Operations', amount: '', expense_date: new Date().toISOString().slice(0, 10), notes: '' })
  }

  const saveExpense = async () => {
    if (!expenseForm.title.trim() || !expenseForm.amount) { toast.error('Enter expense title and amount'); return }
    const payload = { ...expenseForm, amount: parseFloat(expenseForm.amount), currency: 'NGN', recorded_by: profile?.id }
    const query = showExpenseForm?.id
      ? supabase.from('expenses').update(payload).eq('id', showExpenseForm.id)
      : supabase.from('expenses').insert(payload)
    const { error } = await query
    if (error) { toast.error(error.message); return }
    toast.success(showExpenseForm?.id ? 'Expense updated' : 'Expense added')
    setShowExpenseForm(null)
    loadAll()
  }

  const saveEditedGoods = async () => {
    if (!showEditGoods?.description?.trim()) { toast.error('Description is required'); return }
    const payload = {
      description: showEditGoods.description,
      type: showEditGoods.type,
      length_cm: showEditGoods.type === 'sea' ? parseFloat(showEditGoods.length_cm) || null : null,
      width_cm: showEditGoods.type === 'sea' ? parseFloat(showEditGoods.width_cm) || null : null,
      height_cm: showEditGoods.type === 'sea' ? parseFloat(showEditGoods.height_cm) || null : null,
      quantity: parseInt(showEditGoods.quantity, 10) || 1,
      weight_kg: parseFloat(showEditGoods.weight_kg) || 0,
      tracking_no: showEditGoods.tracking_no || null,
      status: showEditGoods.status,
      notes: showEditGoods.notes || '',
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('goods').update(payload).eq('id', showEditGoods.id)
    if (error) { toast.error(error.message); return }
    toast.success('Goods updated')
    setShowEditGoods(null)
    loadAll()
  }

  const removeRecord = async (table, id, label) => {
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success(`${label} deleted`)
    loadAll()
  }

  const searchClientFromScan = value => {
    const raw = String(value || '').trim()
    const parts = raw.split(':')
    const identifier = (parts[0] === '234' || parts[0] === 'OA') && parts[1] ? parts[1] : raw
    if (parts[2] === 'sea' || parts[2] === 'air') setAdminLabelType(parts[2])
    setClientQuery(identifier)
    toast.success('Client label scanned')
  }

  const identifyTrackingOwner = async value => {
    const trackingNumber = String(value || '').trim()
    if (!trackingNumber) return
    setTrackingQuery(trackingNumber)
    const { data, error } = await supabase.from('goods').select('*,client:clients(full_name,phone,shipping_mark,state)').eq('tracking_no', trackingNumber).maybeSingle()
    if (error || !data) {
      setTrackingScanResult(null)
      toast.error('No goods record found for this tracking number')
      return
    }
    setTrackingScanResult(data)
    toast.success(`Package belongs to ${data.client?.full_name || 'this client'}`)
  }

  const exportCsv = (filename, rows) => {
    if (!rows.length) { toast.error('There is no data to export'); return }
    const columns = Object.keys(rows[0])
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
    const csv = [columns.join(','), ...rows.map(row => columns.map(column => escape(row[column])).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${filename}.csv`; link.click()
    URL.revokeObjectURL(url)
  }

  const tabs = [
    hasPermission('dashboard') && { id: 'dashboard', label: 'Overview', Icon: LayoutDashboard },
    hasPermission('goods') && { id: 'goods', label: 'Goods', Icon: Package },
    hasPermission('scan') && { id: 'tracking', label: 'Track', Icon: Barcode },
    (hasPermission('finance') || hasPermission('receipts')) && { id: 'finance', label: hasPermission('finance') ? 'Finance' : 'Receipts', Icon: Wallet },
    (isAdmin || hasPermission('clients') || hasPermission('containers') || hasPermission('messages')) && { id: 'more', label: 'More', Icon: MoreHorizontal },
  ].filter(Boolean)
  const activeNav = ['clients', 'containers', 'messages', 'settings'].includes(tab) ? 'more' : tab

  useEffect(() => {
    if (tabs.length && !tabs.some(item => item.id === tab)) setTab(tabs[0].id)
  }, [tab, profile?.role, profile?.permissions?.join(',')])

  // Group messages by client
  const clientThreads = clients.map(c => ({
    ...c,
    msgs: messages.filter(m => m.client_id === c.id),
    lastMsg: messages.filter(m => m.client_id === c.id).slice(-1)[0],
  })).filter(c => c.msgs.length > 0).sort((a,b) => new Date(b.lastMsg?.created_at) - new Date(a.lastMsg?.created_at))

  const filteredGoods = goods.filter(g => {
    const term = goodsQuery.trim().toLowerCase()
    const matchesTerm = !term || [g.description, g.tracking_no, g.client?.full_name, g.client?.shipping_mark].some(value => String(value || '').toLowerCase().includes(term))
    return matchesTerm && (goodsTypeFilter === 'all' || g.type === goodsTypeFilter) && (goodsStatusFilter === 'all' || g.status === goodsStatusFilter)
  }).sort((a, b) => {
    if (goodsSort === 'cbm') return (parseFloat(b.cbm) || 0) - (parseFloat(a.cbm) || 0)
    if (goodsSort === 'weight') return (parseFloat(b.weight_kg) || 0) - (parseFloat(a.weight_kg) || 0)
    if (goodsSort === 'quantity') return (parseInt(b.quantity, 10) || 1) - (parseInt(a.quantity, 10) || 1)
    if (goodsSort === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
    return new Date(b.created_at) - new Date(a.created_at)
  })

  const trackedGoods = goods.filter(g => g.tracking_no).filter(g => {
    const term = trackingQuery.trim().toLowerCase()
    return !term || [g.tracking_no, g.description, g.client?.full_name, g.client?.shipping_mark].some(value => String(value || '').toLowerCase().includes(term))
  })
  const filteredClients = clients.filter(client => {
    const term = clientQuery.trim().toLowerCase()
    return !term || [client.full_name, client.phone, client.shipping_mark, client.state].some(value => String(value || '').toLowerCase().includes(term))
  })
  const totalCbmDisplay = Number.parseFloat(stats.totalCbm)
  const safeTotalCbm = Number.isFinite(totalCbmDisplay) ? totalCbmDisplay.toFixed(2) : '0.00'
  const dashboardStats = [
    (isAdmin || hasPermission('clients')) && { label: 'Total Clients', value: stats.clients, Icon: Users, color: 'var(--blue)' },
    (isAdmin || hasPermission('goods') || hasPermission('scan')) && { label: 'Total Goods', value: stats.goods, Icon: Package, color: 'var(--teal)' },
    (isAdmin || hasPermission('goods') || hasPermission('containers')) && { label: 'Total CBM', value: safeTotalCbm, Icon: Boxes, color: 'var(--amber)' },
    (isAdmin || hasPermission('goods') || hasPermission('scan')) && { label: 'In Transit', value: stats.inTransit, Icon: Ship, color: 'var(--amber)' },
    (isAdmin || hasPermission('goods') || hasPermission('scan')) && { label: 'Delivered', value: stats.delivered, Icon: CheckCircle2, color: 'var(--green)' },
    (isAdmin || hasPermission('finance') || hasPermission('receipts')) && { label: 'Receipts', value: stats.receipts, Icon: ReceiptText, color: 'var(--violet)' },
    (isAdmin || hasPermission('containers')) && { label: 'Containers', value: stats.containers, Icon: Container, color: 'var(--ink3)' },
    (isAdmin || hasPermission('messages')) && { label: 'Messages', value: stats.messages, Icon: MessageCircle, color: 'var(--red)' },
    (isAdmin || hasPermission('finance')) && { label: 'Paid Income', value: formatMoney(stats.paidIncome), Icon: Wallet, color: 'var(--green)' },
    (isAdmin || hasPermission('finance')) && { label: 'Expenses', value: formatMoney(stats.totalExpenses), Icon: FileText, color: 'var(--red)' },
  ].filter(Boolean)

  return (
    <div className="app-shell">
      <TopNav role={isAdmin ? 'Admin' : roleLabel(profile?.role)} title={tab === 'dashboard' ? (isAdmin ? 'Admin Overview' : 'Operations Overview') : tab === 'goods' ? 'Goods Management' : tab === 'tracking' ? 'Tracking Register' : tab === 'clients' ? 'Clients' : tab === 'containers' ? 'Containers' : tab === 'messages' ? 'Messages' : tab === 'finance' ? (hasPermission('finance') ? 'Finance' : 'Receipts') : tab === 'settings' ? 'System Settings' : 'More Tools'}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={refreshData} disabled={refreshing} title="Refresh data" aria-label="Refresh data" style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--white)', borderRadius: 8, cursor: refreshing ? 'wait' : 'pointer' }}>
              <RefreshCw size={16} style={{ opacity: refreshing ? 0.55 : 1 }} />
            </button>
            <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--white)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontSize: 12 }}>
              <LogOut size={14} style={{ display: 'inline', marginRight: 4 }} />Logout
            </button>
          </div>
        }
      />

      <div className="page">

        {/* OVERVIEW */}
        {tab === 'dashboard' && hasPermission('dashboard') && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif' }}>Hello, {profile?.full_name?.split(' ')[0]} 👋</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{format(new Date(), 'EEEE, d MMMM yyyy')}</div>
            </div>

            <div className="stat-grid">
              {dashboardStats.map((s, i) => (
                <div key={i} className="stat-card">
                  <div className="stat-icon" style={{ background: 'color-mix(in srgb, ' + s.color + ' 12%, transparent)' }}><s.Icon size={17} color={s.color} /></div>
                  <div className="stat-value">{s.value ?? '—'}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            {isAdmin && <>
            <SectionHeader title="Team Roles and Permissions" action={<span style={{ fontSize: 12, color: 'var(--muted)' }}>{staffList.length} members</span>} />
            {staffList.map(s => (
              <div key={s.id} className="card">
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{s.full_name} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>- {roleLabel(s.role)}</span></div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{s.phone}</div>
                <div className="input-group" style={{ marginBottom: 12 }}>
                  <label className="input-label">Role</label>
                  <select className="input-field" value={s.role} disabled={s.id === profile?.id} onChange={event => updateTeamRole(s, event.target.value)}>
                    {ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PERMISSIONS.map(perm => {
                    const has = (s.permissions || []).includes(perm)
                    return (
                      <button key={perm} onClick={() => togglePermission(s.id, perm, s.permissions || [])} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', background: has ? 'var(--teal)' : 'var(--surface)', color: has ? 'var(--navy)' : 'var(--muted)', fontWeight: has ? 700 : 400, fontFamily: 'Inter, sans-serif', transition: 'all 0.15s' }}>
                        {perm}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Announcements */}
            <SectionHeader title="Announcements" action={<button className="btn btn-sm btn-primary" onClick={() => setShowAddAnn(true)}>+ New</button>} />
            {announcements.map(a => (
              <div key={a.id} className="card" style={{ borderLeft: `4px solid ${a.is_important ? 'var(--danger)' : 'var(--teal)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{a.title}</div>
                  <button onClick={async () => { await supabase.from('announcements').delete().eq('id', a.id); loadAll() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>✕</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{a.body.slice(0, 100)}…</div>
              </div>
            ))}
            </>}

            {isAdmin && <>
            {/* Suppliers */}
            <SectionHeader title="Suppliers" action={<button className="btn btn-sm btn-primary" onClick={() => setShowAddSup(true)}>+ Add</button>} />
            {suppliers.map(s => (
              <div key={s.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.category} · {s.contact}</div>
                  </div>
                  <button onClick={async () => { await supabase.from('suppliers').delete().eq('id', s.id); loadAll() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16 }}>✕</button>
                </div>
              </div>
            ))}
            </>}
          </>
        )}

        {/* GOODS MANAGEMENT */}
        {tab === 'goods' && hasPermission('goods') && (
          <>
            <SectionHeader title={`All Goods (${filteredGoods.length})`} action={<div style={{ display: 'flex', gap: 8 }}><button className="btn btn-sm btn-secondary" onClick={() => exportCsv('234cargo-goods', filteredGoods.map(g => ({ description: g.description, tracking_no: g.tracking_no, client: g.client?.full_name, shipping_mark: g.client?.shipping_mark, shipment_type: g.type, status: g.status, cbm: g.cbm, weight_kg: g.weight_kg, recorded_at: g.created_at })))}><Download size={14} />Export</button><button className="btn btn-sm btn-primary" onClick={() => setShowRecordGoods(true)}>+ Record</button></div>} />
            <div className="card" style={{ padding: 12 }}>
              <div className="search-control" style={{ marginBottom: 10 }}><Search size={18} /><input placeholder="Search client, shipping mark, goods or tracking number" value={goodsQuery} onChange={e => setGoodsQuery(e.target.value)} /></div>
              <div className="filter-row">
                <select className="input-field" value={goodsTypeFilter} onChange={e => setGoodsTypeFilter(e.target.value)}><option value="all">All shipment types</option><option value="sea">Sea</option><option value="air">Air</option></select>
                <select className="input-field" value={goodsStatusFilter} onChange={e => setGoodsStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="in_warehouse">In warehouse</option><option value="in_transit">In transit</option><option value="delivered">Delivered</option></select>
                <select className="input-field" value={goodsSort} onChange={e => setGoodsSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="cbm">Highest CBM</option><option value="weight">Heaviest first</option><option value="quantity">Most packages</option></select>
              </div>
            </div>
            {loading ? <SkeletonList /> : filteredGoods.map(g => {
              const hasReceipt = receipts.find(r => r.goods_id === g.id)
              return (
                <div key={g.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, flex: 1, paddingRight: 8 }}>{g.description}</div>
                    <StatusPill status={g.status} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                    <span style={{ color: 'var(--teal-dark)', fontWeight: 600 }}>{g.client?.full_name}</span>
                    {g.type === 'sea' && g.cbm ? ` · ${g.cbm} CBM` : ''} · {g.weight_kg} kg
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                    <TypePill type={g.type} />
                    {g.tracking_no && <span style={{ fontSize: 11, color: 'var(--muted)', padding: '2px 8px', background: 'var(--surface)', borderRadius: 20 }}>{g.tracking_no}</span>}
                  </div>
                  <PhotoGallery photos={g.photos?.slice(0, 4)} compact />
                  {/* Container assignment */}
                  <div style={{ marginBottom: 8 }}>
                    <select className="input-field" style={{ fontSize: 13, padding: '7px 10px' }}
                      value={g.container_id || ''}
                      onChange={async e => {
                        await supabase.from('goods').update({ container_id: e.target.value || null }).eq('id', g.id)
                        toast.success('Container assigned'); loadAll()
                      }}>
                      <option value="">Assign to container…</option>
                      {containers.filter(c => c.status !== 'delivered').map(c => <option key={c.id} value={c.id}>{c.container_no} ({c.status})</option>)}
                    </select>
                  </div>
                  {/* Status change */}
                  <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                    {['in_warehouse','in_transit','delivered'].map(s => (
                      <button key={s} onClick={async () => { await supabase.from('goods').update({ status: s }).eq('id', g.id); toast.success('Updated'); loadAll() }} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', background: g.status === s ? 'var(--teal)' : 'var(--surface)', color: g.status === s ? 'var(--navy)' : 'var(--muted)', cursor: 'pointer', fontWeight: g.status === s ? 700 : 400, fontFamily: 'Inter, sans-serif' }}>
                        {s.replace('_',' ')}
                      </button>
                    ))}
                  </div>
                  {/* Receipt */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setShowEditGoods(g)} className="btn btn-sm btn-secondary"><Pencil size={14} />Edit</button>
                    <button onClick={() => removeRecord('goods', g.id, 'goods record')} className="btn btn-sm btn-danger"><Trash2 size={14} />Delete</button>
                    {!hasReceipt && (hasPermission('receipts') || hasPermission('finance')) ? (
                      <button onClick={() => setShowReceiptGen({ goods_id: g.id, client_id: g.client_id, goods: g })} className="btn btn-sm btn-secondary">Generate Receipt</button>
                    ) : hasReceipt && (hasPermission('receipts') || hasPermission('finance')) ? (
                      <button onClick={() => setShowReceiptView(hasReceipt)} className="btn btn-sm btn-ghost">View Receipt</button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {tab === 'tracking' && hasPermission('scan') && (
          <>
            <SectionHeader title="Tracking Number Register" action={<button className="btn btn-sm btn-secondary" onClick={() => exportCsv('234cargo-tracking-register', trackedGoods.map(g => ({ tracking_no: g.tracking_no, description: g.description, client: g.client?.full_name, shipping_mark: g.client?.shipping_mark, shipment_type: g.type, status: g.status, cbm: g.cbm, weight_kg: g.weight_kg, received_at: g.created_at })))}><Download size={14} />Export</button>} />
            <div className="search-control"><Search size={18} /><input placeholder="Search tracking number, client, mark or goods" value={trackingQuery} onChange={e => { setTrackingQuery(e.target.value); setTrackingScanResult(null) }} /><button className="search-scan-button" onClick={() => setTrackingScanOpen(true)} title="Scan tracking number" aria-label="Scan tracking number"><Barcode size={18} /></button></div>
            {trackingScanResult && <section className="tracking-owner-card"><div className="tracking-owner-heading"><span>Package owner identified</span><button onClick={() => setTrackingScanResult(null)}>Clear</button></div><div className="tracking-owner-name">{trackingScanResult.client?.full_name}</div><div className="tracking-owner-mark">{trackingScanResult.client?.shipping_mark}</div><div className="tracking-owner-grid"><div><span>Tracking</span><strong>{trackingScanResult.tracking_no}</strong></div><div><span>Shipment</span><strong>{trackingScanResult.type === 'air' ? 'Air freight' : 'Sea freight'}</strong></div><div><span>Package</span><strong>{trackingScanResult.description}</strong></div><div><span>Status</span><StatusPill status={trackingScanResult.status} /></div></div></section>}
            {trackedGoods.length === 0 ? <EmptyState icon="box" title="No matching tracking numbers" text="Tracking numbers recorded by staff will appear here." /> : trackedGoods.map(g => (
              <div key={g.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><div style={{ color: 'var(--teal-d)', fontWeight: 800, fontSize: 16 }}>{g.tracking_no}</div><div style={{ fontWeight: 700, marginTop: 4 }}>{g.description}</div><div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>{g.client?.full_name} · {g.client?.shipping_mark}</div></div><div style={{ textAlign: 'right' }}><TypePill type={g.type} /><div style={{ marginTop: 7 }}><StatusPill status={g.status} /></div></div></div>
                <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10 }}>{g.type === 'sea' ? `${g.cbm || 0} CBM · ` : ''}{g.weight_kg || 0} kg · Recorded {fmtDate(g.created_at)}</div>
              </div>
            ))}
          </>
        )}

        {tab === 'clients' && hasPermission('clients') && (
          <>
            <button className="section-back" onClick={() => setTab('more')}><ArrowLeft size={16} />Back</button>
            <SectionHeader title={`Clients (${filteredClients.length})`} action={<button className="btn btn-sm btn-secondary" onClick={() => exportCsv('234cargo-clients', filteredClients.map(client => ({ full_name: client.full_name, phone: client.phone, state: client.state, country: client.country, shipping_mark: client.shipping_mark, notes: client.notes, registered_at: client.created_at })))}><Download size={14} />Export Excel</button>} />
            <div className="search-control"><Search size={18} /><input placeholder="Search name, phone, state or shipping mark" value={clientQuery} onChange={e => setClientQuery(e.target.value)} /><button className="search-scan-button" onClick={() => setClientScanOpen(true)} title="Scan client shipping label" aria-label="Scan client shipping label"><Barcode size={18} /></button></div>
            {filteredClients.length === 0 ? <EmptyState icon="users" title="No matching clients" /> : filteredClients.map(client => (
              <div key={client.id} className="card"><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><div style={{ fontWeight: 800 }}>{client.full_name}</div><div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>{client.phone} · {client.state || 'Nigeria'}</div><div style={{ color: 'var(--teal-d)', fontSize: 13, fontWeight: 800, marginTop: 4 }}>{client.shipping_mark}</div></div><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}><div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(client.created_at)}</div><button className="btn btn-xs btn-secondary" onClick={() => setShowClientLabel(client)}><QrCode size={13} />Label</button></div></div></div>
            ))}
          </>
        )}

        {tab === 'more' && (
          <>
            <SectionHeader title="More Tools" />
            {[
              hasPermission('clients') && { id: 'clients', title: 'Client Directory', text: `${clients.length} registered client${clients.length === 1 ? '' : 's'}, with export.`, Icon: Users },
              (hasPermission('goods') || hasPermission('containers')) && { id: 'containers', title: 'Containers and Parking List', text: 'Manage container loading, routes and unassigned goods.', Icon: Ship },
              hasPermission('messages') && { id: 'messages', title: 'Client Messages', text: `${clientThreads.length} active conversation${clientThreads.length === 1 ? '' : 's'}.`, Icon: MessageCircle },
              isAdmin && { id: 'settings', title: 'Settings and Staff Access', text: 'Company settings, staff permissions, suppliers and announcements.', Icon: Settings },
            ].filter(Boolean).map(item => (
              <button key={item.id} className="more-menu-item" onClick={() => setTab(item.id)}>
                <span className="more-menu-icon"><item.Icon size={21} /></span><span><strong>{item.title}</strong><small>{item.text}</small></span><span className="more-menu-arrow">›</span>
              </button>
            ))}
          </>
        )}

        {/* CONTAINERS */}
        {tab === 'containers' && (hasPermission('goods') || hasPermission('containers')) && (
          <>
            <button className="section-back" onClick={() => setTab('more')}><ArrowLeft size={16} />Back</button>
            <SectionHeader title="Containers" action={<button className="btn btn-sm btn-primary" onClick={() => setShowAddCont(true)}>+ New</button>} />
            {loading ? <SkeletonList /> : containers.map(c => {
              const cGoods = goods.filter(g => g.container_id === c.id)
              const totalCbm = cGoods.reduce((s, g) => s + (parseFloat(g.cbm) || 0), 0)
              return (
                <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setShowContainerDetail(c)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 16 }}>{c.container_no}</div>
                    <StatusPill status={c.status} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{c.route} · {c.type}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                    Dep {fmtDate(c.departure_date)} → ETA {fmtDate(c.arrival_date)}
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                    <span style={{ color: 'var(--info)' }}>{cGoods.length} items</span>
                    <span style={{ color: 'var(--amber)' }}>{totalCbm.toFixed(2)} CBM</span>
                  </div>
                </div>
              )
            })}

            {/* Parking list */}
            <div style={{ marginTop: 24 }}>
              <SectionHeader title="Parking List" action={<button className="btn btn-xs btn-secondary" onClick={() => exportCsv('234cargo-parking-list', goods.filter(g => !g.container_id).map(g => ({ description: g.description, tracking_no: g.tracking_no, client: g.client?.full_name, shipping_mark: g.client?.shipping_mark, shipment_type: g.type, cbm: g.cbm, weight_kg: g.weight_kg, status: g.status })))}><Download size={13} />Export</button>} />
              {goods.filter(g => !g.container_id).map(g => (
                <div key={g.id} className="card card-sm">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{g.description}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{g.client?.full_name} · {g.type === 'sea' && g.cbm ? g.cbm + ' CBM · ' : ''}{g.weight_kg} kg</div>
                    </div>
                    <TypePill type={g.type} />
                  </div>
                  <select className="input-field" style={{ fontSize: 13, padding: '7px 10px' }} defaultValue=""
                    onChange={async e => {
                      if (!e.target.value) return
                      await supabase.from('goods').update({ container_id: e.target.value }).eq('id', g.id)
                      toast.success('Assigned!'); loadAll()
                    }}>
                    <option value="">Assign to container…</option>
                    {containers.filter(c => c.status !== 'delivered').map(c => <option key={c.id} value={c.id}>{c.container_no}</option>)}
                  </select>
                </div>
              ))}
              {goods.filter(g => !g.container_id).length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>All goods have been assigned to containers.</div>}
            </div>
          </>
        )}

        {/* MESSAGES */}
        {tab === 'messages' && hasPermission('messages') && (
          <>
            <button className="section-back" onClick={() => setTab('more')}><ArrowLeft size={16} />Back</button>
            <SectionHeader title="Client Messages" />
            {clientThreads.length === 0 ? <EmptyState icon="chat" title="No messages yet" /> : clientThreads.map(c => (
              <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setShowMsgThread(c)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--navy)', color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                    {c.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMsg?.message}</div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtAgo(c.lastMsg?.created_at)}</div>
                    {c.msgs.filter(m => m.sender === 'client').length > 0 && (
                      <div style={{ background: 'var(--danger)', color: 'var(--white)', borderRadius: '50%', width: 20, height: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4, marginLeft: 'auto' }}>
                        {c.msgs.filter(m => m.sender === 'client').length}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* FINANCE */}
        {tab === 'finance' && (hasPermission('finance') || hasPermission('receipts')) && (
          <>
            {hasPermission('finance') && <>
            <SectionHeader title="Financial Summary" action={<button className="btn btn-sm btn-primary" onClick={() => openExpenseForm()}>+ Expense</button>} />
            <div className="stat-grid">
              {[
                { label: 'Paid Income', value: formatMoney(stats.paidIncome), Icon: Wallet, color: 'var(--green)' },
                { label: 'Unpaid Invoices', value: formatMoney(receipts.filter(r => r.status === 'unpaid').reduce((s, r) => s + (parseFloat(r.total) || 0), 0)), Icon: ReceiptText, color: 'var(--amber)' },
                { label: 'Expenses', value: formatMoney(stats.totalExpenses), Icon: FileText, color: 'var(--red)' },
                { label: 'Net Balance', value: formatMoney(stats.netBalance), Icon: Boxes, color: Number(stats.netBalance || 0) >= 0 ? 'var(--green)' : 'var(--red)' },
              ].map((s, i) => (
                <div key={i} className="stat-card">
                  <div className="stat-icon" style={{ background: 'color-mix(in srgb, ' + s.color + ' 12%, transparent)' }}><s.Icon size={17} color={s.color} /></div>
                  <div className="stat-value" style={{ fontSize: 17 }}>{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            <SectionHeader title="Expenses" action={<button className="btn btn-xs btn-secondary" onClick={() => exportCsv('234cargo-expenses', expenses.map(exp => ({ date: exp.expense_date, title: exp.title, category: exp.category, amount_ngn: exp.amount, notes: exp.notes })))}><Download size={13} />Export</button>} />
            <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
              {expenses.length === 0 ? <EmptyState icon="box" title="No expenses yet" text="Add rent, freight, handling, staff, or operating costs here." /> : (
                <table className="finance-table">
                  <thead>
                    <tr><th>Date</th><th>Expense</th><th>Category</th><th>Amount</th><th></th></tr>
                  </thead>
                  <tbody>
                    {expenses.map(exp => (
                      <tr key={exp.id}>
                        <td>{fmtDate(exp.expense_date)}</td>
                        <td><div style={{ fontWeight: 600 }}>{exp.title}</div>{exp.notes && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{exp.notes}</div>}</td>
                        <td>{exp.category}</td>
                        <td className="amount-expense">{formatMoney(exp.amount, exp.currency || 'NGN')}</td>
                        <td style={{ display: 'flex', gap: 6 }}><button className="btn btn-xs btn-secondary" onClick={() => openExpenseForm(exp)}><Pencil size={12} />Edit</button><button className="btn btn-xs btn-danger" onClick={() => removeRecord('expenses', exp.id, 'expense')}><Trash2 size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            </>}

            <SectionHeader title="Payment List" action={<button className="btn btn-xs btn-secondary" onClick={() => exportCsv('234cargo-payments', receipts.map(r => ({ date: r.issued_at, receipt_no: r.receipt_no, client: r.client?.full_name, status: r.status, total_ngn: r.total, paid_at: r.paid_at })))}><Download size={13} />Export</button>} />
            <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
              <table className="finance-table">
                <thead>
                  <tr><th>Date</th><th>Receipt</th><th>Client</th><th>Status</th><th>Total</th><th></th></tr>
                </thead>
                <tbody>
                  {receipts.map(r => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.issued_at)}</td>
                      <td>{r.receipt_no}</td>
                      <td>{r.client?.full_name}</td>
                      <td>{r.status}</td>
                      <td className="amount-income">{formatMoney(r.total, r.currency || 'NGN')}</td>
                      <td><button className="btn btn-xs btn-secondary" onClick={() => setShowReceiptView(r)}><ReceiptText size={12} />Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && isAdmin && (
          <>
            <button className="section-back" onClick={() => setTab('more')}><ArrowLeft size={16} />Back</button>
            <SectionHeader title="System Settings" action={<span style={{ fontSize: 11, color: 'var(--muted)' }}>Admin only</span>} />
            <div className="banner banner-warn" style={{ marginBottom: 16 }}>Changes here update all shipping labels immediately.</div>

            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)', marginBottom: 16 }}>China Warehouse</div>
              {[
                ['china_warehouse_name', 'Warehouse Name'],
                ['china_warehouse_address', 'Warehouse Address'],
                ['china_warehouse_phone', 'Warehouse Phone'],
              ].map(([k, l]) => (
                <div key={k} className="input-group">
                  <label className="input-label">{l}</label>
                  <input className="input-field" value={settingsForm[k] || ''} onChange={e => setSettingsForm(p => ({...p, [k]: e.target.value}))} />
                </div>
              ))}
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)', marginBottom: 16 }}>Company Info</div>
              <div className="input-group">
                <label className="input-label">Company Name</label>
                <input className="input-field" value={settingsForm.company_name || ''} onChange={e => setSettingsForm(p => ({...p, company_name: e.target.value}))} />
              </div>
            </div>

            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)', marginBottom: 16 }}>Rates</div>
              {[['sea_rate_cbm','Sea Freight Rate (₦/CBM)'],['sea_rate_kg','Sea Surcharge (₦/kg)'],['air_rate_kg','Air Freight Rate (₦/kg)']].map(([k,l]) => (
                <div key={k} className="input-group">
                  <label className="input-label">{l}</label>
                  <input className="input-field" type="number" step="0.01" value={settingsForm[k] || ''} onChange={e => setSettingsForm(p => ({...p, [k]: e.target.value}))} />
                </div>
              ))}
            </div>

            <button className="btn btn-primary btn-full" onClick={saveSettings} style={{ padding: 14, fontSize: 16 }}>Save All Settings</button>

            {/* Preview label */}
            {clients[0] && (
              <div style={{ marginTop: 20 }}>
                <SectionHeader title="Label Preview" />
                <ShippingLabel client={clients[0]} settings={settingsForm} />
              </div>
            )}
          </>
        )}

      </div>

      <BottomNav tabs={tabs} active={activeNav} onChange={setTab} />

      {/* Container detail */}
      <Modal open={!!showContainerDetail} title="Container Details" onClose={() => setShowContainerDetail(null)}>
        {showContainerDetail && (
          <>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, fontSize: 20, marginBottom: 6 }}>{showContainerDetail.container_no}</div>
            <StatusPill status={showContainerDetail.status} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '16px 0' }}>
              {[['Type',showContainerDetail.type],['Route',showContainerDetail.route],['Departure',fmtDate(showContainerDetail.departure_date)],['ETA',fmtDate(showContainerDetail.arrival_date)]].map(([k,v]) => (
                <div key={k} style={{ background: 'var(--surface)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{k}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {['loading','in_transit','delivered'].map(s => (
                <button key={s} onClick={() => updateContainerStatus(showContainerDetail.id, s)} style={{ flex: 1, padding: '8px 6px', borderRadius: 8, border: '1px solid var(--border)', background: showContainerDetail.status === s ? 'var(--teal)' : 'var(--surface)', color: showContainerDetail.status === s ? 'var(--navy)' : 'var(--muted)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                  {s}
                </button>
              ))}
            </div>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Goods in this container</div>
            {goods.filter(g => g.container_id === showContainerDetail.id).map(g => (
              <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{g.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{g.client?.full_name} · {g.type === 'sea' && g.cbm ? g.cbm + ' CBM · ' : ''}{g.weight_kg} kg</div>
                </div>
                <StatusPill status={g.status} />
              </div>
            ))}
          </>
        )}
      </Modal>

      {/* Goods edit */}
      <ScannerModal open={clientScanOpen} onClose={() => setClientScanOpen(false)} onResult={searchClientFromScan} title="Scan Client Shipping Label" />
      <ScannerModal open={trackingScanOpen} onClose={() => setTrackingScanOpen(false)} onResult={identifyTrackingOwner} title="Scan Tracking Number to Identify Owner" />

      <Modal open={!!showClientLabel} title="Client Shipping Label" onClose={() => setShowClientLabel(null)}>
        <TabRow tabs={[{ id: 'sea', label: 'Sea Freight' }, { id: 'air', label: 'Air Freight' }]} active={adminLabelType} onChange={setAdminLabelType} />
        <ShippingLabel client={showClientLabel} settings={settings} shipmentType={adminLabelType} />
        <button className="btn btn-navy btn-full" onClick={() => window.print()} style={{ marginTop: 14 }}><Download size={16} />Download / Print Label</button>
      </Modal>

      <Modal open={showRecordGoods} title="Record New Goods" onClose={() => setShowRecordGoods(false)}>
        <RecordGoods onDone={() => { setShowRecordGoods(false); loadAll() }} />
      </Modal>

      <Modal open={!!showEditGoods} title="Edit Goods" onClose={() => setShowEditGoods(null)}>
        {showEditGoods && (
          <>
            <div className="input-group">
              <label className="input-label">Description</label>
              <input className="input-field" value={showEditGoods.description || ''} onChange={e => setShowEditGoods(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Type</label>
              <select className="input-field" value={showEditGoods.type || 'sea'} onChange={e => setShowEditGoods(p => ({ ...p, type: e.target.value }))}>
                <option value="sea">Sea</option>
                <option value="air">Air</option>
              </select>
            </div>
            {showEditGoods.type === 'sea' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {['length_cm','width_cm','height_cm'].map(k => (
                  <div key={k} className="input-group">
                    <label className="input-label">{k.replace('_cm', '').toUpperCase()} cm</label>
                    <input className="input-field" type="number" value={showEditGoods[k] || ''} onChange={e => setShowEditGoods(p => ({ ...p, [k]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}
            <div className="input-group">
              <label className="input-label">Number of Packages</label>
              <input className="input-field" type="number" min="1" value={showEditGoods.quantity || 1} onChange={e => setShowEditGoods(p => ({ ...p, quantity: e.target.value }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Weight kg</label>
              <input className="input-field" type="number" step="0.1" value={showEditGoods.weight_kg || ''} onChange={e => setShowEditGoods(p => ({ ...p, weight_kg: e.target.value }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Tracking Number</label>
              <input className="input-field" value={showEditGoods.tracking_no || ''} onChange={e => setShowEditGoods(p => ({ ...p, tracking_no: e.target.value }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Status</label>
              <select className="input-field" value={showEditGoods.status || 'in_warehouse'} onChange={e => setShowEditGoods(p => ({ ...p, status: e.target.value }))}>
                <option value="in_warehouse">In Warehouse</option>
                <option value="in_transit">In Transit</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Notes</label>
              <textarea className="input-field" rows={3} value={showEditGoods.notes || ''} onChange={e => setShowEditGoods(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <PhotoGallery photos={showEditGoods.photos} />
            <button className="btn btn-primary btn-full" onClick={saveEditedGoods} style={{ marginTop: 14 }}>Save Changes</button>
          </>
        )}
      </Modal>

      {/* Expense form */}
      <Modal open={!!showExpenseForm} title={showExpenseForm?.id ? 'Edit Expense' : 'Add Expense'} onClose={() => setShowExpenseForm(null)}>
        <div className="input-group">
          <label className="input-label">Expense Title</label>
          <input className="input-field" value={expenseForm.title} onChange={e => setExpenseForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Warehouse rent, fuel, staff allowance" />
        </div>
        <div className="input-group">
          <label className="input-label">Category</label>
          <select className="input-field" value={expenseForm.category} onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))}>
            {['Operations','Freight','Warehouse','Staff','Transport','Supplies','Other'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="input-group">
            <label className="input-label">Amount (₦)</label>
            <input className="input-field" type="number" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))} />
          </div>
          <div className="input-group">
            <label className="input-label">Date</label>
            <input className="input-field" type="date" value={expenseForm.expense_date} onChange={e => setExpenseForm(p => ({ ...p, expense_date: e.target.value }))} />
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Notes</label>
          <textarea className="input-field" rows={3} value={expenseForm.notes} onChange={e => setExpenseForm(p => ({ ...p, notes: e.target.value }))} />
        </div>
        <button className="btn btn-primary btn-full" onClick={saveExpense}>Save Expense</button>
      </Modal>

      {/* Receipt generate */}
      <Modal open={!!showReceiptGen} title="Generate Receipt" onClose={() => setShowReceiptGen(null)}>
        {showReceiptGen && (
          <>
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Client</div>
              <div style={{ fontWeight: 600 }}>{clients.find(c=>c.id===showReceiptGen.client_id)?.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Goods</div>
              <div style={{ fontWeight: 600 }}>{showReceiptGen.goods?.description}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                {showReceiptGen.goods?.type === 'sea'
                  ? `Rate: ₦${settings.sea_rate_cbm}/CBM + ₦${settings.sea_rate_kg}/kg`
                  : `Rate: ₦${settings.air_rate_kg}/kg`}
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Discount (₦)</label>
              <input className="input-field" type="number" min="0" step="0.01" placeholder="0.00" value={receiptForm.discount} onChange={e => setReceiptForm(p=>({...p, discount: e.target.value}))} />
            </div>
            <button className="btn btn-primary btn-full" onClick={generateReceipt} style={{ padding: 13 }}>Generate & Issue Receipt</button>
          </>
        )}
      </Modal>

      {/* Receipt view */}
      <Modal open={!!showReceiptView} title="Receipt" onClose={() => setShowReceiptView(null)}>
        <ReceiptView receipt={showReceiptView} client={clients.find(c=>c.id===showReceiptView?.client_id)} companyName={settings.company_name || '234 Cargo'} />
        <button onClick={() => window.print()} className="btn btn-secondary btn-full" style={{ marginTop: 12 }}>Download / Print A4 Receipt</button>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {(hasPermission('receipts') || hasPermission('finance')) && <button className="btn btn-secondary btn-full" onClick={() => openReceiptEdit(showReceiptView)}><Pencil size={15} />Edit Receipt</button>}
          {showReceiptView?.status === 'unpaid' && (
            <button className="btn btn-primary btn-full" onClick={async () => {
              const { error } = await supabase.from('receipts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', showReceiptView.id)
              if (error) { toast.error(error.message); return }
              toast.success('Marked as paid'); setShowReceiptView(null); loadAll()
            }}>Mark as Paid</button>
          )}
        </div>
      </Modal>

      <Modal open={!!showReceiptEdit} title="Edit Receipt" onClose={() => setShowReceiptEdit(null)}>
        {showReceiptEdit && (
          <>
            <div className="banner banner-info" style={{ marginBottom: 14 }}>{showReceiptEdit.receipt_no}</div>
            <div className="input-group">
              <label className="input-label">Subtotal (NGN)</label>
              <input className="input-field" type="number" min="0" step="0.01" value={receiptEditForm.subtotal} onChange={event => setReceiptEditForm(form => ({ ...form, subtotal: event.target.value }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Discount (NGN)</label>
              <input className="input-field" type="number" min="0" step="0.01" value={receiptEditForm.discount} onChange={event => setReceiptEditForm(form => ({ ...form, discount: event.target.value }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Payment Status</label>
              <select className="input-field" value={receiptEditForm.status} onChange={event => setReceiptEditForm(form => ({ ...form, status: event.target.value }))}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div className="receipt-total" style={{ marginBottom: 16 }}>
              <span>Updated Total</span>
              <strong>{formatMoney(Math.max(0, (parseFloat(receiptEditForm.subtotal) || 0) - (parseFloat(receiptEditForm.discount) || 0)), 'NGN')}</strong>
            </div>
            <button className="btn btn-primary btn-full" onClick={saveReceiptEdit}>Save Receipt Changes</button>
          </>
        )}
      </Modal>

      {/* Message thread */}
      <Modal open={!!showMsgThread} title={'Chat — ' + showMsgThread?.full_name} onClose={() => { setShowMsgThread(null); setReplyText('') }}>
        {showMsgThread && (
          <>
            <div ref={messageListRef} className="chat-list modal-chat-list">
              {messages.filter(m => m.client_id === showMsgThread.id).map(m => (
                <div key={m.id} className={`chat-row ${m.sender === 'client' ? 'chat-row-in' : 'chat-row-out'}`}>
                  <div className="chat-message">
                    <div className={`chat-meta ${m.sender === 'client' ? '' : 'chat-meta-out'}`}>
                      {m.sender === 'client' ? showMsgThread.full_name : 'You (Admin)'}
                    </div>
                    <div className={`chat-bubble ${m.sender === 'client' ? 'bubble-client' : 'bubble-admin'}`}>
                      {m.message}
                    </div>
                    <div className={`message-actions ${m.sender === 'client' ? '' : 'message-actions-out'}`}><button onClick={() => copyMessage(m.message)} title="Copy message" aria-label="Copy message"><Copy size={13} /></button><button className="message-delete" onClick={() => deleteMessage(m.id)} title="Delete message" aria-label="Delete message"><Trash2 size={13} /></button></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="chat-composer">
              <input className="input-field" style={{ margin: 0 }} placeholder="Type a reply…" value={replyText}
                onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReply()} />
              <button className="chat-paste" onClick={pasteReply} title="Paste message" aria-label="Paste message"><Clipboard size={17} /></button>
              <button className="btn btn-primary chat-send" onClick={sendReply}>Send</button>
            </div>
          </>
        )}
      </Modal>

      {/* Add Announcement */}
      <Modal open={showAddAnn} title="New Announcement" onClose={() => setShowAddAnn(false)}>
        <div className="input-group">
          <label className="input-label">Title</label>
          <input className="input-field" placeholder="Announcement title" value={newAnn.title} onChange={e => setNewAnn(p=>({...p,title:e.target.value}))} />
        </div>
        <div className="input-group">
          <label className="input-label">Message</label>
          <textarea className="input-field" rows={4} value={newAnn.body} onChange={e => setNewAnn(p=>({...p,body:e.target.value}))} placeholder="Write your announcement…" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>
          <input type="checkbox" checked={newAnn.is_important} onChange={e => setNewAnn(p=>({...p,is_important:e.target.checked}))} />
          Mark as important
        </label>
        <button className="btn btn-primary btn-full" onClick={async () => {
          if (!newAnn.title || !newAnn.body) return
          await supabase.from('announcements').insert({ ...newAnn, created_by: profile?.id })
          toast.success('Announcement published!'); setShowAddAnn(false); setNewAnn({ title:'',body:'',is_important:false }); loadAll()
        }} style={{ padding: 13 }}>Publish Announcement</button>
      </Modal>

      {/* Add Supplier */}
      <Modal open={showAddSup} title="Add Supplier" onClose={() => setShowAddSup(false)}>
        {[['name','Supplier Name','e.g. Yiwu Wholesale Market'],['contact','Contact Number','+86 xxx-xxxx-xxxx'],['category','Category','Electronics, Clothing…'],['address','Address','City, Province']].map(([k,l,p]) => (
          <div key={k} className="input-group">
            <label className="input-label">{l}</label>
            <input className="input-field" placeholder={p} value={newSup[k]} onChange={e => setNewSup(prev=>({...prev,[k]:e.target.value}))} />
          </div>
        ))}
        <div className="input-group">
          <label className="input-label">Notes (optional)</label>
          <textarea className="input-field" rows={2} value={newSup.notes} onChange={e => setNewSup(p=>({...p,notes:e.target.value}))} />
        </div>
        <button className="btn btn-primary btn-full" onClick={async () => {
          if (!newSup.name) return
          await supabase.from('suppliers').insert(newSup)
          toast.success('Supplier added!'); setShowAddSup(false); setNewSup({ name:'',contact:'',category:'',address:'',notes:'' }); loadAll()
        }} style={{ padding: 13 }}>Add Supplier</button>
      </Modal>

      {/* Add Container */}
      <Modal open={showAddCont} title="New Container" onClose={() => setShowAddCont(false)}>
        {[['container_no','Container Number','e.g. CONT-2501-A'],['route','Route','e.g. Guangzhou → Port Klang']].map(([k,l,p]) => (
          <div key={k} className="input-group">
            <label className="input-label">{l}</label>
            <input className="input-field" placeholder={p} value={newCont[k]} onChange={e => setNewCont(p=>({...p,[k]:e.target.value}))} />
          </div>
        ))}
        <div className="input-group">
          <label className="input-label">Type</label>
          <select className="input-field" value={newCont.type} onChange={e => setNewCont(p=>({...p,type:e.target.value}))}>
            <option value="20ft">20ft</option><option value="40ft">40ft</option><option value="40hc">40HC</option><option value="air">Air</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="input-group">
            <label className="input-label">Departure Date</label>
            <input className="input-field" type="date" value={newCont.departure_date} onChange={e => setNewCont(p=>({...p,departure_date:e.target.value}))} />
          </div>
          <div className="input-group">
            <label className="input-label">Arrival Date (ETA)</label>
            <input className="input-field" type="date" value={newCont.arrival_date} onChange={e => setNewCont(p=>({...p,arrival_date:e.target.value}))} />
          </div>
        </div>
        <button className="btn btn-primary btn-full" onClick={async () => {
          if (!newCont.container_no) return
          await supabase.from('containers').insert(newCont)
          toast.success('Container created!'); setShowAddCont(false); setNewCont({ container_no:'',type:'20ft',route:'Guangzhou → Port Klang',status:'loading',departure_date:'',arrival_date:'' }); loadAll()
        }} style={{ padding: 13 }}>Create Container</button>
      </Modal>
    </div>
  )
}
