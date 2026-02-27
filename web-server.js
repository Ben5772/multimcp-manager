import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import SupergatewayManager from './manager.js';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const manager = new SupergatewayManager();

// Get all servers status
app.get('/api/servers', async (req, res) => {
  try {
    res.json(manager.getStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start a server
app.post('/api/servers/:name/start', async (req, res) => {
  try {
    const result = await manager.startServer(req.params.name);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop a server
app.post('/api/servers/:name/stop', async (req, res) => {
  try {
    await manager.stopServer(req.params.name);
    res.json({ success: true, message: 'Server stopped' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restart a server
app.post('/api/servers/:name/restart', async (req, res) => {
  try {
    await manager.restartServer(req.params.name);
    res.json({ success: true, message: 'Server restarted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get server logs
app.get('/api/servers/:name/logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 50;
    const logs = manager.getLogs(req.params.name, lines);
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update server config
app.put('/api/servers/:name/config', async (req, res) => {
  try {
    const index = manager.config.servers.findIndex(s => s.name === req.params.name);
    if (index === -1) return res.status(404).json({ error: 'Server not found' });
    
    manager.config.servers[index] = { 
      ...manager.config.servers[index], 
      ...req.body,
      name: manager.config.servers[index].name
    };
    manager.saveConfig();
    res.json({ success: true, server: manager.config.servers[index] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new server
app.post('/api/servers', async (req, res) => {
  try {
    const newServer = req.body;
    
    if (!newServer.name || !newServer.port) {
      return res.status(400).json({ error: 'Name and port are required' });
    }
    
    if (manager.config.servers.find(s => s.name === newServer.name)) {
      return res.status(400).json({ error: 'Server name already exists' });
    }
    
    const server = {
      enabled: false,
      type: 'supergateway',
      command: 'npx',
      args: [],
      env: {},
      autoRestart: true,
      maxRestarts: 3,
      healthCheck: {
        enabled: true,
        interval: manager.config.globalSettings?.healthCheck?.defaultInterval || 10000,
        endpoint: '/sse',
        timeout: 5000
      },
      supergatewayArgs: {
        stdio: true,
        outputTransport: 'sse',
        port: newServer.port,
        cors: true
      },
      ...newServer
    };
    
    manager.config.servers.push(server);
    manager.saveConfig();
    res.json({ success: true, server });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete server
app.delete('/api/servers/:name', async (req, res) => {
  try {
    const index = manager.config.servers.findIndex(s => s.name === req.params.name);
    if (index === -1) return res.status(404).json({ error: 'Server not found' });
    
    await manager.stopServer(req.params.name);
    
    manager.config.servers.splice(index, 1);
    manager.saveConfig();
    res.json({ success: true, message: 'Server deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch operations
app.post('/api/batch', async (req, res) => {
  try {
    const { operation, servers } = req.body;
    if (!operation || !servers || !Array.isArray(servers)) {
      return res.status(400).json({ error: 'Operation and servers array required' });
    }
    
    const results = await manager.batchOperation(operation, servers);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start all enabled servers
app.post('/api/start-all', async (req, res) => {
  try {
    const enabledServers = manager.config.servers
      .filter(s => s.enabled)
      .map(s => s.name);
    
    const results = await manager.batchOperation('start', enabledServers);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop all servers
app.post('/api/stop-all', async (req, res) => {
  try {
    const runningServers = manager.config.servers
      .filter(s => s.running)
      .map(s => s.name);
    
    const results = await manager.batchOperation('stop', runningServers);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute shell command
app.post('/api/execute', async (req, res) => {
  try {
    const { command, timeout = 30000 } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }
    
    const { exec } = await import('child_process');
    
    exec(command, { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      res.json({
        success: !error,
        exitCode: error ? error.code : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        error: error ? error.message : null
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/servers/:name/health', async (req, res) => {
  try {
    const health = await manager.checkHealth(req.params.name);
    res.json({ success: true, health });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Port management
app.get('/api/ports', async (req, res) => {
  try {
    const usedPorts = manager.getUsedPorts();
    const availablePorts = [];
    
    for (let port = 8000; port < 8100; port++) {
      if (!usedPorts.includes(port)) {
        const available = await manager.checkPortAvailable(port);
        if (available) availablePorts.push(port);
      }
    }
    
    res.json({ 
      success: true, 
      used: usedPorts,
      available: availablePorts.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ports/check', async (req, res) => {
  try {
    const { port } = req.body;
    if (!port) return res.status(400).json({ error: 'Port required' });
    
    const available = await manager.checkPortAvailable(port);
    res.json({ success: true, port, available });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ports/find', async (req, res) => {
  try {
    const { startPort = 8000 } = req.body;
    const port = await manager.findAvailablePort(startPort);
    res.json({ success: true, port });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Templates
app.get('/api/templates', async (req, res) => {
  try {
    res.json({ success: true, templates: manager.getTemplates() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/templates/:name/create', async (req, res) => {
  try {
    const server = manager.createFromTemplate(req.params.name, req.body);
    
    if (manager.config.servers.find(s => s.name === server.name)) {
      return res.status(400).json({ error: 'Server name already exists' });
    }
    
    manager.config.servers.push(server);
    manager.saveConfig();
    res.json({ success: true, server });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Backup management
app.get('/api/backups', async (req, res) => {
  try {
    const backups = manager.listBackups();
    res.json({ success: true, backups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/backups/create', async (req, res) => {
  try {
    const backupFile = manager.createBackup();
    res.json({ success: true, file: path.basename(backupFile) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/backups/restore', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Backup name required' });
    
    manager.restoreBackup(name);
    res.json({ success: true, message: 'Config restored' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Email settings
app.get('/api/settings/email', async (req, res) => {
  try {
    const email = manager.config.globalSettings?.email;
    res.json({ 
      success: true, 
      email: email ? { enabled: email.enabled, to: email.to } : null 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings/email', async (req, res) => {
  try {
    if (!manager.config.globalSettings) manager.config.globalSettings = {};
    manager.config.globalSettings.email = {
      ...manager.config.globalSettings.email,
      ...req.body
    };
    manager.saveConfig();
    manager.initEmail();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Global settings
app.get('/api/settings', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      settings: {
        healthCheck: manager.config.globalSettings?.healthCheck,
        email: manager.config.globalSettings?.email ? { enabled: manager.config.globalSettings.email.enabled } : null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = manager.config.globalSettings?.webPort || 3457;

app.listen(PORT, () => {
  console.log(`Supergateway Manager Web UI running at http://localhost:${PORT}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /api/servers              - List all servers');
  console.log('  POST /api/servers/:name/start  - Start a server');
  console.log('  POST /api/servers/:name/stop   - Stop a server');
  console.log('  POST /api/servers/:name/restart- Restart a server');
  console.log('  GET  /api/servers/:name/logs   - Get server logs');
  console.log('  GET  /api/servers/:name/health - Check server health');
  console.log('  POST /api/batch                - Batch operations');
  console.log('  POST /api/start-all            - Start all enabled');
  console.log('  POST /api/stop-all             - Stop all running');
  console.log('  GET  /api/ports                - Port management');
  console.log('  GET  /api/templates            - List templates');
  console.log('  GET  /api/backups              - List backups');
  console.log('  POST /api/backups/create       - Create backup');
  console.log('  POST /api/execute              - Execute shell command');
});
