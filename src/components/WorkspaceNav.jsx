import { ArrowUpRight, LogOut } from 'lucide-react'

export default function WorkspaceNav({ items, active, onChange, name, role, onSignOut }) {
  return <aside className="workspace-sidebar" aria-label="Workspace navigation">
    <a className="workspace-brand" href="#" onClick={event=>{event.preventDefault();onChange(items[0]?.id)}} aria-label="234Cargo home">
      <img src="/234cargo-logo.svg" alt="234Cargo"/>
      <span>LOGISTICS & COMMERCE</span>
    </a>
    <div className="workspace-switcher"><span className="workspace-avatar">234</span><div><strong>234Cargo</strong><small>{role}</small></div></div>
    <nav>{['Workspace','Operations','Business','Account'].map(group=>{
      const links=items.filter(item=>(item.group || 'Workspace')===group)
      if(!links.length) return null
      return <div className="workspace-nav-group" key={group}><p>{group}</p>{links.map(({id,label,Icon,badge})=><button key={id} aria-current={active===id?'page':undefined} onClick={()=>onChange(id)}><Icon size={18}/><span>{label}</span>{badge>0 && <b>{badge>99?'99+':badge}</b>}</button>)}</div>
    })}</nav>
    <div className="workspace-sidebar-footer"><div className="workspace-route"><ArrowUpRight size={17}/><span>From China.<br/><strong>To your doorstep.</strong></span></div><div className="workspace-user"><span className="workspace-avatar">{(name || role || 'U').slice(0,1).toUpperCase()}</span><div><strong>{name || role}</strong><small>{role}</small></div><button onClick={onSignOut} aria-label="Sign out"><LogOut size={17}/></button></div></div>
  </aside>
}
