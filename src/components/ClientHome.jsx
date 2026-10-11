import { useState } from 'react'
import { Search, QrCode, Wallet, Package, ShoppingBag, ShoppingCart, Ship, ReceiptText, MessageCircle, Warehouse, Tag, Bell, ArrowRight, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { formatMoney, StatusPill, fmtAgo, SkeletonList } from './UI'
import '../styles/client-home.css'

export default function ClientHome({ client, goods, receipts, announcements, unread, wallet, walletLoading, loading, navigate, showLabel, selectGoods }) {
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState('Everyday')
  const services=[
    {label:'Shop products',icon:ShoppingBag,tab:'store',group:'Shopping',tone:'green'},
    {label:'Buy for me',icon:ShoppingCart,tab:'purchase',group:'Shopping',tone:'orange'},
    {label:'My packages',icon:Package,tab:'goods',group:'Shipping',tone:'blue'},
    {label:'My wallet',icon:Wallet,tab:'wallet',group:'Account',tone:'green'},
    {label:'Shipping label',icon:QrCode,tab:'label',group:'Shipping',tone:'violet'},
    {label:'Receipts',icon:ReceiptText,tab:'receipts',group:'Account',tone:'orange'},
    {label:'Suppliers',icon:Warehouse,tab:'suppliers',group:'Shopping',tone:'blue'},
    {label:'Support',icon:MessageCircle,tab:'chat',group:'Account',tone:'green'},
  ]
  const term=query.trim().toLowerCase()
  const matches=goods.filter(g=>[g.description,g.tracking_no].some(v=>String(v||'').toLowerCase().includes(term))).slice(0,5)
  const active=goods.find(g=>g.status!=='delivered')
  const balance=wallet?.balances?.find(b=>b.currency==='NGN')?.available_balance || 0
  return <div className="hub-home">
    <header className="hub-header client-welcome">
      <div className="hub-greeting"><span>Your everyday cargo companion</span><h1>Hello, {client.full_name?.split(' ')[0]}</h1></div>
      <label className="hub-search"><Search size={20}/><input aria-label="Search services or packages" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search services or packages"/>{query && <button onClick={()=>setQuery('')} aria-label="Clear search">×</button>}</label>
      <div className="hub-quick">{[{label:'My label',Icon:QrCode,action:showLabel},{label:'Wallet',Icon:Wallet,action:()=>navigate('wallet')},{label:'Packages',Icon:Ship,action:()=>navigate('goods')},{label:'Shop',Icon:ShoppingBag,action:()=>navigate('store')}].map(({label,Icon,action})=><button key={label} onClick={action}><Icon size={30} strokeWidth={1.7}/><span>{label}</span></button>)}</div>
    </header>
    <div className="hub-body">
      <section className="hub-services" aria-label="Services">
        <div className="hub-tabs" aria-label="Service categories">{['Everyday','Shopping','Shipping','Account'].map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div>
        <div className="hub-service-grid">{services.filter(s=>(term || category==='Everyday' || s.group===category) && (!term || s.label.toLowerCase().includes(term))).map(s=><button key={s.label} onClick={()=>navigate(s.tab)}><span className={`hub-service-icon ${s.tone}`}><s.icon size={26} strokeWidth={1.8}/></span><span>{s.label}</span></button>)}</div>
        {term && <div className="hub-search-results"><h2>Matching packages</h2>{matches.length ? matches.map(g=><button key={g.id} onClick={()=>selectGoods(g)}><Package size={18}/><span>{g.description}<small>{g.tracking_no}</small></span><ArrowRight size={16}/></button>):<p>No packages match “{query}”.</p>}</div>}
      </section>
      <button className="hub-notifications" onClick={()=>navigate('chat')}><span className="hub-bell"><Bell size={20}/></span><span>{unread ? `${unread} unread message${unread===1?'':'s'}`:'Messages & support'}<small>{unread ? 'Your team has an update for you':'We are here to help with your orders and cargo'}</small></span>{unread>0 && <i/>}<ArrowRight size={17}/></button>
      <div className="hub-feature-grid">
        <section className="hub-panel"><div className="hub-section-heading"><h2>Shop & source</h2><button onClick={()=>navigate('store')}>Explore <ArrowRight size={14}/></button></div><button className="hub-shop-feature" onClick={()=>navigate('store')}><div><span>234CARGO MARKETPLACE</span><strong>Find it. Love it.<br/>We'll help ship it.</strong><small>Browse products selected by our team</small></div><ShoppingBag size={56} strokeWidth={1.2}/><ArrowUpRight className="hub-feature-arrow" size={20}/></button><button className="hub-source-link" onClick={()=>navigate('purchase')}><ShoppingCart size={19}/><span>Found something on 1688 or Taobao?<strong>Send a link. We can buy it for you.</strong></span><ArrowRight size={16}/></button></section>
        <section className="hub-panel"><div className="hub-section-heading"><h2>Your shipping space</h2><button onClick={()=>navigate('goods')}>View all <ArrowRight size={14}/></button></div><button className="hub-mark" onClick={showLabel}><div><small>YOUR SHIPPING MARK</small><strong>{client.shipping_mark}</strong><span>View or download your label</span></div><QrCode size={37}/></button><div className="hub-cargo-stats">{[{label:'Warehouse',value:goods.filter(g=>g.status==='in_warehouse').length,Icon:Warehouse},{label:'In transit',value:goods.filter(g=>g.status==='in_transit').length,Icon:Ship},{label:'Delivered',value:goods.filter(g=>g.status==='delivered').length,Icon:CheckCircle2}].map(s=><button key={s.label} onClick={()=>navigate('goods')}><s.Icon size={18}/><strong>{loading?'—':s.value}</strong><span>{s.label}</span></button>)}</div></section>
      </div>
      <section className="hub-panel hub-wallet"><span className="hub-service-icon green"><Wallet size={25}/></span><div><small>Available wallet balance</small><strong>{walletLoading?'Loading…':wallet?formatMoney(balance,'NGN'):'View your balance'}</strong><span>Manage balances and verified top-ups</span></div><button onClick={()=>navigate('wallet')}>Open wallet <ArrowRight size={15}/></button></section>
      {loading ? <SkeletonList n={1}/> : active && <section className="hub-panel"><div className="hub-section-heading"><h2>Latest shipment</h2><StatusPill status={active.status}/></div><button className="hub-shipment" onClick={()=>selectGoods(active)}><Package size={28}/><span><strong>{active.description}</strong><small>{active.tracking_no || 'View shipment details'}</small></span><ArrowRight size={18}/></button></section>}
      <section className="hub-panel"><div className="hub-section-heading"><h2>Latest updates</h2><Bell size={18}/></div>{announcements.length ? announcements.slice(0,3).map(a=><article className="hub-announcement" key={a.id}><strong>{a.title}</strong><p>{a.body}</p><small>{fmtAgo(a.created_at)}{a.is_important?' · Important':''}</small></article>):<p className="hub-muted">You're all caught up. Company announcements will appear here.</p>}</section>
    </div>
  </div>
}
