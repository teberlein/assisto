import { normalizeInbound, toArgentineE164 } from './kapso-webhook.types';

describe('toArgentineE164', () => {
  it('inserta el 9 de celular que WhatsApp omite en números argentinos', () => {
    // wa_id que entrega Kapso (sin 9) -> E.164 de celular (con 9)
    expect(toArgentineE164('543464560100')).toBe('5493464560100');
    expect(toArgentineE164('543413272484')).toBe('5493413272484');
  });

  it('no duplica el 9 si el número ya lo trae', () => {
    expect(toArgentineE164('5493464560100')).toBe('5493464560100');
  });

  it('deja intactos los números de otros países', () => {
    expect(toArgentineE164('5511999998888')).toBe('5511999998888'); // Brasil
    expect(toArgentineE164('12025550123')).toBe('12025550123'); // EE.UU.
  });
});

describe('normalizeInbound', () => {
  it('canoniza el teléfono argentino entrante para que matchee al paciente', () => {
    const result = normalizeInbound({
      phone_number_id: 'pn-1',
      message: {
        id: 'wamid.ABC',
        type: 'text',
        from: '543464560100',
        text: { body: 'Hola' },
      },
    });

    expect(result).not.toBeNull();
    expect(result?.from).toBe('+5493464560100');
    expect(result?.text).toBe('Hola');
    expect(result?.buttonId).toBeNull();
  });

  it('extrae el buttonId de una respuesta interactiva y no lo trata como texto', () => {
    const result = normalizeInbound({
      message: {
        id: 'wamid.DEF',
        type: 'interactive',
        from: '543464560100',
        interactive: { type: 'button_reply', button_reply: { id: 'menu:book', title: 'Sacar turno' } },
      },
    });

    expect(result?.buttonId).toBe('menu:book');
    expect(result?.text).toBeNull();
  });

  it('ignora los ecos de nuestros propios envíos (outbound)', () => {
    const result = normalizeInbound({
      message: { id: 'wamid.GHI', from: '543464560100', kapso: { direction: 'outbound' } },
    });
    expect(result).toBeNull();
  });
});
