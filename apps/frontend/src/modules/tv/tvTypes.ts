export type TvSlideType = 'OFFER' | 'PRODUCTS' | 'APP' | 'CUSTOM';

export interface TvProductRef {
  id: string;
  name: string;
  salePrice: number;
  imageUrl: string | null;
}

// Slide tal como se edita en pantalla (startsAt/endsAt como texto para los
// inputs datetime-local). `key` solo existe en el cliente, para las listas.
export interface TvSlideDraft {
  key: string;
  type: TvSlideType;
  offerId: string | null;
  offerName: string | null;
  offerActive: boolean | null;
  offerImage: string | null;
  autoCount: number | null;
  title: string;
  subtitle: string;
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
  virtual: boolean;
  type: TvSlideType;
  offerId: string | null;
  offerName: string | null;
  offerActive: boolean | null;
  offerImage: string | null;
  autoCount: number | null;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  productIds: string[];
  products: TvProductRef[];
  autoPage: number;
  seconds: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
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

export function fromApi(s: TvSlideFromApi): TvSlideDraft {
  return {
    key: s.id ?? newKey(),
    type: s.type,
    offerId: s.offerId,
    offerName: s.offerName,
    offerActive: s.offerActive,
    offerImage: s.offerImage,
    autoCount: s.autoCount,
    title: s.title ?? '',
    subtitle: s.subtitle ?? '',
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
    key: newKey(), type, offerId: null, offerName: null, offerActive: null, offerImage: null, autoCount: null,
    title: type === 'PRODUCTS' ? 'Los más vendidos' : '', subtitle: '', imageUrl: '',
    productIds: [], products: [], autoPage: 0,
    seconds: type === 'PRODUCTS' ? 13 : type === 'APP' ? 12 : 10,
    isActive: true, startsAt: '', endsAt: '', virtual: false,
  };
}

export function toPayload(s: TvSlideDraft) {
  return {
    type: s.type,
    offerId: s.type === 'OFFER' ? s.offerId : null,
    title: s.title.trim() || null,
    subtitle: s.subtitle.trim() || null,
    imageUrl: s.imageUrl || null,
    productIds: s.type === 'PRODUCTS' ? s.productIds : [],
    autoPage: s.autoPage,
    seconds: s.seconds,
    isActive: s.isActive,
    startsAt: s.startsAt ? new Date(s.startsAt).toISOString() : null,
    endsAt: s.endsAt ? new Date(s.endsAt).toISOString() : null,
  };
}
