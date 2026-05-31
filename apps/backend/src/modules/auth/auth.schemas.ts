import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    login: z.string().min(1, 'Usuario o email requerido'),
    password: z.string().min(1, 'Contraseña requerida'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token requerido'),
  }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, 'Contraseña actual requerida'),
      newPassword: z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .regex(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
          'La contraseña debe tener al menos una mayúscula, una minúscula y un número',
        ),
      confirmPassword: z.string().min(1, 'Confirmación requerida'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'Las contraseñas no coinciden',
      path: ['confirmPassword'],
    }),
});

export const pinLoginSchema = z.object({
  body: z.object({
    userId: z.string().uuid('ID de usuario inválido'),
    pin: z.string().length(4, 'El PIN debe tener exactamente 4 dígitos').regex(/^\d+$/, 'El PIN solo puede contener números'),
  }),
});

export type LoginInput = z.infer<typeof loginSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];
