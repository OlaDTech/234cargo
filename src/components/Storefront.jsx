import { useEffect, useRef, useState } from 'react'
import { ShoppingBag, ShoppingCart, Search, Package, Plus, Trash2, Copy, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Modal, formatMoney } from './UI'
import toast from 'react-hot-toast'
import '../styles/storefront.css'
import '../styles/storefront-layout.css'

const emptyProduct = { name: '', description: '', category: 'General', supplier: '234Cargo', price: '', currency: 'RMB', image_url: '', active: false }
export default function Storefront({ admin = false }) {
  const { clientSessionToken, clientUser } = useAuth()
  const [products,setProducts] = useState([]), [orders,setOrders] = useState([])
  const [loading,setLoading] = useState(true), [error,setError] = useState('')
  const [query,setQuery] = useState(''), [category,setCategory] = useState('All'), [sort,setSort] = useState('newest')
  const [view,setView] = useState('catalog'), [cart,setCart] = useState({}), [cartOpen,setCartOpen] = useState(false)
  const [editing,setEditing] = useState(null), [photo,setPhoto] = useState(null), [detail,setDetail] = useState(null)
  const [busy,setBusy] = useState(false), [notes,setNotes] = useState('')
  const requestId = useRef(null)
  const [orderError,setOrderError] = useState('')
  const [supplier,setSupplier] = useState('All')
  const [currencyFilter,setCurrencyFilter] = useState('All')
  const [visibility,setVisibility] = useState('All')
  const [orderStatus,setOrderStatus] = useState('All')
  const [photoPreview,setPhotoPreview] = useState('')
  const cartKey = '234cargo-cart-' + (clientUser?.id || 'guest')
  const restoredKey = useRef(null)
  useEffect(()=>{
    if(admin) return
    try {
      const stored = JSON.parse(localStorage.getItem(cartKey) || '{}')
      setCart(Object.fromEntries(Object.entries(stored).filter(([id,q])=>/^[a-f0-9-]{36}$/i.test(id) && Number.isInteger(q) && q>0 && q<=9999)))
    } catch {setCart({})}
    restoredKey.current = cartKey
  },[cartKey,admin])
  function changeCart(next) {
    setCart(next); requestId.current=null
    if(!admin && restoredKey.current===cartKey) try {localStorage.setItem(cartKey,JSON.stringify(next))} catch {}
  }
  useEffect(()=>{
    if(!photo) {setPhotoPreview('');return}
    const url=URL.createObjectURL(photo);setPhotoPreview(url)
    return ()=>URL.revokeObjectURL(url)
  },[photo])
  async function deleteProduct(product) {
    if(!admin || busy || !window.confirm('Delete '+product.name+' from the catalog? Existing orders will retain their original product details.')) return
    setBusy(true)
    try {
      const {data,error}=await supabase.from('store_products').delete().eq('id',product.id).select('id')
      if(error) throw error
      if(!data?.length) throw new Error('Product not deleted. Apply the storefront management migration and confirm you are signed in as admin.')
      toast.success('Product deleted');setEditing(null);setDetail(null);await load()
    } catch(e){toast.error(e.message)} finally{setBusy(false)}
  }
  async function togglePublished(product) {
    setBusy(true)
    try {
      const {data,error}=await supabase.from('store_products').update({active:!product.active}).eq('id',product.id).select('id')
      if(error) throw error
      if(!data?.length) throw new Error('Product was not updated.')
      toast.success(product.active ? 'Product unpublished':'Product published');await load()
    } catch(e){toast.error(e.message)} finally{setBusy(false)}
  }
  async function cancelOrder(order) {
    if(!window.confirm('Cancel this pending order?')) return
    setBusy(true)
    try {await clientApi({action:'cancel',order_id:order.id});toast.success('Order cancelled');await load()}
    catch(e){toast.error(e.message)} finally{setBusy(false)}
  }
  async function clientApi(body) {
    const {data,error} = await supabase.functions.invoke('storefront',{method:body ? 'POST':'GET',headers:{Authorization:`Bearer ${clientSessionToken}`},...(body ? {body}:{})})
    if(error) { let message = 'Unable to connect to the store. Please try again.'; try { message = (await error.context.json()).error || message } catch {} throw new Error(message) }
    if(data?.error) throw new Error(data.error)
    return data
  }
  async function load() {
    setLoading(true); setError('')
    try {
      const result = await supabase.from('store_products').select('*').order('created_at',{ascending:false})
      if(result.error) throw result.error
      setProducts(result.data || [])
      try {
      if(admin) {
        const result = await supabase.from('store_orders').select('*,client:clients(full_name,shipping_mark)').order('created_at',{ascending:false}).limit(100)
        if(result.error) throw result.error
        setOrders(result.data || [])
      } else setOrders((await clientApi()).orders || [])
      setOrderError('')
      } catch(e) {setOrderError(e.message || 'Unable to load orders.')}
    } catch(e) { setError(e.message || 'Unable to load the store.') } finally { setLoading(false) }
  }
  useEffect(()=>{load()},[admin,clientSessionToken])
  const cartLines = products.filter(p=>cart[p.id]).map(p=>({...p,quantity:cart[p.id]}))
  const currency = cartLines[0]?.currency || 'RMB'
  const total = cartLines.reduce((sum,p)=>sum+Number(p.price)*p.quantity,0)
  function add(product) {
    if(cartLines.length && currency !== product.currency) { toast.error('Please order one currency at a time.'); return }
    requestId.current = null
    if(!cart[product.id] && cartLines.length>=50) {toast.error('A cart can contain up to 50 products.');return}
    changeCart({...cart,[product.id]:Math.min(9999,(cart[product.id] || 0)+1)})
    toast.success('Added to cart')
  }
  async function checkout() {
    if(busy || !cartLines.length) return
    setBusy(true)
    try {
      requestId.current ||= crypto.randomUUID()
      await clientApi({request_id:requestId.current,items:cartLines.map(p=>({id:p.id,quantity:p.quantity})),notes})
      changeCart({}); setNotes(''); setCartOpen(false); setView('orders'); requestId.current = null
      toast.success('Order received. We will confirm availability and shipping.'); await load()
    } catch(e) { toast.error(e.message) } finally {setBusy(false)}
  }
  async function saveProduct(event) {
    event.preventDefault(); if(busy) return; setBusy(true)
    try {
      let image_url = editing.image_url
      if(photo) {
        if(!['image/jpeg','image/png','image/webp'].includes(photo.type) || photo.size > 5242880) throw new Error('Choose a JPG, PNG or WebP image up to 5 MB.')
        const path = `${crypto.randomUUID()}.${photo.type.split('/')[1]}`
        const {error} = await supabase.storage.from('store-products').upload(path,photo)
        if(error) throw error
        image_url = supabase.storage.from('store-products').getPublicUrl(path).data.publicUrl
      }
      const payload = {...editing,name:editing.name.trim(),category:editing.category.trim(),supplier:editing.supplier.trim(),price:Number(editing.price),image_url:image_url || null}
      delete payload.id; delete payload.created_at
      const result = editing.id ? await supabase.from('store_products').update(payload).eq('id',editing.id) : await supabase.from('store_products').insert(payload)
      if(result.error) throw result.error
      setEditing(null); setPhoto(null); toast.success('Product saved'); await load()
    } catch(e) {toast.error(e.message)} finally {setBusy(false)}
  }
  async function updateStatus(id,status) {
    setBusy(true)
    const {error} = await supabase.from('store_orders').update({status}).eq('id',id)
    if(error) toast.error(error.message); else await load()
    setBusy(false)
  }
  const visible = products.filter(p=>(supplier==='All' || p.supplier===supplier) && (currencyFilter==='All' || p.currency===currencyFilter) && (visibility==='All' || p.active===(visibility==='Published')) && (category==='All' || p.category===category) && `${p.name} ${p.supplier} ${p.description}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==='name' ? a.name.localeCompare(b.name) : sort==='low' || sort==='high' ? a.currency.localeCompare(b.currency) || (Number(a.price)-Number(b.price))*(sort==='low'?1:-1) : 0)
  return <section className="storefront">
    <div className="store-toolbar"><button className="btn btn-secondary" onClick={()=>setView('catalog')} aria-pressed={view==='catalog'}>Catalog</button><button className="btn btn-secondary" onClick={()=>setView('orders')} aria-pressed={view==='orders'}>Orders ({orders.length})</button>{admin ? <button className="btn btn-primary" onClick={()=>{setEditing({...emptyProduct});setPhoto(null)}}><Plus size={16}/>Add product</button> : <button className="btn btn-primary" onClick={()=>setCartOpen(true)}><ShoppingCart size={16}/>Cart ({cartLines.reduce((s,p)=>s+p.quantity,0)})</button>}</div>
    <header className="store-hero"><span><ShoppingBag size={16}/>234CARGO MARKETPLACE</span><h1>{admin ? 'Manage your storefront' : 'Your next great find starts here.'}</h1><p>{admin ? 'Publish your catalog and manage client orders in one place.' : 'Shop products selected by our team, with China sourcing and shipping support.'}</p><small>{products.filter(p=>p.active).length} products available · Shipping quoted separately</small></header>
    {loading ? <p role="status">Loading store…</p> : error ? <div className="card" role="alert"><p>{error}</p><button className="btn btn-secondary" onClick={load}>Retry</button></div> : view==='orders' ? <div className="store-orders">{orderError && <div className="store-notice" role="alert">{orderError}<button className="btn btn-secondary" onClick={load}>Retry</button></div>}<label className="store-order-filter">Filter orders<select className="input-field" value={orderStatus} onChange={e=>setOrderStatus(e.target.value)}>{['All','pending','confirmed','purchased','ready_to_ship','cancelled'].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label><h2>{admin ? 'Client orders':'My orders'}</h2>{!orders.length && <div className="store-empty"><Package/><h3>No orders yet</h3><p>Your orders will appear here after checkout.</p></div>}{orders.filter(o=>orderStatus==='All' || o.status===orderStatus).map(order=><article className="card" key={order.id}><div className="store-order-heading"><strong>Order {order.id.slice(0,8).toUpperCase()}</strong><span className={`store-status-pill status-${order.status}`}>{order.status.replaceAll('_',' ')}</span></div><p>{order.client?.full_name} {order.client?.shipping_mark} · {new Date(order.created_at).toLocaleDateString()}</p>{order.items.map((item,i)=><div className="store-order-line" key={i}><span>{item.quantity} × {item.name}</span><strong>{formatMoney(item.amount,order.currency)}</strong></div>)}<div className="store-order-line"><span>Products total</span><strong>{formatMoney(order.total,order.currency)}</strong></div>{order.notes && <p>{order.notes}</p>}<small>Shipping is quoted separately. This order is not a payment receipt.</small>{!admin && order.status==='pending' && <button className="btn btn-secondary" disabled={busy} onClick={()=>cancelOrder(order)}>Cancel order</button>}{admin && <label className="store-status">Order status<select className="input-field" value={order.status} disabled={busy} onChange={e=>updateStatus(order.id,e.target.value)}>{['pending','confirmed','purchased','ready_to_ship','cancelled'].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label>}</article>)}</div> : <>
    <div className="store-search"><Search size={18}/><input aria-label="Search products" placeholder="Search products or suppliers…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Sort products" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest</option><option value="name">Name A–Z</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></div>
    <div className="store-filters"><label>Supplier<select value={supplier} onChange={e=>setSupplier(e.target.value)}><option>All</option>{[...new Set(products.map(p=>p.supplier))].map(x=><option key={x}>{x}</option>)}</select></label><label>Currency<select value={currencyFilter} onChange={e=>setCurrencyFilter(e.target.value)}>{['All','RMB','NGN','USD'].map(x=><option key={x}>{x}</option>)}</select></label>{admin && <label>Visibility<select value={visibility} onChange={e=>setVisibility(e.target.value)}>{['All','Published','Draft'].map(x=><option key={x}>{x}</option>)}</select></label>}<button className="btn btn-secondary" onClick={()=>{setQuery('');setCategory('All');setSupplier('All');setCurrencyFilter('All');setVisibility('All')}}>Reset filters</button></div><div className="store-categories">{['All',...new Set(products.map(p=>p.category))].map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div><p className="store-count">{visible.length} products <span>Prices are per unit · Shipping quoted separately</span></p>
    {!visible.length && <div className="store-empty"><ShoppingBag/><h3>{products.length ? 'No matching products':'The catalog is coming soon'}</h3><p>{admin ? 'Add a product, upload its photo and publish it for clients.' : 'Check back for products selected by the 234Cargo team.'}</p></div>}
    <div className="store-grid">{visible.map(p=><article className="store-product" key={p.id}><button className="store-photo" onClick={()=>setDetail(p)} aria-label={`View ${p.name}`}>{p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy"/>:<ShoppingBag size={48}/>}<span>{p.category}</span></button><div className="store-product-body"><small>{p.supplier}{!p.active ? ' · Draft':''}</small><h3>{p.name}</h3><strong className="store-price">{formatMoney(p.price,p.currency)} <small>/ unit</small></strong><div className="store-product-actions"><button className="btn btn-secondary" onClick={()=>setDetail(p)}>View</button>{admin ? <button className="btn btn-primary" onClick={()=>{setEditing({...p});setPhoto(null)}}>Edit</button>:<button className="btn btn-primary" onClick={()=>add(p)}><Plus size={14}/>Add</button>}</div>{admin && <div className="store-admin-actions"><button disabled={busy} onClick={()=>togglePublished(p)} title={p.active?'Unpublish':'Publish'}>{p.active?<EyeOff size={14}/>:<Eye size={14}/>}<span>{p.active?'Unpublish':'Publish'}</span></button><button disabled={busy} onClick={()=>{const {id,created_at,...copy}=p;setEditing({...copy,name:p.name+' (copy)',active:false});setPhoto(null)}} aria-label={'Duplicate '+p.name}><Copy size={14}/></button><button className="store-delete" disabled={busy} onClick={()=>deleteProduct(p)} aria-label={'Delete '+p.name}><Trash2 size={14}/></button></div>}</div></article>)}</div></>}
    <Modal open={!!detail} title={detail?.name || 'Product'} onClose={()=>setDetail(null)}>{detail && <div className="store-detail">{detail.image_url && <img src={detail.image_url} alt={detail.name}/>}<p>{detail.description || 'Contact our team for product specifications.'}</p><p>{detail.supplier} · {detail.category}</p><h3>{formatMoney(detail.price,detail.currency)}</h3>{!admin && <button className="btn btn-primary" onClick={()=>add(detail)}>Add to cart</button>}</div>}</Modal>
    <Modal open={cartOpen} title="Your cart" onClose={()=>{if(!busy)setCartOpen(false)}}>{!cartLines.length ? <div className="store-empty"><ShoppingCart size={36}/><h3>Your cart is waiting</h3><p>Explore the catalog and add something you like.</p><button className="btn btn-primary" onClick={()=>{setCartOpen(false);setView('catalog')}}>Continue shopping</button></div>:<>{cartLines.map(p=><div className="store-cart-line" key={p.id}><strong>{p.name}</strong><label>Quantity<input type="number" min="0" max="9999" value={p.quantity} disabled={busy} onChange={e=>{requestId.current=null;changeCart({...cart,[p.id]:Math.max(0,Math.min(9999,parseInt(e.target.value)||0))})}}/></label><span>{formatMoney(p.price*p.quantity,p.currency)}</span><button className="store-remove" disabled={busy} onClick={()=>{const next={...cart};delete next[p.id];changeCart(next)}}><Trash2 size={14}/>Remove</button></div>)}<div className="store-checkout-total"><span>Products subtotal</span><strong>{formatMoney(total,currency)}</strong></div><button className="btn btn-secondary" disabled={busy} onClick={()=>{if(window.confirm('Remove all products from your cart?'))changeCart({})}}>Clear cart</button><p>Availability and shipping charges are confirmed by our team. No payment is taken at checkout.</p><label>Order notes<textarea className="input-field" maxLength={1000} value={notes} disabled={busy} onChange={e=>{requestId.current=null;setNotes(e.target.value)}}/></label><button className="btn btn-primary btn-full" disabled={busy} onClick={checkout}>{busy ? 'Submitting…':'Place order for confirmation'}</button></>}</Modal>
    <Modal open={!!editing} title={editing?.id ? 'Edit product':'Add product'} onClose={()=>{if(!busy)setEditing(null)}}>{editing && <form onSubmit={saveProduct} className="store-form">{['name','category','supplier'].map(field=><label key={field}>{field}<input className="input-field" required maxLength={160} value={editing[field]} onChange={e=>setEditing({...editing,[field]:e.target.value})}/></label>)}<label>Description<textarea className="input-field" maxLength={4000} value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})}/></label><label>Unit price<input className="input-field" type="number" min="0.01" max="999999999" step="0.01" required value={editing.price} onChange={e=>setEditing({...editing,price:e.target.value})}/></label><label>Currency<select className="input-field" value={editing.currency} onChange={e=>setEditing({...editing,currency:e.target.value})}>{['RMB','NGN','USD'].map(c=><option key={c}>{c}</option>)}</select></label>{(photoPreview || editing.image_url) && <img className="store-editor-preview" src={photoPreview || editing.image_url} alt="Product preview"/>}<label>Product photo (JPG, PNG, WebP · up to 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setPhoto(e.target.files?.[0] || null)}/></label><label><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Publish for clients</label><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…':'Save product'}</button>{editing.id && <button type="button" className="btn btn-danger" disabled={busy} onClick={()=>deleteProduct(editing)}><Trash2 size={15}/>Delete product</button>}</form>}</Modal>
  </section>
}
