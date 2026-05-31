import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/modules/auth/LoginPage';
import { DashboardPage } from '@/modules/dashboard/DashboardPage';
import { PosPage } from '@/modules/pos/PosPage';
import { ProductsPage } from '@/modules/products/ProductsPage';
import { ProductFormPage } from '@/modules/products/ProductFormPage';
import { SalesPage } from '@/modules/sales/SalesPage';
import { SaleDetailPage } from '@/modules/sales/SaleDetailPage';
import { CustomersPage } from '@/modules/customers/CustomersPage';
import { PurchasesPage } from '@/modules/purchases/PurchasesPage';
import { InventoryPage } from '@/modules/inventory/InventoryPage';
import { ReportsPage } from '@/modules/reports/ReportsPage';
import { CashPage } from '@/modules/cash/CashPage';
import { UsersPage } from '@/modules/users/UsersPage';
import { SettingsPage } from '@/modules/settings/SettingsPage';
import { ChangePasswordPage } from '@/modules/auth/ChangePasswordPage';

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
  return (
    <>
      <Toaster position="top-right" richColors closeButton />
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
          <Route path="users" element={<UsersPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}
