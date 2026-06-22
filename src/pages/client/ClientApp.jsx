import { useState, useEffect, useRef, useCallback } from 'react'
import { Home, Package, Tag, ShoppingBag, ShoppingCart, MessageCircle, LogOut, Warehouse, Ship, CheckCircle2, ReceiptText, MoreHorizontal, ArrowRight, ArrowLeft, QrCode, Copy, Clipboard, RefreshCw, Download, Wallet } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { getClientWallet, supabase } from '../../lib/supabase'
import { TopNav, BottomNav, SectionHeader, StatusPill, TypePill, SkeletonList, EmptyState, Modal, ShippingLabel, ReceiptView, PhotoGallery, fmtDate, fmtDateTime, fmtAgo, formatMoney } from '../../components/UI'
import toast from 'react-hot-toast'
import { downloadReceiptPdf } from '../../lib/receiptPdf'
import { EMPTY_PURCHASE_REQUEST, marketplaceUrl, PURCHASE_PLATFORMS } from '../../lib/purchaseRequests'

const WALLET_ENTRY_LABELS = {
  cash_topup: 'Cash top-up',
  shipping_charge: 'Shipping charge',
  purchase_charge: 'Purchase charge',
  refund: 'Refund',
}

const walletBalanceFor = (wallet, currency) => wallet?.balances?.find(balance => balance.currency === currency)?.available_balance || 0

export default function ClientApp() {
  const { clientUser, clientSessionToken, signOut } = useAuth()
  const [tab, setTab] = useState('home')
  const [goods, setGoods] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [messages, setMessages] = useState([])
  const [receipts, setReceipts] = useState([])
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [selectedGoods, setSelectedGoods] = useState(null)
  const [selectedReceipt, setSelectedReceipt] = useState(null)
  const [showLabel, setShowLabel] = useState(false)
  const [labelShipmentType, setLabelShipmentType] = useState('sea')
  const [purchaseForm, setPurchaseForm] = useState(EMPTY_PURCHASE_REQUEST)
  const [submittingPurchase, setSubmittingPurchase] = useState(false)
  const [wallet, setWallet] = useState(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletError, setWalletError] = useState('')
  const reloadTimer = useRef(null)
  const chatListRef = useRef(null)

  const loadWallet = useCallback(async () => {
    if (!clientSessionToken) {
      setWallet(null)
      setWalletError('Sign out and sign in again to activate your secure prepaid balance.')
      return false
    }
    setWalletLoading(true)
    try {
      const data = await getClientWallet(clientSessionToken)
      setWallet(data)
      setWalletError('')
      return true
    } catch (error) {
      setWallet(null)
      setWalletError(error.message || 'Could not load your prepaid balance.')
      return false
    } finally {
      setWalletLoading(false)
    }
  }, [clientSessionToken])

  useEffect(() => { loadAll() }, [clientUser.id])

  useEffect(() => { loadWallet() }, [loadWallet])

  useEffect(() => {
    if (tab !== 'wallet' || !clientSessionToken) return undefined
    const interval = setInterval(loadWallet, 60000)
    return () => clearInterval(interval)
  }, [tab, clientSessionToken, loadWallet])

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

  useEffect(() => {
    if (tab !== 'chat' || !chatListRef.current) return
    const frame = requestAnimationFrame(() => { chatListRef.current.scrollTop = chatListRef.current.scrollHeight })
    return () => cancelAnimationFrame(frame)
  }, [messages, tab])

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

  const refreshData = async () => {
    setRefreshing(true)
    await loadAll(false)
    setRefreshing(false)
    toast.success('Data refreshed')
  }

  const refreshWallet = async () => {
    if (await loadWallet()) toast.success('Prepaid balance refreshed')
  }

  const copyMessage = async text => {
    try { await navigator.clipboard.writeText(text); toast.success('Message copied') }
    catch { toast.error('Could not copy this message') }
  }

  const pasteMessage = async () => {
    try { setMsgText(await navigator.clipboard.readText()) }
    catch { toast.error('Allow clipboard access to paste') }
  }

  const submitPurchaseRequest = async () => {
    const productLink = marketplaceUrl(purchaseForm.product_link)
    if (!productLink) {
      toast.error('Paste a complete product link that starts with https:// or http://')
      return
    }

    setSubmittingPurchase(true)
    const { error } = await supabase.from('purchase_requests').insert({
      client_id: clientUser.id,
      platform: purchaseForm.platform,
      product_link: productLink,
      product_name: purchaseForm.product_name.trim() || null,
      variant: purchaseForm.variant.trim() || null,
      quantity: Math.max(1, parseInt(purchaseForm.quantity, 10) || 1),
      notes: purchaseForm.notes.trim() || null,
    })
    setSubmittingPurchase(false)

    if (error) {
      toast.error('Could not submit your request. Please try again.')
      return
    }

    setPurchaseForm(EMPTY_PURCHASE_REQUEST)
    toast.success('Purchase request sent to our China team')
    loadAll(false)
  }

  const tabs = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'goods', label: 'My Goods', Icon: Package },
    { id: 'receipts', label: 'Receipts', Icon: ReceiptText },
    { id: 'chat', label: 'Messages', Icon: MessageCircle },
    { id: 'more', label: 'More', Icon: MoreHorizontal },
  ]
  const activeNav = ['label', 'suppliers', 'purchase', 'wallet'].includes(tab) ? 'more' : tab

  const inWarehouse = goods.filter(g => g.status === 'in_warehouse').length
  const inTransit = goods.filter(g => g.status === 'in_transit').length
  const delivered = goods.filter(g => g.status === 'delivered').length
  const unreadMsgs = messages.filter(m => m.sender !== 'client').length
  const currentShipment = goods.find(g => g.status !== 'delivered') || goods[0]
  const LabelMethodPicker = () => <div className="tab-row" style={{ marginBottom: 14 }}><button className={`tab-btn ${labelShipmentType === 'sea' ? 'active' : ''}`} onClick={() => setLabelShipmentType('sea')}>Sea Freight</button><button className={`tab-btn ${labelShipmentType === 'air' ? 'active' : ''}`} onClick={() => setLabelShipmentType('air')}>Air Freight</button></div>

  return (
    <div className="app-shell client-app">
      <TopNav role="Client Portal" title={settings.company_name || '234 Cargo Logistics'}
        right={
          <div className="client-header-actions">
            <div className="client-header-avatar">
              {clientUser.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <button className="client-refresh" onClick={refreshData} disabled={refreshing} title="Refresh data" aria-label="Refresh data"><RefreshCw size={17} style={{ opacity: refreshing ? 0.55 : 1 }} /></button>
            <button className="client-logout" onClick={signOut} title="Log out" aria-label="Log out"><LogOut size={18} /></button>
          </div>
        }
      />

      <div className={`page ${tab === 'chat' ? 'page-chat' : ''}`}>

        {/* HOME */}
        {tab === 'home' && (
          <>
            <section className="client-welcome">
              <div><div className="client-welcome-kicker">Client portal</div><h1>Hello, {clientUser.full_name.split(' ')[0]}</h1><p>Track every package from our China warehouse to Nigeria.</p></div>
              <button className="client-avatar-button" onClick={() => setTab('more')} aria-label="Open more options">{clientUser.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</button>
            </section>

            <section className="client-mark-card">
              <div><span>Your shipping mark</span><strong>{clientUser.shipping_mark}</strong></div>
              <button onClick={() => setShowLabel(true)}><QrCode size={18} />Label</button>
            </section>

            <button type="button" className="client-purchase-card" onClick={() => setTab('purchase')}>
              <span className="client-purchase-icon"><ShoppingCart size={21} /></span>
              <span className="client-purchase-copy"><small>Shopping Assistance</small><strong>Buy From China</strong><em>Send a 1688, Taobao, or Pinduoduo link. We buy and ship it for you.</em></span>
              <ArrowRight size={19} />
            </button>

            <button type="button" className="client-wallet-card" onClick={() => setTab('wallet')}>
              <span className="client-wallet-icon"><Wallet size={21} /></span>
              <span className="client-wallet-copy"><small>Prepaid Balance</small><strong>{walletLoading ? 'Loading balance...' : wallet ? `${formatMoney(walletBalanceFor(wallet, 'NGN'), 'NGN')} / ${formatMoney(walletBalanceFor(wallet, 'RMB'), 'RMB')}` : 'View prepaid balance'}</strong><em>Top up in cash at our Nigeria office. Credits are verified before use.</em></span>
              <ArrowRight size={19} />
            </button>

            {loading ? <SkeletonList n={2} /> : currentShipment ? (
              <section className="shipment-focus-card" onClick={() => setSelectedGoods(currentShipment)}>
                <div className="shipment-focus-top"><div><span>Current shipment</span><h2>{currentShipment.description}</h2></div><StatusPill status={currentShipment.status} /></div>
                <div className="shipment-focus-meta"><TypePill type={currentShipment.type} /><span>{currentShipment.quantity || 1} package{(currentShipment.quantity || 1) === 1 ? '' : 's'}</span><span>{currentShipment.weight_kg} kg</span></div>
                <div className="shipment-progress" aria-label={`Shipment is ${currentShipment.status.replace('_', ' ')}`}><span className="progress-step complete"><i />Warehouse</span><span className={`progress-line ${currentShipment.status !== 'in_warehouse' ? 'complete' : ''}`} /><span className={`progress-step ${currentShipment.status !== 'in_warehouse' ? 'complete' : ''}`}><i />In transit</span><span className={`progress-line ${currentShipment.status === 'delivered' ? 'complete' : ''}`} /><span className={`progress-step ${currentShipment.status === 'delivered' ? 'complete' : ''}`}><i />Delivered</span></div>
                <div className="shipment-focus-footer"><span>{currentShipment.tracking_no || 'Tracking will be added by the warehouse'}</span><span>View details <ArrowRight size={15} /></span></div>
              </section>
            ) : <section className="client-empty-shipment"><Package size={24} /><h2>No shipments yet</h2><p>When your supplier sends goods to our warehouse, they will appear here.</p><button className="btn btn-primary" onClick={() => setShowLabel(true)}>Get your shipping label</button></section>}

            <section className="client-quick-actions"><button onClick={() => setTab('goods')}><Package size={18} /><span>My goods</span><small>{goods.length}</small></button><button onClick={() => setTab('receipts')}><ReceiptText size={18} /><span>Receipts</span><small>{receipts.length}</small></button><button onClick={() => setTab('chat')}><MessageCircle size={18} /><span>Messages</span>{unreadMsgs > 0 && <small>{unreadMsgs}</small>}</button></section>

            <section className="client-summary-grid">
              {[{ label: 'Warehouse', value: inWarehouse, Icon: Warehouse }, { label: 'In transit', value: inTransit, Icon: Ship }, { label: 'Delivered', value: delivered, Icon: CheckCircle2 }].map(item => <div key={item.label}><item.Icon size={16} /><strong>{item.value}</strong><span>{item.label}</span></div>)}
            </section>

            <SectionHeader title="Updates" />
            {announcements.length === 0 ? <div className="client-updates-empty">No updates right now.</div> : announcements.slice(0, 3).map(a => <article key={a.id} className={`client-update ${a.is_important ? 'important' : ''}`}><div><strong>{a.title}</strong><p>{a.body}</p><span>{fmtAgo(a.created_at)}</span></div>{a.is_important && <b>Important</b>}</article>)}
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

        {tab === 'receipts' && (
          <>
            <SectionHeader title={`My Receipts (${receipts.length})`} />
            {receipts.length === 0 ? <EmptyState icon="receipt" title="No receipts yet" text="Your freight receipts will appear here after they are issued." /> : receipts.map(receipt => (
              <button key={receipt.id} className="more-menu-item" onClick={() => setSelectedReceipt(receipt)}>
                <span className="more-menu-icon"><ReceiptText size={21} /></span><span><strong>{receipt.receipt_no}</strong><small>{fmtDate(receipt.issued_at)} · {receipt.status === 'paid' ? 'Paid' : 'Unpaid'}</small></span><strong style={{ color: 'var(--teal-d)', fontSize: 14 }}>View</strong>
              </button>
            ))}
          </>
        )}

        {tab === 'more' && (
          <>
            <SectionHeader title="More" />
            {[
              { id: 'wallet', title: 'Prepaid Balance', text: 'View your Naira and RMB balance, credits, and charges.', Icon: Wallet },
              { id: 'purchase', title: 'Buy for Me', text: 'Send a 1688, Taobao or Pinduoduo link. We buy and ship it for you.', Icon: ShoppingCart },
              { id: 'label', title: 'Shipping Label', text: 'View, print or share your shipping mark label.', Icon: Tag },
              { id: 'suppliers', title: 'Supplier Directory', text: 'Browse the approved supplier directory.', Icon: ShoppingBag },
            ].map(item => (
              <button key={item.id} className="more-menu-item" onClick={() => setTab(item.id)}>
                <span className="more-menu-icon"><item.Icon size={21} /></span><span><strong>{item.title}</strong><small>{item.text}</small></span><span className="more-menu-arrow">›</span>
              </button>
            ))}
          </>
        )}

        {/* PREPAID BALANCE */}
        {tab === 'wallet' && (
          <>
            <button className="section-back" onClick={() => setTab('more')}><ArrowLeft size={16} />Back</button>
            <SectionHeader title="Prepaid Balance" action={<button className="btn btn-xs btn-secondary" onClick={refreshWallet} disabled={walletLoading} title="Refresh prepaid balance"><RefreshCw size={13} className={walletLoading ? 'spin' : ''} />Refresh</button>} />
            <div className="banner banner-info" style={{ marginBottom: 16 }}>Pay cash at our Nigeria office with your shipping mark. Your balance becomes available after a finance team member verifies the payment.</div>
            {walletLoading && !wallet ? <SkeletonList n={3} /> : walletError ? (
              <div className="card client-wallet-empty"><Wallet size={24} /><strong>Secure balance unavailable</strong><p>{walletError}</p><button className="btn btn-primary" onClick={signOut}>Sign Out</button></div>
            ) : (
              <>
                <div className="wallet-balance-grid">
                  {['NGN', 'RMB'].map(currency => <div key={currency} className="wallet-balance-card"><span>{currency === 'NGN' ? 'Naira balance' : 'RMB balance'}</span><strong>{formatMoney(walletBalanceFor(wallet, currency), currency)}</strong><small>Available to use</small></div>)}
                </div>
                <SectionHeader title="Balance Activity" />
                {wallet?.transactions?.length ? wallet.transactions.map(transaction => {
                  const isCredit = transaction.direction === 'credit'
                  const statusLabel = transaction.status === 'pending' ? 'Awaiting verification' : transaction.status === 'completed' ? 'Completed' : transaction.status
                  return <div key={transaction.id} className="client-wallet-transaction">
                    <span className={`client-wallet-direction ${isCredit ? 'credit' : 'debit'}`}>{isCredit ? '+' : '-'}</span>
                    <span className="client-wallet-transaction-copy"><strong>{WALLET_ENTRY_LABELS[transaction.entry_type] || 'Balance activity'}</strong><small>{transaction.description || statusLabel} · {fmtDate(transaction.created_at)}</small></span>
                    <span className="client-wallet-transaction-amount"><strong className={isCredit ? 'credit' : 'debit'}>{isCredit ? '+' : '-'}{formatMoney(transaction.amount, transaction.currency)}</strong><small>{statusLabel}</small></span>
                  </div>
                }) : <EmptyState icon="receipt" title="No balance activity yet" text="Verified cash top-ups and shipping or purchase charges will appear here." />}
              </>
            )}
          </>
        )}

        {/* PURCHASE REQUEST */}
        {tab === 'purchase' && (
          <>
            <button className="section-back" onClick={() => setTab('more')}><ArrowLeft size={16} />Back</button>
            <SectionHeader title="Buy From China" />
            <div className="banner banner-info" style={{ marginBottom: 16 }}>
              Send a product link from 1688, Taobao, or Pinduoduo. Our team will confirm the RMB total and payment details before buying.
            </div>
            <div className="card">
              <div className="input-group">
                <label className="input-label">Marketplace</label>
                <select className="input-field" value={purchaseForm.platform} onChange={event => setPurchaseForm(form => ({ ...form, platform: event.target.value }))}>
                  {PURCHASE_PLATFORMS.map(platform => <option key={platform.value} value={platform.value}>{platform.label}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Product Link</label>
                <input className="input-field" type="url" inputMode="url" placeholder="https://..." value={purchaseForm.product_link} onChange={event => setPurchaseForm(form => ({ ...form, product_link: event.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Product Name <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
                <input className="input-field" placeholder="For example: Stainless food flask" value={purchaseForm.product_name} onChange={event => setPurchaseForm(form => ({ ...form, product_name: event.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px', gap: 10 }}>
                <div className="input-group">
                  <label className="input-label">Colour, size, or variant</label>
                  <input className="input-field" placeholder="For example: Black, 42" value={purchaseForm.variant} onChange={event => setPurchaseForm(form => ({ ...form, variant: event.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="input-label">Quantity</label>
                  <input className="input-field" type="number" min="1" inputMode="numeric" value={purchaseForm.quantity} onChange={event => setPurchaseForm(form => ({ ...form, quantity: event.target.value }))} />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Extra Details <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
                <textarea className="input-field" rows="4" placeholder="Add any size, colour, quality, or delivery instructions." value={purchaseForm.notes} onChange={event => setPurchaseForm(form => ({ ...form, notes: event.target.value }))} />
              </div>
              <button className="btn btn-primary btn-full" onClick={submitPurchaseRequest} disabled={submittingPurchase} style={{ marginTop: 4 }}>
                <ShoppingCart size={16} />{submittingPurchase ? 'Sending Request...' : 'Send Purchase Request'}
              </button>
            </div>
            <div className="banner banner-info" style={{ marginTop: 16 }}>We will send the approval, RMB quote, and purchase status to your Messages.</div>
          </>
        )}

        {/* LABEL */}
        {tab === 'label' && (
          <>
            <button className="section-back" onClick={() => setTab('more')}><ArrowLeft size={16} />Back</button>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Your Shipping Label</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Choose how this package will ship, then send this label to your supplier before they ship it to our warehouse.</div>
            </div>
            <LabelMethodPicker />
            <ShippingLabel client={clientUser} settings={settings} shipmentType={labelShipmentType} />
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
            <button className="section-back" onClick={() => setTab('more')}><ArrowLeft size={16} />Back</button>
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
            <div ref={chatListRef} className="chat-list">
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
                    <div className={`message-actions ${m.sender === 'client' ? 'message-actions-out' : ''}`}><button onClick={() => copyMessage(m.message)} title="Copy message" aria-label="Copy message"><Copy size={13} /></button></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="chat-composer">
              <input className="input-field" style={{ margin: 0 }} placeholder="Type a message…" value={msgText}
                onChange={e => setMsgText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()} />
              <button className="chat-paste" onClick={pasteMessage} title="Paste message" aria-label="Paste message"><Clipboard size={17} /></button>
              <button className="btn btn-primary chat-send" onClick={sendMsg}>Send</button>
            </div>
          </div>
        )}

      </div>

      <BottomNav tabs={tabs} active={activeNav} onChange={setTab} />

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
                ['Packages', (selectedGoods.quantity || 1) + ' package(s)'],
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
        <ReceiptView receipt={selectedReceipt} client={clientUser} companyName={settings.company_name || '234 Cargo'} />
        <button onClick={() => downloadReceiptPdf({ receipt: selectedReceipt, client: clientUser, companyName: settings.company_name || '234 Cargo Logistics' })} className="btn btn-primary btn-full" style={{ marginTop: 12 }}><Download size={16} />Download PDF Receipt</button>
        <button onClick={() => window.print()} className="btn btn-secondary btn-full" style={{ marginTop: 8 }}>Print A4 Receipt</button>
      </Modal>

      {/* Shipping label modal */}
      <Modal open={showLabel} title="Shipping Label" onClose={() => setShowLabel(false)}>
        <LabelMethodPicker />
        <ShippingLabel client={clientUser} settings={settings} shipmentType={labelShipmentType} />
        <button onClick={() => window.print()} className="btn btn-navy btn-full" style={{ marginTop: 12 }}>Print Label</button>
      </Modal>
    </div>
  )
}
