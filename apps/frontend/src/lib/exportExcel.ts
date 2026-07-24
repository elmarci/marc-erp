import { api, getErrorMessage } from '@/services/api';
import { toast } from 'sonner';

// Descarga el .xlsx que devuelve un endpoint de exportación del backend y
// dispara la descarga en el navegador — usado por los botones "Exportar
// Excel" de Clientes, Ventas, Compras, Cajas, Inventario y Proveedores.
export async function downloadExcel(url: string, filename: string): Promise<void> {
  try {
    const res = await api.get<ArrayBuffer>(url, { responseType: 'blob' });
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    toast.error(getErrorMessage(err));
  }
}
