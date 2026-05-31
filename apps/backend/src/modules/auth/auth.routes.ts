import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { env } from '../../config/env';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_LOGIN_MAX,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: `Demasiados intentos de inicio de sesión. Intente de nuevo en ${Math.round(env.RATE_LIMIT_WINDOW_MS / 60000)} minutos.`,
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, authController.login.bind(authController));
router.post('/pin-login', loginLimiter, authController.pinLogin.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.post('/logout', authenticate, authController.logout.bind(authController));
router.post('/change-password', authenticate, authController.changePassword.bind(authController));
router.get('/me', authenticate, authController.me.bind(authController));

export default router;
