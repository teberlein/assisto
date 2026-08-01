import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Asissto',
    template: '%s · Asissto',
  },
  description:
    'Gestión de turnos con reasignación automática: si alguien cancela, el cupo no se pierde.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Deja que el contenido use toda la pantalla en celulares con notch/home bar;
  // habilita los env(safe-area-inset-*) que usamos en el nav del paciente.
  viewportFit: 'cover',
  themeColor: '#155252',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
