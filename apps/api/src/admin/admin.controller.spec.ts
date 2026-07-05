import { Role } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { AdminController } from './admin.controller';

describe('AdminController authorization', () => {
  it('protege todos los endpoints del controlador con el rol ADMIN', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController)).toEqual([
      Role.ADMIN,
    ]);
  });
});
