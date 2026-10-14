export type TvSlideType = 'OFFER' | 'PRODUCTS' | 'APP' | 'CUSTOM';

export interface TvProductRef {
  id: string;
  name: string;
  salePrice: number;
  imageUrl: string | null;
}

// Slide tal como se edita en pantalla (startsAt/endsAt como texto para los
// inputs datetime-local). `key` solo existe en el cliente, para las listas.
// Cómo se ve un aviso propio en la TV: solo la imagen a pantalla completa,
// imagen con texto al lado, o solo texto grande. Solo existe en el cliente: en
// la base se deduce de qué campos tienen contenido.
export type CustomLayout = 'IMAGE' | 'IMAGE_TEXT' | 'TEXT';

export interface TvSlideDraft {
  key: string;
  // Identificador que entiende la TV para "mostrar esta ahora"; null en las
  // slides nuevas que todavía no se guardaron.
  liveKey: string | null;
  type: TvSlideType;
  offerId: string | null;
  offerName: string | null;
  offerActive: boolean | null;
  offerImage: string | null;
  autoCount: number | null;
  title: string;
  subtitle: string;
  // Nombre para identificarla en el ERP; no sale en la TV.
  label: string;
  layout: CustomLayout;
  imageUrl: string;
  productIds: string[];
  products: TvProductRef[];
  autoPage: number;
  seconds: number;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
  virtual: boolean;
}

export interface TvSlideFromApi {
  id: string | null;
  key: string;
  virtual: boolean;
  type: TvSlideType;
  offerId: string | null;
  offerName: string | null;
  offerActive: boolean | null;
  offerImage: string | null;
  autoCount: number | null;
  title: string | null;
  subtitle: string | null;
  label?: string | null;
  imageUrl: string | null;
  productIds: string[];
  products: TvProductRef[];
  autoPage: number;
  seconds: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

// Estado de la transmisión en vivo (lo que la TV muestra "ahora mismo").
export interface TvLiveState {
  mode: 'AUTO' | 'ONLY' | 'CART';
  keys: string[];
  hasImage: boolean;
  expiresAt: number | null;
  cartItems: number;
  version: number;
}

export interface TvLiveOption {
  key: string;
  type: TvSlideType;
  label: string;
  thumb: string | null;
  isActive: boolean;
}

// <input type="datetime-local"> espera "YYYY-MM-DDTHH:mm" en hora local.
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let counter = 0;
export const newKey = () => `s${Date.now()}-${counter++}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function fromApi(s: TvSlideFromApi): TvSlideDraft {
  const hasText = !!(s.title || s.subtitle);
  const layout: CustomLayout = s.imageUrl ? (hasText ? 'IMAGE_TEXT' : 'IMAGE') : 'TEXT';
  return {
    key: s.id ?? newKey(),
    liveKey: s.key ?? null,
    type: s.type,
    offerId: s.offerId,
    offerName: s.offerName,
    offerActive: s.offerActive,
    offerImage: s.offerImage,
    autoCount: s.autoCount,
    title: s.title ?? '',
    subtitle: s.subtitle ?? '',
    label: s.label ?? '',
    layout,
    imageUrl: s.imageUrl ?? '',
    productIds: s.productIds,
    products: s.products,
    autoPage: s.autoPage,
    seconds: s.seconds,
    isActive: s.isActive,
    startsAt: toLocalInput(s.startsAt),
    endsAt: toLocalInput(s.endsAt),
    virtual: s.virtual,
  };
}

export function blankSlide(type: TvSlideType): TvSlideDraft {
  return {
    key: newKey(), liveKey: null, type, offerId: null, offerName: null, offerActive: null, offerImage: null, autoCount: null,
    title: type === 'PRODUCTS' ? 'Los más vendidos' : '', subtitle: '', label: '', layout: 'TEXT', imageUrl: '',
    productIds: [], products: [], autoPage: 0,
    seconds: type === 'PRODUCTS' ? 13 : type === 'APP' ? 12 : 10,
    isActive: true, startsAt: '', endsAt: '', virtual: false,
  };
}

export function toPayload(s: TvSlideDraft) {
  // En un aviso, lo que se manda depende del diseño elegido: "solo imagen" no
  // lleva texto aunque se haya escrito antes, y "solo texto" no lleva imagen.
  const isCustom = s.type === 'CUSTOM';
  const title = isCustom && s.layout === 'IMAGE' ? '' : s.title;
  const subtitle = isCustom && s.layout === 'IMAGE' ? '' : s.subtitle;
  const imageUrl = isCustom && s.layout === 'TEXT' ? '' : s.imageUrl;
  return {
    // Se conserva el id de las slides ya guardadas para que lo "en vivo" que
    // apunta a ellas siga valiendo después de guardar el orden.
    id: !s.virtual && UUID.test(s.key) ? s.key : null,
    type: s.type,
    offerId: s.type === 'OFFER' ? s.offerId : null,
    title: title.trim() || null,
    subtitle: subtitle.trim() || null,
    label: s.label.trim() || null,
    imageUrl: imageUrl || null,
    productIds: s.type === 'PRODUCTS' ? s.productIds : [],
    autoPage: s.autoPage,
    seconds: s.seconds,
    isActive: s.isActive,
    startsAt: s.startsAt ? new Date(s.startsAt).toISOString() : null,
    endsAt: s.endsAt ? new Date(s.endsAt).toISOString() : null,
  };
}

export function liveSummary(live: TvLiveState | undefined, options: TvLiveOption[]): string {
  if (!live || live.mode === 'AUTO') return 'Automático — rotando todas tus slides';
  if (live.mode === 'CART') {
    return live.cartItems > 0
      ? `Venta en curso del POS (${live.cartItems} producto${live.cartItems === 1 ? '' : 's'})`
      : 'Pantalla del cliente activada (sin venta en este momento)';
  }
  const names = live.keys.map((k) => options.find((o) => o.key === k)?.label).filter(Boolean) as string[];
  if (live.hasImage && names.length === 0) return 'Mostrando una imagen que subiste';
  if (names.length === 1) return `Fija en pantalla: ${names[0]}`;
  return `Mostrando solo ${names.length + (live.hasImage ? 1 : 0)} slides: ${names.join(', ')}`;
}
