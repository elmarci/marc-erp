import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../database/client';
import { BusinessError, NotFoundError } from '../../utils/errors';
import { env } from '../../config/env';

const CUSTOMER_JWT_SECRET = env.JWT_SECRET + '_customer';
const TOKEN_EXPIRES = '30d';

export class StoreAuthService {
  async register(data: {
    name: string; phone: string; email?: string; password: string;
  }) {
    const existingPhone = await prisma.storeCustomer.findUnique({ where: { phone: data.phone } });
    if (existingPhone) throw new BusinessError('Ya existe una cuenta con ese teléfono.');

    if (data.email) {
      const existingEmail = await prisma.storeCustomer.findUnique({ where: { email: data.email } });
      if (existingEmail) throw new BusinessError('Ya existe una cuenta con ese correo.');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const customer = await prisma.storeCustomer.create({
      data: { name: data.name, phone: data.phone, email: data.email, passwordHash },
    });

    const token = this.generateToken(customer.id);
    return { customer: this.safeCustomer(customer), token };
  }

  async login(identifier: string, password: string) {
    // Login by phone or email
    const customer = await prisma.storeCustomer.findFirst({
      where: {
        OR: [{ phone: identifier }, { email: identifier }],
        isActive: true,
      },
    });
    if (!customer) throw new BusinessError('Teléfono/correo o contraseña incorrectos.');

    const valid = await bcrypt.compare(password, customer.passwordHash);
    if (!valid) throw new BusinessError('Teléfono/correo o contraseña incorrectos.');

    const token = this.generateToken(customer.id);
    return { customer: this.safeCustomer(customer), token };
  }

  async getProfile(customerId: string) {
    const customer = await prisma.storeCustomer.findUnique({
      where: { id: customerId },
      include: { addresses: { orderBy: { isDefault: 'desc' } } },
    });
    if (!customer) throw new NotFoundError('Cliente');
    return { ...this.safeCustomer(customer), addresses: customer.addresses };
  }

  async updateProfile(customerId: string, data: { name?: string; email?: string }) {
    const customer = await prisma.storeCustomer.update({
      where: { id: customerId },
      data,
    });
    return this.safeCustomer(customer);
  }

  async addAddress(customerId: string, data: {
    label: string; address: string; district: string; reference?: string; isDefault?: boolean;
  }) {
    if (data.isDefault) {
      await prisma.storeAddress.updateMany({
        where: { customerId }, data: { isDefault: false },
      });
    }
    return prisma.storeAddress.create({
      data: { ...data, customerId },
    });
  }

  async deleteAddress(customerId: string, addressId: string) {
    await prisma.storeAddress.deleteMany({ where: { id: addressId, customerId } });
  }

  async setDefaultAddress(customerId: string, addressId: string) {
    await prisma.storeAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    return prisma.storeAddress.update({ where: { id: addressId }, data: { isDefault: true } });
  }

  verifyToken(token: string): string {
    const payload = jwt.verify(token, CUSTOMER_JWT_SECRET) as { sub: string };
    return payload.sub;
  }

  private generateToken(customerId: string): string {
    return jwt.sign({ sub: customerId }, CUSTOMER_JWT_SECRET, { expiresIn: TOKEN_EXPIRES });
  }

  private safeCustomer(c: { id: string; name: string; phone: string; email: string | null; createdAt: Date }) {
    return { id: c.id, name: c.name, phone: c.phone, email: c.email, createdAt: c.createdAt };
  }
}

export const storeAuthService = new StoreAuthService();
