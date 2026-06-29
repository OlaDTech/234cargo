import { useState, useEffect, useRef, useCallback } from 'react'
import { Home, Package, Tag, ShoppingBag, ShoppingCart, MessageCircle, LogOut, Warehouse, Ship, CheckCircle2, ReceiptText, MoreHorizontal, ArrowRight, ArrowLeft, QrCode, Copy, Clipboard, RefreshCw, Download, Wallet, Upload, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { getClientPortal, getClientWallet, payClientPurchase, payClientReceipt, sendClientPortalMessage, submitClientPurchaseRequest, submitClientTopUpRequest } from '../../lib/supabase'
import { TopNav, BottomNav, SectionHeader, StatusPill, TypePill, SkeletonList, EmptyState, Modal, ShippingLabel, ReceiptView, PhotoGallery, fmtDate, fmtDateTime, fmtAgo, formatMoney } from '../../components/UI'
import toast from 'react-hot-toast'
import { downloadReceiptPdf } from '../../lib/receiptPdf'
import { EMPTY_PURCHASE_REQUEST, marketplaceUrl, normalizePurchaseVariantItems, purchaseStatusMeta, purchaseVariantNotes, purchaseVariantSummary, purchaseVariantTotal, PURCHASE_PLATFORMS } from '../../lib/purchaseRequests'

const WALLET_ENTRY_LABELS = {
  cash_topup: 'Wallet top-up',
  shipping_charge: 'Shipping charge',
  purchase_charge: 'Purchase charge',
  refund: 'Refund',
}

const walletBalanceFor = (wallet, currency) => wallet?.balances?.find(balance => balance.currency === currency)?.available_balance || 0

const TOP_UP_DEFAULT = {
  currency: 'NGN',
  amount: '',
  paymentMethod: 'bank_transfer',
  reference: '',
  officeLocation: 'Nigeria office',
  description: '',
}

export default function ClientApp() {
  const { clientUser, clientSessionToken, signOut } = useAuth()
  const [tab, setTab] = useState('home')
  const [goods, setGoods] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [messages, setMessages] = useState([])
  const [receipts, setReceipts] = useState([])
  const [purchaseRequests, setPurchaseRequests] = useState([])
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
  const [payingReceipt, setPayingReceipt] = useState(null)
  const [payingPurchase, setPayingPurchase] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletError, setWalletError] = useState('')
  const [topUpForm, setTopUpForm] = useState(TOP_UP_DEFAULT)
  const [topUpProof, setTopUpProof] = useState(null)
  const [submittingTopUp, setSubmittingTopUp] = useState(false)
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
    const interval = setInterval(() => loadAll(false), 60000)
    return () => clearInterval(interval)
  }, [clientSessionToken])

  useEffect(() => {
    if (tab !== 'chat' || !chatListRef.current) return
    const frame = requestAnimationFrame(() => { chatListRef.current.scrollTop = chatListRef.current.scrollHeight })
    return () => cancelAnimationFrame(frame)
  }, [messages, tab])

  const loadAll = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    try {
      const data = await getClientPortal(clientSessionToken)
      setGoods(data.goods || []); setAnnouncements(data.announcements || []); setSuppliers(data.suppliers || [])
      setMessages(data.messages || []); setReceipts(data.receipts || []); setPurchaseRequests(data.purchase_requests || [])
      setSettings(data.settings || {})
    } catch (error) {
      if (showLoader) toast.error(error.message || 'Could not load your client portal')
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  const sendMsg = async () => {
    if (!msgText.trim()) return
    try {
      const { message } = await sendClientPortalMessage(clientSessionToken, msgText.trim())
      setMessages(prev => [...prev, message]); setMsgText('')
    } catch (error) { toast.error(error.message || 'Failed to send message') }
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

  const submitTopUpRequest = async () => {
    const amount = Number(topUpForm.amount)
    if (!amount || amount <= 0) {
      toast.error('Enter the amount you want to top up')
      return
    }
    if (topUpForm.paymentMethod === 'bank_transfer' && !topUpProof) {
      toast.error('Upload your bank transfer receipt')
      return
    }

    setSubmittingTopUp(true)
    try {
      await submitClientTopUpRequest(clientSessionToken, {
        currency: topUpForm.currency,
        amount,
        paymentMethod: topUpForm.paymentMethod,
        reference: topUpForm.reference.trim(),
        officeLocation: topUpForm.officeLocation.trim(),
        description: topUpForm.description.trim(),
        proofFile: topUpProof,
      })
      setTopUpForm(TOP_UP_DEFAULT)
      setTopUpProof(null)
      toast.success('Top-up request sent for verification')
      await loadWallet()
    } catch (error) {
      toast.error(error.message || 'Could not submit your top-up request')
    } finally {
      setSubmittingTopUp(false)
    }
  }

  const copyMessage = async text => {
    try { await navigator.clipboard.writeText(text); toast.success('Message copied') }
    catch { toast.error('Could not copy this message') }
  }

  const pasteMessage = async () => {
    try { setMsgText(await navigator.clipboard.readText()) }
    catch { toast.error('Allow clipboard access to paste') }
  }

  const updatePurchaseOption = (index, field, value) => {
    setPurchaseForm(form => {
      const items = normalizePurchaseVariantItems(form.variant_items, form.variant, form.quantity)
      return {
        ...form,
        variant_items: items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
      }
    })
  }

  const addPurchaseOption = () => {
    setPurchaseForm(form => ({
      ...form,
      variant_items: [...normalizePurchaseVariantItems(form.variant_items, form.variant, form.quantity), { variant: '', quantity: '1' }],
    }))
  }

  const removePurchaseOption = index => {
    setPurchaseForm(form => {
      const nextItems = normalizePurchaseVariantItems(form.variant_items, form.variant, form.quantity).filter((_, itemIndex) => itemIndex !== index)
      return { ...form, variant_items: nextItems.length ? nextItems : [{ variant: '', quantity: '1' }] }
    })
  }

  const submitPurchaseRequest = async () => {
    const productLink = marketplaceUrl(purchaseForm.product_link)
    if (!productLink) {
      toast.error('Paste a complete product link that starts with https:// or http://')
      return
    }
    const optionItems = normalizePurchaseVariantItems(purchaseForm.variant_items, purchaseForm.variant, purchaseForm.quantity)
    const totalQuantity = purchaseVariantTotal(optionItems)
    const optionDetails = purchaseVariantNotes(optionItems)
    const extraDetails = purchaseForm.notes.trim()

    setSubmittingPurchase(true)
    try {
      await submitClientPurchaseRequest(clientSessionToken, {
        platform: purchaseForm.platform,
        product_link: productLink,
        product_name: purchaseForm.product_name.trim(),
        variant: purchaseVariantSummary(optionItems),
        quantity: totalQuantity,
        notes: [optionDetails, extraDetails && `Extra details:\n${extraDetails}`].filter(Boolean).join('\n\n'),
      })
      setPurchaseForm(EMPTY_PURCHASE_REQUEST)
      toast.success('Purchase request sent to our China team')
      loadAll(false)
    } catch (error) {
      toast.error(error.message || 'Could not submit your request. Please try again.')
    } finally {
      setSubmittingPurchase(false)
    }
  }

  const payReceiptFromWallet = async receipt => {
    if (!receipt || receipt.status !== 'unpaid') return
    if (!window.confirm(`Pay ${formatMoney(receipt.total, receipt.currency || 'NGN')} for ${receipt.receipt_no} from your prepaid wallet?`)) return
    setPayingReceipt(receipt.id)
    try {
      await payClientReceipt(clientSessionToken, receipt.id)
      toast.success('Receipt paid from your prepaid wallet')
      setSelectedReceipt(null)
      await Promise.all([loadAll(false), loadWallet()])
    } catch (error) {
      toast.error(error.message || 'Could not pay this receipt from your wallet')
    } finally {
      setPayingReceipt(null)
    }
  }

  const payPurchaseFromWallet = async request => {
    if (!request || request.status !== 'awaiting_payment' || !Number(request.quoted_amount_rmb)) return
    const itemName = request.product_name || 'this purchase request'
    if (!window.confirm(`Pay ${formatMoney(request.quoted_amount_rmb, 'RMB')} for ${itemName} from your RMB wallet?`)) return
    setPayingPurchase(request.id)
    try {
      await payClientPurchase(clientSessionToken, request.id)
      toast.success('Purchase request paid from your RMB wallet')
      await Promise.all([loadAll(false), loadWallet()])
    } catch (error) {
      toast.error(error.message || 'Could not pay this purchase request from your wallet')
    } finally {
      setPayingPurchase(null)
    }
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
      <TopNav role="Client Portal" title={settings.company_name || '234Cargo Logistics'}
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
              <span className="client-wallet-copy"><small>Prepaid Balance</small><strong>{walletLoading ? 'Loading balance...' : wallet ? `${formatMoney(walletBalanceFor(wallet, 'NGN'), 'NGN')} / ${formatMoney(walletBalanceFor(wallet, 'RMB'), 'RMB')}` : 'View prepaid balance'}</strong><em>Request a top-up by office cash or bank transfer. Credits are verified before use.</em></span>
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
              { id: 'wallet', title: 'Request Wallet Top-Up', text: 'Upload transfer proof or report cash paid at our office.', Icon: Wallet },
              { id: 'purchase', title: 'Buy for Me', text: 'Send one product link with each size, colour, and quantity.', Icon: ShoppingCart },
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
            <div className="banner banner-info" style={{ marginBottom: 16 }}>Request a wallet top-up after paying by bank transfer or cash at our office. Your balance becomes available after finance verifies the payment.</div>
            {walletLoading && !wallet ? <SkeletonList n={3} /> : walletError ? (
              <div className="card client-wallet-empty"><Wallet size={24} /><strong>Secure balance unavailable</strong><p>{walletError}</p><button className="btn btn-primary" onClick={signOut}>Sign Out</button></div>
            ) : (
              <>
                <div className="card">
                  <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Request Top-Up</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="input-group">
                      <label className="input-label">Currency</label>
                      <select className="input-field" value={topUpForm.currency} onChange={event => setTopUpForm(form => ({ ...form, currency: event.target.value }))}>
                        <option value="NGN">NGN</option>
                        <option value="RMB">RMB</option>
                      </select>
                    </div>
                    <div className="input-group">
                      <label className="input-label">Amount</label>
                      <input className="input-field" type="number" min="0.01" step="0.01" inputMode="decimal" value={topUpForm.amount} onChange={event => setTopUpForm(form => ({ ...form, amount: event.target.value }))} placeholder="0.00" />
                    </div>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Payment Method</label>
                    <select className="input-field" value={topUpForm.paymentMethod} onChange={event => setTopUpForm(form => ({ ...form, paymentMethod: event.target.value, reference: '' }))}>
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="cash_office">Cash to our office</option>
                    </select>
                  </div>
                  {topUpForm.paymentMethod === 'cash_office' ? (
                    <>
                      <div className="input-group">
                        <label className="input-label">Office</label>
                        <input className="input-field" value={topUpForm.officeLocation} onChange={event => setTopUpForm(form => ({ ...form, officeLocation: event.target.value }))} placeholder="Nigeria office" />
                      </div>
                      <div className="input-group">
                        <label className="input-label">Cash Receipt or Reference <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
                        <input className="input-field" value={topUpForm.reference} onChange={event => setTopUpForm(form => ({ ...form, reference: event.target.value }))} placeholder="For example: CASH-2026-001" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="input-group">
                        <label className="input-label">Transfer Reference <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
                        <input className="input-field" value={topUpForm.reference} onChange={event => setTopUpForm(form => ({ ...form, reference: event.target.value }))} placeholder="Bank reference or sender name" />
                      </div>
                      <div className="input-group">
                        <label className="input-label">Transaction Receipt</label>
                        <label className="btn btn-secondary btn-full" style={{ justifyContent: 'center', cursor: 'pointer' }}>
                          <Upload size={16} />{topUpProof ? topUpProof.name : 'Upload Receipt'}
                          <input type="file" accept="image/*,.pdf,application/pdf" style={{ display: 'none' }} onChange={event => setTopUpProof(event.target.files?.[0] || null)} />
                        </label>
                      </div>
                    </>
                  )}
                  <div className="input-group">
                    <label className="input-label">Note <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
                    <textarea className="input-field" rows="3" value={topUpForm.description} onChange={event => setTopUpForm(form => ({ ...form, description: event.target.value }))} placeholder="Anything finance should know about this payment." />
                  </div>
                  <button className="btn btn-primary btn-full" onClick={submitTopUpRequest} disabled={submittingTopUp}>
                    <Wallet size={16} />{submittingTopUp ? 'Sending Request...' : 'Send Top-Up Request'}
                  </button>
                </div>
                <div className="wallet-balance-grid">
                  {['NGN', 'RMB'].map(currency => <div key={currency} className="wallet-balance-card"><span>{currency === 'NGN' ? 'Naira balance' : 'RMB balance'}</span><strong>{formatMoney(walletBalanceFor(wallet, currency), currency)}</strong><small>Available to use</small></div>)}
                </div>
                <SectionHeader title="Balance Activity" />
                {wallet?.transactions?.length ? wallet.transactions.map(transaction => {
                  const isCredit = transaction.direction === 'credit'
                  const statusLabel = transaction.status === 'pending' ? 'Awaiting verification' : transaction.status === 'completed' ? 'Completed' : transaction.status
                  const methodLabel = transaction.payment_method === 'bank_transfer' ? 'Bank transfer' : transaction.payment_method === 'cash_office' ? 'Cash to office' : ''
                  return <div key={transaction.id} className="client-wallet-transaction">
                    <span className={`client-wallet-direction ${isCredit ? 'credit' : 'debit'}`}>{isCredit ? '+' : '-'}</span>
                    <span className="client-wallet-transaction-copy"><strong>{WALLET_ENTRY_LABELS[transaction.entry_type] || 'Balance activity'}</strong><small>{transaction.description || statusLabel} · {fmtDate(transaction.created_at)}</small></span>
                    {(methodLabel || transaction.payment_proof_url) && <span className="client-wallet-transaction-copy" style={{ gridColumn: '2 / 3', gridRow: 2, marginTop: -6 }}><small>{methodLabel}{transaction.payment_proof_url ? <> · <a href={transaction.payment_proof_url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>Receipt</a></> : null}</small></span>}
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
              Send one product link from 1688, Taobao, or Pinduoduo, then add each size, colour, and quantity you want. Our team will confirm the RMB total before buying.
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
              <div className="input-group">
                <label className="input-label">Sizes, colours, and quantities</label>
                {normalizePurchaseVariantItems(purchaseForm.variant_items, purchaseForm.variant, purchaseForm.quantity).map((item, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 82px auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <input className="input-field" placeholder="For example: Black shoes size 34" value={item.variant} onChange={event => updatePurchaseOption(index, 'variant', event.target.value)} />
                    <input className="input-field" aria-label="Quantity" type="number" min="1" inputMode="numeric" value={item.quantity} onChange={event => updatePurchaseOption(index, 'quantity', event.target.value)} />
                    <button type="button" className="btn btn-xs btn-danger" onClick={() => removePurchaseOption(index)} disabled={normalizePurchaseVariantItems(purchaseForm.variant_items, purchaseForm.variant, purchaseForm.quantity).length === 1} title="Remove this option" aria-label="Remove this option"><Trash2 size={13} /></button>
                  </div>
                ))}
                <button type="button" className="btn btn-xs btn-secondary" onClick={addPurchaseOption}><Plus size={13} />Add another size or colour</button>
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
            <SectionHeader title={`Your Purchase Requests (${purchaseRequests.length})`} />
            {purchaseRequests.length === 0 ? <EmptyState icon="store" title="No purchase requests yet" text="Your submitted links and purchase updates will appear here." /> : purchaseRequests.map(request => {
              const status = purchaseStatusMeta(request.status)
              const canPay = request.status === 'awaiting_payment' && Number(request.quoted_amount_rmb) > 0
              return <div key={request.id} className="card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div><strong>{request.product_name || 'Marketplace item'}</strong><div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{request.platform.toUpperCase()} · Qty {request.quantity}{request.variant ? ` · ${request.variant}` : ''}</div></div>
                  <span style={{ color: status.color, fontSize: 12, fontWeight: 700 }}>{status.label}</span>
                </div>
                {request.quoted_amount_rmb != null && <div style={{ color: 'var(--teal-d)', fontSize: 14, fontWeight: 800, marginTop: 10 }}>RMB {Number(request.quoted_amount_rmb).toLocaleString()}</div>}
                {request.team_notes && <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.45, marginTop: 8 }}>{request.team_notes}</div>}
                {canPay && <button className="btn btn-primary btn-full" style={{ marginTop: 12 }} onClick={() => payPurchaseFromWallet(request)} disabled={payingPurchase === request.id}><Wallet size={16} />{payingPurchase === request.id ? 'Paying From RMB Wallet...' : 'Pay From RMB Wallet'}</button>}
              </div>
            })}
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
                  <PhotoGallery photos={s.photos?.slice(0, 4)} compact />
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
                      {m.sender === 'client' ? 'You' : '234Cargo Team'} · {fmtAgo(m.created_at)}
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
        <ReceiptView receipt={selectedReceipt} client={clientUser} companyName={settings.company_name || '234Cargo'} />
        {selectedReceipt?.status === 'unpaid' && <button onClick={() => payReceiptFromWallet(selectedReceipt)} disabled={payingReceipt === selectedReceipt.id} className="btn btn-primary btn-full" style={{ marginTop: 12 }}><Wallet size={16} />{payingReceipt === selectedReceipt.id ? 'Paying From Wallet...' : 'Pay With Prepaid Wallet'}</button>}
        <button onClick={() => downloadReceiptPdf({ receipt: selectedReceipt, client: clientUser, companyName: settings.company_name || '234Cargo Logistics' })} className="btn btn-primary btn-full" style={{ marginTop: 12 }}><Download size={16} />Download PDF Receipt</button>
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
