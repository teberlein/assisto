-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'AVAILABLE_FOR_REASSIGNMENT', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AppointmentOrigin" AS ENUM ('WEB', 'WHATSAPP', 'REASSIGNMENT');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'SIMULATED');

-- CreateEnum
CREATE TYPE "NotificationResponse" AS ENUM ('ACCEPTED', 'DECLINED', 'NO_RESPONSE', 'LOST_RACE');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "planTier" TEXT NOT NULL DEFAULT 'starter',
    "whatsappNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "roles" "Role"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professional" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "googleCalendarId" TEXT,
    "googleRefreshToken" TEXT,
    "googleTokenExpiry" TIMESTAMP(3),
    "googleSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceType" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "specificDate" DATE,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientOtpChallenge" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "patientId" TEXT,
    "previousPatientId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "origin" "AppointmentOrigin" NOT NULL,
    "originalAppointmentId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "googleEventId" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "autoCancelAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "notifyRound" INTEGER NOT NULL DEFAULT 0,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "serviceTypeId" TEXT,
    "preferredDaysOfWeek" INTEGER[],
    "linkedAppointmentId" TEXT,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "waitlistEntryId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowLabel" TEXT NOT NULL,
    "response" "NotificationResponse",
    "respondedAt" TIMESTAMP(3),
    "externalId" TEXT,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'IDLE',
    "context" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReassignmentEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "previousPatientId" TEXT NOT NULL,
    "newPatientId" TEXT NOT NULL,
    "waitlistEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReassignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_whatsappNumber_key" ON "Account"("whatsappNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Professional_userId_key" ON "Professional"("userId");

-- CreateIndex
CREATE INDEX "Professional_accountId_idx" ON "Professional"("accountId");

-- CreateIndex
CREATE INDEX "ServiceType_professionalId_idx" ON "ServiceType"("professionalId");

-- CreateIndex
CREATE INDEX "AvailabilitySlot_professionalId_idx" ON "AvailabilitySlot"("professionalId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_phone_key" ON "Patient"("phone");

-- CreateIndex
CREATE INDEX "PatientOtpChallenge_patientId_createdAt_idx" ON "PatientOtpChallenge"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_originalAppointmentId_key" ON "Appointment"("originalAppointmentId");

-- CreateIndex
CREATE INDEX "Appointment_professionalId_startAt_idx" ON "Appointment"("professionalId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_status_startAt_idx" ON "Appointment"("status", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_accountId_startAt_idx" ON "Appointment"("accountId", "startAt");

-- CreateIndex
CREATE INDEX "WaitlistEntry_professionalId_status_createdAt_idx" ON "WaitlistEntry"("professionalId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WaitlistEntry_patientId_idx" ON "WaitlistEntry"("patientId");

-- CreateIndex
CREATE INDEX "NotificationLog_appointmentId_sentAt_idx" ON "NotificationLog"("appointmentId", "sentAt");

-- CreateIndex
CREATE INDEX "NotificationLog_waitlistEntryId_idx" ON "NotificationLog"("waitlistEntryId");

-- CreateIndex
CREATE INDEX "NotificationLog_patientId_sentAt_idx" ON "NotificationLog"("patientId", "sentAt");

-- CreateIndex
CREATE INDEX "NotificationLog_externalId_idx" ON "NotificationLog"("externalId");

-- CreateIndex
CREATE INDEX "WhatsappSession_expiresAt_idx" ON "WhatsappSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappSession_accountId_phone_key" ON "WhatsappSession"("accountId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "InboundEvent_provider_externalId_key" ON "InboundEvent"("provider", "externalId");

-- CreateIndex
CREATE INDEX "ReassignmentEvent_appointmentId_idx" ON "ReassignmentEvent"("appointmentId");

-- CreateIndex
CREATE INDEX "ReassignmentEvent_createdAt_idx" ON "ReassignmentEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceType" ADD CONSTRAINT "ServiceType_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientOtpChallenge" ADD CONSTRAINT "PatientOtpChallenge_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_originalAppointmentId_fkey" FOREIGN KEY ("originalAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_waitlistEntryId_fkey" FOREIGN KEY ("waitlistEntryId") REFERENCES "WaitlistEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReassignmentEvent" ADD CONSTRAINT "ReassignmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
