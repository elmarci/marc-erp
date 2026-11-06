import { prisma } from '../../database/client';
import { logger } from '../../config/logger';
import { getSettingValues } from '../../utils/settings';
import { buildBaskets, type BasketProduct, type BasketResult } from './basket-engine';
import { parseBasketRequest, type ParsedBasketRequest } from './basket-parser';
import { basketTemplatesSchema, DEFAULT_BASKET_TEMPLATES, type BasketTemplate } from './basket-templates';

const TEMPLATES_SETTING = 'store_basket_templates';
const CATALOG_TTL_MS = 60_000;
const POPULARITY_TTL_MS = 10 * 60_000;
const POPULARITY_DAYS = 60;

// Lo que necesita la tienda para meter el producto al carrito (mismo
// formato que GET /store/products).
const storeProductSelect = {
  id: true, name: true, barcode: true, salePrice: true, currentStock: true, imageUrl: true,
  description: true, isBulk: true, bulkUnit: true,
  category: { select: { id: true, name: true } },
} as const;

type StoreProductRow = {
  id: string; name: string; barcode: string | null; salePrice: unknown; currentStock: unknown;
  imageUrl: string | null; description: string | null; isBulk: boolean; bulkUnit: string | null;
  category: { id: string; name: string };
};

export interface BasketSuggestInput {
  text?: string;
  budget?: number;
  people?: number;
  occasion?: string;
}

export interface BasketSuggestResponse {
  understood: ParsedBasketRequest;
  missing: Array<'budget' | 'people' | 'occasion'>;
  occasions: Array<{ key: string; name: string; emoji?: string }>;
  result: (Omit<BasketResult, 'proposals'> & { proposals: unknown[] }) | null;
}

class BasketService {
  private catalog: { at: number; products: BasketProduct[]; rows: Map<string, StoreProductRow> } | null = null;
  private popularity: { at: number; byId: Map<string, number> } | null = null;

  async getTemplates(): Promise<BasketTemplate[]> {
    const values = await getSettingValues([TEMPLATES_SETTING]);
    const raw = values[TEMPLATES_SETTING];
    if (!raw) return DEFAULT_BASKET_TEMPLATES;
    try {
      return basketTemplatesSchema.parse(JSON.parse(raw));
    } catch (err) {
      logger.warn(`Configuración ${TEMPLATES_SETTING} inválida, se usan las plantillas por defecto: ${(err as Error).message}`);
      return DEFAULT_BASKET_TEMPLATES;
    }
  }

  private async getPopularity(): Promise<Map<string, number>> {
    if (this.popularity && Date.now() - this.popularity.at < POPULARITY_TTL_MS) return this.popularity.byId;
    const since = new Date(Date.now() - POPULARITY_DAYS * 24 * 3600_000);
    const rows = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { createdAt: { gte: since }, status: 'COMPLETED' } },
      _sum: { quantity: true },
    });
    const byId = new Map(rows.map(r => [r.productId, Number(r._sum.quantity ?? 0)]));
    this.popularity = { at: Date.now(), byId };
    return byId;
  }

  private async getCatalog() {
    if (this.catalog && Date.now() - this.catalog.at < CATALOG_TTL_MS) return this.catalog;
    const [rows, popularity] = await Promise.all([
      prisma.product.findMany({
        // Mismo filtro que el catálogo público de la tienda.
        where: { deletedAt: null, status: 'ACTIVE', currentStock: { gt: 0 }, isMiscItem: false },
        select: { ...storeProductSelect, costPrice: true, reservedStock: true },
      }),
      this.getPopularity(),
    ]);
    const products: BasketProduct[] = rows.map(r => ({
      id: r.id,
      name: r.name,
      salePrice: Number(r.salePrice),
      costPrice: Number(r.costPrice),
      available: Number(r.currentStock) - Number(r.reservedStock),
      isBulk: r.isBulk,
      bulkUnit: r.bulkUnit,
      popularity: popularity.get(r.id) ?? 0,
    }));
    const map = new Map<string, StoreProductRow>(rows.map(({ costPrice: _c, reservedStock: _r, ...row }) => [row.id, row]));
    this.catalog = { at: Date.now(), products, rows: map };
    return this.catalog;
  }

  async suggest(input: BasketSuggestInput): Promise<BasketSuggestResponse> {
    const templates = await this.getTemplates();
    const parsed = input.text ? parseBasketRequest(input.text, templates) : { budget: null, people: null, occasion: null };
    // Lo elegido con botones manda sobre lo que se entendió del texto.
    const understood: ParsedBasketRequest = {
      budget: input.budget ?? parsed.budget,
      people: input.people ?? parsed.people,
      occasion: input.occasion && templates.some(t => t.key === input.occasion) ? input.occasion : parsed.occasion,
    };
    const missing = (['budget', 'people', 'occasion'] as const).filter(k => understood[k] == null);
    const occasions = templates.map(t => ({ key: t.key, name: t.name, emoji: t.emoji }));

    if (missing.length) return { understood, missing: [...missing], occasions, result: null };

    const template = templates.find(t => t.key === understood.occasion)!;
    const catalog = await this.getCatalog();
    const result = buildBaskets(template, catalog.products, understood.budget!, understood.people!);

    // Devolver los productos en el formato del catálogo de la tienda.
    const toStore = (c: { product: BasketProduct; quantity: number; subtotal: number }) => ({
      product: catalog.rows.get(c.product.id),
      quantity: c.quantity,
      subtotal: c.subtotal,
    });
    return {
      understood, missing: [], occasions,
      result: {
        ...result,
        proposals: result.proposals.map(p => ({
          ...p,
          items: p.items.map(i => ({
            ...toStore(i),
            slotKey: i.slotKey,
            slotLabel: i.slotLabel,
            alternatives: i.alternatives.map(toStore),
          })),
        })),
      },
    };
  }
}

export const basketService = new BasketService();
