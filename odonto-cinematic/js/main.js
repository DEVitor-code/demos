// Opala Odontologia — orquestra a abertura, o scroll e as seções.
import { Sequencia } from './sequencia.js';
import { iniciarBotoes } from './botoes.js';
import { iniciarAvaliacao } from './avaliacao.js';

const { gsap, ScrollTrigger, SplitText, ScrambleTextPlugin, CustomEase, Lenis } = window;
gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, CustomEase);
CustomEase.create('opala', '0.16, 1, 0.3, 1');

const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const telaPequena = window.matchMedia('(max-width: 767px)').matches;
const doc = document.documentElement;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const tresDigitos = (n) => String(n).padStart(3, '0');

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

/* ------------------------------------------------------------------ */
/* Scroll suave                                                        */
/* ------------------------------------------------------------------ */
let lenis = null;
if (!reduzir) {
  lenis = new Lenis({ lerp: 0.085, smoothWheel: true, anchors: { offset: 0 } });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
const irPara = (alvo) => {
  if (lenis) lenis.scrollTo(alvo, { duration: 1.6 });
  else document.querySelector(alvo)?.scrollIntoView();
};

iniciarBotoes(gsap);
iniciarAvaliacao(gsap);

/* ------------------------------------------------------------------ */
/* Topo: tema conforme a seção e esconder ao descer                    */
/* ------------------------------------------------------------------ */
const topo = $('[data-topo]');
topo.dataset.tema = 'escuro';
const secoesTema = $$('main > section[data-tema], footer[data-tema]');
let progressoRefletor = 0;

// O tema do topo segue a seção que está passando por baixo dele.
function atualizarTema() {
  let tema = 'escuro';
  for (const secao of secoesTema) {
    const r = secao.getBoundingClientRect();
    if (r.top <= 38 && r.bottom > 38) {
      tema = secao.dataset.tema;
      // No fim do refletor a tela já ficou cor de porcelana.
      if (secao.classList.contains('refletor') && progressoRefletor > 0.9) tema = 'claro';
      break;
    }
  }
  if (topo.dataset.tema !== tema) topo.dataset.tema = tema;
}

ScrollTrigger.create({
  start: 0,
  end: 'max',
  onUpdate: (st) => {
    const descendo = st.direction === 1 && st.scroll() > 160;
    topo.classList.toggle('escondido', descendo && !doc.classList.contains('menu-aberto'));
    atualizarTema();
  },
  onRefresh: atualizarTema,
});

// Menu móvel
const abrirMenu = $('.menu-movel__abrir');
const menuMovel = $('#menu-movel');
const fecharMenu = () => {
  abrirMenu.setAttribute('aria-expanded', 'false');
  menuMovel.hidden = true;
  doc.classList.remove('menu-aberto');
  lenis?.start();
};
abrirMenu.addEventListener('click', () => {
  const abrir = abrirMenu.getAttribute('aria-expanded') !== 'true';
  if (!abrir) return fecharMenu();
  abrirMenu.setAttribute('aria-expanded', 'true');
  menuMovel.hidden = false;
  doc.classList.add('menu-aberto');
  lenis?.stop();
  gsap.fromTo($$('a', menuMovel),
    { y: 30, autoAlpha: 0 },
    { y: 0, autoAlpha: 1, stagger: 0.05, duration: 0.7, ease: 'opala', overwrite: true });
});
menuMovel.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (!link) return;
  e.preventDefault();
  fecharMenu();
  irPara(link.getAttribute('href'));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menuMovel.hidden) fecharMenu(); });

/* ------------------------------------------------------------------ */
/* 1. Herói — o sorriso acontece conforme a página desce               */
/* ------------------------------------------------------------------ */
const heroi = $('.heroi');
const pastaSorriso = telaPequena ? 'm' : 'd';
const seqSorriso = new Sequencia({
  canvas: $('.heroi__canvas'),
  total: 85,
  url: (i) => `assets/seq/sorriso/${pastaSorriso}/${tresDigitos(i + 1)}.webp`,
  foco: [0.5, 0.32],
  // Em telas largas o retrato fica à direita e se dissolve no escuro.
  retrato: (W, H) => (W / H > 0.95 ? { altura: 1.2, cx: 0.665, cy: 0.5 } : null),
});

const sorriso = { quadro: 0 };
const tlHeroi = gsap.timeline({
  defaults: { ease: 'none' },
  scrollTrigger: {
    trigger: heroi,
    start: 'top top',
    end: '+=240%',
    pin: true,
    scrub: true,
    anticipatePin: 1,
  },
});
tlHeroi
  .to(sorriso, { quadro: 84, duration: 0.84, onUpdate: () => seqSorriso.irPara(sorriso.quadro) }, 0)
  .to('.heroi__luz', { opacity: 0, duration: 0.55 }, 0)
  .to('.heroi__rolar', { autoAlpha: 0, duration: 0.06 }, 0)
  .fromTo('.legenda--1', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.08 }, 0.2)
  .to('.legenda--1', { autoAlpha: 0, y: -24, duration: 0.08 }, 0.44)
  .fromTo('.legenda--2', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.08 }, 0.5)
  .to('.legenda--2', { autoAlpha: 0, y: -24, duration: 0.08 }, 0.76)
  .fromTo('.heroi__texto',
    { autoAlpha: 1, y: 0, filter: 'blur(0px)' },
    { autoAlpha: 0, y: -60, filter: 'blur(8px)', duration: 0.2, immediateRender: false }, 0.8)
  .to('.heroi__canvas', { scale: 1.06, duration: 1 }, 0);

/* ------------------------------------------------------------------ */
/* 2. Manifesto — palavras acendem                                     */
/* ------------------------------------------------------------------ */
const manifesto = $('[data-palavras]');
const splitManifesto = SplitText.create(manifesto, { type: 'words', wordsClass: 'palavra' });
gsap.to(splitManifesto.words, {
  opacity: 1,
  ease: 'none',
  stagger: 0.12,
  scrollTrigger: {
    trigger: manifesto,
    start: 'top 78%',
    end: 'bottom 52%',
    scrub: true,
  },
});

/* ------------------------------------------------------------------ */
/* 3. Refletor — a luz acende e a página clareia                       */
/* ------------------------------------------------------------------ */
const seqLuz = new Sequencia({
  canvas: $('.refletor__canvas'),
  total: 57,
  url: (i) => `assets/seq/refletor/${tresDigitos(i + 1)}.webp`,
  foco: [0.44, 0.3],
});
const QUADRO_ACENDE = 25;
const luz = { quadro: 0 };
const tempoAcende = 0.72 * (QUADRO_ACENDE / 56);
const splitRefletor = SplitText.create('.refletor__texto h2', { type: 'lines', mask: 'lines', linesClass: 'linha' });

const tlLuz = gsap.timeline({
  defaults: { ease: 'none' },
  scrollTrigger: {
    trigger: '.refletor',
    start: 'top top',
    end: '+=200%',
    pin: true,
    scrub: true,
    anticipatePin: 1,
    onUpdate: (st) => {
      progressoRefletor = st.progress;
      atualizarTema();
    },
  },
});
tlLuz
  .to(luz, { quadro: 56, duration: 0.72, onUpdate: () => seqLuz.irPara(luz.quadro) }, 0)
  .from(splitRefletor.lines, { yPercent: 110, duration: 0.12, stagger: 0.03, ease: 'power2.out' }, 0.02)
  .from('.refletor__texto p', { autoAlpha: 0, y: 20, duration: 0.1 }, 0.12)
  .to('.refletor__veu', { opacity: 0.12, duration: 0.025 }, tempoAcende)
  .to('.refletor__flash', { opacity: 0.9, duration: 0.02 }, tempoAcende)
  .to('.refletor__flash', { opacity: 0, duration: 0.16 }, tempoAcende + 0.02)
  .to('.refletor__texto', { autoAlpha: 0, y: -40, duration: 0.1 }, 0.5)
  .to('.refletor__porcelana', { opacity: 1, duration: 0.2 }, 0.78);

/* ------------------------------------------------------------------ */
/* Títulos que entram linha a linha                                    */
/* ------------------------------------------------------------------ */
if (!reduzir) {
  $$('[data-linhas]').forEach((titulo) => {
    SplitText.create(titulo, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'linha',
      autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, {
        yPercent: 115,
        duration: 1.2,
        stagger: 0.08,
        ease: 'opala',
        scrollTrigger: { trigger: titulo, start: 'top 84%', once: true },
      }),
    });
  });
}

/* ------------------------------------------------------------------ */
/* 4. Tratamentos — mídia troca com luz atravessando                   */
/* ------------------------------------------------------------------ */
const itensTrat = $$('.tratamento');
const midias = new Map($$('.moldura__item').map((m) => [m.dataset.midia, m]));
const legendaMoldura = $('[data-moldura-legenda]');
const moldura = $('[data-moldura]');
let midiaAtiva = 'implantes';
let molduraVisivel = false;

const tocar = (el) => { if (el?.tagName === 'VIDEO') el.play().catch(() => {}); };
const pausar = (el) => { if (el?.tagName === 'VIDEO') el.pause(); };

function trocarMidia(nome) {
  if (nome === midiaAtiva) return;
  const antiga = midias.get(midiaAtiva);
  const nova = midias.get(nome);
  midiaAtiva = nome;
  gsap.killTweensOf(nova);
  midias.forEach((m) => { m.style.zIndex = m === nova ? 2 : m === antiga ? 1 : 0; });
  nova.classList.add('ativo');
  if (molduraVisivel) tocar(nova);
  gsap.fromTo(nova,
    { clipPath: 'inset(100% 0% 0% 0%)', scale: 1.14 },
    {
      clipPath: 'inset(0% 0% 0% 0%)',
      scale: 1,
      duration: reduzir ? 0.01 : 1.15,
      ease: 'opala',
      onComplete: () => {
        midias.forEach((m) => { if (m !== nova) { m.classList.remove('ativo'); pausar(m); } });
      },
    });
  if (!reduzir) {
    gsap.fromTo('.moldura__brilho', { xPercent: -130 }, { xPercent: 130, duration: 1.1, ease: 'power2.inOut' });
  }
  const item = itensTrat.find((li) => li.dataset.tratamento === nome);
  gsap.to(legendaMoldura, {
    duration: reduzir ? 0.01 : 0.9,
    scrambleText: { text: item.dataset.legenda, chars: 'abcdefghijklmnopqrstuvwxyz', speed: 0.6 },
    ease: 'none',
  });
}

function abrirTratamento(li, abrir) {
  const botao = $('.tratamento__botao', li);
  const corpo = $('.tratamento__corpo', li);
  botao.setAttribute('aria-expanded', String(abrir));
  corpo.inert = !abrir;
  gsap.to(corpo, { height: abrir ? 'auto' : 0, duration: reduzir ? 0.01 : 0.7, ease: 'opala' });
}

itensTrat.forEach((li) => {
  const corpo = $('.tratamento__corpo', li);
  const aberto = li.classList.contains('ativo');
  gsap.set(corpo, { height: aberto ? 'auto' : 0 });
  corpo.inert = !aberto;

  const ativar = () => {
    itensTrat.forEach((o) => o.classList.toggle('ativo', o === li));
    trocarMidia(li.dataset.tratamento);
  };
  $('.tratamento__botao', li).addEventListener('click', () => {
    const abrir = $('.tratamento__botao', li).getAttribute('aria-expanded') !== 'true';
    itensTrat.forEach((o) => { if (o !== li) abrirTratamento(o, false); });
    abrirTratamento(li, abrir);
    ativar();
    setTimeout(() => ScrollTrigger.refresh(), 750);
  });
  if (window.matchMedia('(hover: hover)').matches) {
    $('.tratamento__botao', li).addEventListener('pointerenter', ativar);
  }
});

// Ao tirar o mouse da lista, a mídia volta para o tratamento que está aberto.
if (window.matchMedia('(hover: hover)').matches) {
  $('.tratamentos__lista').addEventListener('pointerleave', () => {
    const aberto = itensTrat.find((li) => $('.tratamento__botao', li).getAttribute('aria-expanded') === 'true');
    if (!aberto) return;
    itensTrat.forEach((o) => o.classList.toggle('ativo', o === aberto));
    trocarMidia(aberto.dataset.tratamento);
  });
}

ScrollTrigger.create({
  trigger: moldura,
  start: 'top bottom',
  end: 'bottom top',
  onToggle: (st) => {
    molduraVisivel = st.isActive;
    const m = midias.get(midiaAtiva);
    if (st.isActive) tocar(m); else pausar(m);
  },
});

/* ------------------------------------------------------------------ */
/* 5. Implante em 3D                                                   */
/* ------------------------------------------------------------------ */
const secImplante = $('.implante');
const estado3d = { separar: 0, giro: 0 };
let cena3d = null;
let pedindo3d = null;
const carregar3d = () => {
  if (!pedindo3d) {
    pedindo3d = import('./implante3d.js')
      .then((m) => {
        cena3d = m.criarCena($('.implante__canvas'), $('.implante__rotulos'));
        cena3d.aplicar(estado3d);
      })
      .catch((erro) => {
        console.warn('3D indisponível:', erro);
        secImplante.classList.add('sem-3d');
      });
  }
  return pedindo3d;
};
ScrollTrigger.create({ trigger: secImplante, start: 'top 250%', once: true, onEnter: carregar3d });

$('.implante__rotulos').addEventListener('rotulo:entrou', (e) => {
  if (reduzir) return;
  const titulo = $('b', e.target);
  gsap.to(titulo, {
    duration: 0.8,
    scrambleText: { text: titulo.textContent, chars: 'ãçéíóúabcdefgilmnoprstuz', revealDelay: 0.2, speed: 0.5 },
  });
});

const fases = $$('.implante__fase');
// No celular o texto de abertura sai logo, para as peças terem a tela toda.
const saidaTextoImplante = window.matchMedia('(max-width: 899px)').matches ? 0.08 : 0.74;
const tlImplante = gsap.timeline({
  defaults: { ease: 'none' },
  onUpdate: () => cena3d?.aplicar(estado3d),
  scrollTrigger: {
    trigger: secImplante,
    start: 'top top',
    end: '+=330%',
    pin: true,
    scrub: true,
    anticipatePin: 1,
    onToggle: (st) => {
      if (st.isActive) carregar3d().then(() => cena3d?.ativar(true));
      else cena3d?.ativar(false);
    },
  },
});
tlImplante
  .to(estado3d, { separar: 1, duration: 0.56 }, 0.06)
  .to(estado3d, { separar: 0, duration: 0.18, ease: 'power2.inOut' }, 0.72)
  .to(estado3d, { giro: 1, duration: 1 }, 0)
  .to(fases[0], { autoAlpha: 0, y: -24, duration: 0.06 }, saidaTextoImplante)
  .fromTo(fases[1], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.08 }, 0.86)
  .to('.implante__dica', { autoAlpha: 0, duration: 0.05 }, 0.7);

/* ------------------------------------------------------------------ */
/* 6. Como funciona — trilho horizontal no desktop                     */
/* ------------------------------------------------------------------ */
const mm = gsap.matchMedia();
mm.add('(min-width: 960px)', () => {
  const trilho = $('.metodo__trilho');
  const barra = $('.metodo__progresso i');
  const distancia = () => Math.max(0, trilho.scrollWidth - window.innerWidth);
  const trilhoTween = gsap.to(trilho, {
    x: () => -distancia(),
    ease: 'none',
    scrollTrigger: {
      trigger: '.metodo',
      start: 'top top',
      end: () => `+=${distancia()}`,
      pin: true,
      scrub: true,
      invalidateOnRefresh: true,
      anticipatePin: 1,
      onUpdate: (st) => gsap.set(barra, { scaleX: st.progress }),
    },
  });
  $$('.etapa__midia').forEach((caixa) => {
    const midia = caixa.firstElementChild;
    gsap.fromTo(midia, { xPercent: -6, scale: 1.16 }, {
      xPercent: 6,
      ease: 'none',
      scrollTrigger: { trigger: caixa, containerAnimation: trilhoTween, start: 'left right', end: 'right left', scrub: true },
    });
  });
  ScrollTrigger.sort();
});

// Vídeos das etapas e do contato tocam só quando aparecem.
const observadorVideo = new IntersectionObserver((entradas) => {
  entradas.forEach((en) => {
    if (en.isIntersecting) en.target.play().catch(() => {});
    else en.target.pause();
  });
}, { threshold: 0.15 });
$$('.etapa__midia video, .contato__video').forEach((v) => observadorVideo.observe(v));

/* ------------------------------------------------------------------ */
/* 8. Equipe — retratos com leve paralaxe                              */
/* ------------------------------------------------------------------ */
$$('.pessoa__foto img').forEach((img) => {
  gsap.fromTo(img, { yPercent: -6 }, {
    yPercent: 0,
    ease: 'none',
    scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
  });
});

/* ------------------------------------------------------------------ */
/* 9. Depoimentos                                                      */
/* ------------------------------------------------------------------ */
(() => {
  const falas = $$('.fala');
  const fundos = $$('.depoimentos__fundos img');
  const barras = $$('.depoimentos__barras b');
  const splits = falas.map((f) => SplitText.create($('p', f), { type: 'lines', mask: 'lines', linesClass: 'linha' }));
  const DURACAO = 7;
  let atual = 0;
  let relogio = null;
  let visivel = false;
  let pausado = false;

  function mostrar(i, direcao = 1) {
    const anterior = atual;
    atual = (i + falas.length) % falas.length;
    falas.forEach((f, k) => f.classList.toggle('ativa', k === atual));
    if (anterior !== atual) {
      gsap.to(fundos[anterior], { opacity: 0, duration: 1.2, ease: 'power2.inOut' });
      gsap.fromTo(fundos[atual], { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: reduzir ? 0.01 : 2.4, ease: 'opala' });
      if (!reduzir) {
        gsap.fromTo(splits[atual].lines,
          { yPercent: 110 * direcao },
          { yPercent: 0, duration: 1, stagger: 0.07, ease: 'opala', overwrite: true });
        gsap.fromTo($('figcaption', falas[atual]),
          { autoAlpha: 0, y: 12 },
          { autoAlpha: 1, y: 0, duration: 0.8, delay: 0.3, ease: 'opala', overwrite: true });
      }
    }
    barras.forEach((b, k) => gsap.set(b, { scaleX: k < atual ? 1 : 0 }));
    relogio?.kill();
    if (reduzir) return;
    relogio = gsap.to(barras[atual], {
      scaleX: 1,
      duration: DURACAO,
      ease: 'none',
      paused: !visivel || pausado,
      onComplete: () => mostrar(atual + 1),
    });
  }
  const sincronizar = () => {
    if (!relogio) return;
    if (visivel && !pausado) relogio.resume(); else relogio.pause();
  };

  $('[data-proximo]').addEventListener('click', () => mostrar(atual + 1, 1));
  $('[data-anterior]').addEventListener('click', () => mostrar(atual - 1, -1));
  const secao = $('.depoimentos');
  secao.addEventListener('pointerenter', () => { pausado = true; sincronizar(); });
  secao.addEventListener('pointerleave', () => { pausado = false; sincronizar(); });
  secao.addEventListener('focusin', () => { pausado = true; sincronizar(); });
  secao.addEventListener('focusout', () => { pausado = false; sincronizar(); });
  ScrollTrigger.create({
    trigger: secao,
    start: 'top 70%',
    end: 'bottom 30%',
    onToggle: (st) => { visivel = st.isActive; sincronizar(); },
  });
  gsap.set(fundos[0], { opacity: 1 });
  mostrar(0);
})();

/* ------------------------------------------------------------------ */
/* Rodapé — a marca se expande                                         */
/* ------------------------------------------------------------------ */
gsap.fromTo('.rodape__marca', { '--wdth': 62 }, {
  '--wdth': 125,
  ease: 'none',
  scrollTrigger: { trigger: '.rodape', start: 'top bottom', end: 'bottom bottom', scrub: true },
});

/* ------------------------------------------------------------------ */
/* Abertura                                                            */
/* ------------------------------------------------------------------ */
(() => {
  const abertura = $('.abertura');
  const contagem = $('[data-contagem]');
  const barra = $('.abertura__barra i');
  const marca = $('.abertura__marca');
  const exibido = { v: 0 };
  let alvo = 0;

  const atualizar = () => {
    exibido.v += (alvo * 100 - exibido.v) * 0.14;
    const v = Math.min(100, exibido.v);
    contagem.textContent = Math.round(v);
    barra.style.transform = `scaleX(${v / 100})`;
    marca.style.setProperty('--wdth', (62 + (v / 100) * 63).toFixed(1));
  };
  gsap.ticker.add(atualizar);

  const quadros = seqSorriso.carregar({ criticos: 22, aoProgresso: (p) => { alvo = Math.max(alvo, p * 0.92); } });
  const fontes = document.fonts?.ready ?? Promise.resolve();
  const limite = new Promise((r) => setTimeout(r, 9000));

  Promise.race([Promise.all([quadros, fontes]), limite]).then(() => {
    alvo = 1;
    // O refletor carrega em segundo plano depois do herói.
    seqLuz.carregar({ criticos: 57 });

    const splitTitulo = SplitText.create('.heroi__titulo', { type: 'lines', mask: 'lines', linesClass: 'linha' });
    const saida = gsap.timeline({
      delay: 0.55,
      defaults: { ease: 'opala' },
      onStart: () => gsap.ticker.remove(atualizar),
      onComplete: () => {
        abertura.remove();
        // Ao recarregar, o navegador pode tentar voltar ao ponto anterior; a abertura sempre leva ao topo.
        window.scrollTo(0, 0);
        lenis?.scrollTo(0, { immediate: true, force: true });
        document.body.classList.remove('carregando');
        lenis?.start();
        ScrollTrigger.refresh();
      },
    });
    saida
      .add(() => {
        contagem.textContent = '100';
        barra.style.transform = 'scaleX(1)';
        marca.style.setProperty('--wdth', '125');
      })
      .to(marca, { yPercent: -40, autoAlpha: 0, duration: 0.9 }, 0.15)
      .to('.abertura__rodape', { autoAlpha: 0, duration: 0.5 }, 0.15)
      .to(abertura, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.3, ease: 'expo.inOut' }, 0.35)
      .from('.heroi__canvas', { scale: 1.18, duration: 2.4 }, 0.35)
      .from('.heroi__luz', { opacity: 0.95, duration: 2.2, ease: 'power2.out' }, 0.5)
      .from('.heroi__local', { autoAlpha: 0, y: 16, duration: 1 }, 1.05)
      .from(splitTitulo.lines, { yPercent: 115, duration: 1.3, stagger: 0.1 }, 1.0)
      .from('.heroi__apoio', { autoAlpha: 0, y: 24, duration: 1.1 }, 1.35)
      .from('.heroi__acoes > *', { autoAlpha: 0, y: 24, duration: 1.1, stagger: 0.08 }, 1.5)
      // fromTo: o CSS da abertura deixa o topo invisível, então o valor final precisa ser explícito.
      .fromTo('.topo', { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 }, 1.4)
      .from('.heroi__rolar', { autoAlpha: 0, duration: 1 }, 1.9);
  });
})();

// Fontes ou imagens que mudem a altura das seções pedem recálculo.
window.addEventListener('load', () => ScrollTrigger.refresh());
