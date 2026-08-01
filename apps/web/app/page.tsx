import Link from 'next/link';

const PROFESSIONAL_LINKS = [
  { href: '/agenda', label: 'Ver mi agenda' },
  { href: '/login', label: 'Ingresar' },
  { href: '/signup', label: 'Crear una cuenta' },
];

const PATIENT_LINKS = [
  { href: '/reservar', label: 'Sacar un turno' },
  { href: '/turnos', label: 'Mis turnos' },
  { href: '/cupos', label: 'Cupos liberados ahora' },
  { href: '/ingresar', label: 'Ingresar con mi celular' },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-full max-w-4xl flex-col justify-center px-4 py-12">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
          Asissto
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">
          Turnos que no se pierden
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Cuando alguien cancela, el motor de reasignación avisa automáticamente
          a los pacientes anotados en la lista de espera para que el cupo se
          vuelva a ocupar.
        </p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Soy profesional
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Agenda semanal, disponibilidad, servicios y lista de espera.
          </p>
          <ul className="mt-4 space-y-2">
            {PROFESSIONAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Soy paciente</h2>
          <p className="mt-1 text-sm text-slate-600">
            Sacá turno, cancelá y anotate para que te avisemos si se libera uno
            antes.
          </p>
          <ul className="mt-4 space-y-2">
            {PATIENT_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
