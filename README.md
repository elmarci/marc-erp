# ERP Minimarket

Sistema ERP completo para minimarket / tienda de conveniencia. Incluye punto de venta (POS), gestión de inventario, compras, clientes, caja, reportes y más.

## Stack Tecnológico

- **Backend:** Node.js + Express + TypeScript + Prisma
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Base de datos:** PostgreSQL 16
- **Cache/Sesiones:** Redis 7
- **Tiempo real:** Socket.io
- **Contenedores:** Docker + Docker Compose

## Requisitos

- Docker Desktop 4.x+
- Node.js 20+ (para desarrollo local)
- npm 10+

## Inicio Rápido

### 1. Clonar y configurar

```bash
git clone <repo-url>
cd erp-minimarket
cp .env.example .env
```

### 2. Editar variables de entorno

Editar `.env` con al menos estas variables obligatorias:

```env
POSTGRES_PASSWORD=tu_password_seguro
REDIS_PASSWORD=tu_redis_password
JWT_SECRET=cadena_aleatoria_de_64_caracteres_minimo
JWT_REFRESH_SECRET=otra_cadena_aleatoria_diferente
```

### 3. Levantar con Docker

```bash
docker-compose up --build
```

El sistema estará disponible en:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001
- **API Docs:** http://localhost:3001/api/v1/docs
- **Health Check:** http://localhost:3001/health

### 4. Inicializar base de datos

```bash
# Ejecutar migraciones
docker-compose exec backend npm run db:migrate

# Cargar datos de ejemplo
docker-compose exec backend npm run db:seed
```

## Credenciales de Acceso (después de seed)

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| admin | Admin123! | Super Admin |
| supervisor | Admin123! | Supervisor |
| cajero1 | Cajero123! | Cajero |
| cajero2 | Cajero123! | Cajero |
| almacen | Almacen123! | Almacenero |

**PIN rápido (para turno de caja):** `1234`

## Scripts Disponibles

```bash
# Desarrollo
npm run start:dev          # Levantar todo el entorno de desarrollo

# Producción
npm run start:prod          # Build y levantar producción

# Base de datos
npm run db:migrate          # Ejecutar migraciones pendientes
npm run db:seed             # Insertar datos de ejemplo
npm run db:reset            # Reset completo (solo desarrollo)

# Testing
npm run test                # Ejecutar todos los tests
npm run test:coverage       # Tests con reporte de cobertura

# Código
npm run lint                # Verificar estilo de código
npm run format              # Formatear código
npm run build               # Build de producción
```

## Módulos del Sistema

### 1. Punto de Venta (POS)
- Interfaz optimizada para touch y teclado
- Búsqueda incremental de productos (< 200ms)
- Soporte lector de código de barras
- Múltiples métodos de pago (efectivo, tarjeta, Yape, Plin, fiado)
- Cálculo automático de vuelto
- Aplicación de descuentos por ítem y global
- Anulación de ventas (requiere rol Supervisor)
- Apertura y cierre de caja con cuadre

### 2. Inventario y Productos
- CRUD completo de productos
- Control de stock con alertas automáticas
- Ajustes de inventario con auditoria
- Movimientos por producto
- Importación masiva CSV

### 3. Clientes y CRM
- Base de datos de clientes
- Control de crédito y fiados
- Historial de compras

### 4. Compras y Proveedores
- Gestión de proveedores
- Órdenes de compra
- Recepción de mercadería

### 5. Caja y Finanzas
- Multi-caja con sesiones
- Retiros y depósitos intermedios
- Cierre de caja con cuadre

### 6. Reportes
- Dashboard ejecutivo con KPIs
- Reportes de ventas con gráficas
- Inventario valorizado
- Top productos

### 7. Usuarios y Seguridad
- Roles: Super Admin, Admin, Supervisor, Cajero, Almacenero
- Auditoría completa de acciones
- JWT con refresh tokens
- Rate limiting y bcrypt

## Estructura del Proyecto

```
erp-minimarket/
├── apps/
│   ├── frontend/          # React + TypeScript + Vite
│   │   └── src/
│   │       ├── modules/   # Un directorio por módulo ERP
│   │       ├── components/# Componentes reutilizables
│   │       ├── stores/    # Estado global (Zustand)
│   │       ├── services/  # Llamadas a API (Axios)
│   │       └── lib/       # Utilidades
│   └── backend/           # Node.js + Express + TypeScript
│       ├── src/
│       │   ├── modules/   # Un módulo por dominio
│       │   ├── middleware/ # Auth, logging, errores
│       │   ├── database/  # Prisma, migraciones, seeds
│       │   └── config/    # Env, Logger, Redis
│       └── prisma/        # Schema de base de datos
├── docker-compose.yml
├── docker-compose.prod.yml
└── .env.example
```

## Atajos de Teclado (POS)

| Tecla | Acción |
|-------|--------|
| F1 | Enfocar búsqueda |
| F2 | Cobrar |
| Enter (en búsqueda) | Agregar por código de barras |
| Esc | Cancelar |

## Variables de Entorno

Ver `.env.example` para la lista completa de variables disponibles.

## Arquitectura

- **Backend:** REST API versionada (`/api/v1/...`), Repository + Service pattern, validación con Zod
- **Frontend:** Feature-based modules, React Query para server state, Zustand para client state
- **Seguridad:** JWT + refresh tokens, bcrypt, rate limiting, auditoría completa
- **Base de datos:** UUIDs como PKs, soft delete, timestamps automáticos, índices en búsquedas frecuentes

## Licencia

Propietario. Todos los derechos reservados.
