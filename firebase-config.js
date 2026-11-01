// ─────────────────────────────────────────────────────────────
//  Configuración de Firebase
// ─────────────────────────────────────────────────────────────
//  Mientras `firebaseConfig` sea null la página funciona en MODO LOCAL:
//  todo se guarda solo en este navegador (sirve para probar).
//
//  Con el objeto de abajo se activa la edición colaborativa.
//  Los pasos completos están en el README.md.
//
//  (Esa clave no es secreta: la seguridad la dan las reglas de
//  Firestore del archivo firestore.rules.)
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyBn3FAgU8ZjnJRlIGJKjd0xA5Rwy_GQQcA",
  authDomain: "presentaciones-6379f.firebaseapp.com",
  projectId: "presentaciones-6379f",
  storageBucket: "presentaciones-6379f.firebasestorage.app",
  messagingSenderId: "1021153712954",
  appId: "1:1021153712954:web:74e42f23b056efdb5c0e03",
  measurementId: "G-6HXTJCKM83"
};

export const opciones = {
  // 'anonima': quien abre el enlace entra directo y elige un nombre.
  // 'google' : hay que iniciar sesión con Google (úsalo con las reglas
  //            "estrictas" del README para limitar quién puede editar).
  autenticacion: 'anonima',

  // Título que se ve en la lista de presentaciones.
  titulo: 'Presentaciones',
};
