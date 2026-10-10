// Implante dentário em 3D, gerado por código (sem modelos externos):
// implante de titânio com rosca, pilar dourado, parafuso e coroa em zircônia.
// O scroll controla a explosão das peças; os rótulos HTML seguem as peças na tela.
import * as THREE from 'three';
import { RoomEnvironment } from '../assets/vendor/three/addons/RoomEnvironment.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const suave = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------------ */
/* Geometrias                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Superfície de revolução com raio variável por ângulo (para roscas helicoidais).
 * Os anéis vão do topo (d = 0) até a ponta (d = comprimento), onde fecham num ponto.
 * Sem coluna duplicada na emenda, para as normais ficarem contínuas.
 */
function superficieRosca({ comprimento, segU, segV, raio, grupoAte = 0 }) {
  const pos = [];
  for (let j = 0; j <= segV; j += 1) {
    const d = (j / segV) * comprimento;
    for (let i = 0; i < segU; i += 1) {
      const ang = (i / segU) * TAU;
      const r = raio(d, ang);
      pos.push(Math.cos(ang) * r, -d, Math.sin(ang) * r);
    }
  }
  const ponta = pos.length / 3;
  pos.push(0, -comprimento - 0.02, 0);

  const idx = [];
  const anel = (j, i) => j * segU + (i % segU);
  let linhaGrupo = 0;
  for (let j = 0; j < segV; j += 1) {
    const d = (j / segV) * comprimento;
    if (d < grupoAte) linhaGrupo = j + 1;
    for (let i = 0; i < segU; i += 1) {
      const a = anel(j, i);
      const b = anel(j + 1, i);
      const c = anel(j + 1, i + 1);
      const e = anel(j, i + 1);
      idx.push(a, e, b, b, e, c);
    }
  }
  for (let i = 0; i < segU; i += 1) idx.push(anel(segV, i), anel(segV, i + 1), ponta);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  if (grupoAte > 0) {
    const corte = linhaGrupo * segU * 6;
    geo.addGroup(0, corte, 1);
    geo.addGroup(corte, idx.length - corte, 0);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Perfil da rosca: subida curta, crista plana, descida longa (rosca de compressão). */
function perfilRosca(fase) {
  if (fase < 0.14) return suave(0, 0.14, fase);
  if (fase < 0.42) return 1;
  if (fase < 0.78) return 1 - suave(0.42, 0.78, fase);
  return 0;
}

function geoImplante() {
  const L = 11;
  const colar = 0.9;
  const passo = 0.8;
  const prof = 0.34;
  const raio = (d, ang) => {
    let nucleo;
    if (d < colar) nucleo = 2.05 - 0.04 * suave(0, colar, d);
    else nucleo = lerp(1.68, 1.46, suave(colar, 9.4, d));
    // Ápice arredondado
    if (d > 9.6) nucleo *= Math.sqrt(Math.max(0, 1 - ((d - 9.6) / 1.42) ** 2));
    const fase = (((d / passo) - ang / TAU) % 1 + 1) % 1;
    const presenca = suave(colar - 0.05, colar + 0.45, d) * (1 - suave(9.4, 10.6, d));
    const transicao = d < colar ? 0 : prof * perfilRosca(fase) * presenca;
    return nucleo + transicao;
  };
  return superficieRosca({ comprimento: L, segU: 168, segV: 560, raio, grupoAte: colar });
}

function geoParafuso() {
  const L = 7.2;
  const passo = 0.42;
  const raio = (d, ang) => {
    // cabeça
    if (d < 0.9) {
      const borda = d < 0.12 ? lerp(0.82, 0.95, d / 0.12) : 0.95;
      return borda;
    }
    if (d < 1.15) return lerp(0.95, 0.56, suave(0.9, 1.15, d));
    let r = 0.56;
    if (d > 6.7) r *= Math.sqrt(Math.max(0, 1 - ((d - 6.7) / 0.55) ** 2));
    const fase = (((d / passo) - ang / TAU) % 1 + 1) % 1;
    const presenca = suave(4.2, 4.6, d) * (1 - suave(6.6, 7.1, d));
    return r + 0.13 * perfilRosca(fase) * presenca;
  };
  return superficieRosca({ comprimento: L, segU: 72, segV: 260, raio });
}

function geoPilar() {
  // Perfil (raio, altura), de baixo para cima e entrando pelo canal do parafuso.
  const p = [
    [0.0, -2.1], [0.98, -2.1], [1.04, -2.0], [1.04, -0.05],
    [2.02, 0.0], [2.12, 0.18], [2.36, 0.7], [2.56, 1.2], [2.6, 1.42],
    [2.54, 1.58], [1.98, 1.64], [1.9, 1.78],
    [1.72, 3.4], [1.56, 5.0], [1.46, 5.4], [1.3, 5.58], [1.02, 5.6],
    [0.98, 5.45], [0.98, 3.2], [0.6, 3.1], [0.6, 2.0], [0.0, 2.0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(p, 144);
}

/** Coroa de molar: parede em superelipse e mesa oclusal com cúspides e sulcos. */
function geoCoroa() {
  const segA = 176;
  const segParede = 70;
  const segMesa = 56;
  const n = 3.1; // expoente da superelipse (quanto maior, mais "quadrado")
  const alturaParede = 5.6;

  const sx = (t) => {
    // semi-eixo mesio-distal ao longo da parede: estreito na margem, maior no terço médio
    if (t < 0.42) return lerp(2.62, 4.7, Math.sin((t / 0.42) * Math.PI / 2));
    if (t < 0.82) return lerp(4.7, 4.5, suave(0.42, 0.82, t));
    return lerp(4.5, 4.05, suave(0.82, 1, t));
  };
  const sz = (t) => sx(t) * (t < 0.2 ? 1 : lerp(1, 0.93, suave(0.2, 0.6, t)));
  const yParede = (t) => {
    // sobe rápido e arredonda no topo
    if (t < 0.82) return (t / 0.82) * (alturaParede - 0.7);
    return alturaParede - 0.7 + 0.7 * Math.sin(((t - 0.82) / 0.18) * Math.PI / 2);
  };

  const cuspides = [
    [-1.95, -1.55, 1.25], [0.35, -1.8, 1.15], [2.45, -1.05, 0.9],
    [-1.85, 1.6, 1.45], [0.95, 1.7, 1.38],
  ];
  const relevo = (x, z) => {
    let h = 0;
    for (const [cx, cz, a] of cuspides) {
      const dx = x - cx;
      const dz = z - cz;
      h += a * Math.exp(-(dx * dx + dz * dz) / (2 * 1.05 * 1.05));
    }
    const zigue = z - 0.12 - 0.18 * Math.sin(x * 1.3);
    h -= 0.6 * Math.exp(-(zigue * zigue) / 0.07) * (1 - suave(2.4, 3.2, Math.abs(x)));
    h -= 0.32 * Math.exp(-((x + 0.75) ** 2) / 0.05) * suave(0.2, -0.4, z) * (1 - suave(-2.6, -3.3, z));
    h -= 0.28 * Math.exp(-((x - 0.1) ** 2) / 0.05) * suave(-0.2, 0.4, z) * (1 - suave(2.6, 3.3, z));
    h -= 0.35 * Math.exp(-(x * x + z * z) / 1.4);
    return h;
  };

  const sgn = (v) => (v < 0 ? -1 : 1);
  const contorno = (ang, a, b) => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return [a * sgn(c) * Math.abs(c) ** (2 / n), b * sgn(s) * Math.abs(s) ** (2 / n)];
  };

  const pos = [];
  const cores = [];
  // Cores da zircônia: cervical mais quente, corpo marfim e cúspides levemente azuladas
  // (a opalescência do esmalte nas bordas).
  const corCervical = new THREE.Color('#DCC39C');
  const corCorpo = new THREE.Color('#ECE4D4');
  const corBorda = new THREE.Color('#CBD6E4');
  const tmp = new THREE.Color();

  // Sulcos verticais suaves nas faces vestibular e lingual (terço oclusal da parede)
  const sulcoParede = (ang, t) => {
    const perto = (alvo) => {
      const d = Math.atan2(Math.sin(ang - alvo), Math.cos(ang - alvo));
      return Math.exp(-(d * d) / 0.012);
    };
    return 1 - 0.035 * (perto(-Math.PI / 2 - 0.12) + perto(Math.PI / 2 + 0.05)) * suave(0.35, 0.95, t);
  };

  // Parede
  for (let j = 0; j <= segParede; j += 1) {
    const t = j / segParede;
    const a = sx(t);
    const b = sz(t);
    const y = yParede(t);
    for (let i = 0; i < segA; i += 1) {
      const ang = (i / segA) * TAU;
      const [cx, cz] = contorno(ang, a, b);
      const k = sulcoParede(ang, t);
      const x = cx * k;
      const z = cz * k;
      pos.push(x, y, z);
      tmp.copy(corCervical).lerp(corCorpo, suave(0.0, 0.55, t));
      cores.push(tmp.r, tmp.g, tmp.b);
    }
  }
  // Mesa oclusal (anéis da borda até o centro)
  const aBorda = sx(1);
  const bBorda = sz(1);
  const yBorda = yParede(1);
  for (let j = 1; j <= segMesa; j += 1) {
    const s = j / segMesa; // 0 borda, 1 centro
    const escala = 1 - s;
    for (let i = 0; i < segA; i += 1) {
      const ang = (i / segA) * TAU;
      const [bx, bz] = contorno(ang, aBorda, bBorda);
      const k = sulcoParede(ang, 1);
      const x = bx * k * escala;
      const z = bz * k * escala;
      const cupula = 0.55 * Math.sin(Math.min(1, s / 0.5) * Math.PI / 2);
      const h = yBorda + cupula + relevo(x, z) * suave(0.0, 0.32, s);
      pos.push(x, h, z);
      const pico = clamp01((h - yBorda - 0.7) / 1.1);
      tmp.copy(corCorpo).lerp(corBorda, 0.75 * pico);
      cores.push(tmp.r, tmp.g, tmp.b);
    }
  }
  const centro = pos.length / 3;
  pos.push(0, yBorda + 0.55 + relevo(0, 0), 0);
  cores.push(corCorpo.r, corCorpo.g, corCorpo.b);

  const linhas = segParede + segMesa; // número de anéis - 1
  const idx = [];
  const v = (j, i) => j * segA + (i % segA);
  for (let j = 0; j < linhas; j += 1) {
    for (let i = 0; i < segA; i += 1) {
      const a = v(j, i);
      const b = v(j + 1, i);
      const c = v(j + 1, i + 1);
      const e = v(j, i + 1);
      idx.push(a, b, e, e, b, c);
    }
  }
  for (let i = 0; i < segA; i += 1) idx.push(v(linhas, i), centro, v(linhas, i + 1));

  // Fundo: anel que fecha a margem e sobe para dentro (intradorso)
  const base = pos.length / 3;
  const anelFundo = [[2.62, 0], [2.0, 0.05], [1.8, 3.6], [0, 3.9]];
  anelFundo.forEach(([r, y]) => {
    for (let i = 0; i < segA; i += 1) {
      const [x, z] = contorno((i / segA) * TAU, r, r * (r > 2.5 ? 1 : 0.97));
      pos.push(x, y, z);
      cores.push(corCervical.r, corCervical.g, corCervical.b);
    }
  });
  for (let j = 0; j < anelFundo.length - 1; j += 1) {
    for (let i = 0; i < segA; i += 1) {
      const a = base + j * segA + (i % segA);
      const b = base + (j + 1) * segA + (i % segA);
      const c = base + (j + 1) * segA + ((i + 1) % segA);
      const e = base + j * segA + ((i + 1) % segA);
      idx.push(a, e, b, b, e, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------------ */
/* Cena                                                                      */
/* ------------------------------------------------------------------------ */

export function criarCena(canvas, rotulosEl) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const cena = new THREE.Scene();
  cena.background = new THREE.Color('#EEF0EC');
  const pmrem = new THREE.PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
  cena.environmentIntensity = 0.95;

  const camera = new THREE.PerspectiveCamera(24, 1, 1, 500);

  // Luz principal quente, contraluz azulada e um toque âmbar por baixo (opalescência).
  const chave = new THREE.DirectionalLight(0xfff1df, 2.1);
  chave.position.set(20, 28, 26);
  const contra = new THREE.DirectionalLight(0xb3c8ff, 2.4);
  contra.position.set(-26, 10, -22);
  const ambar = new THREE.PointLight(0xffc48a, 260, 90, 2);
  ambar.position.set(16, -10, 14);
  cena.add(chave, contra, ambar, new THREE.HemisphereLight(0xf4f6fb, 0xd9cfc2, 0.35));

  // Materiais
  const titanioJateado = new THREE.MeshPhysicalMaterial({ color: 0x9ea4ac, metalness: 1, roughness: 0.46 });
  const titanioPolido = new THREE.MeshPhysicalMaterial({ color: 0xc8cdd3, metalness: 1, roughness: 0.14 });
  const titanioEscuro = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 1, roughness: 0.55, side: THREE.DoubleSide });
  const ouro = new THREE.MeshPhysicalMaterial({
    color: 0xdcb47a, metalness: 1, roughness: 0.2, clearcoat: 0.35, clearcoatRoughness: 0.12,
  });
  const aco = new THREE.MeshPhysicalMaterial({ color: 0xb7bdc5, metalness: 1, roughness: 0.26 });
  const ceramica = new THREE.MeshPhysicalMaterial({
    color: 0xeee9e0,
    vertexColors: true,
    roughness: 0.44,
    metalness: 0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.3,
    sheen: 0.4,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xb9cbe8),
    ior: 1.55,
    specularIntensity: 0.55,
  });

  // Peças. Cada peça fica num "eixo" (que se move) e gira dentro dele.
  const conjunto = new THREE.Group();
  conjunto.rotation.z = -0.16;
  conjunto.rotation.x = 0.2; // inclina o topo para a câmera e mostra as cúspides da coroa
  cena.add(conjunto);

  const criarPeca = (malha, base) => {
    const eixo = new THREE.Group();
    eixo.position.y = base;
    const giro = new THREE.Group();
    giro.add(malha);
    eixo.add(giro);
    conjunto.add(eixo);
    return { eixo, giro, base };
  };

  const implanteMalha = new THREE.Group();
  implanteMalha.add(new THREE.Mesh(geoImplante(), [titanioJateado, titanioPolido]));
  const anelTopo = new THREE.Mesh(new THREE.RingGeometry(1.12, 2.05, 96), titanioPolido);
  anelTopo.rotation.x = -Math.PI / 2;
  const poco = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 2.2, 6, 1, true), titanioEscuro);
  poco.position.y = -1.1;
  const fundoPoco = new THREE.Mesh(new THREE.CircleGeometry(1.12, 6), titanioEscuro);
  fundoPoco.rotation.x = -Math.PI / 2;
  fundoPoco.position.y = -2.2;
  implanteMalha.add(anelTopo, poco, fundoPoco);

  const pilarMalha = new THREE.Mesh(geoPilar(), ouro);
  const parafusoMalha = new THREE.Group();
  parafusoMalha.add(new THREE.Mesh(geoParafuso(), aco));
  const sextavado = new THREE.Mesh(new THREE.CircleGeometry(0.42, 6), titanioEscuro);
  sextavado.rotation.x = -Math.PI / 2;
  sextavado.position.y = 0.005;
  parafusoMalha.add(sextavado);
  parafusoMalha.position.y = 4.15; // cabeça do parafuso apoiada no degrau do canal do pilar
  const coroaMalha = new THREE.Mesh(geoCoroa(), ceramica);

  const pecas = {
    implante: criarPeca(implanteMalha, 0),
    pilar: criarPeca(pilarMalha, 0),
    parafuso: criarPeca(parafusoMalha, 0),
    coroa: criarPeca(coroaMalha, 1.6),
  };

  // Deslocamento de cada peça quando o conjunto está aberto e onde fica o rótulo.
  // As peças saem de cima para baixo (ordem de remoção), para nenhuma atravessar a outra.
  const config = {
    coroa: { abre: 15.2, ancora: [5.3, 4.0], ancoraEstreita: [3.4, 4.6], limiar: 0.12 },
    parafuso: { abre: 11.2, ancora: [1.4, 2.2], limiar: 0.34 },
    pilar: { abre: 2.0, ancora: [2.9, 1.0], limiar: 0.56 },
    implante: { abre: -3.2, ancora: [2.6, -5.0], limiar: 0.78 },
  };

  // Rótulos HTML
  const rotulos = {};
  rotulosEl.querySelectorAll('[data-peca]').forEach((el) => { rotulos[el.dataset.peca] = el; });

  const estado = { separar: 0, giro: 0, vista: 0 };
  let largura = 1;
  let altura = 1;
  let ativo = false;
  let ultimoTempo = performance.now();
  let rotacaoLivre = 0;
  let quadro = 0;
  const vetor = new THREE.Vector3();

  function redimensionar() {
    const r = canvas.getBoundingClientRect();
    largura = Math.max(1, r.width);
    altura = Math.max(1, r.height);
    renderer.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();
    desenhar();
  }

  // Quanto cada peça já saiu do lugar (0 montada, 1 aberta).
  const saida = (nome, s) => suave(0, 1, clamp01((s - (config[nome].limiar - 0.12)) / 0.34));

  function posicionar() {
    const s = estado.separar;
    const aspecto = largura / altura;
    const largo = aspecto > 1.1;

    // A câmera enquadra sempre o conjunto inteiro: calcula a altura ocupada pelas
    // peças neste instante (coroa sobe primeiro, implante desce por último).
    const limiteAlto = 9.8 + config.coroa.abre * saida('coroa', s);
    const limiteBaixo = -11.3 + config.implante.abre * saida('implante', s);
    const alturaCena = limiteAlto - limiteBaixo;
    const centroY = (limiteAlto + limiteBaixo) / 2;
    const meioFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const porAltura = (alturaCena / 2) / Math.tan(meioFov) * (largo ? 1.22 : 1.3);
    const porLargura = (largo ? 0 : 9) / (Math.tan(meioFov) * aspecto);
    const distancia = Math.max(porAltura, porLargura, 50);

    camera.position.set(distancia * 0.17, centroY + distancia * 0.22, distancia);
    camera.lookAt(0, centroY, 0);
    camera.updateMatrixWorld();
    // Em telas largas o conjunto fica um pouco à direita do centro, deixando espaço para os rótulos.
    const meiaLargura = distancia * Math.tan(meioFov) * aspecto;
    conjunto.position.x = largo ? meiaLargura * 0.1 : -meiaLargura * 0.34;
    conjunto.position.y = largo ? 0 : -alturaCena * 0.06;

    const base = estado.giro * TAU * 1.25 + rotacaoLivre;
    for (const [nome, p] of Object.entries(pecas)) {
      const local = saida(nome, s);
      p.eixo.position.y = p.base + config[nome].abre * local;
      // O parafuso gira enquanto sai, como se estivesse sendo desrosqueado.
      const extra = nome === 'parafuso' ? -local * TAU * 1.5 : 0;
      p.giro.rotation.y = base + extra;
    }
  }

  function atualizarRotulos() {
    const s = estado.separar;
    const estreita = largura / altura <= 1.1;
    for (const [nome, el] of Object.entries(rotulos)) {
      const c = config[nome];
      const p = pecas[nome];
      const [ax, ay] = estreita && c.ancoraEstreita ? c.ancoraEstreita : c.ancora;
      vetor.set(ax, ay, 0);
      p.eixo.localToWorld(vetor);
      vetor.project(camera);
      const x = (vetor.x * 0.5 + 0.5) * largura;
      const y = (-vetor.y * 0.5 + 0.5) * altura;
      const opacidade = suave(c.limiar + 0.08, c.limiar + 0.2, s);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - 9).toFixed(1)}px, 0)`;
      el.style.opacity = opacidade.toFixed(3);
      const visivel = opacidade > 0.02;
      if (visivel && !el.dataset.visto) {
        el.dataset.visto = '1';
        el.dispatchEvent(new CustomEvent('rotulo:entrou', { bubbles: true }));
      } else if (!visivel && el.dataset.visto) {
        delete el.dataset.visto;
      }
    }
  }

  function desenhar() {
    posicionar();
    renderer.render(cena, camera);
    atualizarRotulos();
  }

  function laco(t) {
    if (!ativo) return;
    const dt = Math.min(0.05, (t - ultimoTempo) / 1000);
    ultimoTempo = t;
    rotacaoLivre += dt * 0.22;
    desenhar();
    quadro = requestAnimationFrame(laco);
  }

  const observador = new ResizeObserver(redimensionar);
  observador.observe(canvas);
  redimensionar();

  return {
    aplicar(valores) {
      Object.assign(estado, valores);
      if (!ativo) desenhar();
    },
    ativar(sim) {
      if (sim === ativo) return;
      ativo = sim;
      cancelAnimationFrame(quadro);
      if (ativo) {
        ultimoTempo = performance.now();
        quadro = requestAnimationFrame(laco);
      }
    },
  };
}
