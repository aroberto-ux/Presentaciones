// ─────────────────────────────────────────────────────────────
//  Configuración de Firebase
// ─────────────────────────────────────────────────────────────
//  Mientras `firebaseConfig` sea null la página funciona en MODO LOCAL:
//  todo se guarda solo en este navegador (sirve para probar).
//
//  Para activar la edición colaborativa, crea un proyecto en
//  https://console.firebase.google.com, añade una app web y pega aquí
//  el objeto de configuración que te muestra. Los pasos completos
//  están en el README.md.
//
//  Ejemplo:
//
//  export const firebaseConfig = {
//    apiKey: "AIza...",
//    authDomain: "mi-proyecto.firebaseapp.com",
//    projectId: "mi-proyecto",
//    storageBucket: "mi-proyecto.appspot.com",
//    messagingSenderId: "1234567890",
//    appId: "1:1234567890:web:abcdef"
//  };
//
//  (Esa clave no es secreta: la seguridad la dan las reglas de
//  Firestore del archivo firestore.rules.)
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = null;

export const opciones = {
  // 'anonima': quien abre el enlace entra directo y elige un nombre.
  // 'google' : hay que iniciar sesión con Google (úsalo con las reglas
  //            "estrictas" del README para limitar quién puede editar).
  autenticacion: 'anonima',

  // Título que se ve en la lista de presentaciones.
  titulo: 'Presentaciones',
};
