import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 收集控制台日志
  page.on('console', msg => {
    console.log(`[${msg.type()}] ${msg.text()}`);
  });
  
  // 收集页面错误
  page.on('pageerror', error => {
    console.log(`[Page Error] ${error.message}`);
  });
  
  console.log('=== 调试前端数据加载 ===\n');
  
  await page.goto('http://localhost:3457');
  
  // 等待一段时间让JS执行
  await page.waitForTimeout(5000);
  
  // 检查servers变量
  const serversData = await page.evaluate(() => {
    return {
      servers: typeof servers !== 'undefined' ? servers : 'undefined',
      serversLength: typeof servers !== 'undefined' ? servers.length : -1
    };
  });
  console.log('servers变量:', serversData);
  
  // 检查serversGrid内容
  const gridContent = await page.evaluate(() => {
    const grid = document.getElementById('serversGrid');
    return grid ? grid.innerHTML.substring(0, 500) : 'not found';
  });
  console.log('\nserversGrid内容:', gridContent);
  
  // 手动调用loadServers测试
  console.log('\n手动调用loadServers...');
  await page.evaluate(async () => {
    try {
      const response = await fetch('/api/servers');
      const data = await response.json();
      console.log('API返回数据:', JSON.stringify(data).substring(0, 200));
      window.testData = data;
    } catch (e) {
      console.error('API调用失败:', e.message);
    }
  });
  
  await page.waitForTimeout(2000);
  
  // 检查testData
  const testData = await page.evaluate(() => window.testData);
  console.log('\n手动API调用结果:', testData);
  
  await page.screenshot({ path: '/root/multimcp-manager/test-debug.png', fullPage: true });
  console.log('\n截图已保存: test-debug.png');
  
  await browser.close();
})();
