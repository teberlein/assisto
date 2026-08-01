import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface RequestPatient {
  patientId: string;
}

/**
 * Guard para los endpoints del paciente. El token de paciente lo emite
 * PatientAuthService con `{ sub: patientId, scope: 'patient' }` — distinto del
 * token de profesional, que trae accountId y no trae scope.
 */
@Injectable()
export class PatientJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();

    let payload: { sub?: string; scope?: string };
    try {
      payload = this.jwt.verify(header.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    if (payload.scope !== 'patient' || !payload.sub) {
      throw new UnauthorizedException('Not a patient token');
    }
    req.patient = { patientId: payload.sub } satisfies RequestPatient;
    return true;
  }
}

export const CurrentPatient = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestPatient =>
    ctx.switchToHttp().getRequest().patient,
);
