import { z } from 'zod';

// Plantillas de "Arma tu canasta": cada ocasión (desayuno, lonche...) tiene
// espacios a llenar (pan, bebida, algo para el pan...). Cada espacio acepta
// varias "opciones" — una opción es una familia de productos que se
// reconoce por palabras del NOMBRE (no por categoría: así funciona aunque
// el catálogo de producción tenga las categorías armadas a su manera) y
// sabe cuánto hace falta por persona.
//
// Modos de cantidad:
// - units:  perPerson unidades por persona (pan: 2, huevos: 1).
//           Si el producto se vende a granel, gramsPerUnit convierte a kg.
// - amount: perPerson ml o g por persona (leche 250 ml, arroz 90 g). Se
//           divide entre el tamaño que trae el nombre ("Leche Gloria 1L" →
//           1000 ml); a granel se vende directo por kg/L.
// - shared: un producto alcanza para servesPeople personas (una mantequilla
//           para 6, un sobre de café para 10).
//
// El dueño puede reemplazar estas plantillas guardando un JSON con la misma
// forma en la configuración `store_basket_templates` (tabla settings).

export const basketOptionSchema = z.object({
  include: z.array(z.string().min(1)).min(1),
  exclude: z.array(z.string().min(1)).optional(),
  mode: z.enum(['units', 'amount', 'shared']),
  perPerson: z.number().positive().optional(),
  servesPeople: z.number().positive().optional(),
  gramsPerUnit: z.number().positive().optional(),
  // amount sin tamaño en el nombre: cuántas personas cubre una unidad.
  fallbackServes: z.number().positive().optional(),
});

export const basketSlotSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  // La canasta "Completa" puede llevar un segundo producto de este espacio
  // (ej. mantequilla y jamonada) si sobra presupuesto.
  allowSecond: z.boolean().optional(),
  options: z.array(basketOptionSchema).min(1),
});

export const basketTemplateSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().optional(),
  keywords: z.array(z.string().min(1)).min(1),
  slots: z.array(basketSlotSchema).min(1),
});

export const basketTemplatesSchema = z.array(basketTemplateSchema).min(1);

export type BasketOption = z.infer<typeof basketOptionSchema>;
export type BasketSlot = z.infer<typeof basketSlotSchema>;
export type BasketTemplate = z.infer<typeof basketTemplateSchema>;

// Nunca entran en una canasta, coincida o no con alguna opción: alcohol y
// cigarros (Ley 28705 — no se promocionan).
export const GLOBAL_EXCLUDE = [
  'cigarro', 'cigarrillo', 'tabaco', 'cerveza', 'pilsen', 'cristal', 'cusquena',
  'ron', 'vino', 'pisco', 'whisky', 'vodka', 'licor', 'tequila', 'anisado',
  'chilcano', 'mikes', 'four loko', 'sixpack',
];

const PAN = {
  include: ['pan'],
  exclude: ['molde', 'paneton', 'rallado', 'pita', 'hamburguesa', 'hot dog'],
  mode: 'units' as const, perPerson: 2, gramsPerUnit: 35,
};
const PAN_MOLDE = { include: ['pan de molde', 'pan molde'], mode: 'shared' as const, servesPeople: 4 };

const BEBIDA_DESAYUNO: BasketOption[] = [
  // La evaporada se toma rebajada con agua: rinde el doble.
  { include: ['leche evaporada', 'evaporada'], exclude: ['condensada'], mode: 'amount', perPerson: 120, fallbackServes: 3 },
  { include: ['leche'], exclude: ['condensada', 'polvo', 'asada', 'evaporada', 'manjar'], mode: 'amount', perPerson: 250, fallbackServes: 4 },
  { include: ['avena'], exclude: ['galleta'], mode: 'amount', perPerson: 30, fallbackServes: 4 },
  { include: ['cafe', 'nescafe', 'kirma', 'altomayo'], exclude: ['caramelo', 'galleta'], mode: 'shared', servesPeople: 10 },
  { include: ['cocoa', 'chocolate para taza', 'milo'], mode: 'shared', servesPeople: 8 },
  { include: ['filtrante', 'manzanilla', 'anis', 'te verde', 'hierba luisa'], mode: 'shared', servesPeople: 20 },
];

const PARA_EL_PAN: BasketOption[] = [
  { include: ['mantequilla', 'margarina', 'dorina', 'manty'], mode: 'shared', servesPeople: 6 },
  { include: ['queso'], exclude: ['crema de queso', 'galleta', 'snack'], mode: 'amount', perPerson: 30, fallbackServes: 4 },
  { include: ['jamonada', 'jamon', 'mortadela', 'salame', 'chorizo', 'hot dog', 'salchicha'], exclude: ['pizza'], mode: 'amount', perPerson: 30, fallbackServes: 4 },
  { include: ['huevo', 'huevos'], exclude: ['pascua', 'chocolate'], mode: 'units', perPerson: 1, gramsPerUnit: 60 },
  { include: ['mermelada', 'manjar', 'manjarblanco'], mode: 'shared', servesPeople: 8 },
  { include: ['palta'], mode: 'units', perPerson: 0.25, gramsPerUnit: 250 },
];

const FRUTA: BasketOption[] = [
  { include: ['platano', 'manzana', 'mandarina', 'naranja', 'pera', 'granadilla'], exclude: ['jugo', 'sabor', 'gaseosa', 'fanta', 'galleta', 'pulp', 'cifrut', 'nectar', 'refresco'], mode: 'units', perPerson: 1, gramsPerUnit: 150 },
];

const VERDURA_EXCLUDE = ['salsa', 'pure', 'lata', 'pasta', 'snack', 'frita', 'fritas', 'lays', 'pringles', 'sabor'];

export const DEFAULT_BASKET_TEMPLATES: BasketTemplate[] = [
  {
    key: 'desayuno', name: 'Desayuno', emoji: '☕',
    keywords: ['desayuno', 'desayunar', 'manana', 'temprano'],
    slots: [
      { key: 'pan', label: 'Pan', required: true, options: [PAN, PAN_MOLDE] },
      { key: 'bebida', label: 'Bebida', required: true, options: BEBIDA_DESAYUNO },
      { key: 'acompanante', label: 'Para el pan', required: true, allowSecond: true, options: PARA_EL_PAN },
      {
        key: 'extra', label: 'Extra', required: false, allowSecond: true,
        options: [
          ...FRUTA,
          { include: ['yogurt', 'yogur'], mode: 'amount', perPerson: 200, fallbackServes: 1 },
        ],
      },
    ],
  },
  {
    key: 'lonche', name: 'Lonche', emoji: '🥪',
    keywords: ['lonche', 'lonchecito', 'merienda', 'tarde', 'onces', 'cafecito'],
    slots: [
      { key: 'pan', label: 'Pan', required: true, options: [PAN, PAN_MOLDE] },
      { key: 'bebida', label: 'Bebida', required: true, options: BEBIDA_DESAYUNO },
      { key: 'acompanante', label: 'Para el pan', required: true, allowSecond: true, options: PARA_EL_PAN },
      {
        key: 'dulce', label: 'Algo dulce', required: false,
        options: [
          { include: ['keke', 'queque', 'bizcocho', 'alfajor', 'chancay', 'pionono'], mode: 'units', perPerson: 1 },
          { include: ['galleta', 'galletas', 'oreo', 'chokis', 'soda', 'casino', 'margarita', 'morochas', 'vainilla'], exclude: ['animalitos'], mode: 'units', perPerson: 1 },
        ],
      },
    ],
  },
  {
    key: 'almuerzo', name: 'Almuerzo', emoji: '🍲',
    keywords: ['almuerzo', 'almorzar', 'comida', 'cena', 'cenar', 'menu', 'cocinar', 'segundo'],
    slots: [
      {
        key: 'base', label: 'Arroz o fideos', required: true,
        options: [
          { include: ['arroz'], exclude: ['chaufa', 'galleta', 'harina', 'con leche'], mode: 'amount', perPerson: 90, fallbackServes: 10 },
          { include: ['fideo', 'fideos', 'tallarin', 'spaghetti', 'tallarines', 'canuto', 'codo', 'corbata'], exclude: ['instantaneo', 'ramen', 'aji-no-men', 'sopa'], mode: 'amount', perPerson: 90, fallbackServes: 5 },
        ],
      },
      {
        key: 'proteina', label: 'Proteína', required: true,
        options: [
          { include: ['pollo', 'pechuga', 'pierna', 'encuentro', 'alitas'], exclude: ['caldo', 'sabor', 'cubito', 'maggi', 'sopa', 'nugget'], mode: 'amount', perPerson: 180, fallbackServes: 2 },
          { include: ['carne', 'bistec', 'molida', 'res', 'cerdo', 'chuleta'], exclude: ['caldo', 'sabor', 'cubito', 'ablandador'], mode: 'amount', perPerson: 150, fallbackServes: 2 },
          { include: ['huevo', 'huevos'], exclude: ['pascua', 'chocolate'], mode: 'units', perPerson: 2, gramsPerUnit: 60 },
          { include: ['atun', 'filete de atun', 'trozos de atun', 'caballa', 'sardina', 'grated'], mode: 'shared', servesPeople: 2 },
          { include: ['hot dog', 'salchicha', 'chorizo'], exclude: ['pan'], mode: 'amount', perPerson: 100, fallbackServes: 3 },
        ],
      },
      {
        key: 'verdura', label: 'Verduras', required: false, allowSecond: true,
        options: [
          ...[['tomate'], ['cebolla'], ['zanahoria'], ['papa', 'camote'], ['choclo'], ['lechuga', 'pepino']].map(include => ({
            include, exclude: VERDURA_EXCLUDE, mode: 'units' as const, perPerson: 0.5, gramsPerUnit: 150,
          })),
        ],
      },
      {
        key: 'bebida', label: 'Para tomar', required: false,
        options: [
          { include: ['gaseosa', 'inca kola', 'coca cola', 'coca-cola', 'kola real', 'pepsi', 'fanta', 'sprite', 'guarana', 'chicha', 'refresco', 'cifrut', 'pulp', 'frugos', 'tampico', 'agua'], exclude: ['energizante', 'red bull', 'volt', 'monster', 'tonica'], mode: 'amount', perPerson: 300, fallbackServes: 1 },
        ],
      },
    ],
  },
];
