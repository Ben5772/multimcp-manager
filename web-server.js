import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import SupergatewayManager from './manager.js';
import fs from 'fs';
import { Client } from 'ssh2';

// SSH 会话管理
const sshSessions = new Map();
let sshSessionIdCounter = 1;

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
    
    const server = manager.config.servers[index];
    
    // 尝试通过 SSH 执行停止命令或 kill 进程
    try {
      // 获取默认的 SSH 会话（第一个连接的宿主机）
      const defaultSessionId = Array.from(sshSessions.keys())[0];
      if (defaultSessionId) {
        const session = sshSessions.get(defaultSessionId);
        
        // 如果有自定义停止命令，通过 SSH 执行
        if (server.stopCommand) {
          await executeSSHCommand(session.conn, server.stopCommand);
        } 
        // 否则根据类型执行停止操作
        else if (server.type === 'direct') {
          // 直接运行的进程，通过 PID kill
          if (server.pid) {
            await executeSSHCommand(session.conn, `kill -9 ${server.pid}`);
          } else {
            // 没有 PID，尝试通过端口查找并 kill
            await executeSSHCommand(session.conn, `fuser -k ${server.port}/tcp 2>/dev/null || true`);
          }
        } else {
          // Supergateway 模式，通过端口 kill
          await executeSSHCommand(session.conn, `fuser -k ${server.port}/tcp 2>/dev/null || true`);
        }
      } else {
        // 没有 SSH 连接，使用本地方式停止
        if (manager.processes.has(req.params.name)) {
          await manager.stopServer(req.params.name);
        }
      }
    } catch (stopError) {
      // 忽略停止错误，继续删除配置
      console.warn('Failed to stop server via SSH:', stopError.message);
    }
    
    // 从配置中删除
    manager.config.servers.splice(index, 1);
    manager.saveConfig();
    
    res.json({ success: true, message: 'Server deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to execute SSH command
async function executeSSHCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      
      let stdout = '';
      let stderr = '';
      
      stream.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
      
      stream.on('data', (data) => {
        stdout += data.toString();
      });
      
      stream.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
}

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

// Batch delete servers
app.post('/api/batch/delete', async (req, res) => {
  try {
    const { servers } = req.body;
    if (!servers || !Array.isArray(servers)) {
      return res.status(400).json({ error: 'Servers array required' });
    }
    
    const results = [];
    
    // 获取 SSH 会话
    const defaultSessionId = Array.from(sshSessions.keys())[0];
    const sshSession = defaultSessionId ? sshSessions.get(defaultSessionId) : null;
    
    for (const name of servers) {
      try {
        const index = manager.config.servers.findIndex(s => s.name === name);
        if (index === -1) {
          results.push({ name, success: false, error: 'Server not found' });
          continue;
        }
        
        const server = manager.config.servers[index];
        
        // 通过 SSH 执行停止命令
        if (sshSession) {
          try {
            if (server.stopCommand) {
              await executeSSHCommand(sshSession.conn, server.stopCommand);
            } else if (server.type === 'direct' && server.pid) {
              await executeSSHCommand(sshSession.conn, `kill -9 ${server.pid}`);
            } else {
              await executeSSHCommand(sshSession.conn, `fuser -k ${server.port}/tcp 2>/dev/null || true`);
            }
          } catch (stopError) {
            console.warn(`Failed to stop ${name} via SSH:`, stopError.message);
          }
        } else {
          // 没有 SSH 连接，尝试本地停止
          try {
            await manager.stopServer(name);
          } catch (localStopError) {
            if (!localStopError.message.includes('not running')) {
              throw localStopError;
            }
          }
        }
        
        manager.config.servers.splice(index, 1);
        results.push({ name, success: true });
      } catch (error) {
        results.push({ name, success: false, error: error.message });
      }
    }
    
    manager.saveConfig();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk import servers
app.post('/api/servers/bulk', async (req, res) => {
  try {
    const { servers } = req.body;
    if (!servers || !Array.isArray(servers)) {
      return res.status(400).json({ error: 'Servers array required' });
    }
    
    const results = [];
    for (const serverData of servers) {
      try {
        if (!serverData.name || !serverData.port) {
          results.push({ name: serverData.name || 'unknown', success: false, error: 'Name and port required' });
          continue;
        }
        
        if (manager.config.servers.find(s => s.name === serverData.name)) {
          results.push({ name: serverData.name, success: false, error: 'Server name already exists' });
          continue;
        }
        
        const server = {
          enabled: false,
          type: serverData.type || 'supergateway',
          command: serverData.command || 'npx',
          args: serverData.args || [],
          env: serverData.env || {},
          autoRestart: serverData.autoRestart !== false,
          maxRestarts: serverData.maxRestarts || 3,
          healthCheck: serverData.healthCheck || {
            enabled: true,
            interval: manager.config.globalSettings?.healthCheck?.defaultInterval || 10000,
            endpoint: '/sse',
            timeout: 5000
          },
          supergatewayArgs: serverData.supergatewayArgs || {
            stdio: true,
            outputTransport: 'sse',
            port: serverData.port,
            cors: true
          },
          ...serverData
        };
        
        manager.config.servers.push(server);
        results.push({ name: server.name, success: true });
      } catch (error) {
        results.push({ name: serverData.name || 'unknown', success: false, error: error.message });
      }
    }
    
    manager.saveConfig();
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

// SSH API 端点
app.post('/api/ssh/connect', async (req, res) => {
  try {
    const { host, user, pass, saveConfig = false } = req.body;
    if (!host || !user || !pass) {
      return res.status(400).json({ error: 'Host, user and password are required' });
    }

    const conn = new Client();
    const sessionId = sshSessionIdCounter++;
    
    conn.on('ready', () => {
      sshSessions.set(sessionId, { conn, host, user });
      
      // 如果需要保存配置
      if (saveConfig) {
        manager.saveSSHConfig({ host, user, pass });
      }
      
      res.json({ success: true, sessionId, message: `Connected to ${user}@${host}` });
    });

    conn.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });

    conn.connect({
      host,
      port: 22,
      username: user,
      password: pass,
      readyTimeout: 20000
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get saved SSH config
app.get('/api/ssh/config', async (req, res) => {
  try {
    const sshConfig = manager.getSSHConfig();
    res.json({ success: true, sshConfig });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update SSH config
app.post('/api/ssh/config', async (req, res) => {
  try {
    const { host, user, pass, enabled, autoConnect } = req.body;
    manager.saveSSHConfig({ host, user, pass, enabled, autoConnect });
    res.json({ success: true, message: 'SSH config updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete saved SSH config
app.delete('/api/ssh/config', async (req, res) => {
  try {
    manager.deleteSSHConfig();
    res.json({ success: true, message: 'SSH config deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ssh/execute', async (req, res) => {
  try {
    const { sessionId, command } = req.body;
    if (!sessionId || !command) {
      return res.status(400).json({ error: 'Session ID and command are required' });
    }

    const session = sshSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'SSH session not found' });
    }

    session.conn.exec(command, (err, stream) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      let stdout = '';
      let stderr = '';

      stream.on('close', (code) => {
        res.json({ success: code === 0, stdout, stderr, exitCode: code });
      });

      stream.on('data', (data) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ssh/disconnect', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = sshSessions.get(sessionId);
    
    if (session) {
      session.conn.end();
      sshSessions.delete(sessionId);
    }
    
    res.json({ success: true, message: 'Disconnected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add custom template
app.post('/api/templates', async (req, res) => {
  try {
    const { key, template } = req.body;
    
    if (!key || !template) {
      return res.status(400).json({ error: 'Key and template required' });
    }
    
    if (!manager.config.globalSettings.templates) {
      manager.config.globalSettings.templates = {};
    }
    
    manager.config.globalSettings.templates[key] = template;
    manager.saveConfig();
    res.json({ success: true, templates: manager.getTemplates() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete template
app.delete('/api/templates/:key', async (req, res) => {
  try {
    const templates = manager.getTemplates();
    delete templates[req.params.key];
    
    manager.config.globalSettings.templates = templates;
    manager.saveConfig();
    res.json({ success: true, templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export templates
app.get('/api/templates/export', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      templates: manager.getTemplates(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import templates
app.post('/api/templates/import', async (req, res) => {
  try {
    const { templates, merge = true } = req.body;
    
    if (!templates || typeof templates !== 'object') {
      return res.status(400).json({ error: 'Invalid templates data' });
    }
    
    if (!merge) {
      manager.config.globalSettings.templates = templates;
    } else {
      if (!manager.config.globalSettings.templates) {
        manager.config.globalSettings.templates = {};
      }
      Object.assign(manager.config.globalSettings.templates, templates);
    }
    
    manager.saveConfig();
    res.json({ success: true, templates: manager.getTemplates() });
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
  console.log('  POST /api/templates            - Add template');
  console.log('  DELETE /api/templates/:name    - Delete template');
  console.log('  POST /api/ssh/connect          - SSH connect');
  console.log('  POST /api/ssh/execute          - SSH execute');
  console.log('  POST /api/ssh/disconnect       - SSH disconnect');
  console.log('  GET  /api/backups              - List backups');
  console.log('  POST /api/backups/create       - Create backup');
  console.log('  POST /api/execute              - Execute shell command');
});
