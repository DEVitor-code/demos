// Efeitos dos botões: texto que rola ao passar o mouse e atração magnética.

export function iniciarBotoes(gsap) {
  // Duplica o rótulo para o efeito de rolagem (a cópia é ignorada por leitores de tela).
  document.querySelectorAll('.botao').forEach((botao) => {
    if (botao.querySelector('.botao__rotulo')) return;
    const nos = [...botao.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (!nos.length) return;
    const texto = nos.map((n) => n.textContent.trim()).join(' ');
    nos.forEach((n) => n.remove());

    const rotulo = document.createElement('span');
    rotulo.className = 'botao__rotulo';
    const pilha = document.createElement('span');
    pilha.className = 'botao__pilha';
    const a = document.createElement('span');
    a.textContent = texto;
    const b = document.createElement('span');
    b.textContent = texto;
    b.setAttribute('aria-hidden', 'true');
    pilha.append(a, b);
    rotulo.append(pilha);
    botao.append(rotulo);
  });

  const ponteiroFino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!ponteiroFino || reduzir) return;

  document.querySelectorAll('[data-magnetico]').forEach((el) => {
    const forca = el.classList.contains('botao--grande') ? 0.32 : 0.26;
    const interno = el.querySelector('.botao__rotulo');
    let mover = null;

    // As funções quickTo são recriadas a cada entrada porque a volta elástica as substitui.
    el.addEventListener('pointerenter', () => {
      const op = { duration: 0.6, ease: 'power3' };
      mover = {
        x: gsap.quickTo(el, 'x', op),
        y: gsap.quickTo(el, 'y', op),
        ix: interno && gsap.quickTo(interno, 'x', op),
        iy: interno && gsap.quickTo(interno, 'y', op),
      };
    });

    el.addEventListener('pointermove', (e) => {
      if (!mover) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      mover.x(dx * forca);
      mover.y(dy * forca * 1.3);
      mover.ix?.(dx * 0.1);
      mover.iy?.(dy * 0.12);
    });

    el.addEventListener('pointerleave', () => {
      mover = null;
      const volta = { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.38)', overwrite: true };
      gsap.to(el, volta);
      if (interno) gsap.to(interno, volta);
    });
  });
}
