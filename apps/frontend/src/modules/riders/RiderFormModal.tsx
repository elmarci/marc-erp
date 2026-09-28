import { useState } from 'react';
import { Bike, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, getErrorMessage } from '@/services/api';

export interface RiderFormValues {
  id?: string;
  nombre: string;
  telefono: string;
  motoModelo: string;
  motoPlaca: string;
  motoSoatHasta: string;
  zonas: string;
}

interface RiderFormModalProps {
  initial?: RiderFormValues;
  onClose: () => void;
  onSaved: () => void;
}

// Alta/edición de repartidor — el ERP es quien crea la cuenta y le asigna el
// PIN inicial (el biker nunca se autoregistra: LoginPage de apps/delivery
// solo pide teléfono + PIN, sin flujo de registro propio).
export function RiderFormModal({ initial, onClose, onSaved }: RiderFormModalProps) {
  const editing = !!initial?.id;
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [telefono, setTelefono] = useState(initial?.telefono ?? '');
  const [pin, setPin] = useState('');
  const [motoModelo, setMotoModelo] = useState(initial?.motoModelo ?? '');
  const [motoPlaca, setMotoPlaca] = useState(initial?.motoPlaca ?? '');
  const [motoSoatHasta, setMotoSoatHasta] = useState(initial?.motoSoatHasta ?? '');
  const [zonas, setZonas] = useState(initial?.zonas ?? '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!nombre.trim() || !telefono.trim()) { toast.error('Nombre y teléfono son obligatorios.'); return; }
    if (!editing && !/^\d{4}$/.test(pin)) { toast.error('El PIN debe tener 4 dígitos.'); return; }
    if (editing && pin && !/^\d{4}$/.test(pin)) { toast.error('El PIN debe tener 4 dígitos.'); return; }

    setLoading(true);
    try {
      const zonasArray = zonas.split(',').map((z) => z.trim()).filter(Boolean);
      if (editing) {
        await api.patch(`/delivery/admin/riders/${initial!.id}`, {
          nombre, ...(pin ? { pin } : {}),
          motoModelo: motoModelo || undefined,
          motoPlaca: motoPlaca || undefined,
          motoSoatHasta: motoSoatHasta || undefined,
          zonas: zonasArray,
        });
        toast.success('Repartidor actualizado.');
      } else {
        await api.post('/delivery/admin/riders', { nombre, telefono, pin });
        toast.success('Repartidor creado.');
      }
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl animate-fade-in flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 pb-5">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Bike className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{editing ? 'Editar repartidor' : 'Nuevo repartidor'}</h2>
              <p className="text-xs text-muted-foreground">{editing ? 'Datos y moto' : 'Da de alta a un biker'}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="overflow-y-auto px-6 pb-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nombre completo</label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Luis Ramírez" autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Teléfono</label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="987654321" disabled={editing} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              PIN de acceso (4 dígitos){editing && ' — dejar vacío para no cambiarlo'}
            </label>
            <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" inputMode="numeric" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Modelo de moto</label>
              <Input value={motoModelo} onChange={(e) => setMotoModelo(e.target.value)} placeholder="Honda Wave 110" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Placa</label>
              <Input value={motoPlaca} onChange={(e) => setMotoPlaca(e.target.value)} placeholder="ABC-123" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">SOAT vigente hasta</label>
            <Input type="date" value={motoSoatHasta} onChange={(e) => setMotoSoatHasta(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Zonas de cobertura</label>
            <Input value={zonas} onChange={(e) => setZonas(e.target.value)} placeholder="Manchay, Pachacámac" />
            <p className="mt-1 text-xs text-muted-foreground">Separadas por coma.</p>
          </div>

          <Button className="w-full" size="lg" onClick={handleSave} loading={loading}>
            {editing ? 'Guardar cambios' : 'Crear repartidor'}
          </Button>
        </div>
      </div>
    </div>
  );
}
