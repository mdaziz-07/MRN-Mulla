importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-messaging.js');

firebase.initializeApp({
  apiKey: "AIzaSyDp01XzR_CU57pH6VaqqpFjBIyircDj_Lg",
  authDomain: "mrn-mulla.firebaseapp.com",
  projectId: "mrn-mulla",
  storageBucket: "mrn-mulla.firebasestorage.app",
  messagingSenderId: "989396560408",
  appId: "1:989396560408:web:935cdd9951c2ea98ff316d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/vite.svg', // Ensure you have an icon in public folder
    vibrate: [200, 100, 200]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});