import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBdLihfRzX-s7dE4-KtUh4Objx74yIljL0',
  authDomain: 'rf-football.firebaseapp.com',
  projectId: 'rf-football',
  storageBucket: 'rf-football.firebasestorage.app',
  messagingSenderId: '556649562326',
  appId: '1:556649562326:web:c21789ad4b2e66329fc977',
  measurementId: 'G-1YJ23GT3VP'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});
const loginScreen = document.querySelector('#loginScreen');
const loginForm = document.querySelector('#loginForm');
const loginButton = document.querySelector('#loginButton');
const loginError = document.querySelector('#loginError');
const syncStatus = document.querySelector('#syncStatus');
const accountBtn = document.querySelector('#accountBtn');
let activeUser = null;

function setStatus(text, mode='') {
  syncStatus.textContent = text;
  syncStatus.className = `sync-status ${mode}`.trim();
}

function friendlyAuthError(code) {
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Email ou palavra-passe incorretos.';
  if (code === 'auth/too-many-requests') return 'Demasiadas tentativas. Aguarda alguns minutos.';
  if (code === 'auth/network-request-failed') return 'Sem ligação à internet.';
  return 'Não foi possível iniciar sessão.';
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';
  loginButton.disabled = true;
  loginButton.textContent = 'A entrar…';
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, document.querySelector('#loginEmail').value.trim(), document.querySelector('#loginPassword').value);
  } catch (error) {
    loginError.textContent = friendlyAuthError(error.code);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = 'Entrar';
  }
});

accountBtn.addEventListener('click', () => {
  if (activeUser && confirm('Terminar a sessão na RF Football?')) signOut(auth);
});

async function hydrateFromCloud(user) {
  setStatus('A sincronizar…');
  const matchRef = doc(db, 'users', user.uid, 'app', 'match');
  const exercisesRef = doc(db, 'users', user.uid, 'app', 'exercises');
  const [matchSnap, exercisesSnap] = await Promise.all([getDoc(matchRef), getDoc(exercisesRef)]);
  let reload = false;

  if (matchSnap.exists()) {
    const remote = matchSnap.data();
    const localUpdated = Number(localStorage.getItem('rf-football-match-updated') || 0);
    if ((remote.updatedAt || 0) > localUpdated && remote.data) {
      localStorage.setItem('rf-football-match', JSON.stringify(remote.data));
      localStorage.setItem('rf-football-match-updated', String(remote.updatedAt));
      reload = true;
    }
  } else {
    const data = JSON.parse(localStorage.getItem('rf-football-match') || '{}');
    await setDoc(matchRef, {data, updatedAt: Date.now()});
  }

  if (exercisesSnap.exists()) {
    const remote = exercisesSnap.data();
    const localUpdated = Number(localStorage.getItem('rf-football-exercises-updated') || 0);
    if ((remote.updatedAt || 0) > localUpdated && Array.isArray(remote.data)) {
      localStorage.setItem('rf-football-exercises', JSON.stringify(remote.data));
      localStorage.setItem('rf-football-exercises-updated', String(remote.updatedAt));
      reload = true;
    }
  } else {
    const data = JSON.parse(localStorage.getItem('rf-football-exercises') || '[]');
    await setDoc(exercisesRef, {data, updatedAt: Date.now()});
  }

  setStatus(navigator.onLine ? 'Sincronizado' : 'Modo offline', navigator.onLine ? 'synced' : 'offline');
  if (reload) location.reload();
}

onAuthStateChanged(auth, async user => {
  activeUser = user;
  loginScreen.classList.toggle('authenticated', Boolean(user));
  if (!user) {
    setStatus('Sessão terminada');
    return;
  }
  accountBtn.title = user.email ? `Terminar sessão — ${user.email}` : 'Terminar sessão';
  try {
    await hydrateFromCloud(user);
  } catch (error) {
    console.error(error);
    setStatus(navigator.onLine ? 'Erro de sincronização' : 'Modo offline', 'offline');
  }
});

window.addEventListener('rf:match-changed', async event => {
  if (!activeUser) return;
  setStatus('A guardar…');
  try {
    await setDoc(doc(db, 'users', activeUser.uid, 'app', 'match'), event.detail);
    setStatus('Sincronizado', 'synced');
  } catch {
    setStatus('Guardado offline', 'offline');
  }
});

window.addEventListener('rf:exercises-changed', async event => {
  if (!activeUser) return;
  setStatus('A guardar…');
  try {
    await setDoc(doc(db, 'users', activeUser.uid, 'app', 'exercises'), event.detail);
    setStatus('Sincronizado', 'synced');
  } catch {
    setStatus('Guardado offline', 'offline');
  }
});

window.addEventListener('online', () => setStatus('Ligação recuperada', 'synced'));
window.addEventListener('offline', () => setStatus('Modo offline', 'offline'));
