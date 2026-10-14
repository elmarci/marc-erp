import { prisma } from '../../database/client';
import { redis } from '../../config/redis';
import { storeService } from '../store/store.service';

export type TvSlideType = 'OFFER' | 'PRODUCTS' | 'APP' | 'CUSTOM';

export interface TvSlideInput {
  // Id de una slide ya guardada: se conserva al guardar la lista para que lo
  // que se mandó "en vivo" a la TV (que apunta a ese id) no se rompa.
  id?: string | null;
  type: TvSlideType;
  offerId?: string | null;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  productIds: string[];
  autoPage: number;
  seconds: number;
  isActive: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

interface EffectiveSlide extends TvSlideInput {
  id: string | null;
  // true = todavía no está guardada: sale de las ofertas activas (o del
  // armado por defecto) y se guarda sola la primera vez que el admin graba.
  virtual: boolean;
}

type ActiveOffer = Awaited<ReturnType<typeof storeService.getActiveOffers>>[number];

const GRID_SIZE = 8;
const MIN_AUTO_PRODUCTS = 4;

// Identificador estable de una slide, el mismo para la TV y para el ERP: es lo
// que se usa para decir "muestra esta ahora" (transmisión en vivo).
export function slideKey(s: { id: string | null; type: string; offerId?: string | null; autoPage: number }): string {
  if (s.id) return s.id;
  if (s.type === 'OFFER') return `offer:${s.offerId}`;
  if (s.type === 'PRODUCTS') return `products:${s.autoPage}`;
  return s.type.toLowerCase();
}

function virtualOffer(o: ActiveOffer): EffectiveSlide {
  return {
    id: null, virtual: true, type: 'OFFER', offerId: o.id, title: null, subtitle: null, imageUrl: null,
    productIds: [], autoPage: 0, seconds: 11, isActive: true, startsAt: null, endsAt: null,
  };
}

function virtualProducts(autoPage: number, title: string): EffectiveSlide {
  return {
    id: null, virtual: true, type: 'PRODUCTS', offerId: null, title, subtitle: null, imageUrl: null,
    productIds: [], autoPage, seconds: 13, isActive: true, startsAt: null, endsAt: null,
  };
}

/* ── Transmisión en vivo ──────────────────────────────────────────────────── */
// Estado "ahora mismo" de la TV, por encima de la rotación normal. Vive en
// Redis (no en la base): es efímero, la TV lo consulta cada pocos segundos.
//   ONLY → rota solo las slides elegidas (una sola = fija) o una imagen subida al vuelo
//   CART → la venta en curso del POS (carrito en vivo) + promos al lado
export interface TvLiveCartItem { name: string; quantity: number; unit: string | null; unitPrice: number; subtotal: number }

interface LiveState {
  version: number;
  mode: 'ONLY' | 'CART';
  keys: string[];
  image: { url: string; seconds: number } | null;
  cart: { items: TvLiveCartItem[]; total: number; customerName: string | null } | null;
  thanksUntil: number | null;
  expiresAt: number | null;
  updatedBy: string | null;
}

const LIVE_KEY = 'tv:live';
const THANKS_MS = 9000;
const CART_TTL_MS = 4 * 60 * 60 * 1000;

export class TvService {
  // Lista efectiva: lo guardado por el admin; si nunca guardó nada, el armado
  // automático (ofertas → más vendidos → app). Las ofertas nuevas que todavía
  // no están en la lista se agregan al final, así nadie tiene que acordarse de
  // sumarlas a mano para que salgan en la TV.
  private async loadEffective() {
    const [stored, offers] = await Promise.all([
      prisma.tvSlide.findMany({ orderBy: { sortOrder: 'asc' } }),
      storeService.getActiveOffers(),
    ]);

    let base: EffectiveSlide[];
    if (stored.length === 0) {
      base = [
        ...offers.map(virtualOffer),
        virtualProducts(0, 'Los más vendidos'),
        virtualProducts(1, 'Más para tu despensa'),
        {
          id: null, virtual: true, type: 'APP', offerId: null, title: null, subtitle: null, imageUrl: null,
          productIds: [], autoPage: 0, seconds: 12, isActive: true, startsAt: null, endsAt: null,
        },
      ];
    } else {
      base = stored.map((s) => ({
        id: s.id, virtual: false, type: s.type as TvSlideType, offerId: s.offerId, title: s.title,
        subtitle: s.subtitle, imageUrl: s.imageUrl, productIds: s.productIds, autoPage: s.autoPage,
        seconds: s.seconds, isActive: s.isActive, startsAt: s.startsAt, endsAt: s.endsAt,
      }));
      const referenced = new Set(base.filter((s) => s.type === 'OFFER').map((s) => s.offerId));
      offers.filter((o) => !referenced.has(o.id)).forEach((o) => base.push(virtualOffer(o)));
    }
    return { base, offers };
  }

  private async productsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await prisma.product.findMany({
      where: { id: { in: ids }, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true, salePrice: true, imageUrl: true },
    });
    const byId = new Map(rows.map((p) => [p.id, { ...p, salePrice: Number(p.salePrice) }]));
    return ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  }

  // Convierte las slides efectivas en lo que lee la TV. `ignoreFilters` (para
  // lo que el admin manda "en vivo") muestra la slide aunque esté apagada o
  // fuera de horario: si la eligió a mano para mostrarla ahora, se muestra.
  private async buildPublicSlides(base: EffectiveSlide[], offers: ActiveOffer[], opts: { ignoreFilters?: boolean } = {}) {
    const now = new Date();
    const offerById = new Map(offers.map((o) => [o.id, o]));

    let featured: Awaited<ReturnType<typeof storeService.getFeaturedProducts>> | null = null;
    const slides = [];

    for (const s of base) {
      if (!opts.ignoreFilters) {
        if (!s.isActive) continue;
        if (s.startsAt && s.startsAt > now) continue;
        if (s.endsAt && s.endsAt < now) continue;
      }

      const common = {
        id: s.id, key: slideKey(s), type: s.type, seconds: s.seconds,
        title: s.title, subtitle: s.subtitle, imageUrl: s.imageUrl,
      };

      if (s.type === 'OFFER') {
        const offer = s.offerId ? offerById.get(s.offerId) : undefined;
        if (!offer) continue; // la promo ya no está vigente
        slides.push({ ...common, offer });
      } else if (s.type === 'PRODUCTS') {
        let products;
        if (s.productIds.length > 0) {
          products = await this.productsByIds(s.productIds);
        } else {
          // Solo con foto: en una TV un recuadro vacío se ve como un error.
          featured = featured ?? await storeService.getFeaturedProducts(20);
          products = featured
            .filter((p) => !!p.imageUrl)
            .slice(s.autoPage * GRID_SIZE, (s.autoPage + 1) * GRID_SIZE);
          if (!opts.ignoreFilters && products.length < MIN_AUTO_PRODUCTS) continue;
        }
        if (products.length === 0) continue;
        slides.push({ ...common, products });
      } else {
        slides.push(common);
      }
    }
    return slides;
  }

  /* ── Pública: lo que lee la TV ────────────────────────────────────────── */
  async getPublicConfig() {
    const { base, offers } = await this.loadEffective();
    const slides = await this.buildPublicSlides(base, offers);
    return { slides, generatedAt: new Date().toISOString() };
  }

  /* ── Admin: lista editable ────────────────────────────────────────────── */
  async getAdminSlides() {
    const { base, offers } = await this.loadEffective();
    const offerById = new Map(offers.map((o) => [o.id, o]));

    // Promos guardadas que ya no están vigentes: se muestran igual (apagadas
    // de hecho) para que el admin entienda por qué no salen en la TV.
    const missing = base.filter((s) => s.type === 'OFFER' && s.offerId && !offerById.has(s.offerId)).map((s) => s.offerId as string);
    const inactive = missing.length > 0
      ? await prisma.promotion.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } })
      : [];
    const inactiveName = new Map(inactive.map((p) => [p.id, p.name]));

    // Cuántos productos con foto le quedan a cada grilla automática: si son
    // menos de MIN_AUTO_PRODUCTS la TV la omite, y el admin tiene que poder
    // verlo en la lista en vez de preguntarse por qué no sale.
    const needsAuto = base.some((s) => s.type === 'PRODUCTS' && s.productIds.length === 0);
    const withPhoto = needsAuto
      ? (await storeService.getFeaturedProducts(20)).filter((p) => !!p.imageUrl)
      : [];

    const slides = await Promise.all(base.map(async (s) => ({
      ...s,
      key: slideKey(s),
      autoCount: s.type === 'PRODUCTS' && s.productIds.length === 0
        ? withPhoto.slice(s.autoPage * GRID_SIZE, (s.autoPage + 1) * GRID_SIZE).length
        : null,
      offerName: s.offerId ? (offerById.get(s.offerId)?.name ?? inactiveName.get(s.offerId) ?? 'Promoción eliminada') : null,
      offerActive: s.offerId ? offerById.has(s.offerId) : null,
      offerImage: s.offerId ? (offerById.get(s.offerId)?.storeImage || offerById.get(s.offerId)?.products[0]?.product.imageUrl || null) : null,
      products: s.type === 'PRODUCTS' ? await this.productsByIds(s.productIds) : [],
    })));
    return { slides };
  }

  async saveSlides(slides: TvSlideInput[]) {
    // Ids que llegan del cliente: solo se respetan si no se repiten (una
    // slide duplicada en el borrador recibiría un id nuevo).
    const seen = new Set<string>();
    const idFor = (s: TvSlideInput) => {
      if (!s.id || seen.has(s.id)) return undefined;
      seen.add(s.id);
      return s.id;
    };
    await prisma.$transaction([
      prisma.tvSlide.deleteMany({}),
      prisma.tvSlide.createMany({
        data: slides.map((s, i) => ({
          id: idFor(s),
          type: s.type,
          offerId: s.type === 'OFFER' ? s.offerId ?? null : null,
          title: s.title || null,
          subtitle: s.subtitle || null,
          imageUrl: s.imageUrl || null,
          productIds: s.type === 'PRODUCTS' ? s.productIds : [],
          autoPage: s.autoPage,
          seconds: s.seconds,
          sortOrder: i,
          isActive: s.isActive,
          startsAt: s.startsAt ?? null,
          endsAt: s.endsAt ?? null,
        })),
      }),
    ]);
    await this.dropStaleLive();
    return this.getAdminSlides();
  }

  async resetToAutomatic() {
    await prisma.tvSlide.deleteMany({});
    await this.dropStaleLive();
    return this.getAdminSlides();
  }

  // Al guardar o restaurar la lista, las slides "fijas en vivo" pueden haber
  // cambiado de identificador (una oferta automática pasa a guardada): se
  // suelta esa transmisión para no dejar la TV apuntando a algo que ya no existe.
  // La venta en curso del POS (modo CART) no se toca.
  private async dropStaleLive() {
    const s = await this.readLive();
    if (s && s.mode === 'ONLY' && s.keys.length > 0) await this.clearLive();
  }

  /* ── Transmisión en vivo ──────────────────────────────────────────────── */
  private async readLive(): Promise<LiveState | null> {
    try {
      const raw = await redis.get(LIVE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw) as LiveState;
      if (state.expiresAt && Date.now() > state.expiresAt) {
        await redis.del(LIVE_KEY).catch(() => {});
        return null;
      }
      return state;
    } catch {
      return null; // sin Redis la TV simplemente sigue en automático
    }
  }

  private async writeLive(state: Omit<LiveState, 'version'>) {
    const full: LiveState = { ...state, version: Date.now() };
    const ttl = state.expiresAt ? Math.max(5, Math.ceil((state.expiresAt - Date.now()) / 1000)) : 12 * 60 * 60;
    await redis.set(LIVE_KEY, JSON.stringify(full), 'EX', ttl);
    return full;
  }

  // Mostrar solo estas slides (una = fija en pantalla) o una imagen subida al
  // vuelo. `minutes` = cuánto dura; null = hasta que se vuelva al automático.
  async setLiveOnly(input: { keys?: string[]; imageUrl?: string; seconds?: number; minutes: number | null }, userId: string) {
    return this.writeLive({
      mode: 'ONLY',
      keys: input.keys ?? [],
      image: input.imageUrl ? { url: input.imageUrl, seconds: input.seconds ?? 15 } : null,
      cart: null, thanksUntil: null,
      expiresAt: input.minutes ? Date.now() + input.minutes * 60 * 1000 : null,
      updatedBy: userId,
    });
  }

  // Venta en curso del POS: el carrito en vivo (con promos elegidas al lado).
  async setLiveCart(
    input: { items: TvLiveCartItem[]; total: number; customerName?: string | null; promoKeys?: string[] },
    userId: string,
  ) {
    return this.writeLive({
      mode: 'CART',
      keys: input.promoKeys ?? [],
      image: null,
      cart: input.items.length > 0
        ? { items: input.items, total: input.total, customerName: input.customerName ?? null }
        : null,
      thanksUntil: null,
      expiresAt: Date.now() + CART_TTL_MS,
      updatedBy: userId,
    });
  }

  // Venta cobrada: agradecimiento unos segundos y de vuelta a la rotación.
  async setLiveThanks(promoKeys: string[], userId: string) {
    return this.writeLive({
      mode: 'CART', keys: promoKeys, image: null, cart: null,
      thanksUntil: Date.now() + THANKS_MS,
      expiresAt: Date.now() + CART_TTL_MS,
      updatedBy: userId,
    });
  }

  async clearLive() {
    await redis.del(LIVE_KEY).catch(() => {});
  }

  async getLiveAdmin() {
    const s = await this.readLive();
    if (!s) return { mode: 'AUTO' as const, keys: [] as string[], hasImage: false, expiresAt: null as number | null, cartItems: 0, version: 0 };
    return {
      mode: s.mode, keys: s.keys, hasImage: !!s.image, expiresAt: s.expiresAt,
      cartItems: s.cart?.items.length ?? 0, version: s.version,
    };
  }

  // Lo que la TV consulta cada pocos segundos. Solo trabaja de más (leer la
  // base) cuando hay una transmisión activa con slides por resolver, y aun así
  // se cachea por versión para no repetirlo en cada consulta.
  private liveCache: { version: number; slides: unknown[] } | null = null;

  async getLivePublic() {
    const now = Date.now();
    const s = await this.readLive();
    if (!s) return { mode: 'AUTO' as const, version: 0, now, slides: [] as unknown[], cart: null, thanksUntil: null };

    let slides: unknown[];
    if (this.liveCache && this.liveCache.version === s.version) {
      slides = this.liveCache.slides;
    } else {
      slides = [];
      if (s.keys.length > 0) {
        const { base, offers } = await this.loadEffective();
        const byKey = new Map(base.map((b) => [slideKey(b), b]));
        const chosen = s.keys.map((k) => byKey.get(k)).filter((b): b is EffectiveSlide => !!b);
        slides = await this.buildPublicSlides(chosen, offers, { ignoreFilters: true });
      }
      if (s.image) {
        slides = [...slides, {
          id: null, key: 'live-image', type: 'CUSTOM', seconds: s.image.seconds,
          title: null, subtitle: null, imageUrl: s.image.url,
        }];
      }
      this.liveCache = { version: s.version, slides };
    }

    return {
      mode: s.mode, version: s.version, now, slides,
      cart: s.cart, thanksUntil: s.thanksUntil,
    };
  }

  // Opciones para elegir qué mostrar (ERP y POS): todas las slides, activas o no.
  async getLiveOptions() {
    const { slides } = await this.getAdminSlides();
    return slides.map((s) => ({
      key: s.key,
      type: s.type,
      label: s.type === 'OFFER' ? (s.offerName ?? 'Promoción')
        : s.type === 'PRODUCTS' ? (s.title || 'Productos')
        : s.type === 'APP' ? (s.title || 'Pide desde tu celular (QR)')
        : (s.title || (s.imageUrl ? 'Imagen' : 'Aviso')),
      thumb: s.type === 'OFFER' ? s.offerImage : s.type === 'CUSTOM' ? s.imageUrl : s.type === 'PRODUCTS' ? (s.products[0]?.imageUrl ?? null) : null,
      isActive: s.isActive,
    }));
  }
}

export const tvService = new TvService();
