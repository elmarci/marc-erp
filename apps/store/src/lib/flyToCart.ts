// Señal al agregar un producto: un pulso corto y discreto en el botón del
// carrito (barra de abajo en celular, cabecera en escritorio). Antes volaba
// una copia de la foto y estallaban dos anillos; el dueño pidió algo sutil.
// El número del carrito y el total ya cambian al instante, así que el pulso
// solo dirige la mirada. Puro DOM + Web Animations API, no toca React.
export function flyToCart(_sourceEl?: HTMLElement | null) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-cart-target]'))
    .find(el => el.offsetParent !== null)
  if (!target) return
  target.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
    { duration: 220, easing: 'ease-out' }
  )
}
