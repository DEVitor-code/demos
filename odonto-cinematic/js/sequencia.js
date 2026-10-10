// Sequência de quadros desenhada em <canvas>, controlada pelo scroll.
// Carrega primeiro os quadros-chave (espaçados) e depois preenche os intervalos,
// assim o scroll já funciona enquanto o resto termina de baixar.

export class Sequencia {
  /**
   * @param {object} op
   * @param {HTMLCanvasElement} op.canvas
   * @param {number} op.total            quantidade de quadros
   * @param {(i:number)=>string} op.url  endereço do quadro i (0..total-1)
   * @param {[number,number]} [op.foco]  ponto de foco no modo "cobrir" (0..1)
   * @param {(W:number,H:number)=>({altura:number,cx:number,cy:number}|null)} [op.retrato]
   *        quando devolve um objeto, desenha a imagem como retrato que se dissolve
   *        no fundo (altura relativa à tela e centro em frações da tela).
   */
  constructor({ canvas, total, url, foco = [0.5, 0.5], retrato = null }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.total = total;
    this.url = url;
    this.foco = foco;
    this.retrato = retrato;
    this.imgs = new Array(total);
    this.atual = 0;
    this.ultima = null;
    this.fundo = (getComputedStyle(canvas).getPropertyValue('--fundo') || '#0E131A').trim();
    this.fundoTransparente = Sequencia.transparente(this.fundo);
    this.pedido = 0;
    this.carregando = null;

    this.redimensionar = this.redimensionar.bind(this);
    this.observador = new ResizeObserver(this.redimensionar);
    this.observador.observe(canvas);
  }

  static transparente(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0)`;
  }

  /** Ordem de carregamento: primeiro, último e depois passos cada vez menores. */
  ordem() {
    const n = this.total;
    const vistos = new Set();
    const lista = [];
    const add = (i) => {
      if (i >= 0 && i < n && !vistos.has(i)) {
        vistos.add(i);
        lista.push(i);
      }
    };
    add(0);
    add(n - 1);
    for (let passo = 16; passo >= 1; passo = Math.floor(passo / 2)) {
      for (let i = 0; i < n; i += passo) add(i);
      if (passo === 1) break;
    }
    return lista;
  }

  /**
   * Começa a baixar os quadros. Resolve quando os `criticos` primeiros (na ordem
   * de prioridade) estiverem prontos; o restante continua em segundo plano.
   */
  carregar({ criticos = 24, aoProgresso } = {}) {
    if (this.carregando) return this.carregando;
    const lista = this.ordem();
    const meta = Math.min(criticos, lista.length);
    let feitos = 0;
    let indice = 0;

    this.carregando = new Promise((resolver) => {
      let resolvido = false;
      const proximo = () => {
        if (indice >= lista.length) return;
        const i = lista[indice++];
        const img = new Image();
        img.decoding = 'async';
        const fim = () => {
          if (img.naturalWidth) this.imgs[i] = img;
          feitos += 1;
          aoProgresso?.(Math.min(1, feitos / meta), feitos / lista.length);
          if (!this.ultima || i === this.atual) this.agendar(true);
          if (!resolvido && feitos >= meta) {
            resolvido = true;
            resolver();
          }
          proximo();
        };
        img.onload = () => (img.decode ? img.decode().catch(() => {}).finally(fim) : fim());
        img.onerror = fim;
        img.src = this.url(i);
      };
      for (let k = 0; k < 6; k += 1) proximo();
    });
    return this.carregando;
  }

  irPara(quadro) {
    const i = Math.max(0, Math.min(this.total - 1, Math.round(quadro)));
    if (i !== this.atual) {
      this.atual = i;
      this.agendar();
    }
  }

  agendar(forcar = false) {
    this.forcar = this.forcar || forcar;
    if (this.pedido) return;
    this.pedido = requestAnimationFrame(() => {
      this.pedido = 0;
      const f = this.forcar;
      this.forcar = false;
      this.desenhar(f);
    });
  }

  maisProxima(i) {
    if (this.imgs[i]) return this.imgs[i];
    for (let d = 1; d < this.total; d += 1) {
      if (this.imgs[i - d]) return this.imgs[i - d];
      if (this.imgs[i + d]) return this.imgs[i + d];
    }
    return null;
  }

  redimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.desenhar(true);
  }

  desenhar(forcar = false) {
    const img = this.maisProxima(this.atual);
    if (!img) return;
    if (!forcar && img === this.ultima) return;
    this.ultima = img;

    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    ctx.fillStyle = this.fundo;
    ctx.fillRect(0, 0, W, H);

    const r = this.retrato ? this.retrato(W, H) : null;
    if (r) {
      const escala = (H * r.altura) / ih;
      const dw = iw * escala;
      const dh = ih * escala;
      const x = W * r.cx - dw / 2;
      const y = H * r.cy - dh / 2;
      ctx.drawImage(img, x, y, dw, dh);
      this.dissolverBordas(x, y, dw, dh, W, H);
      return;
    }

    const escala = Math.max(W / iw, H / ih);
    const dw = iw * escala;
    const dh = ih * escala;
    ctx.drawImage(img, (W - dw) * this.foco[0], (H - dh) * this.foco[1], dw, dh);
  }

  /** Funde as bordas do retrato com a cor de fundo, como luz caindo no escuro. */
  dissolverBordas(x, y, dw, dh, W, H) {
    const ctx = this.ctx;
    const cor = this.fundo;
    const nada = this.fundoTransparente;
    const faixa = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, cor);
      g.addColorStop(1, nada);
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    };
    // Vinheta elíptica centrada no rosto: escurece os cantos (parede clara do fundo).
    ctx.save();
    ctx.translate(x + dw / 2, y + dh * 0.44);
    ctx.scale(dw * 0.62, dh * 0.6);
    const radial = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 1);
    radial.addColorStop(0, nada);
    radial.addColorStop(1, cor);
    ctx.fillStyle = radial;
    ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
    ctx.restore();

    const esq = dw * 0.42;
    const dir = dw * 0.3;
    faixa(x, 0, x + esq, 0, x - 1, 0, esq + 1, H);
    faixa(x + dw, 0, x + dw - dir, 0, x + dw - dir, 0, dir + 1, H);
    if (y > -dh * 0.02) {
      const topo = dh * 0.18;
      faixa(0, Math.max(y, 0), 0, Math.max(y, 0) + topo, 0, Math.max(y, 0) - 1, W, topo + 1);
    }
    if (y + dh < H + dh * 0.02) {
      const base = dh * 0.12;
      faixa(0, y + dh, 0, y + dh - base, 0, y + dh - base, W, base + 1);
    }
  }
}
