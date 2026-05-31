import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seeds...');

  // ─── Tax Rates ─────────────────────────────────────────────────────────────
  const igv = await prisma.taxRate.upsert({
    where: { code: 'IGV' },
    update: {},
    create: { name: 'IGV 18%', code: 'IGV', rate: 0.18, isDefault: true },
  });

  await prisma.taxRate.upsert({
    where: { code: 'EXONERADO' },
    update: {},
    create: { name: 'Exonerado', code: 'EXONERADO', rate: 0.00 },
  });

  // ─── Document Series ────────────────────────────────────────────────────────
  await prisma.documentSeries.upsert({
    where: { type_series: { type: 'BOLETA', series: 'B001' } },
    update: {},
    create: { type: 'BOLETA', series: 'B001', prefix: 'B001-' },
  });

  await prisma.documentSeries.upsert({
    where: { type_series: { type: 'FACTURA', series: 'F001' } },
    update: {},
    create: { type: 'FACTURA', series: 'F001', prefix: 'F001-' },
  });

  // ─── Settings ──────────────────────────────────────────────────────────────
  const settings = [
    { key: 'business_name', value: 'Minimarket El Progreso', type: 'string', group: 'business', label: 'Nombre del Negocio' },
    { key: 'business_ruc', value: '10123456789', type: 'string', group: 'business', label: 'RUC' },
    { key: 'business_address', value: 'Jr. Los Pinos 123, San Juan de Lurigancho, Lima', type: 'string', group: 'business', label: 'Dirección' },
    { key: 'business_phone', value: '01-234-5678', type: 'string', group: 'business', label: 'Teléfono' },
    { key: 'business_email', value: 'contacto@elprogreso.pe', type: 'string', group: 'business', label: 'Correo' },
    { key: 'currency_symbol', value: 'S/', type: 'string', group: 'general', label: 'Símbolo de Moneda' },
    { key: 'currency_code', value: 'PEN', type: 'string', group: 'general', label: 'Código de Moneda' },
    { key: 'tax_rate_default', value: '0.18', type: 'number', group: 'taxes', label: 'IGV por defecto' },
    { key: 'session_timeout_minutes', value: '60', type: 'number', group: 'security', label: 'Tiempo de sesión (minutos)' },
    { key: 'receipt_footer', value: '¡Gracias por su compra! Vuelva pronto.', type: 'string', group: 'receipts', label: 'Pie de ticket' },
    { key: 'low_stock_notify', value: 'true', type: 'boolean', group: 'inventory', label: 'Notificar stock bajo' },
    { key: 'printer_width', value: '80', type: 'number', group: 'printer', label: 'Ancho de papel (mm)' },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // ─── Categorías ────────────────────────────────────────────────────────────
  const categorias = [
    { name: 'Bebidas', slug: 'bebidas', description: 'Bebidas y refrescos' },
    { name: 'Snacks', slug: 'snacks', description: 'Snacks y golosinas' },
    { name: 'Lácteos', slug: 'lacteos', description: 'Leche, yogurt y derivados' },
    { name: 'Limpieza', slug: 'limpieza', description: 'Productos de limpieza del hogar' },
    { name: 'Abarrotes', slug: 'abarrotes', description: 'Productos de primera necesidad' },
    { name: 'Panadería', slug: 'panaderia', description: 'Pan y bollería' },
    { name: 'Carnes y Embutidos', slug: 'carnes', description: 'Carnes frías y embutidos' },
    { name: 'Frutas y Verduras', slug: 'frutas-verduras', description: 'Frutas y verduras frescas' },
  ];

  const catMap: Record<string, string> = {};
  for (const cat of categorias) {
    const c = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
    catMap[cat.slug] = c.id;
  }

  // Subcategorías
  const subcats = [
    { name: 'Gaseosas', slug: 'gaseosas', parentId: catMap['bebidas'] },
    { name: 'Agua', slug: 'agua', parentId: catMap['bebidas'] },
    { name: 'Jugos', slug: 'jugos', parentId: catMap['bebidas'] },
    { name: 'Energizantes', slug: 'energizantes', parentId: catMap['bebidas'] },
    { name: 'Papas fritas', slug: 'papas-fritas', parentId: catMap['snacks'] },
    { name: 'Galletas', slug: 'galletas', parentId: catMap['snacks'] },
    { name: 'Chocolates', slug: 'chocolates', parentId: catMap['snacks'] },
  ];

  for (const sub of subcats) {
    await prisma.category.upsert({
      where: { slug: sub.slug },
      update: {},
      create: sub,
    });
  }

  // ─── Marcas ────────────────────────────────────────────────────────────────
  const marcas = ['Inca Kola', 'Coca-Cola', 'Gloria', 'Laive', 'Alicorp', 'Nestlé', 'Unilever', 'P&G', 'Kimberly-Clark', 'Frito Lay'];
  const brandMap: Record<string, string> = {};
  for (const b of marcas) {
    const brand = await prisma.brand.upsert({
      where: { name: b },
      update: {},
      create: { name: b },
    });
    brandMap[b] = brand.id;
  }

  // ─── Proveedores ───────────────────────────────────────────────────────────
  const proveedores = [
    {
      businessName: 'Distribuidora Peruana SAC',
      taxId: '20123456789',
      contactName: 'Juan Ríos',
      email: 'ventas@distperu.com',
      phone: '999-111-222',
      address: 'Av. Los Olivos 456, Lima',
      paymentTermDays: 30,
    },
    {
      businessName: 'Alimentos del Sur EIRL',
      taxId: '20234567890',
      contactName: 'María García',
      email: 'pedidos@alsur.com',
      phone: '999-333-444',
      address: 'Jr. Comercio 789, Lima',
      paymentTermDays: 15,
    },
    {
      businessName: 'Mayorista Central Lima',
      taxId: '20345678901',
      contactName: 'Carlos Mendoza',
      email: 'compras@mayoristacl.com',
      phone: '999-555-666',
      address: 'Mercado Mayorista, La Victoria, Lima',
      paymentTermDays: 7,
    },
  ];

  const supplierMap: Record<string, string> = {};
  for (const prov of proveedores) {
    const s = await prisma.supplier.upsert({
      where: { taxId: prov.taxId },
      update: {},
      create: prov,
    });
    supplierMap[prov.businessName] = s.id;
  }

  // ─── Productos (100 productos realistas) ──────────────────────────────────
  const productos = [
    // Bebidas - Gaseosas
    { name: 'Inca Kola 1.5L', barcode: '7750381001450', categorySlug: 'gaseosas', brand: 'Inca Kola', cost: 3.50, sale: 5.90, stock: 48, min: 12 },
    { name: 'Coca-Cola 1.5L', barcode: '7751610001230', categorySlug: 'gaseosas', brand: 'Coca-Cola', cost: 3.50, sale: 5.90, stock: 36, min: 12 },
    { name: 'Inca Kola 500ml', barcode: '7750381000500', categorySlug: 'gaseosas', brand: 'Inca Kola', cost: 1.80, sale: 3.00, stock: 72, min: 24 },
    { name: 'Coca-Cola 500ml', barcode: '7751610000500', categorySlug: 'gaseosas', brand: 'Coca-Cola', cost: 1.80, sale: 3.00, stock: 60, min: 24 },
    { name: 'Sprite 500ml', barcode: '7751610001500', categorySlug: 'gaseosas', brand: 'Coca-Cola', cost: 1.70, sale: 2.80, stock: 48, min: 12 },
    { name: 'Fanta Naranja 500ml', barcode: '7751610002000', categorySlug: 'gaseosas', brand: 'Coca-Cola', cost: 1.70, sale: 2.80, stock: 48, min: 12 },
    { name: 'Pepsi 1L', barcode: '7750381005000', categorySlug: 'gaseosas', cost: 2.80, sale: 4.50, stock: 30, min: 10 },
    { name: 'Kola Real 3L', barcode: '7751234003000', categorySlug: 'gaseosas', cost: 3.20, sale: 5.50, stock: 24, min: 8 },
    // Agua
    { name: 'San Mateo 625ml', barcode: '7752031000625', categorySlug: 'agua', cost: 0.90, sale: 1.50, stock: 120, min: 24 },
    { name: 'San Mateo 1.5L', barcode: '7752031001500', categorySlug: 'agua', cost: 1.80, sale: 3.00, stock: 60, min: 12 },
    { name: 'Cielo 625ml', barcode: '7753456000625', categorySlug: 'agua', cost: 0.85, sale: 1.30, stock: 96, min: 24 },
    { name: 'Cielo 1.5L', barcode: '7753456001500', categorySlug: 'agua', cost: 1.70, sale: 2.80, stock: 48, min: 12 },
    // Jugos
    { name: 'Pulp Naranja 1L', barcode: '7754567001000', categorySlug: 'jugos', brand: 'Alicorp', cost: 3.20, sale: 5.20, stock: 24, min: 6 },
    { name: 'Cifrut Naranja 500ml', barcode: '7755678000500', categorySlug: 'jugos', cost: 1.50, sale: 2.50, stock: 36, min: 12 },
    { name: 'Tampico 1L', barcode: '7756789001000', categorySlug: 'jugos', cost: 2.50, sale: 4.00, stock: 30, min: 8 },
    // Energizantes
    { name: 'Red Bull 250ml', barcode: '9002490100070', categorySlug: 'energizantes', cost: 4.50, sale: 7.50, stock: 24, min: 6 },
    { name: 'Monster Energy 473ml', barcode: '7049283001234', categorySlug: 'energizantes', cost: 5.50, sale: 9.00, stock: 18, min: 6 },
    // Snacks
    { name: 'Lay\'s Natural 42g', barcode: '7750103000420', categorySlug: 'papas-fritas', brand: 'Frito Lay', cost: 1.20, sale: 2.00, stock: 60, min: 12 },
    { name: 'Cheetos 43g', barcode: '7750103000430', categorySlug: 'papas-fritas', brand: 'Frito Lay', cost: 1.20, sale: 2.00, stock: 48, min: 12 },
    { name: 'Pringles Original 107g', barcode: '0038000845024', categorySlug: 'papas-fritas', cost: 6.50, sale: 10.90, stock: 24, min: 6 },
    { name: 'Oreo 36g', barcode: '7622210998125', categorySlug: 'galletas', brand: 'Nestlé', cost: 1.00, sale: 1.80, stock: 72, min: 18 },
    { name: 'Chokis 36g', barcode: '7750381002360', categorySlug: 'galletas', brand: 'Alicorp', cost: 0.80, sale: 1.50, stock: 60, min: 18 },
    { name: 'Club Social Original', barcode: '7622210997000', categorySlug: 'galletas', cost: 1.50, sale: 2.50, stock: 48, min: 12 },
    { name: 'Sublime 35g', barcode: '7750381003500', categorySlug: 'chocolates', brand: 'Alicorp', cost: 1.30, sale: 2.20, stock: 48, min: 12 },
    { name: 'Kit Kat 42g', barcode: '7613031850686', categorySlug: 'chocolates', brand: 'Nestlé', cost: 1.80, sale: 3.50, stock: 36, min: 12 },
    { name: 'Snickers 52g', barcode: '0040000001621', categorySlug: 'chocolates', cost: 2.20, sale: 3.90, stock: 30, min: 10 },
    // Lácteos
    { name: 'Leche Gloria Entera 1L', barcode: '7750310010006', categorySlug: 'lacteos', brand: 'Gloria', cost: 3.50, sale: 5.50, stock: 48, min: 12 },
    { name: 'Leche Gloria UHT 1L', barcode: '7750310010014', categorySlug: 'lacteos', brand: 'Gloria', cost: 3.20, sale: 5.20, stock: 60, min: 18 },
    { name: 'Leche Laive Entera 1L', barcode: '7750380001000', categorySlug: 'lacteos', brand: 'Laive', cost: 3.40, sale: 5.40, stock: 36, min: 12 },
    { name: 'Yogurt Gloria Fresa 1L', barcode: '7750310020005', categorySlug: 'lacteos', brand: 'Gloria', cost: 4.50, sale: 7.00, stock: 24, min: 8 },
    { name: 'Yogurt Laive Natural 500ml', barcode: '7750380500001', categorySlug: 'lacteos', brand: 'Laive', cost: 3.80, sale: 6.00, stock: 18, min: 6 },
    { name: 'Mantequilla Gloria 100g', barcode: '7750310030001', categorySlug: 'lacteos', brand: 'Gloria', cost: 2.50, sale: 4.20, stock: 24, min: 8 },
    { name: 'Queso Edam Laive 200g', barcode: '7750380200001', categorySlug: 'lacteos', brand: 'Laive', cost: 6.50, sale: 10.50, stock: 12, min: 4 },
    // Abarrotes
    { name: 'Arroz Costeño 1kg', barcode: '7754321001000', categorySlug: 'abarrotes', cost: 3.20, sale: 4.90, stock: 100, min: 20 },
    { name: 'Arroz Costeño 5kg', barcode: '7754321005000', categorySlug: 'abarrotes', cost: 15.00, sale: 22.90, stock: 30, min: 10 },
    { name: 'Azúcar Rubia 1kg', barcode: '7752341001000', categorySlug: 'abarrotes', cost: 2.80, sale: 4.50, stock: 80, min: 20 },
    { name: 'Fideos Lavaggi 500g', barcode: '7750381500001', categorySlug: 'abarrotes', brand: 'Alicorp', cost: 1.80, sale: 3.00, stock: 60, min: 15 },
    { name: 'Aceite Primor 1L', barcode: '7750381100001', categorySlug: 'abarrotes', brand: 'Alicorp', cost: 6.50, sale: 10.50, stock: 36, min: 10 },
    { name: 'Aceite Vegetal 900ml', barcode: '7750382900001', categorySlug: 'abarrotes', cost: 5.80, sale: 9.50, stock: 30, min: 8 },
    { name: 'Sal Marina 1kg', barcode: '7753210001000', categorySlug: 'abarrotes', cost: 0.80, sale: 1.50, stock: 50, min: 10 },
    { name: 'Atún Florida en Agua 170g', barcode: '7754321170001', categorySlug: 'abarrotes', cost: 3.20, sale: 5.20, stock: 48, min: 12 },
    { name: 'Conserva Durazno 820g', barcode: '7754321820001', categorySlug: 'abarrotes', cost: 5.50, sale: 8.90, stock: 24, min: 6 },
    { name: 'Tomate en Lata 400g', barcode: '7754321400001', categorySlug: 'abarrotes', cost: 2.50, sale: 4.00, stock: 36, min: 8 },
    { name: 'Mayonesa Alacena 500g', barcode: '7750381050001', categorySlug: 'abarrotes', brand: 'Alicorp', cost: 4.80, sale: 7.90, stock: 30, min: 8 },
    { name: 'Ketchup Heinz 397g', barcode: '0057000000070', categorySlug: 'abarrotes', cost: 5.50, sale: 9.00, stock: 24, min: 6 },
    { name: 'Ají Amarillo Molido 85g', barcode: '7754321085001', categorySlug: 'abarrotes', cost: 2.00, sale: 3.50, stock: 30, min: 8 },
    { name: 'Café Altomayo 200g', barcode: '7753456200001', categorySlug: 'abarrotes', cost: 9.50, sale: 15.90, stock: 18, min: 6 },
    { name: 'Leche Condensada Nestlé 395g', barcode: '7613031850001', categorySlug: 'abarrotes', brand: 'Nestlé', cost: 3.80, sale: 6.20, stock: 24, min: 6 },
    { name: 'Harina Blanca Flor 1kg', barcode: '7750381100002', categorySlug: 'abarrotes', brand: 'Alicorp', cost: 2.50, sale: 4.20, stock: 40, min: 10 },
    // Limpieza
    { name: 'Jabón Bolivar 230g', barcode: '7750381023001', categorySlug: 'limpieza', brand: 'Alicorp', cost: 2.20, sale: 3.80, stock: 48, min: 12 },
    { name: 'Detergente Ariel 1kg', barcode: '0037000152521', categorySlug: 'limpieza', brand: 'P&G', cost: 8.50, sale: 13.90, stock: 30, min: 8 },
    { name: 'Detergente Ace 500g', barcode: '0037000152515', categorySlug: 'limpieza', brand: 'P&G', cost: 4.50, sale: 7.50, stock: 36, min: 10 },
    { name: 'Lejía Clorox 900ml', barcode: '0044600010031', categorySlug: 'limpieza', cost: 4.20, sale: 7.00, stock: 36, min: 10 },
    { name: 'Limpiatodo Ajax 1L', barcode: '8712561011069', categorySlug: 'limpieza', cost: 5.50, sale: 9.00, stock: 24, min: 8 },
    { name: 'Papel Higiénico Elite 4u', barcode: '7756789004001', categorySlug: 'limpieza', brand: 'Kimberly-Clark', cost: 5.80, sale: 9.50, stock: 36, min: 12 },
    { name: 'Papel Higiénico Suave 12u', barcode: '7756789012001', categorySlug: 'limpieza', brand: 'Kimberly-Clark', cost: 12.50, sale: 19.90, stock: 24, min: 8 },
    { name: 'Pañuelos Elite 60u', barcode: '7756789060001', categorySlug: 'limpieza', brand: 'Kimberly-Clark', cost: 2.80, sale: 4.80, stock: 30, min: 10 },
    { name: 'Shampoo Head & Shoulders 400ml', barcode: '0037000012345', categorySlug: 'limpieza', brand: 'P&G', cost: 12.00, sale: 19.90, stock: 18, min: 6 },
    { name: 'Jabón Lux 125g', barcode: '8712561054003', categorySlug: 'limpieza', brand: 'Unilever', cost: 1.50, sale: 2.50, stock: 48, min: 12 },
    { name: 'Desodorante Rexona 150ml', barcode: '8712561012066', categorySlug: 'limpieza', brand: 'Unilever', cost: 8.00, sale: 13.50, stock: 24, min: 8 },
    { name: 'Pasta Dental Colgate 100ml', barcode: '0035000048502', categorySlug: 'limpieza', cost: 4.50, sale: 7.50, stock: 30, min: 10 },
    // Panadería
    { name: 'Pan Molde Bimbo Blanco 500g', barcode: '7756789500001', categorySlug: 'panaderia', cost: 4.50, sale: 7.50, stock: 15, min: 5, trackExpiry: true },
    { name: 'Pan Molde Integral 450g', barcode: '7756789450001', categorySlug: 'panaderia', cost: 5.00, sale: 8.50, stock: 10, min: 4, trackExpiry: true },
    // Carnes y Embutidos
    { name: 'Jamonada San Fernando 250g', barcode: '7754567250001', categorySlug: 'carnes', cost: 5.50, sale: 9.00, stock: 15, min: 5, trackExpiry: true },
    { name: 'Hot Dog Otto Kunz 250g', barcode: '7754567250002', categorySlug: 'carnes', cost: 4.80, sale: 8.00, stock: 18, min: 6, trackExpiry: true },
    { name: 'Pollo a la Brasa - Cuarto', barcode: '0000000001001', categorySlug: 'carnes', cost: 12.00, sale: 18.00, stock: 10, min: 2 },
    // Frutas y Verduras
    { name: 'Manzana 1kg', barcode: '0000000002001', categorySlug: 'frutas-verduras', cost: 3.00, sale: 5.00, stock: 30, min: 10, trackExpiry: true },
    { name: 'Plátano 1kg', barcode: '0000000002002', categorySlug: 'frutas-verduras', cost: 1.50, sale: 2.50, stock: 40, min: 10, trackExpiry: true },
    { name: 'Tomate 1kg', barcode: '0000000002003', categorySlug: 'frutas-verduras', cost: 2.00, sale: 3.50, stock: 25, min: 8, trackExpiry: true },
    { name: 'Cebolla 1kg', barcode: '0000000002004', categorySlug: 'frutas-verduras', cost: 1.80, sale: 3.00, stock: 30, min: 8 },
    { name: 'Papa Blanca 1kg', barcode: '0000000002005', categorySlug: 'frutas-verduras', cost: 1.50, sale: 2.50, stock: 50, min: 15 },
    { name: 'Limón 1kg', barcode: '0000000002006', categorySlug: 'frutas-verduras', cost: 2.50, sale: 4.00, stock: 20, min: 6 },
    // Más productos varios
    { name: 'Huevos Blancos x12', barcode: '7754321012001', categorySlug: 'abarrotes', cost: 6.00, sale: 9.50, stock: 30, min: 8, trackExpiry: true },
    { name: 'Margarina Manty 200g', barcode: '7750381200001', categorySlug: 'lacteos', brand: 'Alicorp', cost: 3.50, sale: 5.80, stock: 24, min: 6 },
    { name: 'Yogurt Gloria Mix 100g', barcode: '7750310100001', categorySlug: 'lacteos', brand: 'Gloria', cost: 1.20, sale: 2.00, stock: 48, min: 12, trackExpiry: true },
    { name: 'Avena Quaker 500g', barcode: '7754321500001', categorySlug: 'abarrotes', cost: 4.50, sale: 7.50, stock: 24, min: 6 },
    { name: 'Cereales Nestlé Honey Stars 300g', barcode: '7613031850002', categorySlug: 'abarrotes', brand: 'Nestlé', cost: 7.50, sale: 12.50, stock: 18, min: 6 },
    { name: 'Miel de Abeja Colmena 500g', barcode: '7754321500002', categorySlug: 'abarrotes', cost: 12.00, sale: 19.90, stock: 12, min: 3 },
    { name: 'Mantequilla de Maní Crunchy', barcode: '7754321400002', categorySlug: 'abarrotes', cost: 8.50, sale: 14.00, stock: 15, min: 4 },
    { name: 'Flan Negrita 100g', barcode: '7750381100003', categorySlug: 'abarrotes', brand: 'Alicorp', cost: 1.50, sale: 2.80, stock: 30, min: 8 },
    { name: 'Gelatina Negrita Fresa 180g', barcode: '7750381180001', categorySlug: 'abarrotes', brand: 'Alicorp', cost: 2.00, sale: 3.50, stock: 24, min: 6 },
    { name: 'Maizena 200g', barcode: '7754321200001', categorySlug: 'abarrotes', cost: 2.20, sale: 3.80, stock: 24, min: 6 },
    { name: 'Sopa Knorr de Pollo', barcode: '8712561011111', categorySlug: 'abarrotes', brand: 'Unilever', cost: 1.50, sale: 2.50, stock: 36, min: 10 },
    { name: 'Vinagre Blanco 500ml', barcode: '7754321500003', categorySlug: 'abarrotes', cost: 1.80, sale: 3.20, stock: 20, min: 6 },
    { name: 'Pilas Duracell AA x2', barcode: '0041333124185', categorySlug: 'abarrotes', cost: 5.00, sale: 8.50, stock: 30, min: 8 },
    { name: 'Encendedor BIC', barcode: '0070330960034', categorySlug: 'abarrotes', cost: 1.00, sale: 2.00, stock: 30, min: 10 },
    { name: 'Alcohol Isopropílico 70% 250ml', barcode: '7754321250001', categorySlug: 'limpieza', cost: 3.50, sale: 6.00, stock: 24, min: 6 },
    { name: 'Mascarillas x10', barcode: '7754321100001', categorySlug: 'limpieza', cost: 4.00, sale: 7.00, stock: 20, min: 5 },
  ];

  const subcatCatMap: Record<string, string> = {};
  const allCats = await prisma.category.findMany();
  for (const cat of allCats) {
    subcatCatMap[cat.slug] = cat.id;
  }

  const supplierIds = Object.values(supplierMap);
  let productCount = 0;

  for (const prod of productos) {
    const categoryId = subcatCatMap[prod.categorySlug] ?? catMap['abarrotes'];
    const brandId = prod.brand ? brandMap[prod.brand] : undefined;
    const supplierId = supplierIds[productCount % supplierIds.length];

    const internalCode = `PROD${String(productCount + 1).padStart(4, '0')}`;

    try {
      await prisma.product.upsert({
        where: { barcode: prod.barcode },
        update: {},
        create: {
          name: prod.name,
          barcode: prod.barcode,
          internalCode,
          categoryId,
          brandId,
          supplierId,
          taxRateId: igv.id,
          unitOfMeasure: 'UNIT',
          costPrice: prod.cost,
          salePrice: prod.sale,
          minStock: prod.min,
          currentStock: prod.stock,
          trackExpiry: (prod as { trackExpiry?: boolean }).trackExpiry ?? false,
          status: 'ACTIVE',
        },
      });
      productCount++;
    } catch {
      // Si ya existe, continuar
    }
  }

  // ─── Caja Registradora ─────────────────────────────────────────────────────
  await prisma.cashRegister.upsert({
    where: { name: 'Caja Principal' },
    update: {},
    create: { name: 'Caja Principal', description: 'Caja principal del minimarket' },
  });

  await prisma.cashRegister.upsert({
    where: { name: 'Caja 2' },
    update: {},
    create: { name: 'Caja 2', description: 'Segunda caja' },
  });

  // ─── Usuarios ──────────────────────────────────────────────────────────────
  const password12 = await bcrypt.hash('Admin123!', 12);
  const passwordCajero = await bcrypt.hash('Cajero123!', 12);
  const passwordAlmacen = await bcrypt.hash('Almacen123!', 12);
  const pinHash = await bcrypt.hash('1234', 12);

  const usuarios = [
    {
      email: 'admin@minimarket.com',
      username: 'admin',
      firstName: 'Administrador',
      lastName: 'Sistema',
      role: 'SUPER_ADMIN' as const,
      passwordHash: password12,
      mustChangePassword: false,
    },
    {
      email: 'supervisor@minimarket.com',
      username: 'supervisor',
      firstName: 'Carlos',
      lastName: 'Supervisor',
      role: 'SUPERVISOR' as const,
      passwordHash: password12,
      mustChangePassword: false,
      pin: pinHash,
    },
    {
      email: 'cajero1@minimarket.com',
      username: 'cajero1',
      firstName: 'María',
      lastName: 'Cajero',
      role: 'CASHIER' as const,
      passwordHash: passwordCajero,
      mustChangePassword: false,
      pin: pinHash,
    },
    {
      email: 'cajero2@minimarket.com',
      username: 'cajero2',
      firstName: 'Juan',
      lastName: 'Pérez',
      role: 'CASHIER' as const,
      passwordHash: passwordCajero,
      mustChangePassword: false,
      pin: pinHash,
    },
    {
      email: 'almacen@minimarket.com',
      username: 'almacen',
      firstName: 'Pedro',
      lastName: 'Almacenero',
      role: 'WAREHOUSE' as const,
      passwordHash: passwordAlmacen,
      mustChangePassword: false,
    },
  ];

  for (const u of usuarios) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
  }

  // ─── Clientes ──────────────────────────────────────────────────────────────
  const clientes = [
    { taxId: '12345678', taxIdType: 'DNI', firstName: 'Ana', lastName: 'Huerta', phone: '987654321', email: 'ana.huerta@gmail.com', type: 'REGULAR' as const },
    { taxId: '23456789', taxIdType: 'DNI', firstName: 'Roberto', lastName: 'Solis', phone: '976543210', type: 'VIP' as const, creditLimit: 500 },
    { taxId: '34567890', taxIdType: 'DNI', firstName: 'Carmen', lastName: 'López', phone: '965432109', type: 'REGULAR' as const },
    { taxId: '20567890123', taxIdType: 'RUC', firstName: 'Empresa', businessName: 'Bodega Los Compadres SAC', phone: '01-456-7890', type: 'WHOLESALE' as const, creditLimit: 2000 },
    { taxId: '45678901', taxIdType: 'DNI', firstName: 'Luis', lastName: 'Mamani', phone: '954321098', type: 'CREDIT' as const, creditLimit: 200 },
    { taxId: '56789012', taxIdType: 'DNI', firstName: 'Giuliana', lastName: 'Torres', phone: '943210987', type: 'REGULAR' as const },
    { taxId: '67890123', taxIdType: 'DNI', firstName: 'Miguel', lastName: 'Quispe', phone: '932109876', type: 'VIP' as const },
    { taxId: '78901234', taxIdType: 'DNI', firstName: 'Rosa', lastName: 'Flores', phone: '921098765', type: 'REGULAR' as const },
    { taxId: '89012345', taxIdType: 'DNI', firstName: 'Jorge', lastName: 'Vargas', phone: '910987654', type: 'CREDIT' as const, creditLimit: 150 },
    { taxId: '90123456', taxIdType: 'DNI', firstName: 'Sandra', lastName: 'Rojas', phone: '999876543', type: 'REGULAR' as const },
  ];

  for (const c of clientes) {
    await prisma.customer.upsert({
      where: { taxId: c.taxId },
      update: {},
      create: {
        taxId: c.taxId,
        taxIdType: c.taxIdType,
        firstName: c.firstName,
        lastName: (c as { lastName?: string }).lastName,
        businessName: (c as { businessName?: string }).businessName,
        phone: c.phone,
        email: (c as { email?: string }).email,
        type: c.type,
        creditLimit: (c as { creditLimit?: number }).creditLimit ?? 0,
      },
    });
  }

  console.log(`✅ Seeds completados exitosamente!`);
  console.log(`   - ${productCount} productos creados`);
  console.log(`   - ${usuarios.length} usuarios creados`);
  console.log(`   - ${clientes.length} clientes creados`);
  console.log('');
  console.log('📋 Credenciales de acceso:');
  console.log('   Admin:      admin@minimarket.com     / Admin123!');
  console.log('   Supervisor: supervisor@minimarket.com / Admin123!');
  console.log('   Cajero 1:   cajero1@minimarket.com   / Cajero123!');
  console.log('   Cajero 2:   cajero2@minimarket.com   / Cajero123!');
  console.log('   Almacén:    almacen@minimarket.com   / Almacen123!');
  console.log('   PIN rápido: 1234 (para usuarios con PIN)');
}

main()
  .catch((e) => {
    console.error('❌ Error en seeds:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
