import { prisma } from '../../database/client';
import { storeService } from '../store/store.service';

export type TvSlideType = 'OFFER' | 'PRODUCTS' | 'APP' | 'CUSTOM';

export interface TvSlideInput {
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

  /* ── Pública: lo que lee la TV ────────────────────────────────────────── */
  async getPublicConfig() {
    const { base, offers } = await this.loadEffective();
    const now = new Date();
    const offerById = new Map(offers.map((o) => [o.id, o]));

    let featured: Awaited<ReturnType<typeof storeService.getFeaturedProducts>> | null = null;
    const slides = [];

    for (const s of base) {
      if (!s.isActive) continue;
      if (s.startsAt && s.startsAt > now) continue;
      if (s.endsAt && s.endsAt < now) continue;

      const common = { id: s.id, type: s.type, seconds: s.seconds, title: s.title, subtitle: s.subtitle, imageUrl: s.imageUrl };

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
          if (products.length < MIN_AUTO_PRODUCTS) continue;
        }
        if (products.length === 0) continue;
        slides.push({ ...common, products });
      } else {
        slides.push(common);
      }
    }
    return { slides, generatedAt: now.toISOString() };
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
    await prisma.$transaction([
      prisma.tvSlide.deleteMany({}),
      prisma.tvSlide.createMany({
        data: slides.map((s, i) => ({
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
    return this.getAdminSlides();
  }

  async resetToAutomatic() {
    await prisma.tvSlide.deleteMany({});
    return this.getAdminSlides();
  }
}

export const tvService = new TvService();
