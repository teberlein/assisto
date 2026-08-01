import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  CanActivate,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RequestUser } from './jwt.strategy';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest().user as RequestUser;
    if (!user) throw new ForbiddenException();
    const has = required.some((r) => user.roles.includes(r));
    if (!has) throw new ForbiddenException(`Requires role: ${required.join('|')}`);
    return true;
  }
}
