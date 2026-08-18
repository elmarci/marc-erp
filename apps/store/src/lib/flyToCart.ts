// Efecto al agregar un producto al carrito — puro DOM + Web Animations API,
// no toca el árbol de React. Dos partes:
//  1. El "impacto" en el ícono del carrito (rebote + anillos) — SIEMPRE se ve,
//     incluso si el producto no tiene foto (muchos productos de catálogo no
//     tienen imageUrl, y antes el efecto entero dependía de tener una imagen
//     para clonar, así que en esos casos no pasaba nada visible).
//  2. El clon de la imagen que "vuela" hacia el carrito — solo si hay un
//     elemento fuente real (imagen del producto) para clonar.
function cartImpact(target: HTMLElement) {
  const rect = target.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2

  target.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.4) rotate(-6deg)', offset: 0.35 },
      { transform: 'scale(0.92) rotate(3deg)', offset: 0.65 },
      { transform: 'scale(1)' },
    ],
    { duration: 460, easing: 'cubic-bezier(.34,1.56,.64,1)' }
  )

  // Dos anillos con un pequeño desfase — se ve más "festivo" que uno solo,
  // como el poof de agregar al carrito en Rappi/PedidosYa.
  const colors = ['rgba(61,138,24,.9)', 'rgba(28,76,146,.55)']
  colors.forEach((color, i) => {
    const ring = document.createElement('div')
    ring.style.position = 'fixed'
    ring.style.left = `${cx}px`
    ring.style.top = `${cy}px`
    ring.style.width = '12px'
    ring.style.height = '12px'
    ring.style.marginLeft = '-6px'
    ring.style.marginTop = '-6px'
    ring.style.borderRadius = '9999px'
    ring.style.border = `2.5px solid ${color}`
    ring.style.pointerEvents = 'none'
    ring.style.zIndex = '9999'
    document.body.appendChild(ring)
    const anim = ring.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(4.6)', opacity: 0 },
      ],
      { duration: 560, delay: i * 90, easing: 'cubic-bezier(.2,.7,.3,1)' }
    )
    anim.onfinish = () => ring.remove()
  })
}

export function flyToCart(sourceEl: HTMLElement | null) {
  const target = document.getElementById('cart-icon-target')
  if (!target) return

  const sourceRect = sourceEl?.getBoundingClientRect()
  if (!sourceEl || !sourceRect || sourceRect.width === 0 || sourceRect.height === 0) {
    // Sin imagen que volar (producto sin foto) — igual se ve el impacto.
    cartImpact(target)
    return
  }

  const targetRect = target.getBoundingClientRect()
  const clone = sourceEl.cloneNode(true) as HTMLElement
  clone.style.position = 'fixed'
  clone.style.left = `${sourceRect.left}px`
  clone.style.top = `${sourceRect.top}px`
  clone.style.width = `${sourceRect.width}px`
  clone.style.height = `${sourceRect.height}px`
  clone.style.margin = '0'
  clone.style.zIndex = '9999'
  clone.style.pointerEvents = 'none'
  clone.style.borderRadius = '9999px'
  clone.style.objectFit = 'cover'
  clone.style.boxShadow = '0 8px 24px rgba(32,30,29,.25)'
  document.body.appendChild(clone)

  const dx = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2)
  const dy = targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2)

  const anim = clone.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy - 50}px) scale(0.6)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0.4 },
    ],
    { duration: 620, easing: 'cubic-bezier(.3,.85,.2,1)' }
  )
  anim.onfinish = () => { clone.remove(); cartImpact(target) }
  anim.oncancel = () => clone.remove()
}
