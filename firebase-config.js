import {
    getApp,
    getApps,
    initializeApp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAkhKLtFGITmECoBgemJrAxvyXVxhW7wKw",
    authDomain: "tapmenu-c82b8.firebaseapp.com",
    projectId: "tapmenu-c82b8",
    storageBucket: "tapmenu-c82b8.firebasestorage.app",
    messagingSenderId: "54079571067",
    appId: "1:54079571067:web:bbf65cb182882d27a44ede",
    measurementId: "G-NES48ZN0YQ"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

console.log("TapMenu Firebase initialized successfully!");
