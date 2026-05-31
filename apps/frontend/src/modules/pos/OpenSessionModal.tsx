import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, getErrorMessage } from '@/services/api';

interface OpenSessionModalProps {
  onClose: () => void;
  onOpened: (sessionId: string, registerId: string) => void;
}

interface CashRegister { id: string; name: string; description: string | null }

export function OpenSessionModal({ onClose, onOpened }: OpenSessionModalProps) {
  const [selectedRegister, setSelectedRegister] = useState('');
  const [openingAmount, setOpeningAmount] = useState('0');
  const [loading, setLoading] = useState(false);

  const { data: registers } = useQuery({
    queryKey: ['cash-registers-list'],
    queryFn: async () => {
      const res = await api.get<{ data: CashRegister[] }>('/cash/registers');
      return res.data.data;
    },
  });

  const handleOpen = async () => {
    if (!selectedRegister) { toast.error('Seleccione una caja.'); return; }
    const amount = parseFloat(openingAmount);
    if (isNaN(amount) || amount < 0) { toast.error('Monto inicial inválido.'); return; }

    setLoading(true);
    try {
      const res = await api.post<{ data: { id: string; cashRegisterId: string } }>('/cash/sessions', {
        cashRegisterId: selectedRegister,
        openingAmount: amount,
      });
      toast.success('Caja abierta correctamente.');
      onOpened(res.data.data.id, res.data.data.cashRegisterId);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl animate-fade-in p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Abrir Caja</h2>
              <p className="text-xs text-muted-foreground">Ingrese el monto inicial</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Caja</label>
            <select
              value={selectedRegister}
              onChange={(e) => setSelectedRegister(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Seleccione una caja...</option>
              {registers?.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Monto inicial en caja (S/)</label>
            <Input
              type="number"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              min={0}
              step={10}
              className="text-lg font-bold text-center"
              autoFocus
            />
            <div className="mt-2 flex gap-2">
              {[50, 100, 200, 500].map((v) => (
                <Button key={v} variant="outline" size="sm" className="flex-1 text-xs"
                  onClick={() => setOpeningAmount(v.toString())}>
                  S/ {v}
                </Button>
              ))}
            </div>
          </div>

          <Button className="w-full" size="lg" onClick={handleOpen} loading={loading}
            disabled={!selectedRegister}>
            Abrir Caja
          </Button>
        </div>
      </div>
    </div>
  );
}
