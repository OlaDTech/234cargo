import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function RegistrationQueue({ onApproved }) {
  const [rows,setRows]=useState([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(null)
  const [error,setError]=useState('')
  async function refresh() {
    setLoading(true); setError('')
    const {data,error}=await supabase.from('client_registrations').select('id,full_name,phone,country,state,created_at').eq('status','pending').order('created_at')
    if(error) setError('Could not load registration requests. Check that the registration migration is installed.')
    else setRows(data||[])
    setLoading(false)
  }
  useEffect(()=>{refresh()},[])
  async function review(row,approve) {
    if(busy || !window.confirm(`${approve?'Approve':'Reject'} the registration for ${row.full_name}?${approve?' Confirm this is not an existing customer.':''}`)) return
    setBusy(row.id); setError('')
    try {
      const {error}=await supabase.rpc('review_client_registration',{p_id:row.id,p_approve:approve})
      if(error) throw error
      await refresh()
      if(approve) onApproved()
    } catch(err) {setError(err.message||'Could not review this request.')} finally {setBusy(null)}
  }
  return <section className="card" aria-label="Client registration requests" style={{marginTop:16}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><h2 style={{fontSize:17}}>Client registrations {rows.length>0 && `(${rows.length})`}</h2><button className="btn btn-sm" disabled={loading||!!busy} onClick={refresh}>Refresh</button></div>
    <p style={{fontSize:13,color:'var(--muted)',margin:'12px 0'}}>Check for an existing client before approving. Approval creates an account and shipping mark; it does not verify phone ownership. Let the customer know once approved.</p>
    {error && <p className="banner banner-error" role="alert">{error}</p>}
    {loading?<p role="status">Loading requests…</p>:!rows.length&&!error?<p>No pending registrations.</p>:rows.map(row=><article key={row.id} style={{borderTop:'1px solid var(--border)',padding:'14px 0',overflowWrap:'anywhere'}}>
      <strong>{row.full_name}</strong><p>{row.phone} · {row.state}, {row.country}</p><small>{new Date(row.created_at).toLocaleDateString()}</small>
      <div style={{display:'flex',gap:10,marginTop:10}}><button className="btn btn-primary btn-sm" disabled={!!busy} onClick={()=>review(row,true)}>Approve</button><button className="btn btn-sm" disabled={!!busy} onClick={()=>review(row,false)}>Reject</button></div>
    </article>)}
  </section>
}
