// Implante dentário em 3D, montado pela rolagem.
// As peças usinadas (implante, pilar, parafuso) são geradas aqui; a coroa vem de 3d/coroa.glb,
// gerada por ferramentas/gerar-coroa.mjs.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

const { clamp, lerp } = THREE.MathUtils;
const TAU = Math.PI * 2;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fract = x => x - Math.floor(x);
const torno = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/* ========================= geometria ========================= */

// Superfície de revolução com raio(θ, y) livre (roscas, flautas), normais pelo gradiente.
function superficie(raio, { yMin, yMax, seg, linhas, repU = 5, repV = 5, oclusao = null }) {
  const nv = (seg + 1) * (linhas + 1);
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const cor = oclusao ? new Float32Array(nv * 3) : null;
  const eT = 1e-3, eY = 1e-4;
  let k = 0;
  for (let j = 0; j <= linhas; j++) {
    const y = lerp(yMin, yMax, j / linhas);
    for (let i = 0; i <= seg; i++, k++) {
      const t = (i / seg) * TAU, s = Math.sin(t), c = Math.cos(t);
      const r = raio(t, y);
      const rt = (raio(t + eT, y) - raio(t - eT, y)) / (2 * eT);
      const ry = (raio(t, y + eY) - raio(t, y - eY)) / (2 * eY);
      const ax = r * c + rt * s, az = -r * s + rt * c, bx = ry * s, bz = ry * c;
      let nx = -az, ny = az * bx - ax * bz, nz = ax;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) { nx = 0; ny = y < (yMin + yMax) / 2 ? -1 : 1; nz = 0; } else { nx /= l; ny /= l; nz /= l; }
      pos[k * 3] = r * s; pos[k * 3 + 1] = y; pos[k * 3 + 2] = r * c;
      nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
      uv[k * 2] = (i / seg) * repU; uv[k * 2 + 1] = (y - yMin) * repV;
      if (cor) cor[k * 3] = cor[k * 3 + 1] = cor[k * 3 + 2] = oclusao(t, y);
    }
  }
  const idx = new Uint32Array(seg * linhas * 6);
  let q = 0;
  for (let j = 0; j < linhas; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
    idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  if (cor) g.setAttribute("color", new THREE.BufferAttribute(cor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// Média das normais em vértices repetidos (costura do torno), para não aparecer emenda.
function soldaNormais(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, grupos = new Map();
  for (let i = 0; i < p.count; i++) {
    const chave = `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(i);
  }
  const v = new THREE.Vector3();
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of g) { v.x += n.getX(i); v.y += n.getY(i); v.z += n.getZ(i); }
    v.normalize();
    for (const i of g) n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

// Perfil de um filete de rosca ao longo de um passo (0 = raiz): flanco, crista arredondada, flanco.
function perfilRosca(f) {
  if (f < 0.18) return 0;
  if (f < 0.36) return ss(0.18, 0.36, f);
  if (f < 0.5) return 1;
  if (f < 0.84) return 1 - ss(0.5, 0.84, f);
  return 0;
}

// ---------- 1. implante (4,1 x 10 mm; 1 unidade ≈ 5,8 mm) ----------
const PASSO = 0.138, Y_PONTA = -1.125, Y_CAPUZ = -0.92, R_CAPUZ = 0.205;
function nucleo(y) {
  if (y < Y_CAPUZ) { const d = y - Y_CAPUZ; return Math.sqrt(Math.max(0, R_CAPUZ * R_CAPUZ - d * d)); }
  return lerp(R_CAPUZ, 0.295, ss(Y_CAPUZ, -0.3, y));
}
function profundidade(y) {
  return 0.072 * (1 - ss(0.3, 0.42, y)) * (0.35 + 0.65 * ss(-1.05, -0.62, y)) * ss(Y_PONTA + 0.05, -0.97, y);
}
function corteFlautas(t, y) { // 3 canais de corte helicoidais no ápice
  const forca = ss(-0.28, -0.86, y);
  if (forca <= 0) return 0;
  let c = 0;
  for (let k = 0; k < 3; k++) {
    const d = ((t - k * (TAU / 3) - 1.15 * (y + 0.28)) % TAU + TAU * 1.5) % TAU - Math.PI;
    c += Math.exp(-(d * d) / 0.0882);
  }
  return 0.115 * forca * Math.min(1, c);
}
function raioImplante(t, y) {
  const base = nucleo(y);
  const r = base + profundidade(y) * perfilRosca(fract(y / PASSO - t / TAU));
  return Math.max(0, base - 0.055 * ss(-0.28, -0.86, y), r - corteFlautas(t, y));
}
function oclusaoImplante(t, y) { // raiz do filete e fundo das flautas recebem menos luz
  const prof = profundidade(y) / 0.072, crista = perfilRosca(fract(y / PASSO - t / TAU));
  return clamp(lerp(1, 0.55 + 0.45 * crista, prof) * (1 - 0.4 * corteFlautas(t, y) / 0.115), 0, 1);
}
function criaImplante(mats, [seg, linhas]) {
  const g = new THREE.Group();
  const corpo = superficie(raioImplante, { yMin: Y_PONTA, yMax: 0.42, seg, linhas, oclusao: oclusaoImplante });
  const perfil = [];
  for (let i = 0; i <= 16; i++) { const y = lerp(0.4, 0.612, i / 16); perfil.push([lerp(0.295, 0.345, ss(0.4, 0.6, y)), y]); }
  perfil.push([0.343, 0.626], [0.336, 0.636], [0.325, 0.642], [0.215, 0.642], [0.205, 0.637], [0.17, 0.556], [0.152, 0.53]);
  const colar = torno(perfil, 160);                              // colar usinado + cone interno
  const hex = torno([[0.152, 0.53], [0.152, 0.4], [0, 0.4]], 6);  // sextavado interno
  g.add(new THREE.Mesh(corpo, mats.jateado), new THREE.Mesh(colar, mats.usinado), new THREE.Mesh(hex, mats.interno));
  return g;
}

// ---------- 2. pilar (dourado anodizado) ----------
function criaPilar(mats) {
  const perfil = [[0.15, -0.11], [0.18, -0.012], [0.186, 0], [0.25, 0]];
  for (let i = 1; i <= 18; i++) { const t = i / 18; perfil.push([lerp(0.25, 0.364, Math.pow(t, 1.3)), 0.205 * t]); }   // perfil de emergência
  perfil.push([0.362, 0.214], [0.35, 0.224], [0.31, 0.234], [0.278, 0.24], [0.268, 0.25]);                         // ombro
  for (let i = 1; i <= 14; i++) { const t = i / 14; perfil.push([lerp(0.263, 0.218, t), lerp(0.26, 0.76, t)]); }       // munhão
  perfil.push([0.212, 0.782], [0.198, 0.795], [0.18, 0.8], [0.09, 0.8], [0.081, 0.796], [0.077, 0.785], [0.077, 0.33], [0.06, 0.32], [0, 0.32]); // canal do parafuso
  const corpo = torno(perfil, 192);
  const p = corpo.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.245 && p.getX(i) > 0.172) p.setX(i, 0.172); // face plana antirrotação
  corpo.computeVertexNormals(); soldaNormais(corpo);
  const hex = torno([[0, -0.25], [0.118, -0.25], [0.145, -0.235], [0.145, -0.11]], 6);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(corpo, mats.ouro), new THREE.Mesh(hex, mats.ouroFacetado));
  return g;
}

// ---------- 3. parafuso do pilar ----------
function raioParafuso(t, y) {
  const base = 0.033 * Math.sqrt(ss(-0.522, -0.49, y));
  const prof = 0.012 * (1 - ss(-0.33, -0.3, y)) * ss(-0.515, -0.485, y);
  return base + prof * perfilRosca(fract(y / 0.034 - t / TAU));
}
function criaParafuso(mats) {
  const cabeca = torno([[0.033, -0.3], [0.04, -0.3], [0.04, -0.092], [0.043, -0.082], [0.052, -0.07], [0.066, -0.052], [0.068, -0.03], [0.066, -0.006], [0.06, 0], [0.036, 0]], 72);
  const sextavado = torno([[0.036, 0], [0.036, -0.034], [0, -0.034]], 6);
  const rosca = superficie(raioParafuso, { yMin: -0.522, yMax: -0.3, seg: 64, linhas: 110, repU: 1, repV: 1,
    oclusao: (t, y) => lerp(0.6, 1, perfilRosca(fract(y / 0.034 - t / TAU))) });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cabeca, mats.parafuso), new THREE.Mesh(sextavado, mats.parafusoFacetado), new THREE.Mesh(rosca, mats.parafusoRosca));
  return g;
}

/* ========================= materiais e luz ========================= */

// Ruído periódico (sem emenda) para a superfície jateada do titânio.
function texturaRuido(tam = 256) {
  const dados = new Uint8Array(tam * tam * 4);
  const hash = (x, y, p) => {
    x = ((x % p) + p) % p; y = ((y % p) + p) % p;
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const ruido = (u, v, p) => {
    const x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash(x, y, p), hash(x + 1, y, p), sx), lerp(hash(x, y + 1, p), hash(x + 1, y + 1, p), sx), sy);
  };
  for (let j = 0; j < tam; j++) for (let i = 0; i < tam; i++) {
    let s = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < 4; o++) { const p = 16 << o; s += amp * ruido((i / tam) * p, (j / tam) * p, p); tot += amp; amp *= 0.5; }
    const v = Math.round((0.7 + 0.3 * s / tot) * 255), k = (i + j * tam) * 4;
    dados[k] = dados[k + 1] = dados[k + 2] = v; dados[k + 3] = 255;
  }
  const t = new THREE.DataTexture(dados, tam, tam);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

function criaMateriais() {
  const ruido = texturaRuido();
  return {
    jateado: new THREE.MeshPhysicalMaterial({ color: 0xbab5ac, metalness: 1, roughness: 0.62, roughnessMap: ruido, bumpMap: ruido, bumpScale: 0.6, vertexColors: true }),
    usinado: new THREE.MeshPhysicalMaterial({ color: 0xcdc9c1, metalness: 1, roughness: 0.13 }),
    interno: new THREE.MeshPhysicalMaterial({ color: 0x8e8a83, metalness: 1, roughness: 0.32, flatShading: true }),
    ouro: new THREE.MeshPhysicalMaterial({ color: 0xd9b06b, metalness: 1, roughness: 0.2 }),
    ouroFacetado: new THREE.MeshPhysicalMaterial({ color: 0xc9a25f, metalness: 1, roughness: 0.22, flatShading: true }),
    parafuso: new THREE.MeshPhysicalMaterial({ color: 0xbdb9b1, metalness: 1, roughness: 0.2 }),
    parafusoRosca: new THREE.MeshPhysicalMaterial({ color: 0xbdb9b1, metalness: 1, roughness: 0.24, vertexColors: true }),
    parafusoFacetado: new THREE.MeshPhysicalMaterial({ color: 0x77736d, metalness: 1, roughness: 0.3, flatShading: true }),
    ceramica: new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.06, specularIntensity: 0.7, ior: 1.55,
      sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color(1, 0.95, 0.9) }),
  };
}

// Estúdio de fotografia de produto: softbox em cima, faixas verticais nas laterais, recortes atrás.
function ambienteEstudio(renderer) {
  const estudio = new THREE.Scene();
  estudio.background = new THREE.Color(0x030304);
  const painel = (w, h, cor, forca, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).multiplyScalar(forca), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); estudio.add(m);
  };
  painel(6, 3.2, 0xffffff, 2.6, 0, 6.5, 1.5);
  painel(0.8, 10, 0xfff3e6, 6.5, -6, 0.5, 2.8);
  painel(0.6, 10, 0xe2ecff, 4.2, 6, 0.5, -1.2);
  painel(0.4, 8, 0xffffff, 5.5, -2.4, 0.8, -6.5);
  painel(0.4, 8, 0xffffff, 5.5, 2.8, 0.8, -6.5);
  painel(7, 1.4, 0xffe8cf, 0.45, 0, -4.5, 4);
  painel(4, 6, 0xffffff, 1.1, -3.5, 1, 6);       // rebatedor grande na frente, à esquerda
  painel(3, 5, 0xfff8f0, 0.6, 4, 0.5, 5);         // rebatedor menor, à direita
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(estudio, 0.015).texture;
  pm.dispose();
  return tex;
}

function fundoEstudio(cx, cy) {
  const c = document.createElement("canvas"); c.width = 640; c.height = 400;
  const g = c.getContext("2d"), gr = g.createRadialGradient(cx * 640, cy * 400, 8, cx * 640, cy * 400, 520);
  gr.addColorStop(0, "#343940"); gr.addColorStop(0.45, "#1a1d21"); gr.addColorStop(1, "#0a0b0d");
  g.fillStyle = gr; g.fillRect(0, 0, 640, 400);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Acabamento de lente: vinheta, grão de filme e leve aberração cromática nas bordas.
const Acabamento = {
  uniforms: { tDiffuse: { value: null }, tempo: { value: 0 }, grao: { value: 0.03 }, vinheta: { value: 0.3 }, aberracao: { value: 0.0012 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float tempo, grao, vinheta, aberracao; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float d = dot(c, c);
      vec2 desloc = c * aberracao * (0.5 + d * 4.0);
      vec3 cor = vec3(texture2D(tDiffuse, vUv + desloc).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - desloc).b);
      cor *= 1.0 - vinheta * smoothstep(0.08, 0.55, d);
      cor += (hash(vUv * 1931.0 + tempo) - 0.5) * grao;
      gl_FragColor = vec4(cor, 1.0);
    }`,
};

/* ========================= cena, câmera e rolagem ========================= */

export function iniciarImplante3D({ tela, secao, barra, dica, contador, contNum, contNome, etapas, urlCoroa }) {
  const params = new URLSearchParams(location.search);
  const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fraco = matchMedia("(max-width: 899px)").matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const NIVEIS = [ // qualidade: cai sozinha se o aparelho não aguentar
    { dpr: 1, dof: false, bloom: false, sombra: 0, msaa: 0 },
    { dpr: 1.5, dof: false, bloom: true, sombra: 1024, msaa: 0 },
    { dpr: 1.75, dof: true, bloom: true, sombra: 2048, msaa: 4 },
  ];
  const forcado = { baixo: 0, medio: 1, alto: 2 }[params.get("qualidade")];
  let nivel = forcado ?? (fraco ? 1 : 2);
  const adaptativo = forcado === undefined && !params.has("p");

  const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const cena = new THREE.Scene();
  cena.environment = ambienteEstudio(renderer);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.4, 80);

  const chave = new THREE.DirectionalLight(0xfff4e6, 1.6);
  chave.castShadow = true;
  Object.assign(chave.shadow.camera, { left: -3.8, right: 3.8, top: 3.8, bottom: -3.8, near: 1, far: 24 });
  chave.shadow.bias = -0.0004; chave.shadow.normalBias = 0.012; chave.shadow.radius = 3;
  cena.add(chave, chave.target);
  const direcaoLuz = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();

  const mats = criaMateriais();
  const implante = criaImplante(mats, fraco ? [144, 250] : [192, 330]);
  const pilar = criaPilar(mats), parafuso = criaParafuso(mats), coroa = new THREE.Group();
  coroa.visible = false;
  const eixo = new THREE.Group();
  eixo.add(implante, pilar, parafuso, coroa);
  cena.add(eixo);
  eixo.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(urlCoroa, gltf => {
    gltf.scene.traverse(o => { if (o.isMesh) { o.material = mats.ceramica; o.castShadow = o.receiveShadow = true; } });
    coroa.add(gltf.scene);
    coroa.visible = true;
  });

  // posições montadas e afastamento na vista explodida
  const Y = { implante: -1.0, pilar: -0.358, parafuso: 0.192, coroa: -0.136 };
  const SEPARA = { pilar: 1.25, parafuso: 2.45, coroa: 3.25 };
  implante.position.y = Y.implante;

  // anel de luz (moldura de museu) atrás do dente montado
  const anel = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.012, 16, 256),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.65, 1.7), transparent: true }));
  const brilho = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"), gr = g.createRadialGradient(128, 128, 98, 128, 128, 128);
    gr.addColorStop(0, "rgba(244,247,251,0)"); gr.addColorStop(0.86, "rgba(244,247,251,.3)"); gr.addColorStop(1, "rgba(244,247,251,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  brilho.scale.set(5.7, 5.7, 1);
  const moldura = new THREE.Group();
  moldura.add(anel, brilho);
  cena.add(moldura);

  // ---------- pós-produção ----------
  let composer, bokeh, fxaa, acabamento, fundo;
  const tamanho = () => [Math.max(1, tela.clientWidth), Math.max(1, tela.clientHeight)];
  function montaPos() {
    const n = { ...NIVEIS[nivel] }, [w, h] = tamanho();
    for (const k of (params.get("sem") || "").split(",")) if (k) n[k] = 0; // TESTE: ?sem=dof,msaa,sombra
    const dpr = Math.min(devicePixelRatio || 1, n.dpr);
    composer?.dispose();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    renderer.shadowMap.enabled = n.sombra > 0;
    if (n.sombra) { chave.shadow.mapSize.set(n.sombra, n.sombra); chave.shadow.map?.dispose(); chave.shadow.map = null; }
    eixo.traverse(o => { if (o.isMesh) o.material.needsUpdate = true; });
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w * dpr, h * dpr, { type: THREE.HalfFloatType, samples: n.msaa }));
    composer.setPixelRatio(dpr); composer.setSize(w, h);
    composer.addPass(new RenderPass(cena, camera));
    bokeh = null;
    if (n.dof) {
      bokeh = new BokehPass(cena, camera, { focus: 10, aperture: 0.001, maxblur: 0.007 });
      const original = bokeh.render.bind(bokeh); // a profundidade não pode incluir o fundo
      bokeh.render = (...a) => { const bg = cena.background; cena.background = null; original(...a); cena.background = bg; };
      composer.addPass(bokeh);
    }
    if (n.bloom) composer.addPass(new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.32, 0.55, 0.9));
    composer.addPass(new OutputPass());
    fxaa = null;
    if (!n.msaa) { fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa); }
    acabamento = new ShaderPass(Acabamento);
    composer.addPass(acabamento);
    ajusta();
  }
  function ajusta() {
    const [w, h] = tamanho(), dpr = renderer.getPixelRatio();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    fxaa?.material.uniforms.resolution.value.set(1 / (w * dpr), 1 / (h * dpr));
    camera.aspect = w / h; camera.updateProjectionMatrix();
    fundo?.dispose();
    fundo = camera.aspect < 0.9 ? fundoEstudio(0.5, 0.34) : fundoEstudio(0.7, 0.48);
    cena.background = fundo;
  }

  // ---------- roteiro de câmera ----------
  const ROTEIRO = [ // foco, distância, azimute e elevação (radianos)
    { p: 0.00, foco: "todo", dist: 17.5, az: 0.0, el: 0.06 },
    { p: 0.10, foco: "todo", dist: 17.0, az: 0.2, el: 0.08 },
    { p: 0.22, foco: "implante", dist: 5.6, az: -0.75, el: -0.1 },
    { p: 0.38, foco: "implante", dist: 5.0, az: 0.55, el: 0.06 },
    { p: 0.48, foco: "pilar", dist: 5.2, az: 0.85, el: 0.3 },
    { p: 0.56, foco: "canal", dist: 5.2, az: 0.5, el: 0.42 },
    { p: 0.63, foco: "canal", dist: 4.3, az: 0.35, el: 0.55 },
    { p: 0.66, foco: "pilar", dist: 5.0, az: -0.2, el: 0.25 },
    { p: 0.78, foco: "todo", dist: 11.5, az: -0.55, el: 0.12 },
    { p: 0.94, foco: "todo", dist: 11.0, az: 0.0, el: 0.05 },
    { p: 1.00, foco: "todo", dist: 11.0, az: 0.0, el: 0.05 },
  ];
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  const faixa = (p, a, b) => ease(clamp((p - a) / (b - a), 0, 1));
  const tA = new THREE.Vector3(), tB = new THREE.Vector3(), fA = new THREE.Vector3(), fB = new THREE.Vector3(), foco = new THREE.Vector3(), centro = new THREE.Vector3();
  function pontoFoco(nome, alvo) {
    if (nome === "implante") return implante.localToWorld(alvo.set(0, -0.25, 0));
    if (nome === "pilar") return pilar.localToWorld(alvo.set(0, 0.5, 0));
    if (nome === "canal") return pilar.localToWorld(alvo.set(0, 0.95, 0));
    implante.localToWorld(tA.set(0, -0.6, 0)); coroa.localToWorld(tB.set(0, 0.75, 0));
    return alvo.copy(tA).add(tB).multiplyScalar(0.5);
  }

  let orbita = 0, orbitaAlvo = 0;
  const teste = { az: +(params.get("az") || 0), el: +(params.get("el") || 0) }; // TESTE (remover antes de publicar)
  function aplica(p, tempo) {
    pilar.position.y = Y.pilar + SEPARA.pilar * (1 - faixa(p, 0.44, 0.54));
    const fp = faixa(p, 0.55, 0.64);
    parafuso.position.y = Y.parafuso + (SEPARA.parafuso - SEPARA.pilar) * (1 - fp) + SEPARA.pilar * (1 - faixa(p, 0.44, 0.54));
    parafuso.rotation.y = fp * Math.PI * 6;                     // o parafuso gira ao entrar
    coroa.position.y = Y.coroa + SEPARA.coroa * (1 - faixa(p, 0.72, 0.88));
    implante.rotation.y = faixa(p, 0.16, 0.4) * Math.PI * 4;    // o implante "aparafusa"
    const empe = faixa(p, 0.7, 0.92), celular = camera.aspect < 0.9;
    eixo.rotation.z = lerp(celular ? -0.28 : -0.62, 0, empe);
    eixo.rotation.x = lerp(0.2, 0.06, empe);
    eixo.updateMatrixWorld(true);

    let i = 0; while (i < ROTEIRO.length - 2 && p > ROTEIRO[i + 1].p) i++;
    const a = ROTEIRO[i], b = ROTEIRO[i + 1], t = ease(clamp((p - a.p) / (b.p - a.p), 0, 1));
    pontoFoco(a.foco, fA); pontoFoco(b.foco, fB); foco.lerpVectors(fA, fB, t);
    const [w, h] = tamanho();
    const dist = lerp(a.dist, b.dist, t) * (celular ? lerp(1.6, 1.8, faixa(p, 0.72, 0.95)) : 1);
    const az = lerp(a.az, b.az, t) + orbita + (calmo ? 0 : Math.sin(tempo * 0.25) * 0.08) + teste.az;
    const el = lerp(a.el, b.el, t) + teste.el;
    camera.position.set(foco.x + dist * Math.sin(az) * Math.cos(el), foco.y + dist * Math.sin(el), foco.z + dist * Math.cos(az) * Math.cos(el));
    camera.lookAt(foco);
    if (celular) camera.setViewOffset(w, h, 0, h * lerp(0.05, 0.13, faixa(p, 0.08, 0.2)), w, h);
    else camera.setViewOffset(w, h, -w * 0.2, 0, w, h);

    // luz principal acompanha o conjunto; a sombra cobre só a área das peças
    pontoFoco("todo", centro);
    chave.target.position.copy(centro);
    chave.position.copy(centro).addScaledVector(direcaoLuz, 10);

    // profundidade de campo: rasa nos close-ups, quase nenhuma nos planos abertos
    if (bokeh) {
      const d = camera.position.distanceTo(foco);
      bokeh.uniforms.focus.value = d;
      bokeh.uniforms.aperture.value = lerp(0.0042, 0.0007, ss(5, 12, d));
    }

    moldura.position.copy(centro).addScaledVector(tA.copy(camera.position).sub(centro).normalize(), -1.6);
    moldura.quaternion.copy(camera.quaternion);
    moldura.scale.setScalar(celular ? 0.82 : 1);
    const forca = lerp(0.35, 1, faixa(p, 0.78, 0.95)) * (1 - 0.85 * (faixa(p, 0.12, 0.2) - faixa(p, 0.68, 0.78)));
    anel.material.opacity = forca; brilho.material.opacity = forca;
  }

  // ---------- textos das etapas ----------
  const NOMES = ["O implante", "O pilar", "A coroa"];
  function atualizaTexto(p) {
    etapas.forEach(e => e.classList.toggle("ativa", p >= +e.dataset.de && p < +e.dataset.ate));
    const n = p < 0.42 ? 0 : p < 0.68 ? 1 : 2;
    contNum.textContent = "0" + (n + 1); contNome.textContent = NOMES[n];
    contador.style.opacity = p < 0.14 ? 0 : 1;
    barra.style.width = (p * 100) + "%";
  }

  // ---------- arrastar para orbitar ----------
  let arrastando = false, xAntes = 0;
  tela.addEventListener("pointerdown", e => { arrastando = true; xAntes = e.clientX; tela.setPointerCapture(e.pointerId); dica.style.opacity = 0; });
  tela.addEventListener("pointermove", e => { if (!arrastando) return; orbitaAlvo += (e.clientX - xAntes) * 0.008; xAntes = e.clientX; });
  addEventListener("pointerup", () => { arrastando = false; });

  // ---------- qualidade adaptativa ----------
  let amostras = [], ultimo = performance.now(), aquecendo = 0, quedas = 0;
  function mede(agora) {
    const dt = agora - ultimo; ultimo = agora;
    if (!adaptativo || document.hidden || ++aquecendo < 45) return; // ignora a compilação dos shaders
    amostras.push(dt);
    if (amostras.length < 60) return;
    amostras.sort((a, b) => a - b);
    const mediana = amostras[30]; amostras = [];
    if (mediana > 30 && nivel > 0 && quedas < 2) { nivel--; quedas++; aquecendo = 0; montaPos(); }
  }

  // ---------- laço ----------
  let progresso = () => {
    const r = secao.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight), 0, 1);
  };
  if (params.has("p")) { const fixo = +params.get("p"); progresso = () => fixo; } // TESTE: fixa a rolagem (remover antes de publicar)
  let pAlvo = progresso(), pAtual = pAlvo, visivel = true;
  const relogio = new THREE.Clock();
  new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }).observe(secao);
  function quadro(agora) {
    requestAnimationFrame(quadro);
    if (!visivel) return;
    mede(agora);
    pAtual += (pAlvo - pAtual) * (calmo ? 1 : 0.08);
    if (!arrastando) orbitaAlvo *= 0.985;
    orbita += (orbitaAlvo - orbita) * 0.1;
    const tempo = relogio.getElapsedTime();
    aplica(pAtual, tempo);
    acabamento.uniforms.tempo.value = calmo ? 0 : tempo % 100;
    composer.render();
  }
  function aoRolar() { pAlvo = progresso(); atualizaTexto(pAlvo); }
  addEventListener("scroll", aoRolar, { passive: true });
  addEventListener("resize", ajusta);
  montaPos();
  aoRolar();
  requestAnimationFrame(quadro);
}
