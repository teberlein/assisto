import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Ingresar' };

export default function LoginPage() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">
        Ingresar al panel
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Para profesionales y dueños de cuenta.
      </p>

      <LoginForm />

      <p className="mt-6 text-sm text-slate-600">
        ¿Todavía no tenés cuenta?{' '}
        <Link
          href="/signup"
          className="font-medium text-brand-700 underline underline-offset-4"
        >
          Creá una
        </Link>
        .
      </p>
      <p className="mt-2 text-sm text-slate-600">
        ¿Sos paciente?{' '}
        <Link
          href="/ingresar"
          className="font-medium text-brand-700 underline underline-offset-4"
        >
          Ingresá con tu celular
        </Link>
        .
      </p>
    </div>
  );
}
