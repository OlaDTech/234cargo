import { useState } from 'react'
import { Search, Package, Users, Ship, Wallet, Barcode, ShoppingBag, ShoppingCart, ReceiptText, Settings, MessageCircle, Plus, Bell, ArrowRight } from 'lucide-react'
import '../styles/client-home.css'
import '../styles/admin-hub.css'

export default function AdminHub({ profile, isAdmin, can, navigate, recordGoods, addClient, openReceipts, unread, loading, children }) {
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState('Everyday')
  const services=[
    {label:'Warehouse',Icon:Package,tab:'goods',permission:'goods',group:'Operations',tone:'blue'},
    {label:'Customers',Icon:Users,tab:'clients',permission:'clients',group:'Operations',tone:'green'},
    {label:'Shipments',Icon:Ship,tab:'containers',permission:can('containers')?'containers':'goods',group:'Operations',tone:'orange'},
    {label:'Tracking',Icon:Barcode,tab:'tracking',permission:'scan',group:'Operations',tone:'violet'},
    {label:'Storefront',Icon:ShoppingBag,tab:'store',admin:true,group:'Business',tone:'green'},
    {label:'Buy for clients',Icon:ShoppingCart,tab:'purchases',permission:'purchases',group:'Business',tone:'orange'},
    {label:'Receipts',Icon:ReceiptText,action:openReceipts,permission:can('finance')?'finance':'receipts',group:'Business',tone:'violet'},
    {label:'Finance',Icon:Wallet,tab:'finance',permission:'finance',group:'Business',tone:'green'},
    {label:'Client balances',Icon:Wallet,tab:'wallet',permission:'finance',group:'Business',tone:'blue'},
    {label:'Messages',Icon:MessageCircle,tab:'messages',permission:'messages',group:'Manage',tone:'green'},
    {label:'Team & roles',Icon:Users,admin:true,action:()=>{const panel=document.getElementById('admin-team-panel');if(panel){panel.open=true;panel.scrollIntoView({block:'start',behavior:'smooth'})}},group:'Manage',tone:'violet'},
    {label:'Settings',Icon:Settings,tab:'settings',admin:true,group:'Manage',tone:'orange'},
  ].filter(s=>s.admin?isAdmin:can(s.permission))
  const quick=[
    can('goods') && {label:'Record goods',Icon:Plus,action:recordGoods},
    can('clients') && {label:'Add client',Icon:Users,action:addClient},
    (can('receipts')||can('finance')) && {label:'Receipts',Icon:ReceiptText,action:openReceipts},
    can('scan') && {label:'Track goods',Icon:Barcode,action:()=>navigate('tracking')},
  ].filter(Boolean)
  const visible=services.filter(s=>(query || category==='Everyday' || s.group===category) && (!query || s.label.toLowerCase().includes(query.toLowerCase())))
  return <div className="hub-home admin-hub-home">
    <header className="hub-header client-welcome"><div className="hub-greeting"><span>{isAdmin?'Your business, all in one place':'Your daily operations, all in one place'}</span><h1>Hello, {profile?.full_name?.split(' ')[0] || 'team'}</h1></div><label className="hub-search"><Search size={20}/><input aria-label="Search admin tools" placeholder="Search warehouse, receipts, customers…" value={query} onChange={e=>setQuery(e.target.value)}/>{query && <button aria-label="Clear admin search" onClick={()=>setQuery('')}>×</button>}</label><div className="hub-quick">{quick.map(s=><button key={s.label} onClick={s.action}><s.Icon size={30} strokeWidth={1.7}/><span>{s.label}</span></button>)}</div></header>
    <div className="hub-body"><section className="hub-services" aria-label="Admin services"><div className="hub-tabs">{['Everyday','Operations','Business','Manage'].map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="hub-service-grid">{visible.map(s=><button key={s.label} onClick={s.action || (()=>navigate(s.tab))}><span className={`hub-service-icon ${s.tone}`}><s.Icon size={26} strokeWidth={1.8}/></span><span>{s.label}</span></button>)}</div>{!visible.length && <p className="hub-muted admin-hub-empty">No tools match your search.</p>}</section>
    {can('messages') && <button className="hub-notifications" onClick={()=>navigate('messages')}><span className="hub-bell"><Bell size={20}/></span><span>{unread?`${unread} unread client message${unread===1?'':'s'}`:'Your client inbox'}<small>{unread?'Open messages to reply to your clients':'Keep clients updated on their orders and cargo'}</small></span>{unread>0 && <i/>}<ArrowRight size={17}/></button>}
    <div className="admin-hub-section-title"><h2>Business at a glance</h2><span>{loading?'Updating…':'Warehouse & shipping overview'}</span></div>
    {children}
    </div>
  </div>
}
