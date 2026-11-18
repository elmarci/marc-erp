// Configuración del negocio: datos y logo, portada de la tienda, cupones,
// puntos, régimen, comisión de tarjeta, margen bajo y ticket. Cada bloque
// guarda los cambios pendientes de toda la página.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Film, Image, Save, Trash2, Upload, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Field, PageHeader, Panel, fieldCls } from '@/components/erp';
import { api, getErrorMessage, API_ORIGIN } from '@/services/api';
import { cn } from '@/lib/utils';
import { useRef, useState } from 'react';

interface Setting { key: string; value: string; label: string; group: string; type: string }

const checkCls = 'size-4 rounded-[4px] accent-[hsl(var(--brand))]';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroVideoInputRef = useRef<HTMLInputElement>(null);
  const heroPosterInputRef = useRef<HTMLInputElement>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get<{ data: Setting[] }>('/settings');
      return res.data.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, string>) => api.patch('/settings', { updates }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Configuración guardada.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('logo', file);
      return api.post('/settings/logo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Logo actualizado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteLogoMutation = useMutation({
    mutationFn: () => api.delete('/settings/logo'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Logo eliminado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Video de portada de la tienda online — se sube a un endpoint genérico que
  // solo devuelve la URL; guardarla como configuración es un segundo paso
  // (mismo patrón que subir una imagen de producto y luego asignarla).
  const heroVideoMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('video', file);
      const res = await api.post<{ data: { videoUrl: string } }>('/settings/upload-video', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return api.patch('/settings', { updates: { store_hero_video_url: res.data.data.videoUrl } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Video de portada actualizado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const heroPosterMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('image', file);
      const res = await api.post<{ data: { imageUrl: string } }>('/products/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return api.patch('/settings', { updates: { store_hero_poster_url: res.data.data.imageUrl } });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Imagen de portada actualizada.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const removeHeroVideoMutation = useMutation({
    mutationFn: () => api.patch('/settings', { updates: { store_hero_video_url: '' } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.success('Video de portada quitado.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const businessSettings = settings?.filter((s) => s.group === 'business' && s.key !== 'business_logo_url' && s.key !== 'business_logo_print_url') ?? [];
  const couponSettings = settings?.filter((s) => s.group === 'coupons') ?? [];
  const loyaltySettings = settings?.filter((s) => s.group === 'loyalty') ?? [];
  const receiptSettings = settings?.filter((s) => s.group === 'receipts') ?? [];
  const adminSettings = settings?.filter((s) => s.group === 'administration' && s.key !== 'tax_regime') ?? [];
  const marginSetting = settings?.find((s) => s.key === 'min_margin_volatile');
  const cardCommissionSetting = settings?.find((s) => s.key === 'card_commission_percent');
  const logoUrl = settings?.find((s) => s.key === 'business_logo_url')?.value;
  const logoSrc = logoUrl ? (logoUrl.startsWith('http') ? logoUrl : `${API_ORIGIN}${logoUrl}`) : null;
  const heroVideoUrl = settings?.find((s) => s.key === 'store_hero_video_url')?.value;
  const heroVideoSrc = heroVideoUrl ? (heroVideoUrl.startsWith('http') ? heroVideoUrl : `${API_ORIGIN}${heroVideoUrl}`) : null;
  const heroPosterUrl = settings?.find((s) => s.key === 'store_hero_poster_url')?.value;
  const heroPosterSrc = heroPosterUrl ? (heroPosterUrl.startsWith('http') ? heroPosterUrl : `${API_ORIGIN}${heroPosterUrl}`) : null;

  const set = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  const dirty = Object.keys(values).length > 0;
  const saveBtn = (
    <div className="flex justify-end border-t border-line pt-3">
      <Btn variant="primary" onClick={() => updateMutation.mutate(values)} loading={updateMutation.isPending} disabled={!dirty}>
        <Save />Guardar Cambios
      </Btn>
    </div>
  );
  const loading = <div className="py-4 text-center text-table text-ink-muted">Cargando…</div>;
  const field = (st: Setting, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    st.type === 'boolean' ? (
      <label key={st.key} className="flex cursor-pointer items-center gap-2.5">
        <input type="checkbox" className={checkCls} defaultChecked={st.value === 'true'}
          onChange={(e) => set(st.key, e.target.checked ? 'true' : 'false')} />
        <span className="text-table font-medium text-ink">{st.label}</span>
      </label>
    ) : (
      <Field key={st.key} label={st.label}>
        <input {...props} className={cn(fieldCls, props.type === 'number' && 'max-w-[200px] text-right tabular-nums', props.className)}
          defaultValue={st.value} onChange={(e) => set(st.key, e.target.value)} />
      </Field>
    )
  );
  const desc = (t: React.ReactNode) => <p className="text-table text-ink-muted">{t}</p>;
  const media = (src: string | null, kind: 'img' | 'video', wide: boolean) => (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-ctl border border-dashed border-line-strong bg-surface-2', wide ? 'h-20 w-36' : 'h-16 w-32')}>
      {src ? (kind === 'video'
        ? <video src={src} className="size-full object-cover" muted loop autoPlay playsInline />
        : <img src={src} alt="" className={cn('size-full', wide ? 'object-cover' : 'object-contain')} />)
        : kind === 'video' ? <Film className="size-6 text-ink-muted/40" /> : <Image className="size-6 text-ink-muted/40" />}
    </div>
  );
  const fileInput = (ref: React.RefObject<HTMLInputElement>, accept: string, onFile: (f: File) => void) => (
    <input ref={ref} type="file" accept={accept} className="hidden"
      onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ''; }} />
  );
  const body = 'flex flex-col gap-4 p-4';

  return (
    <div className="erp flex max-w-2xl flex-col gap-5">
      <PageHeader title="Configuración" />

      <Panel title="Datos del Negocio" bodyClassName={body}>
        <div className="flex flex-col gap-1.5">
          <span className="text-table font-medium text-ink">Logo (aparece en el ticket de venta)</span>
          <div className="flex items-center gap-4">
            {media(logoSrc, 'img', false)}
            <div className="flex gap-2">
              {fileInput(logoInputRef, 'image/png,image/jpeg,image/webp', (f) => logoMutation.mutate(f))}
              <Btn size="sm" loading={logoMutation.isPending} onClick={() => logoInputRef.current?.click()}>
                <Upload />{logoSrc ? 'Cambiar' : 'Subir logo'}
              </Btn>
              {logoSrc && (
                <Btn size="sm" variant="ghost" aria-label="Quitar logo" loading={deleteLogoMutation.isPending} onClick={() => deleteLogoMutation.mutate()}><Trash2 /></Btn>
              )}
            </div>
          </div>
        </div>
        {isLoading ? loading : businessSettings.map((st) => field(st))}
        {saveBtn}
      </Panel>

      <Panel title="Portada de la Tienda Online" bodyClassName={body}>
        {desc(<>Video corto (MP4/WEBM, máx. 25MB) que se reproduce de fondo en el inicio de la tienda. Si no
          hay video, se usa la imagen de portada como respaldo mientras carga o si el navegador no la soporta.</>)}
        <div className="flex flex-col gap-1.5">
          <span className="text-table font-medium text-ink">Video de portada</span>
          <div className="flex items-center gap-4">
            {media(heroVideoSrc, 'video', true)}
            <div className="flex gap-2">
              {fileInput(heroVideoInputRef, 'video/mp4,video/webm', (f) => heroVideoMutation.mutate(f))}
              <Btn size="sm" loading={heroVideoMutation.isPending} onClick={() => heroVideoInputRef.current?.click()}>
                <Video />{heroVideoSrc ? 'Cambiar' : 'Subir video'}
              </Btn>
              {heroVideoSrc && (
                <Btn size="sm" variant="ghost" aria-label="Quitar video" loading={removeHeroVideoMutation.isPending} onClick={() => removeHeroVideoMutation.mutate()}><Trash2 /></Btn>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-table font-medium text-ink">Imagen de respaldo</span>
          <div className="flex items-center gap-4">
            {media(heroPosterSrc, 'img', true)}
            <div className="flex gap-2">
              {fileInput(heroPosterInputRef, 'image/png,image/jpeg,image/webp', (f) => heroPosterMutation.mutate(f))}
              <Btn size="sm" loading={heroPosterMutation.isPending} onClick={() => heroPosterInputRef.current?.click()}>
                <Upload />{heroPosterSrc ? 'Cambiar' : 'Subir imagen'}
              </Btn>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Cupones de Descuento" bodyClassName={body}>
        {desc(<>Cuando una venta con cliente asignado supera el monto mínimo, se genera e imprime
          automáticamente un cupón de descuento % para la próxima compra de ese cliente.</>)}
        {isLoading ? loading : couponSettings.map((st) => field(st, { type: 'number' }))}
        {saveBtn}
      </Panel>

      <Panel title="Puntos de Fidelización" bodyClassName={body}>
        {desc(<>Los clientes ganan puntos en cada compra con cliente asignado, canjeables por descuento
          en una compra futura (excluyente con los cupones: solo uno de los dos por venta).</>)}
        {isLoading ? loading : loyaltySettings.map((st) => field(st, { type: 'number', step: '0.01' }))}
        {saveBtn}
      </Panel>

      {adminSettings.length > 0 && (
        <Panel title="Régimen tributario y costos" bodyClassName={body}>
          {adminSettings.map((st) => field(st, { type: 'number', step: '1', min: 0 }))}
          {saveBtn}
        </Panel>
      )}

      {cardCommissionSetting && (
        <Panel title="Pagos con Tarjeta (POS Izipay)" bodyClassName={body}>
          {desc(<>Comisión que se le suma al cliente cuando paga con tarjeta de débito o crédito (incluye IGV).
            Se calcula sobre la parte pagada con tarjeta, se redondea al céntimo y se imprime en el ticket.
            Efectivo, Yape, Plin, transferencia y fiado no llevan comisión.</>)}
          {field(cardCommissionSetting, { type: 'number', step: '0.01', min: '0', max: '100' })}
          {saveBtn}
        </Panel>
      )}

      {marginSetting && (
        <Panel title="Alerta de Margen Bajo" bodyClassName={body}>
          {desc(<>En frutas, verduras y productos a granel el costo cambia seguido. Si el último costo de compra
            deja menos que este margen contra el precio de venta, aparece una alerta en Inventario para que
            actualices el precio (el sistema nunca lo cambia solo).</>)}
          {field(marginSetting, { type: 'number', step: '0.10', min: '0' })}
          {saveBtn}
        </Panel>
      )}

      <Panel title="Ticket de Venta" bodyClassName={body}>
        {desc('Qué información se imprime en el ticket que recibe el cliente.')}
        {isLoading ? loading : receiptSettings.map((st) => field(st))}
        {saveBtn}
      </Panel>

      <Panel title="Credenciales de Acceso" bodyClassName="p-4">
        {desc('Para cambiar su contraseña, use la opción en el menú de usuario en la esquina superior derecha.')}
      </Panel>
    </div>
  );
}
