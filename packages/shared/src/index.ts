// Tipos compartidos entre api y web. Se llenará en fase 2 cuando arranquemos Next.
// Los enums de Prisma se re-exportan desde acá para no acoplar el web al client de Prisma.

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'AVAILABLE_FOR_REASSIGNMENT'
  | 'CANCELLED'
  | 'COMPLETED';

export type AppointmentOrigin = 'WEB' | 'WHATSAPP' | 'REASSIGNMENT';

export type Role = 'OWNER' | 'PROFESSIONAL';
