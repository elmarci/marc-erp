import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MapPin, Clock, Phone, ChevronRight, Tag, Truck, ShoppingBag, Star } from 'lucide-react'
import { storeApi } from '../api'
import { ProductCard } from '../components/ProductCard'

const WHATSAPP = '51930555831'
const ADDRESS = 'Mz F10 Lt2A C.27 Av. Manchay, Pachacamac'

const CAT_EMOJI: Record<string, string> = {
  'Abarrotes':'🛒','Bebidas':'🥤','Lácteos':'🥛','Frutas':'🍎','Verduras':'🥦',
  'Carnes':'🥩','Panadería':'🍞','Limpieza':'🧹','Higiene':'🧴','Snacks':'🍿',
  'Golosinas':'🍬','Congelados':'❄️','Mascotas':'🐾','Chocolates':'🍫',
  'Agua':'💧','Energizantes':'⚡','Gaseosas':'🥤','Jugos':'🧃',
  'Galletas':'🍪','Carnes y Embutidos':'🥩','Frutas y Verduras':'🥗',
}

export function HomePage() {
  const { data: cats }   = useQuery({ queryKey:['store-categories'], queryFn:()=>storeApi.getCategories() })
  const { data: prods }  = useQuery({ queryKey:['store-featured'],   queryFn:()=>storeApi.getProducts({limit:8,page:1}) })
  const { data: offersQ } = useQuery({ queryKey:['store-offers'],    queryFn:()=>storeApi.getOffers() })

  const categories   = cats?.data.data ?? []
  const featured     = prods?.data.data ?? []
  const activeOffers = offersQ?.data.data ?? []

  return (
    <div style={{ background:'#F2FCF5', minHeight:'100vh' }}>

      {/* HERO */}
      <section style={{ background:'#fff', borderBottom:'1px solid #E5E7EB' }}>
        <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14 flex flex-col sm:flex-row items-center gap-8">
          <div className="flex-1 text-center sm:text-left">
            <img src="/logo-light.png" alt="TIENDA MARC" style={{ height:44, width:'auto', marginBottom:20, display:'block', marginLeft:'auto', marginRight:'auto' }} className="sm:mx-0" />
            <h1 style={{ fontSize:'2rem', fontWeight:900, color:'#111827', lineHeight:1.2, marginBottom:12 }}>
              El minimarket de tu barrio,<br/>
              <span style={{ color:'#27AE60' }}>en tu celular</span>
            </h1>
            <p style={{ color:'#6B7280', fontSize:'0.95rem', marginBottom:24, maxWidth:380 }}>
              Pide online y recibe en tu puerta o recoge en tienda. Rápido y sin complicaciones.
            </p>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center' }} className="sm:justify-start">
              <Link to="/catalogo" style={{
                display:'inline-flex', alignItems:'center', gap:8, height:44, padding:'0 24px',
                background:'#27AE60', color:'#fff', fontWeight:700, borderRadius:999,
                textDecoration:'none', fontSize:'0.875rem', boxShadow:'0 4px 12px rgba(39,174,96,.3)',
                transition:'background .15s',
              }}>
                <ShoppingBag size={16}/>Ver productos
              </Link>
              <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer" style={{
                display:'inline-flex', alignItems:'center', gap:8, height:44, padding:'0 24px',
                background:'#fff', border:'1px solid #D1EEE0', color:'#374151', fontWeight:600,
                borderRadius:999, textDecoration:'none', fontSize:'0.875rem', transition:'background .15s',
              }}>
                <svg viewBox="0 0 24 24" style={{ width:16,height:16, fill:'#25D366' }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </a>
            </div>
          </div>

          {/* Feature badges */}
          <div className="flex sm:flex-col gap-3 flex-wrap justify-center">
            {[
              { icon: Truck,       label:'Delivery rápido',       sub:'A tu puerta',            bg:'#EAF7EF', clr:'#27AE60' },
              { icon: ShoppingBag, label:'Recojo en tienda',      sub:'Sin costo adicional',    bg:'#EFF6FF', clr:'#3B82F6' },
              { icon: Star,        label:'Productos frescos',     sub:'Calidad garantizada',    bg:'#FFFBEB', clr:'#D97706' },
            ].map(b=>(
              <div key={b.label} style={{ background:b.bg, borderRadius:12, padding:'10px 16px', minWidth:200, display:'flex', alignItems:'center', gap:12 }}>
                <b.icon size={20} style={{ color:b.clr, flexShrink:0 }} />
                <div>
                  <p style={{ fontWeight:700, fontSize:'0.875rem', color:'#111827', margin:0 }}>{b.label}</p>
                  <p style={{ fontSize:'0.75rem', color:'#6B7280', margin:0 }}>{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info strip */}
        <div style={{ background:'#EAF7EF', borderTop:'1px solid #D1EEE0', padding:'8px 16px' }}>
          <div className="max-w-6xl mx-auto flex flex-wrap gap-x-8 gap-y-1 text-xs" style={{ color:'#6B7280' }}>
            <span style={{ display:'flex', alignItems:'center', gap:6 }}><MapPin size={13} style={{ color:'#27AE60' }}/>{ADDRESS}</span>
            <span style={{ display:'flex', alignItems:'center', gap:6 }}><Clock size={13} style={{ color:'#27AE60' }}/>Lun–Dom 7:00 AM – 10:00 PM</span>
            <span style={{ display:'flex', alignItems:'center', gap:6 }}><Phone size={13} style={{ color:'#27AE60' }}/>930 555 831</span>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">

        {/* OFERTAS */}
        {activeOffers.length > 0 && (
          <section>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h2 style={{ fontWeight:900, fontSize:'1.1rem', color:'#111827', display:'flex', alignItems:'center', gap:8 }}>
                <Tag size={18} style={{ color:'#27AE60' }} />Ofertas especiales
              </h2>
              <Link to="/ofertas" style={{ fontSize:'0.875rem', fontWeight:600, color:'#27AE60', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
                Ver todas <ChevronRight size={16}/>
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeOffers.map(o=>(
                <Link key={o.id} to="/ofertas" style={{
                  display:'block', background:'#fff', border:'1px solid #D1EEE0',
                  borderRadius:16, padding:20, textDecoration:'none',
                  position:'relative', overflow:'hidden', transition:'box-shadow .15s, border-color .15s',
                }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.boxShadow='0 4px 16px rgba(0,0,0,.08)';(e.currentTarget as HTMLElement).style.borderColor='#27AE60'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.boxShadow='none';(e.currentTarget as HTMLElement).style.borderColor='#D1EEE0'}}>
                  <div style={{ position:'absolute',left:0,top:0,bottom:0,width:4,background:'#27AE60',borderRadius:'16px 0 0 16px' }}/>
                  <div style={{ paddingLeft:12 }}>
                    {o.storeBadge && <span style={{ display:'inline-block', background:'#27AE60', color:'#fff', fontSize:'0.7rem', fontWeight:700, padding:'2px 10px', borderRadius:999, marginBottom:8 }}>{o.storeBadge}</span>}
                    <p style={{ fontWeight:700, color:'#111827', marginBottom:4 }}>{o.name}</p>
                    {o.description && <p style={{ fontSize:'0.8rem', color:'#6B7280', marginBottom:6 }}>{o.description}</p>}
                    <p style={{ fontSize:'1.25rem', fontWeight:900, color:'#27AE60' }}>
                      {o.type==='PERCENTAGE_DISCOUNT'?`${o.value}% OFF`:o.type==='FIXED_DISCOUNT'?`S/ ${o.value} OFF`:'Precio especial'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* CATEGORÍAS */}
        {categories.length > 0 && (
          <section>
            <h2 style={{ fontWeight:900, fontSize:'1.1rem', color:'#111827', marginBottom:16 }}>Categorías</h2>
            <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:8 }}>
              <Link to="/catalogo" style={{
                flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                width:76, padding:'12px 8px', background:'#27AE60', border:'1px solid #27AE60',
                borderRadius:12, textDecoration:'none', color:'#fff',
              }}>
                <span style={{ fontSize:'1.5rem', lineHeight:1 }}>🛒</span>
                <span style={{ fontSize:'0.7rem', fontWeight:700 }}>Todo</span>
              </Link>
              {categories.map(cat=>(
                <Link key={cat.id} to={`/catalogo?categoryId=${cat.id}`} style={{
                  flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                  width:76, padding:'12px 8px', background:'#fff', border:'1px solid #E5E7EB',
                  borderRadius:12, textDecoration:'none', transition:'border-color .15s, background .15s',
                }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='#27AE60';(e.currentTarget as HTMLElement).style.background='#EAF7EF'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='#E5E7EB';(e.currentTarget as HTMLElement).style.background='#fff'}}>
                  <span style={{ fontSize:'1.5rem', lineHeight:1 }}>{CAT_EMOJI[cat.name]??'📦'}</span>
                  <span style={{ fontSize:'0.7rem', fontWeight:600, color:'#374151', textAlign:'center', lineHeight:1.2 }}>{cat.name}</span>
                  <span style={{ fontSize:'0.65rem', color:'#9CA3AF' }}>{cat._count?.products}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* PRODUCTOS */}
        <section>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h2 style={{ fontWeight:900, fontSize:'1.1rem', color:'#111827' }}>Productos destacados</h2>
            <Link to="/catalogo" style={{ fontSize:'0.875rem', fontWeight:600, color:'#27AE60', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
              Ver todos <ChevronRight size={16}/>
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {featured.map(p=><ProductCard key={p.id} product={p}/>)}
          </div>
        </section>
      </div>

      {/* FOOTER */}
      <footer style={{ background:'#fff', borderTop:'1px solid #E5E7EB', marginTop:48 }}>
        <div className="max-w-6xl mx-auto px-4 py-8 grid sm:grid-cols-3 gap-6 text-sm" style={{ color:'#6B7280' }}>
          <div>
            <img src="/logo-light.png" alt="TIENDA MARC" style={{ height:28, width:'auto', marginBottom:8 }} />
            <p>Tu minimarket de confianza en Pachacamac.</p>
          </div>
          <div>
            <p style={{ fontWeight:700, color:'#111827', marginBottom:6 }}>Ubicación</p>
            <p>{ADDRESS}</p>
          </div>
          <div>
            <p style={{ fontWeight:700, color:'#111827', marginBottom:6 }}>Contacto</p>
            <p>WhatsApp: 930 555 831</p>
            <p style={{ marginTop:4 }}>Lun–Dom: 7:00 AM – 10:00 PM</p>
          </div>
        </div>
        <div style={{ borderTop:'1px solid #E5E7EB', padding:'10px 0', textAlign:'center', fontSize:'0.75rem', color:'#9CA3AF' }}>
          © 2026 TIENDA MARC
        </div>
      </footer>
    </div>
  )
}
