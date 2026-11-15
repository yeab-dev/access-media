// Debo's lessons come from the Digital Bridge learning media server.
// A real provider writes one fixed address here (or the usual <script src="https://SERVER/module/db-player.js">).
// This demo site runs in two places, so it picks:
//  - served by the Digital Bridge server itself at /debo/ (the hosted demo): that same server;
//  - opened on its own (python3 -m http.server 8081): the server on this computer.
const SERVER = location.pathname.startsWith('/debo/') ? location.origin : 'http://localhost:8080';
await import(`${SERVER}/module/db-player.js`);
