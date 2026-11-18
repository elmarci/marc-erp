import { useState } from 'react';
import { toast } from 'sonner';
import { Btn, Field, Modal, fieldCls } from '@/components/erp';
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
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" keepOpen
      title={editing ? 'Editar repartidor' : 'Nuevo repartidor'} description={editing ? 'Datos y moto' : 'Da de alta a un biker'}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={handleSave} loading={loading}>{editing ? 'Guardar cambios' : 'Crear repartidor'}</Btn>
      </>}>
      <div className="flex flex-col gap-4">
        <Field label="Nombre completo"><input className={fieldCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Luis Ramírez" autoFocus /></Field>
        <Field label="Teléfono"><input className={fieldCls} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="987654321" disabled={editing} /></Field>
        <Field label="PIN de acceso (4 dígitos)" hint={editing ? 'Dejar vacío para no cambiarlo' : undefined}>
          <input className={fieldCls} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" inputMode="numeric" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Modelo de moto"><input className={fieldCls} value={motoModelo} onChange={(e) => setMotoModelo(e.target.value)} placeholder="Honda Wave 110" /></Field>
          <Field label="Placa"><input className={fieldCls} value={motoPlaca} onChange={(e) => setMotoPlaca(e.target.value)} placeholder="ABC-123" /></Field>
        </div>
        <Field label="SOAT vigente hasta"><input type="date" className={fieldCls} value={motoSoatHasta} onChange={(e) => setMotoSoatHasta(e.target.value)} /></Field>
        <Field label="Zonas de cobertura" hint="Separadas por coma.">
          <input className={fieldCls} value={zonas} onChange={(e) => setZonas(e.target.value)} placeholder="Manchay, Pachacámac" />
        </Field>
      </div>
    </Modal>
  );
}
