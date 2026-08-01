import type { Metadata } from 'next';
import Link from 'next/link';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default function SignupPage() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Crear una cuenta</h1>
      <p className="mt-1 text-sm text-slate-600">
        Creamos la cuenta y tu usuario dueño. Después vas a poder dar de alta a
        los profesionales del equipo.
      </p>

      <SignupForm />

      <p className="mt-6 text-sm text-slate-600">
        ¿Ya tenés cuenta?{' '}
        <Link
          href="/login"
          className="font-medium text-brand-700 underline underline-offset-4"
        >
          Ingresá
        </Link>
        .
      </p>
    </div>
  );
}
