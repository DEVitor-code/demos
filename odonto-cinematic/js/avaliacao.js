// "Monte sua primeira consulta": o resumo se atualiza a cada escolha e
// gera a mensagem pronta para o WhatsApp.

const WHATSAPP = '5511900000000'; // número fictício da demo

const MAPA = {
  falta: { tratamento: 'implantes', quem: 'Dra. Helena Duarte' },
  cor: { tratamento: 'clareamento ou lentes de porcelana', quem: 'Dr. Rafael Moura' },
  formato: { tratamento: 'lentes de porcelana', quem: 'Dr. Rafael Moura' },
  desalinhados: { tratamento: 'alinhadores invisíveis', quem: 'Dra. Yumi Sato' },
  protese: { tratamento: 'reabilitação sobre implantes', quem: 'Dra. Helena Duarte' },
  dor: { tratamento: 'aliviar a dor antes de qualquer outro tratamento', quem: null },
};

const juntar = (itens) => {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
};
const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function iniciarAvaliacao(gsap) {
  const form = document.querySelector('[data-avaliacao]');
  if (!form) return;
  const vazio = document.querySelector('[data-vazio]');
  const resumo = document.querySelector('[data-resumo]');
  const indicacao = document.querySelector('[data-indicacao]');
  const quem = document.querySelector('[data-quem]');
  const duracao = document.querySelector('[data-duracao]');
  const contador = document.querySelector('[data-contador]');
  const botao = document.querySelector('[data-whatsapp]');
  const numero = { v: 0 };
  let anterior = '';

  const rotuloDe = (input) => input.closest('.opcao').textContent.trim();

  function atualizar() {
    const marcadas = [...form.querySelectorAll('input[name="queixa"]:checked')];
    const queixas = marcadas.map((i) => i.value);
    const quando = form.querySelector('input[name="quando"]:checked')?.value;
    const horario = form.querySelector('input[name="horario"]:checked')?.value;

    gsap.to(numero, {
      v: queixas.length,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => { contador.textContent = Math.round(numero.v); },
    });

    const temItens = queixas.length > 0;
    vazio.hidden = temItens;
    resumo.hidden = !temItens;

    if (temItens) {
      const tratamentos = [...new Set(queixas.map((q) => MAPA[q].tratamento))];
      const pessoas = [...new Set(queixas.map((q) => MAPA[q].quem).filter(Boolean))];
      const novaIndicacao = capitalizar(juntar(tratamentos)) + '.';
      const novoQuem = pessoas.length ? juntar(pessoas) : 'Quem estiver de plantão no dia';
      const novaDuracao = queixas.includes('dor')
        ? 'Encaixe em até 24 horas para cuidar da dor'
        : tratamentos.length > 2 ? '90 minutos' : '60 minutos';

      const assinatura = novaIndicacao + novoQuem + novaDuracao;
      if (assinatura !== anterior) {
        indicacao.textContent = novaIndicacao;
        quem.textContent = novoQuem;
        duracao.textContent = novaDuracao;
        gsap.fromTo(resumo.querySelectorAll('dd'),
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.05, ease: 'power3.out', overwrite: true });
        anterior = assinatura;
      }
    } else {
      anterior = '';
    }

    const linhas = ['Olá! Quero agendar uma avaliação na Opala.'];
    if (temItens) linhas.push(`O que me incomoda: ${juntar(marcadas.map(rotuloDe)).toLowerCase()}.`);
    if (quando) linhas.push(`Quero começar: ${quando.toLowerCase()}.`);
    if (horario) linhas.push(`Melhor horário: ${horario.toLowerCase()}.`);
    botao.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(linhas.join('\n'))}`;
  }

  form.addEventListener('change', atualizar);

  // Os links dos tratamentos chegam aqui com a queixa correspondente já marcada.
  document.querySelectorAll('[data-preseleciona]').forEach((link) => {
    link.addEventListener('click', () => {
      const alvo = form.querySelector(`input[name="queixa"][value="${link.dataset.preseleciona}"]`);
      if (alvo && !alvo.checked) {
        alvo.checked = true;
        atualizar();
      }
    });
  });

  atualizar();
}
