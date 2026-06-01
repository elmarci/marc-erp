import { useNavigate } from 'react-router-dom';
import { LogOut, User, Moon, Sun, Bell, Menu } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { getInitials, ROLE_LABELS } from '@/lib/utils';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout, refreshToken } = useAuthStore();
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(
    () => document.documentElement.classList.contains('dark'),
  );

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Logout silencioso si falla
    } finally {
      logout();
      navigate('/login');
      toast.success('Sesión cerrada correctamente.');
    }
  };

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    setDarkMode((v) => !v);
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-4 lg:px-6">
      {/* Botón hamburguesa — solo visible en móvil/tablet */}
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label="Menú">
        <Menu className="h-5 w-5" />
      </Button>
      <div className="hidden lg:block" />

      <div className="flex items-center gap-2">
        {/* Notificaciones */}
        <Button variant="ghost" size="icon" aria-label="Notificaciones">
          <Bell className="h-5 w-5" />
        </Button>

        {/* Modo oscuro */}
        <Button variant="ghost" size="icon" onClick={toggleDarkMode} aria-label="Cambiar tema">
          {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        {/* Usuario */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                {user ? getInitials(user.firstName, user.lastName) : '?'}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium leading-none">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {user?.role ? ROLE_LABELS[user.role] ?? user.role : ''}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <User className="mr-2 h-4 w-4" />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
