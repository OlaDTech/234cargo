import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, Copy, Trash2, Check, CheckCheck, Search, ArrowDown } from 'lucide-react'
import '../styles/chat.css'

export default function ChatThread({ title, subtitle, messages, isMine, draft, setDraft, onSend, loading, onDelete, syncError }) {
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [newMessages,setNewMessages]=useState(false)
  const list=useRef(null), nearBottom=useRef(true), sending=useRef(false)
  const endId=messages.at(-1)?.id
  function bottom() {if(list.current)list.current.scrollTop=list.current.scrollHeight;nearBottom.current=true;setNewMessages(false)}
  useEffect(()=>{if(nearBottom.current)bottom();else setNewMessages(true)},[endId])
  async function send(e) {
    e.preventDefault()
    if(sending.current||!draft.trim())return
    sending.current=true;setBusy(true);setError('')
    try {await onSend();nearBottom.current=true;requestAnimationFrame(bottom)}
    catch {setError('Message was not confirmed as sent. Your text is kept below. Check the conversation before retrying.')}
    finally{sending.current=false;setBusy(false)}
  }
  const visible=messages.filter(m=>m.message.toLowerCase().includes(query.toLowerCase()))
  return <section className="cargo-chat" aria-label="Conversation">
    <header className="cargo-chat-header"><span className="cargo-chat-avatar"><MessageCircle size={22}/></span><div><h2>{title}</h2><p>{subtitle}</p></div></header>
    <label className="cargo-chat-search"><Search size={16}/><input aria-label="Search this conversation" placeholder="Search this conversation" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {syncError&&<p className="cargo-chat-warning" role="status">Messages could not refresh. Reconnecting…</p>}
    <div className="cargo-chat-history" ref={list} role="log" aria-label="Messages" aria-live="polite" onScroll={()=>{const el=list.current;nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;if(nearBottom.current)setNewMessages(false)}}>
      {loading?<p className="cargo-chat-empty" role="status">Loading messages…</p>:!visible.length?<div className="cargo-chat-empty"><MessageCircle size={30}/><h3>{query?'No matching messages':'Start a conversation'}</h3><p>{query?'Try another search.':'Ask about your goods, shipping or payments.'}</p></div>:visible.map((m,i)=>{
        const mine=isMine(m),date=new Date(m.created_at),day=date.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})
        const previous=i?new Date(visible[i-1].created_at).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):null
        return <div key={m.id}>{day!==previous&&<div className="cargo-chat-date">{day}</div>}<article className={`cargo-chat-message ${mine?'mine':''}`}>
          <div className="cargo-chat-bubble"><p>{m.message}</p><footer><time dateTime={m.created_at}>{date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</time>{mine&&<span>{m.is_read?<CheckCheck size={14}/>:<Check size={14}/>} {m.is_read?'Read':'Sent'}</span>}</footer></div>
          <div className="cargo-chat-actions"><button aria-label="Copy message" onClick={async()=>{try{await navigator.clipboard.writeText(m.message)}catch{setError('Copy unavailable. Select and copy the message text instead.')}}}><Copy size={13}/></button>{onDelete&&<button aria-label="Delete message" onClick={()=>onDelete(m.id)}><Trash2 size={13}/></button>}</div>
        </article></div>
      })}
    </div>
    {newMessages&&<button className="cargo-chat-new" onClick={bottom}><ArrowDown size={14}/> Latest messages</button>}
    {error&&<p className="cargo-chat-warning" role="alert">{error}</p>}
    <form className="cargo-chat-compose" onSubmit={send}><label className="sr-only" htmlFor="chat-draft">Message</label><textarea id="chat-draft" placeholder="Write a message…" value={draft} maxLength={2000} rows={2} disabled={busy} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();send(e)}}}/><button className="btn btn-primary" disabled={busy||!draft.trim()} type="submit" aria-label="Send message"><Send size={18}/><span>{busy?'Sending…':'Send'}</span></button><small>Enter for a new line · Ctrl/⌘ + Enter to send <span>{draft.length}/2000</span></small></form>
  </section>
}
