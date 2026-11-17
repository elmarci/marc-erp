import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/erp';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/modules/auth/LoginPage';
import { ChangePasswordPage } from '@/modules/auth/ChangePasswordPage';

// Cada pantalla se descarga al abrirla (antes todo el ERP era un solo archivo
// de 1,2 MB). El service worker igual las guarda todas para usar sin internet.
const DashboardPage = lazy(() => import('@/modules/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const PosPage = lazy(() => import('@/modules/pos/PosPage').then((m) => ({ default: m.PosPage })));
const ProductsPage = lazy(() => import('@/modules/products/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const ProductFormPage = lazy(() => import('@/modules/products/ProductFormPage').then((m) => ({ default: m.ProductFormPage })));
const SalesPage = lazy(() => import('@/modules/sales/SalesPage').then((m) => ({ default: m.SalesPage })));
const SaleDetailPage = lazy(() => import('@/modules/sales/SaleDetailPage').then((m) => ({ default: m.SaleDetailPage })));
const CustomersPage = lazy(() => import('@/modules/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const PurchasesPage = lazy(() => import('@/modules/purchases/PurchasesPage').then((m) => ({ default: m.PurchasesPage })));
const InventoryPage = lazy(() => import('@/modules/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const ReportsPage = lazy(() => import('@/modules/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const OffersPage = lazy(() => import('@/modules/offers/OffersPage').then((m) => ({ default: m.OffersPage })));
const NotificationsPage = lazy(() => import('@/modules/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const StoreOrdersPage = lazy(() => import('@/modules/store-orders/StoreOrdersPage').then((m) => ({ default: m.StoreOrdersPage })));
const StoreOptionsPage = lazy(() => import('@/modules/store-options/StoreOptionsPage').then((m) => ({ default: m.StoreOptionsPage })));
const ComplaintsPage = lazy(() => import('@/modules/complaints/ComplaintsPage').then((m) => ({ default: m.ComplaintsPage })));
const RidersPage = lazy(() => import('@/modules/riders/RidersPage').then((m) => ({ default: m.RidersPage })));
const TvScreenPage = lazy(() => import('@/modules/tv/TvScreenPage').then((m) => ({ default: m.TvScreenPage })));
const CashPage = lazy(() => import('@/modules/cash/CashPage').then((m) => ({ default: m.CashPage })));
const UsersPage = lazy(() => import('@/modules/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const AttendancePage = lazy(() => import('@/modules/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })));
const SettingsPage = lazy(() => import('@/modules/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const StaffPage = lazy(() => import('@/modules/staff/StaffPage').then((m) => ({ default: m.StaffPage })));
const AdministrationPage = lazy(() => import('@/modules/administration/AdministrationPage').then((m) => ({ default: m.AdministrationPage })));
const DesignPreviewPage = lazy(() => import('@/modules/design-preview/DesignPreviewPage').then((m) => ({ default: m.DesignPreviewPage })));
const CategoriesPage = lazy(() => import('@/modules/categories/CategoriesPage').then((m) => ({ default: m.CategoriesPage })));

function PageLoading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequirePasswordChange({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

export default function App() {
  useOfflineSync();
  return (
    <ConfirmProvider>
      <Toaster position="top-right" richColors closeButton />
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <ChangePasswordPage />
            </RequireAuth>
          }
        />
        {/* Temporal (Fase 5): concepto del rediseño con datos de ejemplo. */}
        <Route
          path="/design-preview"
          element={
            <RequireAuth>
              <DesignPreviewPage />
            </RequireAuth>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <RequirePasswordChange>
                <AppLayout />
              </RequirePasswordChange>
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/new" element={<ProductFormPage />} />
          <Route path="products/:id/edit" element={<ProductFormPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="sales/:id" element={<SaleDetailPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="purchases" element={<PurchasesPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="cash" element={<CashPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="administration" element={<AdministrationPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="offers" element={<OffersPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="store-orders" element={<StoreOrdersPage />} />
          <Route path="store-options" element={<StoreOptionsPage />} />
          <Route path="complaints" element={<ComplaintsPage />} />
          <Route path="riders" element={<RidersPage />} />
          <Route path="tv" element={<TvScreenPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </Suspense>
    </ConfirmProvider>
  );
}
