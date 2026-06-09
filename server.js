const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let clients = [];

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { jugadores: [], pronosticos: {}, resultados: {}, locked: false };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch(e) {
    return { jugadores: [], pronosticos: {}, resultados: {}, locked: false };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients = clients.filter(c => !c.destroyed);
  clients.forEach(c => { try { c.write(msg); } catch(e){} });
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  clients.push(res);
  const data = loadData();
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch(e){ clearInterval(heartbeat); } }, 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients = clients.filter(c => c !== res);
  });
});

app.get('/api/state', (req, res) => res.json(loadData()));

app.post('/api/jugadores', (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  const data = loadData();
  const nombreTrim = nombre.trim();
  if (data.jugadores.find(j => j.toLowerCase() === nombreTrim.toLowerCase()))
    return res.status(409).json({ error: 'Ya existe un jugador con ese nombre' });
  data.jugadores.push(nombreTrim);
  if (!data.pronosticos[nombreTrim]) data.pronosticos[nombreTrim] = {};
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/pronosticos', (req, res) => {
  const { jugador, partidoId, lado, valor } = req.body;
  const data = loadData();
  if (data.locked) return res.status(403).json({ error: 'Pronósticos cerrados' });
  if (!data.pronosticos[jugador]) data.pronosticos[jugador] = {};
  if (!data.pronosticos[jugador][partidoId]) data.pronosticos[jugador][partidoId] = { local: '', visit: '' };
  data.pronosticos[jugador][partidoId][lado] = valor === '' ? '' : parseInt(valor);
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/resultados', (req, res) => {
  const { pass, partidoId, local, visit } = req.body;
  if (pass !== (process.env.ADMIN_PASS || 'admin123')) return res.status(401).json({ error: 'No autorizado' });
  const data = loadData();
  data.resultados[partidoId] = { local: parseInt(local), visit: parseInt(visit) };
  saveData(data);
  res.json({ ok: true });
});

app.delete('/api/resultados/:id', (req, res) => {
  const { pass } = req.body;
  if (pass !== (process.env.ADMIN_PASS || 'admin123')) return res.status(401).json({ error: 'No autorizado' });
  const data = loadData();
  delete data.resultados[req.params.id];
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/lock', (req, res) => {
  const { pass } = req.body;
  if (pass !== (process.env.ADMIN_PASS || 'admin123')) return res.status(401).json({ error: 'No autorizado' });
  const data = loadData();
  data.locked = !data.locked;
  saveData(data);
  res.json({ locked: data.locked });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Prode Mundial 2026 corriendo en puerto ${PORT}`);
});
