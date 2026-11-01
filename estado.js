// Estado compartido entre las vistas (lista, editor, presentar).

export const S = {
  store: null,

  // editor
  pid: null,
  pres: null,
  slides: [],
  sid: null,
  sel: null,
  editando: null,
  antesEdicion: null,
  ocupado: new Set(), // ids de elementos que se están moviendo/editando localmente
  escala: 1,
  zoom: 'ajustar',
  undo: [],
  redo: [],
  usuarios: [],
  portapapeles: null,

  // presentar
  idx: 0,
};

export const E = {}; // referencias a nodos del DOM, se llenan en app.js
