// Fórmulas LaTeX con KaTeX (incluido en vendor/katex, no necesita internet).
//
// En la diapositiva solo se guarda el código LaTeX (data-tex); el HTML que dibuja KaTeX
// se genera al mostrar el elemento y nunca se guarda ni se envía a la base de datos.

const OPCIONES = {
  throwOnError: true,
  trust: false,        // sin \href, \url, \includegraphics ni \htmlClass
  strict: 'ignore',
  output: 'html',
  maxExpand: 1000,     // evita macros que se expanden sin fin
  maxSize: 60,
  errorColor: '#cc0000',
};

export const hayKatex = () => typeof window.katex === 'object' && window.katex && typeof window.katex.renderToString === 'function';

let fuentesPedidas = false;
function esperarFuentes() {
  if (fuentesPedidas || !document.fonts || !document.fonts.load) return;
  fuentesPedidas = true;
  const lista = ['1em KaTeX_Main', 'italic 1em KaTeX_Math', '1em KaTeX_Size1', '1em KaTeX_AMS', '1em KaTeX_Size2'];
  Promise.all(lista.map((f) => document.fonts.load(f).catch(() => null)))
    .then(() => window.dispatchEvent(new Event('formulas-listas')));
}

/** Devuelve el mensaje de error del código LaTeX, o '' si es válido. */
export function errorTex(tex, display = false) {
  if (!hayKatex()) return 'No se pudo cargar KaTeX; la fórmula se muestra como texto.';
  try {
    window.katex.renderToString(String(tex).trim() || '\\square', { ...OPCIONES, displayMode: !!display });
    return '';
  } catch (e) {
    return String((e && e.message) || e).replace(/^KaTeX parse error:\s*/i, '').slice(0, 240);
  }
}

/** Dibuja la fórmula dentro de un elemento (data-tex, data-d). */
export function pintarFormula(nodo) {
  const tex = nodo.getAttribute('data-tex') || '';
  const display = nodo.getAttribute('data-d') === '1';
  nodo.setAttribute('role', 'img');
  nodo.setAttribute('aria-label', tex.slice(0, 200));
  if (!hayKatex()) { nodo.textContent = tex; return; }
  const fuente = tex.trim() || '\\square';
  try {
    nodo.innerHTML = window.katex.renderToString(fuente, { ...OPCIONES, displayMode: display });
  } catch {
    // Con errores se muestra el código en rojo, igual que hace KaTeX.
    nodo.innerHTML = window.katex.renderToString(fuente, { ...OPCIONES, throwOnError: false, displayMode: display });
  }
  esperarFuentes();
}

/** HTML (ya dibujado) de un código LaTeX; para etiquetas de botones. */
export function texAHtml(tex) {
  if (!hayKatex()) return '';
  try { return window.katex.renderToString(tex, { ...OPCIONES, throwOnError: false }); } catch { return ''; }
}

export const EJEMPLOS = [
  { nombre: 'Ecuación cuadrática', tex: 'x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}' },
  { nombre: 'Identidad de Euler', tex: 'e^{i\\pi} + 1 = 0' },
  { nombre: 'Teorema fundamental del cálculo', tex: '\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)' },
  { nombre: 'Serie geométrica', tex: '\\sum_{n=0}^{\\infty} r^{n} = \\frac{1}{1-r}, \\quad |r| < 1' },
  { nombre: 'Límite notable', tex: '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1' },
  { nombre: 'Distribución normal', tex: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^{2}}{2\\sigma^{2}}}' },
  { nombre: 'Matriz 2×2', tex: 'A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
  { nombre: 'Sistema de ecuaciones', tex: '\\begin{cases} x + y = 3 \\\\ x - y = 1 \\end{cases}' },
  { nombre: 'Reacción química', tex: '\\ce{2H2 + O2 -> 2H2O}' },
];

/** Botones de símbolos y estructuras: [grupo, [[etiqueta LaTeX, código a insertar], …]]. */
export const PALETA = [
  ['Estructuras', [
    ['\\frac{a}{b}', '\\frac{a}{b}'], ['\\sqrt{x}', '\\sqrt{x}'], ['\\sqrt[n]{x}', '\\sqrt[n]{x}'],
    ['x^{n}', 'x^{n}'], ['x_{i}', 'x_{i}'], ['x_{i}^{n}', 'x_{i}^{n}'],
    ['\\left(\\cdot\\right)', '\\left( x \\right)'], ['\\left|\\cdot\\right|', '\\left| x \\right|'], ['\\overline{x}', '\\overline{x}'],
    ['\\vec{v}', '\\vec{v}'], ['\\hat{x}', '\\hat{x}'], ['\\dot{x}', '\\dot{x}'],
  ]],
  ['Cálculo y sumas', [
    ['\\sum', '\\sum_{i=1}^{n} a_i'], ['\\prod', '\\prod_{i=1}^{n} a_i'], ['\\int', '\\int_{a}^{b} f(x)\\,dx'],
    ['\\iint', '\\iint_{D} f\\,dA'], ['\\oint', '\\oint_{C} \\vec{F}\\cdot d\\vec{r}'], ['\\lim', '\\lim_{x \\to a} f(x)'],
    ['\\frac{d}{dx}', '\\frac{d}{dx}'], ['\\partial', '\\frac{\\partial f}{\\partial x}'], ['\\nabla', '\\nabla f'],
    ['\\infty', '\\infty'],
  ]],
  ['Relaciones y lógica', [
    ['\\leq', '\\leq'], ['\\geq', '\\geq'], ['\\neq', '\\neq'], ['\\approx', '\\approx'], ['\\equiv', '\\equiv'], ['\\sim', '\\sim'],
    ['\\in', '\\in'], ['\\notin', '\\notin'], ['\\subset', '\\subset'], ['\\subseteq', '\\subseteq'], ['\\cup', '\\cup'], ['\\cap', '\\cap'],
    ['\\to', '\\to'], ['\\Rightarrow', '\\Rightarrow'], ['\\Leftrightarrow', '\\Leftrightarrow'], ['\\forall', '\\forall'], ['\\exists', '\\exists'],
    ['\\emptyset', '\\emptyset'], ['\\pm', '\\pm'], ['\\times', '\\times'], ['\\cdot', '\\cdot'], ['\\ldots', '\\ldots'],
  ]],
  ['Letras griegas', [
    ['\\alpha', '\\alpha'], ['\\beta', '\\beta'], ['\\gamma', '\\gamma'], ['\\delta', '\\delta'], ['\\varepsilon', '\\varepsilon'],
    ['\\theta', '\\theta'], ['\\lambda', '\\lambda'], ['\\mu', '\\mu'], ['\\pi', '\\pi'], ['\\rho', '\\rho'], ['\\sigma', '\\sigma'],
    ['\\phi', '\\phi'], ['\\omega', '\\omega'], ['\\Delta', '\\Delta'], ['\\Sigma', '\\Sigma'], ['\\Omega', '\\Omega'], ['\\Gamma', '\\Gamma'],
  ]],
  ['Conjuntos y matrices', [
    ['\\mathbb{R}', '\\mathbb{R}'], ['\\mathbb{N}', '\\mathbb{N}'], ['\\mathbb{Z}', '\\mathbb{Z}'], ['\\mathbb{Q}', '\\mathbb{Q}'], ['\\mathbb{C}', '\\mathbb{C}'],
    ['\\begin{pmatrix}', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'],
    ['\\begin{bmatrix}', '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}'],
    ['\\begin{vmatrix}', '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}'],
    ['\\begin{cases}', '\\begin{cases} x, & x \\geq 0 \\\\ -x, & x < 0 \\end{cases}'],
    ['\\begin{aligned}', '\\begin{aligned} a &= b + c \\\\ &= d \\end{aligned}'],
  ]],
  ['Química y texto', [
    ['\\ce{H2O}', '\\ce{H2O}'], ['\\ce{->}', '\\ce{A + B -> C}'], ['\\ce{<=>}', '\\ce{A <=> B}'],
    ['\\text{texto}', '\\text{texto}'], ['\\quad', '\\quad'], ['\\,', '\\,'],
  ]],
];
