import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import nodemailer from 'nodemailer';
import cron from 'node-cron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, 'config.json');

class SupergatewayManager {
  constructor() {
    this.config = this.loadConfig();
    this.processes = new Map();
    this.healthStatus = new Map();
    this.alertHistory = new Map();
    this.emailTransporter = null;
    this.initEmail();
    this.initBackup();
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load config:', error.message);
      return { servers: [], globalSettings: {} };
    }
  }

  saveConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  // Email notification setup
  initEmail() {
    const emailConfig = this.config.globalSettings?.email;
    if (emailConfig?.enabled && emailConfig.smtp) {
      this.emailTransporter = nodemailer.createTransport(emailConfig.smtp);
      console.log('Email notifications enabled');
    }
  }

  async sendAlert(serverName, status, details = '') {
    const emailConfig = this.config.globalSettings?.email;
    if (!emailConfig?.enabled || !this.emailTransporter) return;

    const now = Date.now();
    const lastAlert = this.alertHistory.get(serverName);
    const alertInterval = emailConfig.alertInterval || 14400000; // 4 hours

    // Check if we should send alert (first time or interval passed)
    if (lastAlert && (now - lastAlert) < alertInterval) {
      return;
    }

    const subject = status === 'down' 
      ? `🚨 MCP服务器离线: ${serverName}` 
      : `✅ MCP服务器恢复: ${serverName}`;
    
    const html = `
      <h2>${subject}</h2>
      <p><strong>服务器:</strong> ${serverName}</p>
      <p><strong>状态:</strong> ${status}</p>
      <p><strong>时间:</strong> ${new Date().toLocaleString()}</p>
      ${details ? `<p><strong>详情:</strong> ${details}</p>` : ''}
      <hr>
      <p><small>Supergateway Manager 自动告警</small></p>
    `;

    try {
      await this.emailTransporter.sendMail({
        from: emailConfig.smtp.auth.user,
        to: emailConfig.to,
        subject,
        html
      });
      this.alertHistory.set(serverName, now);
      console.log(`Alert sent for ${serverName}: ${status}`);
    } catch (error) {
      console.error('Failed to send email:', error.message);
    }
  }

  // Backup functionality
  initBackup() {
    const backupDir = this.config.globalSettings?.backupDir || path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Auto backup every hour
    cron.schedule('0 * * * *', () => {
      this.createBackup();
    });
  }

  createBackup() {
    const backupDir = this.config.globalSettings?.backupDir || path.join(__dirname, 'backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `config-${timestamp}.json`);
    
    fs.copyFileSync(CONFIG_FILE, backupFile);
    
    // Keep only last 24 backups
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('config-'))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtime }))
      .sort((a, b) => b.time - a.time);
    
    if (backups.length > 24) {
      backups.slice(24).forEach(b => {
        fs.unlinkSync(path.join(backupDir, b.name));
      });
    }
    
    console.log(`Backup created: ${backupFile}`);
    return backupFile;
  }

  listBackups() {
    const backupDir = this.config.globalSettings?.backupDir || path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) return [];
    
    return fs.readdirSync(backupDir)
      .filter(f => f.startsWith('config-'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(backupDir, f)).mtime.toISOString(),
        size: fs.statSync(path.join(backupDir, f)).size
      }))
      .sort((a, b) => new Date(b.time) - new Date(a.time));
  }

  restoreBackup(backupName) {
    const backupDir = this.config.globalSettings?.backupDir || path.join(__dirname, 'backups');
    const backupFile = path.join(backupDir, backupName);
    
    if (!fs.existsSync(backupFile)) {
      throw new Error('Backup not found');
    }
    
    // Create backup of current config first
    this.createBackup();
    
    fs.copyFileSync(backupFile, CONFIG_FILE);
    this.config = this.loadConfig();
    return true;
  }

  // Port management
  async checkPortAvailable(port) {
    return new Promise((resolve) => {
      const server = http.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port);
    });
  }

  async findAvailablePort(startPort = 8000) {
    for (let port = startPort; port < 65535; port++) {
      if (await this.checkPortAvailable(port)) {
        return port;
      }
    }
    throw new Error('No available port found');
  }

  getUsedPorts() {
    return this.config.servers.map(s => s.port);
  }

  // Health check
  async checkHealth(serverName) {
    const server = this.config.servers.find(s => s.name === serverName);
    if (!server || !server.enabled || !server.running) {
      return { healthy: false, reason: 'not running' };
    }

    const healthConfig = server.healthCheck || {};
    if (healthConfig.enabled === false) {
      return { healthy: true, reason: 'health check disabled' };
    }

    const port = server.port;
    const endpoint = healthConfig.endpoint || '/sse';
    const timeout = healthConfig.timeout || 5000;

    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}${endpoint}`, {
        timeout,
        headers: { 'Accept': 'text/event-stream' }
      }, (res) => {
        resolve({ 
          healthy: res.statusCode < 500, 
          statusCode: res.statusCode,
          responseTime: Date.now()
        });
      });

      req.on('error', () => resolve({ healthy: false, reason: 'connection failed' }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ healthy: false, reason: 'timeout' });
      });
    });
  }

  startHealthChecks() {
    const defaultInterval = this.config.globalSettings?.healthCheck?.defaultInterval || 10000;
    
    this.config.servers.forEach(server => {
      if (server.healthCheck?.enabled === false) return;
      
      const interval = server.healthCheck?.interval || defaultInterval;
      
      const check = async () => {
        if (!this.processes.has(server.name)) return;
        
        const health = await this.checkHealth(server.name);
        const previousStatus = this.healthStatus.get(server.name);
        
        this.healthStatus.set(server.name, {
          ...health,
          lastCheck: new Date().toISOString()
        });

        // Send alerts on status change
        if (health.healthy === false && previousStatus?.healthy !== false) {
          await this.sendAlert(server.name, 'down', health.reason);
        } else if (health.healthy === true && previousStatus?.healthy === false) {
          await this.sendAlert(server.name, 'up');
          this.alertHistory.delete(server.name); // Reset alert history
        }
      };

      // Initial check
      check();
      
      // Schedule periodic checks
      const intervalId = setInterval(check, interval);
      this.processes.set(`${server.name}_health`, { intervalId });
    });
  }

  stopHealthChecks(serverName) {
    const healthProcess = this.processes.get(`${serverName}_health`);
    if (healthProcess) {
      clearInterval(healthProcess.intervalId);
      this.processes.delete(`${serverName}_health`);
    }
  }

  // Process management
  buildCommand(serverConfig) {
    if (serverConfig.type === 'direct') {
      return {
        command: serverConfig.command,
        args: serverConfig.args || []
      };
    }

    const args = ['-y', 'supergateway'];
    const sgArgs = serverConfig.supergatewayArgs || {};
    const stdioCmd = `${serverConfig.command} ${(serverConfig.args || []).join(' ')}`;
    args.push('--stdio', stdioCmd);

    if (sgArgs.outputTransport) {
      args.push('--outputTransport', sgArgs.outputTransport);
    }
    args.push('--port', (sgArgs.port || serverConfig.port).toString());
    if (sgArgs.ssePath) args.push('--ssePath', sgArgs.ssePath);
    if (sgArgs.messagePath) args.push('--messagePath', sgArgs.messagePath);
    if (sgArgs.streamableHttpPath) args.push('--streamableHttpPath', sgArgs.streamableHttpPath);
    if (sgArgs.cors) args.push('--cors');
    if (sgArgs.stateful) args.push('--stateful');
    if (sgArgs.sessionTimeout) args.push('--sessionTimeout', sgArgs.sessionTimeout.toString());
    if (sgArgs.headers) {
      sgArgs.headers.forEach(header => args.push('--header', header));
    }

    return { command: 'npx', args };
  }

  buildStopCommand(serverConfig) {
    // For custom templates with stopCommand
    if (serverConfig.stopCommand) {
      return {
        command: serverConfig.stopCommand.split(' ')[0],
        args: serverConfig.stopCommand.split(' ').slice(1)
      };
    }
    // Default to SIGTERM
    return null;
  }

  async startServer(name) {
    const server = this.config.servers.find(s => s.name === name);
    if (!server) throw new Error(`Server ${name} not found`);
    if (this.processes.has(name)) throw new Error(`Server ${name} already running`);

    // Check port availability
    const portAvailable = await this.checkPortAvailable(server.port);
    if (!portAvailable) {
      throw new Error(`Port ${server.port} is already in use`);
    }

    const { command, args } = this.buildCommand(server);
    console.log(`Starting ${name}: ${command} ${args.join(' ')}`);

    const env = { ...process.env, ...server.env };
    const child = spawn(command, args, {
      env,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const logFile = path.join(this.config.globalSettings?.logDir || path.join(__dirname, 'logs'), `${name}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    let restartCount = 0;

    child.on('exit', async (code) => {
      console.log(`Server ${name} exited with code ${code}`);
      this.processes.delete(name);
      this.stopHealthChecks(name);
      logStream.end();

      if (server.autoRestart && restartCount < (server.maxRestarts || 3)) {
        restartCount++;
        console.log(`Auto-restarting ${name} (attempt ${restartCount}/${server.maxRestarts || 3})...`);
        await new Promise(r => setTimeout(r, 2000));
        await this.startServer(name);
      }
    });

    this.processes.set(name, { process: child, restartCount });
    server.running = true;
    server.pid = child.pid;
    
    // Start health checks
    this.startHealthChecks();
    
    return { pid: child.pid };
  }

  async stopServer(name) {
    const proc = this.processes.get(name);
    if (!proc) throw new Error(`Server ${name} not running`);

    // Try custom stop command first if available
    const server = this.config.servers.find(s => s.name === name);
    const stopCmd = server ? this.buildStopCommand(server) : null;
    
    if (stopCmd) {
      // Execute custom stop command
      const { spawn } = await import('child_process');
      const child = spawn(stopCmd.command, stopCmd.args);
      
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 5000);
        
        child.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } else {
      // Default SIGTERM
      proc.process.kill('SIGTERM');
      
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          proc.process.kill('SIGKILL');
          resolve();
        }, 5000);
        
        proc.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    this.processes.delete(name);
    this.stopHealthChecks(name);
    
    if (server) {
      server.running = false;
      server.pid = null;
    }
  }

  async restartServer(name) {
    await this.stopServer(name);
    await new Promise(r => setTimeout(r, 1000));
    return await this.startServer(name);
  }

  getStatus() {
    return this.config.servers.map(server => ({
      ...server,
      health: this.healthStatus.get(server.name) || null
    }));
  }

  getLogs(name, lines = 50) {
    const logFile = path.join(this.config.globalSettings?.logDir || path.join(__dirname, 'logs'), `${name}.log`);
    if (!fs.existsSync(logFile)) return '';
    
    const content = fs.readFileSync(logFile, 'utf8');
    const allLines = content.split('\n');
    return allLines.slice(-lines).join('\n');
  }

  // Batch operations
  async batchOperation(operation, serverNames) {
    const results = [];
    for (const name of serverNames) {
      try {
        if (operation === 'start') {
          await this.startServer(name);
        } else if (operation === 'stop') {
          await this.stopServer(name);
        } else if (operation === 'restart') {
          await this.restartServer(name);
        }
        results.push({ name, success: true });
      } catch (error) {
        results.push({ name, success: false, error: error.message });
      }
    }
    return results;
  }

  // Template management
  getTemplates() {
    return this.config.globalSettings?.templates || {};
  }

  createFromTemplate(templateName, customConfig = {}) {
    const templates = this.getTemplates();
    const template = templates[templateName];
    if (!template) throw new Error(`Template ${templateName} not found`);

    // Check template type
    if (template.templateType === 'custom') {
      // Custom template: use startCommand/stopCommand
      return {
        ...template,
        ...customConfig,
        enabled: false,
        type: 'direct',
        command: template.startCommand || template.command,
        stopCommand: template.stopCommand,
        running: false
      };
    } else {
      // Supergateway template
      return {
        ...template,
        ...customConfig,
        enabled: false,
        type: 'supergateway'
      };
    }
  }

  // SSH Config management
  saveSSHConfig(sshConfig) {
    if (!this.config.globalSettings) {
      this.config.globalSettings = {};
    }
    this.config.globalSettings.sshConfig = {
      host: sshConfig.host,
      user: sshConfig.user,
      pass: sshConfig.pass, // 注意：实际生产环境应该加密
      enabled: sshConfig.enabled !== undefined ? sshConfig.enabled : true,
      autoConnect: sshConfig.autoConnect !== undefined ? sshConfig.autoConnect : true
    };
    this.saveConfig();
    console.log('SSH config saved');
  }

  getSSHConfig() {
    const config = this.config.globalSettings?.sshConfig;
    if (config) {
      return {
        host: config.host,
        user: config.user,
        hasPassword: !!config.pass,
        enabled: config.enabled,
        autoConnect: config.autoConnect
      };
    }
    return null;
  }

  getSSHConfigFull() {
    return this.config.globalSettings?.sshConfig || null;
  }

  deleteSSHConfig() {
    if (this.config.globalSettings?.sshConfig) {
      delete this.config.globalSettings.sshConfig;
      this.saveConfig();
      console.log('SSH config deleted');
    }
  }

  // 删除 MCP 服务器
  async removeServer(name) {
    const serverIndex = this.config.servers.findIndex(s => s.name === name);
    if (serverIndex === -1) {
      throw new Error(`Server ${name} not found`);
    }

    // 如果正在运行，先停止
    if (this.processes.has(name)) {
      await this.stopServer(name);
    }

    // 从配置中移除
    this.config.servers.splice(serverIndex, 1);
    this.saveConfig();
    
    console.log(`Server ${name} removed from configuration`);
    return true;
  }

  // 更新模板
  updateTemplate(templateName, updates) {
    const templates = this.getTemplates();
    if (!templates[templateName]) {
      throw new Error(`Template ${templateName} not found`);
    }

    templates[templateName] = {
      ...templates[templateName],
      ...updates
    };

    if (!this.config.globalSettings.templates) {
      this.config.globalSettings.templates = {};
    }
    this.config.globalSettings.templates = templates;
    this.saveConfig();
    
    console.log(`Template ${templateName} updated`);
    return templates[templateName];
  }

  // 删除模板
  deleteTemplate(templateName) {
    const templates = this.getTemplates();
    if (!templates[templateName]) {
      throw new Error(`Template ${templateName} not found`);
    }

    delete templates[templateName];
    this.config.globalSettings.templates = templates;
    this.saveConfig();
    
    console.log(`Template ${templateName} deleted`);
    return true;
  }
}

// CLI handling
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url) || 
                     process.argv[1].endsWith('manager.js');

if (isMainModule) {
  const manager = new SupergatewayManager();
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'start':
      if (!arg) {
        console.log('Usage: node manager.js start <server-name>');
        process.exit(1);
      }
      manager.startServer(arg).then(() => {
        console.log(`Server ${arg} started`);
      }).catch(err => {
        console.error(`Failed to start ${arg}:`, err.message);
        process.exit(1);
      });
      break;

    case 'stop':
      if (!arg) {
        console.log('Usage: node manager.js stop <server-name>');
        process.exit(1);
      }
      manager.stopServer(arg).then(() => {
        console.log(`Server ${arg} stopped`);
      }).catch(err => {
        console.error(`Failed to stop ${arg}:`, err.message);
        process.exit(1);
      });
      break;

    case 'restart':
      if (!arg) {
        console.log('Usage: node manager.js restart <server-name>');
        process.exit(1);
      }
      manager.restartServer(arg).then(() => {
        console.log(`Server ${arg} restarted`);
      }).catch(err => {
        console.error(`Failed to restart ${arg}:`, err.message);
        process.exit(1);
      });
      break;

    case 'status':
      console.log('Server Status:');
      console.log('==============');
      manager.getStatus().forEach(server => {
        const status = server.running ? '✅ Running' : '⏹️ Stopped';
        const health = server.health ? (server.health.healthy ? '🟢 Healthy' : '🔴 Unhealthy') : '';
        console.log(`${server.name}: ${status} ${health} (Port: ${server.port})`);
      });
      break;

    case 'logs':
      if (!arg) {
        console.log('Usage: node manager.js logs <server-name>');
        process.exit(1);
      }
      console.log(manager.getLogs(arg, 100));
      break;

    case 'backup':
      const backupFile = manager.createBackup();
      console.log(`Backup created: ${backupFile}`);
      break;

    case 'backups':
      console.log('Available backups:');
      manager.listBackups().forEach(b => {
        console.log(`  ${b.name} - ${b.time} (${Math.round(b.size / 1024)}KB)`);
      });
      break;

    case 'restore':
      if (!arg) {
        console.log('Usage: node manager.js restore <backup-name>');
        process.exit(1);
      }
      manager.restoreBackup(arg);
      console.log(`Restored from ${arg}`);
      break;

    case 'ports':
      console.log('Used ports:', manager.getUsedPorts().join(', '));
      break;

    case 'remove':
      if (!arg) {
        console.log('Usage: node manager.js remove <server-name>');
        process.exit(1);
      }
      manager.removeServer(arg).then(() => {
        console.log(`Server ${arg} removed`);
      }).catch(err => {
        console.error(`Failed to remove ${arg}:`, err.message);
        process.exit(1);
      });
      break;

    case 'templates':
      console.log('Available templates:');
      const templates = manager.getTemplates();
      Object.keys(templates).forEach(name => {
        console.log(`  ${name}: ${templates[name].description || 'No description'}`);
      });
      break;

    case 'update-template':
      if (!arg) {
        console.log('Usage: node manager.js update-template <template-name> \'{"key": "value"}\'');
        process.exit(1);
      }
      const updateData = process.argv[4] ? JSON.parse(process.argv[4]) : {};
      try {
        manager.updateTemplate(arg, updateData);
      } catch (err) {
        console.error(`Failed to update template ${arg}:`, err.message);
        process.exit(1);
      }
      break;

    case 'delete-template':
      if (!arg) {
        console.log('Usage: node manager.js delete-template <template-name>');
        process.exit(1);
      }
      try {
        manager.deleteTemplate(arg);
      } catch (err) {
        console.error(`Failed to delete template ${arg}:`, err.message);
        process.exit(1);
      }
      break;

    default:
      console.log('Supergateway Manager CLI');
      console.log('');
      console.log('Commands:');
      console.log('  start <name>          - Start a server');
      console.log('  stop <name>           - Stop a server');
      console.log('  restart <name>        - Restart a server');
      console.log('  remove <name>         - Remove a server from config');
      console.log('  status                - Show all server status');
      console.log('  logs <name>           - Show server logs');
      console.log('  backup                - Create config backup');
      console.log('  backups               - List available backups');
      console.log('  restore <name>        - Restore from backup');
      console.log('  ports                 - Show used ports');
      console.log('  templates             - List available templates');
      console.log('  update-template <n> <json> - Update a template');
      console.log('  delete-template <n>   - Delete a template');
      break;
  }
}

export default SupergatewayManager;
