/**
 * Backend mock para modo demo: implementa el contrato de /lib/api.ts contra
 * un estado persistido en localStorage. Se activa cuando NEXT_PUBLIC_DEMO_MODE
 * != 'false'. Permite correr toda la app (panel + paciente) sin API real.
 */

import type {
  Account,
  Appointment,
  AppointmentStatus,
  AvailabilityInput,
  AvailabilitySlot,
  CreateProfessionalInput,
  CreatePublicAppointmentInput,
  JoinWaitlistInput,
  LoginResponse,
  OtpRequestResponse,
  Patient,
  PatientAuthResponse,
  Professional,
  ServiceType,
  ServiceTypeInput,
  SignupOwnerInput,
  SignupOwnerResponse,
  Slot,
  UpdateAccountInput,
  WaitlistEntry,
} from '@/types/api';

/**
 * Forzado a true mientras no haya API deployada: en la demo TODA request debe
 * caer en el mock, aunque Vercel tenga `NEXT_PUBLIC_API_URL` o
 * `NEXT_PUBLIC_DEMO_MODE=false` heredados de configs viejas.
 */
export const MOCK_ENABLED = true;

const STATE_KEY = 'asissto.demo.state.v3';
const PATIENT_ACCOUNT_KEY = 'asissto.patientAccountId';

const DEMO_ACCOUNT_ID = 'demo-account';
const DEMO_TZ = 'America/Argentina/Buenos_Aires';

interface DemoState {
  account: Account;
  users: Array<{ id: string; email: string; password: string; fullName: string; roles: ('OWNER' | 'PROFESSIONAL')[]; accountId: string }>;
  professionals: Professional[];
  serviceTypes: ServiceType[];
  availability: AvailabilitySlot[];
  patients: Array<Patient & { password?: string }>;
  appointments: Appointment[];
  waitlist: WaitlistEntry[];
  tokens: Record<string, { kind: 'pro' | 'patient'; subjectId: string }>;
}

let state: DemoState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

class DemoApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function uid(prefix = ''): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

function isoWeekStart(d: Date): Date {
  const day = d.getDay(); // 0..6, dom..sáb
  const diff = day === 0 ? -6 : 1 - day; // lunes como inicio
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function localIso(date: Date, time: string): string {
  // Devuelve un ISO en UTC calculado a partir de la fecha local + HH:mm.
  const [h, m] = time.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function seed(): DemoState {
  const account: Account = {
    id: DEMO_ACCOUNT_ID,
    name: 'Consultorio Demo',
    timezone: DEMO_TZ,
    whatsappNumber: '+54 9 11 5555-0000',
  };

  const users: DemoState['users'] = [
    {
      id: 'user-owner',
      email: 'demo@asissto.dev',
      password: 'demo1234',
      fullName: 'Dra. Ana Demo',
      roles: ['OWNER', 'PROFESSIONAL'],
      accountId: DEMO_ACCOUNT_ID,
    },
    {
      id: 'user-bruno',
      email: 'bruno@asissto.dev',
      password: 'demo1234',
      fullName: 'Dr. Bruno Demo',
      roles: ['PROFESSIONAL'],
      accountId: DEMO_ACCOUNT_ID,
    },
  ];

  const professionals: Professional[] = [
    {
      id: 'prof-ana',
      accountId: DEMO_ACCOUNT_ID,
      displayName: 'Dra. Ana',
      userId: 'user-owner',
      user: { id: 'user-owner', email: users[0].email, fullName: users[0].fullName },
    },
    {
      id: 'prof-bruno',
      accountId: DEMO_ACCOUNT_ID,
      displayName: 'Dr. Bruno',
      userId: 'user-bruno',
      user: { id: 'user-bruno', email: users[1].email, fullName: users[1].fullName },
    },
  ];

  const serviceTypes: ServiceType[] = [
    { id: 'srv-ana-consulta', professionalId: 'prof-ana', name: 'Consulta', durationMinutes: 30, active: true },
    { id: 'srv-ana-primera', professionalId: 'prof-ana', name: 'Primera vez', durationMinutes: 60, active: true },
    { id: 'srv-ana-control', professionalId: 'prof-ana', name: 'Control', durationMinutes: 45, active: true },
    { id: 'srv-bruno-consulta', professionalId: 'prof-bruno', name: 'Consulta', durationMinutes: 30, active: true },
    { id: 'srv-bruno-larga', professionalId: 'prof-bruno', name: 'Sesión larga', durationMinutes: 60, active: true },
  ];

  const availability: AvailabilitySlot[] = [];
  for (const profId of ['prof-ana', 'prof-bruno']) {
    for (let dow = 1; dow <= 5; dow++) {
      availability.push({ id: uid('av-'), professionalId: profId, dayOfWeek: dow, startTime: '09:00', endTime: '13:00' });
      availability.push({ id: uid('av-'), professionalId: profId, dayOfWeek: dow, startTime: '14:00', endTime: '18:00' });
    }
  }

  const patients: DemoState['patients'] = [
    { id: 'pat-maria', phone: '+5491133334444', fullName: 'María López', email: 'maria@example.com' },
    { id: 'pat-jose', phone: '+5491155556666', fullName: 'José Pérez' },
    { id: 'pat-lucia', phone: '+5491177778888', fullName: 'Lucía Fernández' },
  ];

  // Turnos: esta semana, algunos confirmados y uno liberado.
  const monday = isoWeekStart(new Date());
  const day = (offset: number) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offset);
    return d;
  };
  const appointments: Appointment[] = [
    {
      id: uid('apt-'),
      professionalId: 'prof-ana',
      professional: professionals[0],
      patientId: 'pat-maria',
      patient: patients[0],
      serviceTypeId: 'srv-ana-consulta',
      serviceType: serviceTypes[0],
      startAt: localIso(day(0), '10:00'),
      endAt: localIso(day(0), '10:30'),
      status: 'CONFIRMED',
      origin: 'WEB',
    },
    {
      id: uid('apt-'),
      professionalId: 'prof-ana',
      professional: professionals[0],
      patientId: 'pat-jose',
      patient: patients[1],
      serviceTypeId: 'srv-ana-primera',
      serviceType: serviceTypes[1],
      startAt: localIso(day(1), '11:00'),
      endAt: localIso(day(1), '12:00'),
      status: 'SCHEDULED',
      origin: 'WHATSAPP',
    },
    {
      id: uid('apt-'),
      professionalId: 'prof-ana',
      professional: professionals[0],
      patientId: null,
      patient: null,
      serviceTypeId: 'srv-ana-consulta',
      serviceType: serviceTypes[0],
      startAt: localIso(day(2), '15:00'),
      endAt: localIso(day(2), '15:30'),
      status: 'AVAILABLE_FOR_REASSIGNMENT',
      origin: 'REASSIGNMENT',
    },
    {
      id: uid('apt-'),
      professionalId: 'prof-bruno',
      professional: professionals[1],
      patientId: 'pat-lucia',
      patient: patients[2],
      serviceTypeId: 'srv-bruno-larga',
      serviceType: serviceTypes[4],
      startAt: localIso(day(3), '09:00'),
      endAt: localIso(day(3), '10:00'),
      status: 'CONFIRMED',
      origin: 'WEB',
    },
  ];

  const waitlist: WaitlistEntry[] = [
    {
      id: uid('wl-'),
      patientId: 'pat-lucia',
      patient: patients[2],
      professionalId: 'prof-ana',
      professional: professionals[0],
      serviceTypeId: 'srv-ana-consulta',
      serviceType: serviceTypes[0],
      preferredDaysOfWeek: [1, 2, 3, 4, 5],
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    },
  ];

  return {
    account,
    users,
    professionals,
    serviceTypes,
    availability,
    patients,
    appointments,
    waitlist,
    tokens: {},
  };
}

function loadState(): DemoState {
  if (state) return state;
  if (typeof window === 'undefined') {
    state = seed();
    return state;
  }
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (raw) {
      state = JSON.parse(raw) as DemoState;
      return state;
    }
  } catch {
    /* ignore */
  }
  state = seed();
  persist();
  return state;
}

function persist() {
  if (typeof window === 'undefined' || !state) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      /* storage lleno o bloqueado */
    }
  }, 30);
}

function issueToken(kind: 'pro' | 'patient', subjectId: string): string {
  const s = loadState();
  const token = `demo.${kind}.${subjectId}.${uid()}`;
  s.tokens[token] = { kind, subjectId };
  persist();
  return token;
}

function tokenFromHeader(auth: string | undefined): DemoState['tokens'][string] | null {
  if (!auth) return null;
  const [, value] = auth.split(' ');
  if (!value) return null;
  const s = loadState();
  return s.tokens[value] ?? null;
}

/**
 * En modo demo, arrancamos con la cuenta demo ya elegida para el paciente,
 * para que el AccountGate no aparezca y la demo fluya sin fricción.
 */
export function bootDemoClient() {
  if (typeof window === 'undefined' || !MOCK_ENABLED) return;
  try {
    if (!window.localStorage.getItem(PATIENT_ACCOUNT_KEY)) {
      window.localStorage.setItem(PATIENT_ACCOUNT_KEY, JSON.stringify(DEMO_ACCOUNT_ID));
    }
  } catch {
    /* ignore */
  }
  loadState();
}

/* -------------------------------------------------------------- helpers */

function parseAppointmentAt(iso: string): Date {
  return new Date(iso);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

function activeAppointments(s: DemoState, professionalId: string): Appointment[] {
  return s.appointments.filter(
    (a) =>
      a.professionalId === professionalId &&
      a.status !== 'CANCELLED' &&
      a.status !== 'AVAILABLE_FOR_REASSIGNMENT',
  );
}

function computeSlots(
  professionalId: string,
  serviceTypeId: string,
  fromIso: string,
  toIso: string,
): Slot[] {
  const s = loadState();
  const service = s.serviceTypes.find((x) => x.id === serviceTypeId);
  if (!service) return [];
  const duration = service.durationMinutes;
  const availability = s.availability.filter((a) => a.professionalId === professionalId);
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const busy = activeAppointments(s, professionalId).map((a) => ({
    start: parseAppointmentAt(a.startAt),
    end: parseAppointmentAt(a.endAt),
  }));

  const results: Slot[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);

  while (cursor <= end) {
    const dow = cursor.getDay();
    const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;

    const matches = availability.filter(
      (a) =>
        (a.dayOfWeek !== null && a.dayOfWeek !== undefined && a.dayOfWeek === dow) ||
        (a.specificDate && a.specificDate === dateKey),
    );

    for (const window of matches) {
      const [sh, sm] = window.startTime.split(':').map(Number);
      const [eh, em] = window.endTime.split(':').map(Number);
      const wStart = new Date(cursor);
      wStart.setHours(sh, sm, 0, 0);
      const wEnd = new Date(cursor);
      wEnd.setHours(eh, em, 0, 0);

      for (
        let t = new Date(wStart);
        t.getTime() + duration * 60_000 <= wEnd.getTime();
        t = new Date(t.getTime() + duration * 60_000)
      ) {
        const slotStart = new Date(t);
        const slotEnd = new Date(t.getTime() + duration * 60_000);
        if (slotEnd <= from || slotStart >= to) continue;
        const conflict = busy.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
        if (conflict) continue;
        results.push({ startAt: slotStart.toISOString(), endAt: slotEnd.toISOString() });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  results.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return results;
}

function enrichAppointment(s: DemoState, a: Appointment): Appointment {
  return {
    ...a,
    professional: s.professionals.find((p) => p.id === a.professionalId) ?? a.professional ?? null,
    patient: a.patientId ? s.patients.find((p) => p.id === a.patientId) ?? a.patient ?? null : null,
    serviceType: a.serviceTypeId
      ? s.serviceTypes.find((t) => t.id === a.serviceTypeId) ?? a.serviceType ?? null
      : null,
  };
}

function enrichWaitlist(s: DemoState, w: WaitlistEntry): WaitlistEntry {
  return {
    ...w,
    patient: s.patients.find((p) => p.id === w.patientId) ?? w.patient ?? null,
    professional: s.professionals.find((p) => p.id === w.professionalId) ?? w.professional ?? null,
    serviceType: w.serviceTypeId
      ? s.serviceTypes.find((t) => t.id === w.serviceTypeId) ?? w.serviceType ?? null
      : null,
    linkedAppointment: w.linkedAppointmentId
      ? s.appointments.find((a) => a.id === w.linkedAppointmentId) ?? null
      : null,
  };
}

/* -------------------------------------------------------- router request */

export interface MockOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  authHeader?: string;
}

export async function mockRequest<T>(path: string, opts: MockOptions): Promise<T> {
  await new Promise((r) => setTimeout(r, 120)); // pequeño delay para que la UI muestre loading
  const s = loadState();
  const { method, body, query } = opts;
  const b = (body ?? {}) as Record<string, unknown>;

  const proAuth = () => {
    const t = tokenFromHeader(opts.authHeader);
    if (!t || t.kind !== 'pro') throw new DemoApiError(401, 'Sesión requerida.');
    return t;
  };
  const patientAuth = () => {
    const t = tokenFromHeader(opts.authHeader);
    if (!t || t.kind !== 'patient') throw new DemoApiError(401, 'Ingresá con tu celular.');
    return t;
  };

  /* -------- auth profesional -------- */
  if (path === '/auth/login' && method === 'POST') {
    const email = String(b.email ?? '').toLowerCase();
    const password = String(b.password ?? '');
    const user =
      s.users.find((u) => u.email.toLowerCase() === email && u.password === password) ??
      s.users.find((u) => u.email.toLowerCase() === email); // acepta cualquier password en demo
    if (!user) throw new DemoApiError(401, 'Usuario o contraseña incorrectos.');
    const token = issueToken('pro', user.id);
    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: user.roles,
        accountId: user.accountId,
      },
    } as unknown as T;
  }

  if (path === '/auth/signup-owner' && method === 'POST') {
    const input = body as SignupOwnerInput;
    const email = input.email.toLowerCase();
    if (s.users.some((u) => u.email.toLowerCase() === email))
      throw new DemoApiError(409, 'Ese email ya está registrado.');
    const accountId = uid('acc-');
    const userId = uid('user-');
    const account: Account = {
      id: accountId,
      name: input.accountName,
      timezone: DEMO_TZ,
      whatsappNumber: null,
    };
    // En demo mantenemos una sola cuenta activa como "actual" del owner nuevo,
    // pero la vista de panel usa el accountId del user, así que agregamos todo.
    s.account = account;
    s.users.push({
      id: userId,
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      roles: ['OWNER', 'PROFESSIONAL'],
      accountId,
    });
    const prof: Professional = {
      id: uid('prof-'),
      accountId,
      displayName: input.fullName,
      userId,
      user: { id: userId, email: input.email, fullName: input.fullName },
    };
    s.professionals.push(prof);
    persist();
    const token = issueToken('pro', userId);
    const response: SignupOwnerResponse = {
      accessToken: token,
      user: {
        id: userId,
        email: input.email,
        fullName: input.fullName,
        roles: ['OWNER', 'PROFESSIONAL'],
        accountId,
      },
      account,
    };
    return response as unknown as T;
  }

  /* -------- auth paciente -------- */
  if (path === '/patients/register' && method === 'POST') {
    const phone = String(b.phone ?? '').trim();
    let patient = s.patients.find((p) => p.phone === phone);
    if (!patient) {
      patient = {
        id: uid('pat-'),
        phone,
        fullName: String(b.fullName ?? ''),
        email: (b.email as string | undefined) ?? null,
      };
      s.patients.push(patient);
      persist();
    }
    return patient as unknown as T;
  }

  if (path === '/auth/patient/otp/request' && method === 'POST') {
    const response: OtpRequestResponse = { sent: true, simulated: true };
    return response as unknown as T;
  }

  if (path === '/auth/patient/otp/verify' && method === 'POST') {
    const phone = String(b.phone ?? '').trim();
    const code = String(b.code ?? '');
    if (code !== '000000')
      throw new DemoApiError(401, 'Código inválido. Para la demo usá 000000.');
    let patient = s.patients.find((p) => p.phone === phone);
    if (!patient) {
      patient = { id: uid('pat-'), phone, fullName: 'Paciente demo' };
      s.patients.push(patient);
      persist();
    }
    const token = issueToken('patient', patient.id);
    const response: PatientAuthResponse = { accessToken: token, patient };
    return response as unknown as T;
  }

  /* -------- cuenta -------- */
  if (path === '/accounts/me' && method === 'GET') {
    proAuth();
    return s.account as unknown as T;
  }
  if (path === '/accounts/me' && method === 'PATCH') {
    proAuth();
    const input = body as UpdateAccountInput;
    s.account = {
      ...s.account,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.whatsappNumber !== undefined ? { whatsappNumber: input.whatsappNumber } : {}),
    };
    persist();
    return s.account as unknown as T;
  }

  /* -------- profesionales -------- */
  if (path === '/professionals' && method === 'GET') {
    proAuth();
    return s.professionals as unknown as T;
  }
  if (path === '/professionals' && method === 'POST') {
    proAuth();
    const input = body as CreateProfessionalInput;
    const userId = uid('user-');
    const user = {
      id: userId,
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      roles: ['PROFESSIONAL'] as ('PROFESSIONAL')[],
      accountId: s.account.id,
    };
    s.users.push(user);
    const prof: Professional = {
      id: uid('prof-'),
      accountId: s.account.id,
      displayName: input.displayName,
      userId,
      user: { id: userId, email: input.email, fullName: input.fullName },
    };
    s.professionals.push(prof);
    persist();
    return prof as unknown as T;
  }

  /* -------- service types -------- */
  {
    const m = path.match(/^\/professionals\/([^/]+)\/service-types(?:\/([^/]+))?$/);
    const publicMatch = path.match(/^\/public\/professionals\/([^/]+)\/service-types$/);
    if (m || publicMatch) {
      const profId = (m?.[1] ?? publicMatch?.[1]) as string;
      const id = m?.[2];
      if (!id && method === 'GET') {
        return s.serviceTypes.filter((t) => t.professionalId === profId) as unknown as T;
      }
      if (!id && method === 'POST') {
        proAuth();
        const input = body as ServiceTypeInput;
        const created: ServiceType = {
          id: uid('srv-'),
          professionalId: profId,
          name: input.name,
          durationMinutes: input.durationMinutes,
          active: input.active ?? true,
        };
        s.serviceTypes.push(created);
        persist();
        return created as unknown as T;
      }
      if (id && method === 'PATCH') {
        proAuth();
        const input = body as Partial<ServiceTypeInput>;
        const target = s.serviceTypes.find((t) => t.id === id && t.professionalId === profId);
        if (!target) throw new DemoApiError(404, 'Servicio no encontrado.');
        Object.assign(target, input);
        persist();
        return target as unknown as T;
      }
      if (id && method === 'DELETE') {
        proAuth();
        s.serviceTypes = s.serviceTypes.filter((t) => t.id !== id);
        persist();
        return undefined as unknown as T;
      }
    }
  }

  /* -------- availability -------- */
  {
    const m = path.match(/^\/professionals\/([^/]+)\/availability(?:\/([^/]+))?$/);
    if (m) {
      const profId = m[1];
      const id = m[2];
      if (!id && method === 'GET') {
        proAuth();
        return s.availability.filter((a) => a.professionalId === profId) as unknown as T;
      }
      if (!id && method === 'POST') {
        proAuth();
        const input = body as AvailabilityInput;
        const created: AvailabilitySlot = {
          id: uid('av-'),
          professionalId: profId,
          dayOfWeek: input.dayOfWeek ?? null,
          specificDate: input.specificDate ?? null,
          startTime: input.startTime,
          endTime: input.endTime,
        };
        s.availability.push(created);
        persist();
        return created as unknown as T;
      }
      if (id && method === 'DELETE') {
        proAuth();
        s.availability = s.availability.filter((a) => a.id !== id);
        persist();
        return undefined as unknown as T;
      }
    }
  }

  /* -------- slots -------- */
  {
    const m = path.match(/^\/professionals\/([^/]+)\/slots$/);
    if (m && method === 'GET') {
      const profId = m[1];
      const serviceTypeId = String(query?.serviceTypeId ?? '');
      const from = String(query?.from ?? '');
      const to = String(query?.to ?? '');
      return computeSlots(profId, serviceTypeId, from, to) as unknown as T;
    }
  }

  /* -------- appointments (panel) -------- */
  if (path === '/appointments' && method === 'GET') {
    proAuth();
    const profId = String(query?.professionalId ?? '');
    const from = new Date(String(query?.from ?? ''));
    const to = new Date(String(query?.to ?? ''));
    const list = s.appointments
      .filter((a) => a.professionalId === profId)
      .filter((a) => {
        const start = new Date(a.startAt);
        return start >= from && start <= to;
      })
      .map((a) => enrichAppointment(s, a));
    return list as unknown as T;
  }

  {
    const m = path.match(/^\/appointments\/([^/]+)\/confirm$/);
    if (m && method === 'POST') {
      proAuth();
      const target = s.appointments.find((a) => a.id === m[1]);
      if (!target) throw new DemoApiError(404, 'Turno no encontrado.');
      target.status = 'CONFIRMED';
      persist();
      return enrichAppointment(s, target) as unknown as T;
    }
  }

  {
    const m = path.match(/^\/appointments\/([^/]+)$/);
    if (m && method === 'DELETE') {
      proAuth();
      const target = s.appointments.find((a) => a.id === m[1]);
      if (!target) throw new DemoApiError(404, 'Turno no encontrado.');
      // Cancelación por profesional: libera el cupo para reasignación.
      target.status = 'AVAILABLE_FOR_REASSIGNMENT' as AppointmentStatus;
      target.patientId = null;
      target.patient = null;
      persist();
      return enrichAppointment(s, target) as unknown as T;
    }

    const claim = path.match(/^\/appointments\/([^/]+)\/claim$/);
    if (claim && method === 'POST') {
      const t = patientAuth();
      const target = s.appointments.find((a) => a.id === claim[1]);
      if (!target) throw new DemoApiError(404, 'Turno no encontrado.');
      if (target.status !== 'AVAILABLE_FOR_REASSIGNMENT')
        throw new DemoApiError(409, 'El cupo ya fue tomado.');
      target.patientId = t.subjectId;
      target.status = 'SCHEDULED';
      target.origin = 'REASSIGNMENT';
      persist();
      return enrichAppointment(s, target) as unknown as T;
    }
  }

  if (path === '/waitlist' && method === 'GET') {
    proAuth();
    const profId = String(query?.professionalId ?? '');
    return s.waitlist
      .filter((w) => w.professionalId === profId)
      .map((w) => enrichWaitlist(s, w)) as unknown as T;
  }

  /* -------- público -------- */
  {
    const m = path.match(/^\/public\/accounts\/([^/]+)\/professionals$/);
    if (m && method === 'GET') {
      return s.professionals.map((p) => ({ ...p })) as unknown as T;
    }
  }

  if (path === '/public/open-slots' && method === 'GET') {
    const profId = query?.professionalId ? String(query.professionalId) : null;
    return s.appointments
      .filter((a) => a.status === 'AVAILABLE_FOR_REASSIGNMENT')
      .filter((a) => (profId ? a.professionalId === profId : true))
      .map((a) => enrichAppointment(s, a)) as unknown as T;
  }

  if (path === '/public/appointments' && method === 'POST') {
    const t = patientAuth();
    const input = body as CreatePublicAppointmentInput;
    const service = s.serviceTypes.find((x) => x.id === input.serviceTypeId);
    if (!service) throw new DemoApiError(400, 'Servicio inválido.');
    const start = new Date(input.startAt);
    const end = new Date(start.getTime() + service.durationMinutes * 60_000);
    const busy = activeAppointments(s, input.professionalId);
    if (busy.some((a) => overlaps(start, end, new Date(a.startAt), new Date(a.endAt))))
      throw new DemoApiError(409, 'Ese horario ya fue tomado.');
    const created: Appointment = {
      id: uid('apt-'),
      professionalId: input.professionalId,
      patientId: t.subjectId,
      serviceTypeId: input.serviceTypeId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: 'SCHEDULED',
      origin: 'WEB',
      createdAt: new Date().toISOString(),
    };
    s.appointments.push(created);
    persist();
    return enrichAppointment(s, created) as unknown as T;
  }

  if (path === '/public/me/appointments' && method === 'GET') {
    const t = patientAuth();
    return s.appointments
      .filter((a) => a.patientId === t.subjectId)
      .map((a) => enrichAppointment(s, a)) as unknown as T;
  }

  {
    const m = path.match(/^\/public\/appointments\/([^/]+)$/);
    if (m && method === 'DELETE') {
      const t = patientAuth();
      const target = s.appointments.find((a) => a.id === m[1] && a.patientId === t.subjectId);
      if (!target) throw new DemoApiError(404, 'Turno no encontrado.');
      target.status = 'AVAILABLE_FOR_REASSIGNMENT';
      target.patientId = null;
      persist();
      return undefined as unknown as T;
    }
  }

  if (path === '/public/waitlist' && method === 'POST') {
    const t = patientAuth();
    const input = body as JoinWaitlistInput;
    const created: WaitlistEntry = {
      id: uid('wl-'),
      patientId: t.subjectId,
      professionalId: input.professionalId,
      serviceTypeId: input.serviceTypeId ?? null,
      preferredDaysOfWeek: input.preferredDaysOfWeek ?? null,
      linkedAppointmentId: input.linkedAppointmentId ?? null,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    s.waitlist.push(created);
    persist();
    return enrichWaitlist(s, created) as unknown as T;
  }

  if (path === '/public/waitlist' && method === 'GET') {
    const t = patientAuth();
    return s.waitlist
      .filter((w) => w.patientId === t.subjectId)
      .map((w) => enrichWaitlist(s, w)) as unknown as T;
  }

  {
    const m = path.match(/^\/public\/waitlist\/([^/]+)$/);
    if (m && method === 'DELETE') {
      const t = patientAuth();
      const target = s.waitlist.find((w) => w.id === m[1] && w.patientId === t.subjectId);
      if (!target) throw new DemoApiError(404, 'Entrada no encontrada.');
      s.waitlist = s.waitlist.filter((w) => w !== target);
      persist();
      return undefined as unknown as T;
    }
  }

  throw new DemoApiError(404, `Ruta demo no implementada: ${method} ${path}`);
}

export { DemoApiError };
