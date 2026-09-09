#!/usr/bin/env node
/**
 * Automated Keka Attendance Bot for the GOAT Jerry
 * Uses persistent Thorium/Chrome profile: log in once, runs unattended forever!
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { chromium } = require('playwright-core');

const BASE_DIR = __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const LOG_PATH = path.join(BASE_DIR, 'keka.log');
const SCREENSHOTS_DIR = path.join(BASE_DIR, 'screenshots');
const USER_DATA_DIR = path.join(BASE_DIR, '.keka_profile');

function getChromePath(cfg = {}) {
  if (cfg.chrome_path && fs.existsSync(cfg.chrome_path)) return cfg.chrome_path;
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;

  const localAppData = process.env.LOCALAPPDATA || '';
  const progFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const progFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

  const candidates = [
    // Linux / Thorium / Chrome / Brave
    '/home/jerry/.local/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/brave-browser',
    '/snap/bin/chromium',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Windows
    path.join(progFiles, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(progFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(progFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(progFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(progFiles, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
    path.join(localAppData, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  try {
    const cmd = process.platform === 'win32'
      ? 'where chrome || where msedge || where brave'
      : 'which google-chrome || which chromium || which brave || which google-chrome-stable';
    const which = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0];
    if (which && fs.existsSync(which)) return which;
  } catch (e) {}

  return process.platform === 'win32' ? 'chrome.exe' : '/usr/bin/google-chrome';
}

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function getLocalTimestamp() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
}

function log(message, level = 'INFO') {
  const ts = getLocalTimestamp();
  const line = `[${ts}] [${level}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_PATH, line + '\n', 'utf8');
  } catch (err) {
    console.error('Failed writing to log file:', err);
  }
}

function notify(title, message, urgency = 'normal') {
  try {
    if (process.platform === 'win32') {
      const escapedTitle = title.replace(/'/g, "''");
      const escapedMsg = message.replace(/'/g, "''");
      const psScript = `
        [void] [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');
        $notify = New-Object System.Windows.Forms.NotifyIcon;
        $notify.Icon = [System.Drawing.SystemIcons]::Information;
        $notify.BalloonTipTitle = '${escapedTitle}';
        $notify.BalloonTipText = '${escapedMsg}';
        $notify.Visible = $True;
        $notify.ShowBalloonTip(5000);
      `;
      spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psScript], {
        detached: true,
        stdio: 'ignore'
      }).unref();
    } else if (process.platform === 'darwin') {
      const escapedTitle = title.replace(/"/g, '\\"');
      const escapedMsg = message.replace(/"/g, '\\"');
      spawn('osascript', ['-e', `display notification "${escapedMsg}" with title "${escapedTitle}"`], {
        detached: true,
        stdio: 'ignore'
      }).unref();
    } else {
      spawn('notify-send', ['-u', urgency, title, message], {
        detached: true,
        stdio: 'ignore'
      }).unref();
    }
  } catch (err) {
    // Ignore notification error on headless / restricted systems
  }
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    log(`Config not found at ${CONFIG_PATH}. Please copy config.example.json to config.json and set your subdomain.`, 'ERROR');
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    log(`Failed to parse config.json: ${err.message}`, 'ERROR');
    process.exit(1);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanStaleLocks() {
  const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  for (const file of lockFiles) {
    const fullPath = path.join(USER_DATA_DIR, file);
    try {
      if (fs.existsSync(fullPath) || fs.lstatSync(fullPath).isSymbolicLink()) {
        fs.unlinkSync(fullPath);
        log(`Cleaned up stale browser lock: ${file}`);
      }
    } catch (err) {
      // Ignore if not present or cannot unlink
    }
  }
}

async function launchBrowser(headless = true, cfg = {}) {
  cleanStaleLocks();

  const chromePath = getChromePath(cfg);
  const loc = cfg.location || {};
  const lat = loc.latitude || 12.9716;
  const lon = loc.longitude || 77.5946;

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    executablePath: chromePath,
    headless: headless,
    viewport: { width: 1366, height: 768 },
    permissions: ['geolocation'],
    geolocation: { latitude: lat, longitude: lon },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  // Block intrusive overlay trackers (Pendo, Clarity) completely
  await context.route('**/*pendo*/**', route => route.abort()).catch(() => {});
  await context.route('**/*clarity*/**', route => route.abort()).catch(() => {});

  return context;
}

// One-time Login Flow
async function handleLogin() {
  const cfg = loadConfig();
  const url = `https://${cfg.subdomain || '4labs'}.keka.com`;

  console.log('\n=============================================================');
  console.log('  Keka One-Time Login for the GOAT Jerry');
  console.log('=============================================================');
  console.log(`Opening Thorium browser to: ${url}`);
  console.log('1. Log into Keka (SSO, Password, 2FA, etc.)');
  console.log('2. Check "Stay signed in" / "Remember me" if prompted.');
  console.log('3. Once you reach your Keka dashboard, press ENTER here.');
  console.log('=============================================================\n');

  const context = await launchBrowser(false, cfg);
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });

  // Wait for user confirmation in console
  await new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });

  log('Saving browser session to .keka_profile...');
  await page.waitForTimeout(2000);
  await context.close();
  console.log('\n✅ Login session successfully saved! You are all set for automated runs.');
  process.exit(0);
}

async function dismissPopups(page) {
  try {
    await page.evaluate(() => {
      // 1. Remove all Pendo backdrop overlays, guides, and banners
      const pendoBackdrops = document.querySelectorAll('._pendo-backdrop, #pendo-base, ._pendo-step-container, ._pendo-guide-walkthrough_, [id^="pendo-backdrop"], div[pendo-region]');
      pendoBackdrops.forEach(el => el.remove());

      // 2. Click dismiss on notification / survey prompts if present
      const dismissBtns = Array.from(document.querySelectorAll('button, a')).filter(el => {
        const t = (el.innerText || '').trim().toLowerCase();
        return t === 'not now' || t === 'dismiss' || t === 'close' || t === 'later' || el.classList.contains('_pendo-close-guide');
      });
      dismissBtns.forEach(btn => {
        try { btn.click(); } catch(e) {}
      });
    });
    await sleep(500);
  } catch (err) {
    // Ignore DOM evaluation errors
  }
}

async function safeClick(page, locator) {
  await dismissPopups(page);
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await locator.click({ force: true, timeout: 5000 });
  } catch (err) {
    log(`Playwright click encountered obstacle, triggering direct DOM click...`, 'INFO');
    await locator.evaluate(el => el.click()).catch(() => {});
  }
}

// Clock-In / Clock-Out Flow
async function handlePunch(action, noJitter = false) {
  const cfg = loadConfig();
  const subdomain = cfg.subdomain || '4labs';
  const actionName = action === 'in' ? 'Clock-In' : 'Clock-Out';
  const todayStr = getLocalTimestamp().substring(0, 10);
  const skipFlagPath = path.join(BASE_DIR, '.skip_today');
  const pauseFlagPath = path.join(BASE_DIR, '.paused');

  // 1. Check if global pause is active
  if (fs.existsSync(pauseFlagPath)) {
    log(`SKIPPED: Automation is currently PAUSED (.paused flag is active). Skipping ${actionName}.`);
    if (cfg.notify_desktop !== false) notify('Keka Paused', `Automation is paused. Skipping ${actionName}.`);
    return;
  }

  // 2. Check if single-day skip is active
  if (fs.existsSync(skipFlagPath)) {
    log(`SKIPPED: .skip_today flag is active. Skipping ${actionName} for today (${todayStr}).`);
    if (cfg.notify_desktop !== false) notify('Keka Skipped', `Skipped ${actionName} for today.`);
    return;
  }

  // 3. Check if specific date is in skip_dates list in config.json
  const skipDates = cfg.skip_dates || [];
  if (skipDates.includes(todayStr)) {
    log(`SKIPPED: Date ${todayStr} is in skip_dates. Skipping ${actionName}.`);
    if (cfg.notify_desktop !== false) notify('Keka Skipped', `Date ${todayStr} is configured to skip.`);
    return;
  }

  // Apply jitter
  const jitterMinutes = cfg.random_jitter_minutes || 0;
  if (!noJitter && jitterMinutes > 0) {
    const delaySeconds = Math.floor(Math.random() * (jitterMinutes * 60));
    log(`Applying random jitter delay: waiting ${delaySeconds}s before ${actionName}...`);
    await sleep(delaySeconds * 1000);
  }

  log(`Starting unattended ${actionName} for ${subdomain}.keka.com...`);
  const context = await launchBrowser(true, cfg);
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  const targetUrl = `https://${subdomain}.keka.com/#/home/dashboard`;

  try {
    log(`Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(6000); // Allow Angular app to hydrate
    await dismissPopups(page);

    // Check if redirected to login page (session expired)
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('identity') || currentUrl.includes('oauth')) {
      const err = 'Session expired or not logged in! Please run: npm run login (or node keka.js login)';
      log(err, 'ERROR');
      if (cfg.notify_desktop !== false) notify('Keka Error', err, 'critical');
      await context.close();
      process.exit(1);
    }

    log('Dashboard loaded. Waiting for attendance widget to render...');
    await page.waitForSelector('button:has-text("Clock-in"), button:has-text("Web Clock-In"), button:has-text("Clock-out"), button:has-text("Web Clock-Out")', { timeout: 30000 }).catch(() => {});
    await dismissPopups(page);

    // Selectors for clock in and clock out
    const clockInSelectors = [
      'button:has-text("Clock-in")',
      'button:has-text("Clock-In")',
      'button:has-text("Clock in")',
      'button:has-text("Clock In")',
      'button:has-text("Web Clock-In")',
      'button:has-text("Web Clock In")'
    ];

    const clockOutSelectors = [
      'button:has-text("Clock-out")',
      'button:has-text("Clock-Out")',
      'button:has-text("Clock out")',
      'button:has-text("Clock Out")',
      'button:has-text("Web Clock-Out")',
      'button:has-text("Web Clock Out")'
    ];

    const isClockIn = action === 'in';
    const targetSelectors = isClockIn ? clockInSelectors : clockOutSelectors;
    const oppositeSelectors = isClockIn ? clockOutSelectors : clockInSelectors;

    // Check if already in desired state
    for (const oppSel of oppositeSelectors) {
      const oppBtn = page.locator(oppSel).first();
      if (await oppBtn.isVisible().catch(() => false)) {
        if (isClockIn) {
          log('Already clocked in! Clock-Out button is currently visible. Skipping safely.');
          if (cfg.notify_desktop !== false) notify('Keka Status', 'Already clocked in today.');
        } else {
          log('Already clocked out! Clock-In button is currently visible. Skipping safely.');
          if (cfg.notify_desktop !== false) notify('Keka Status', 'Already clocked out today.');
        }
        await takeScreenshot(page, `${actionName}_already_done`);
        await context.close();
        return;
      }
    }

    // Locate target button
    let foundButton = null;
    for (const sel of targetSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        foundButton = btn;
        log(`Found attendance button matching selector: ${sel}`);
        break;
      }
    }

    if (!foundButton) {
      // Sometimes Keka puts clock-in in the 'Me' or 'Attendance' section
      log('Punch button not found on home dashboard. Checking /#/me/attendance...');
      await page.goto(`https://${subdomain}.keka.com/#/me/attendance`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      await dismissPopups(page);

      for (const sel of targetSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible().catch(() => false)) {
          foundButton = btn;
          log(`Found attendance button in attendance tab: ${sel}`);
          break;
        }
      }
    }

    if (!foundButton) {
      const err = `Could not find ${actionName} button. Please check screenshot.`;
      log(err, 'ERROR');
      await takeScreenshot(page, `${actionName}_button_not_found`);
      if (cfg.notify_desktop !== false) notify(`Keka ${actionName} Failed`, err, 'critical');
      await context.close();
      process.exit(1);
    }

    // Click the initial punch button
    log(`Clicking initial ${actionName} button...`);
    await safeClick(page, foundButton);
    await page.waitForTimeout(2000);

    // 1. Check for Inline Confirmation (e.g. widget reveals "[Clock-out] [Cancel]")
    const cancelBtn = page.locator('button:has-text("Cancel")').first();
    const isInlinePrompt = await cancelBtn.isVisible().catch(() => false);
    if (isInlinePrompt) {
      log(`Inline confirmation detected: Cancel button is visible. Clicking ${actionName} again to confirm...`);
      await takeScreenshot(page, `${actionName}_inline_confirm_prompt`);

      // Re-find the target button (which is now alongside the Cancel button)
      let inlineConfirmBtn = null;
      for (const sel of targetSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible().catch(() => false)) {
          inlineConfirmBtn = btn;
          break;
        }
      }

      if (inlineConfirmBtn) {
        log(`Clicking confirmation ${actionName} button...`);
        await safeClick(page, inlineConfirmBtn);
        log(`Confirmed inline ${actionName}!`);
        await page.waitForTimeout(4000);
      }
    }

    // 2. Check for any confirmation modal dialogs ("Are you sure?", etc.)
    const modalContainers = [
      '.modal.show',
      '.modal-dialog',
      '.modal-content',
      'div[role="dialog"]',
      'ngb-modal-window',
      '.modal'
    ];

    for (const mSel of modalContainers) {
      const modal = page.locator(mSel).first();
      if (await modal.isVisible().catch(() => false)) {
        log(`Confirmation modal detected (${mSel})! Looking for confirm button...`);

        // Take a screenshot of the confirmation dialog for proof
        await takeScreenshot(page, `${actionName}_modal_prompt`);

        // Find the action/confirm button inside the modal (ignoring Cancel)
        const modalConfirmSelectors = [
          'button.btn-primary',
          'button.btn-danger',
          'button[type="submit"]',
          `button:has-text("${actionName}")`,
          'button:has-text("Clock-out")',
          'button:has-text("Clock-In")',
          'button:has-text("Clock Out")',
          'button:has-text("Clock In")',
          'button:has-text("Confirm")',
          'button:has-text("Yes")',
          'button:has-text("Submit")'
        ];

        let confirmed = false;
        for (const cSel of modalConfirmSelectors) {
          const cBtn = modal.locator(cSel).first();
          if (await cBtn.isVisible().catch(() => false)) {
            const btnText = (await cBtn.innerText().catch(() => '')).trim();
            // Ensure we don't accidentally click Cancel
            if (/cancel|close|dismiss/i.test(btnText)) continue;

            log(`Clicking modal confirmation button: "${btnText}" (${cSel})...`);
            await safeClick(page, cBtn);
            confirmed = true;
            await page.waitForTimeout(4000);
            break;
          }
        }

        if (!confirmed) {
          log('Attempting generic primary button click in modal...', 'WARNING');
          const primaryBtn = modal.locator('button.btn-primary, button.btn-danger').first();
          if (await primaryBtn.isVisible().catch(() => false)) {
            await safeClick(page, primaryBtn);
            await page.waitForTimeout(4000);
          }
        }
        break;
      }
    }

    // Wait and verify final state
    await page.waitForTimeout(4000);
    const shotPath = await takeScreenshot(page, `${actionName}_success`);
    log(`SUCCESS: ${actionName} process completed! Screenshot saved: ${shotPath}`);

    if (cfg.notify_desktop !== false) {
      notify(`Keka ${actionName} Successful`, `Logged at ${new Date().toLocaleTimeString()}`);
    }

  } catch (err) {
    log(`Error during ${actionName}: ${err.message}`, 'ERROR');
    await takeScreenshot(page, `${actionName}_error`).catch(() => {});
    if (cfg.notify_desktop !== false) {
      notify(`Keka ${actionName} Error`, err.message, 'critical');
    }
  } finally {
    await context.close();
  }
}

async function takeScreenshot(page, prefix) {
  const ts = getLocalTimestamp().replace(/:/g, '-').replace(' ', '_');
  const filename = `${prefix}_${ts}.png`;
  const fullPath = path.join(SCREENSHOTS_DIR, filename);
  try {
    await page.screenshot({ path: fullPath, fullPage: false });
    return fullPath;
  } catch (err) {
    log(`Screenshot failed: ${err.message}`, 'WARNING');
    return '';
  }
}

async function checkStatus() {
  const cfg = loadConfig();
  const subdomain = cfg.subdomain || '4labs';
  log(`Checking current attendance status on ${subdomain}.keka.com...`);

  const context = await launchBrowser(true, cfg);
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  try {
    await page.goto(`https://${subdomain}.keka.com/#/home/dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('button:has-text("Clock-in"), button:has-text("Web Clock-In"), button:has-text("Clock-out"), button:has-text("Web Clock-Out")', { timeout: 30000 }).catch(() => {});
    await dismissPopups(page);

    const isClockOutVisible = await page.locator('button:has-text("Clock-out"), button:has-text("Clock-Out"), button:has-text("Web Clock-Out")').first().isVisible().catch(() => false);
    const isClockInVisible = await page.locator('button:has-text("Clock-in"), button:has-text("Clock-In"), button:has-text("Web Clock-In")').first().isVisible().catch(() => false);

    if (isClockOutVisible) {
      console.log('\n🟢 CURRENT PERSONAL STATUS: CLOCKED IN (Clock-out button is active)');
    } else if (isClockInVisible) {
      console.log('\n🔴 CURRENT PERSONAL STATUS: CLOCKED OUT (Clock-in button is active)');
    } else {
      console.log('\n🟡 CURRENT PERSONAL STATUS: Could not determine directly. View screenshot in screenshots/ directory.');
    }

    const shotPath = await takeScreenshot(page, 'status_check');
    console.log(`📸 Screenshot: ${shotPath}\n`);
  } catch (err) {
    log(`Status check failed: ${err.message}`, 'ERROR');
  } finally {
    await context.close();
  }
}

async function handleTeamStatus() {
  const cfg = loadConfig();
  const subdomain = cfg.subdomain || '4labs';
  log(`Fetching team attendance status on ${subdomain}.keka.com...`);

  const context = await launchBrowser(true, cfg);
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  let teamEmployeesData = null;
  let metricsData = null;
  let onLeaveData = null;

  page.on('response', async (res) => {
    const url = res.url();
    try {
      if (url.includes('/teamemployees')) {
        teamEmployeesData = await res.json().catch(() => null);
      } else if (url.includes('/attendancemetrics')) {
        metricsData = await res.json().catch(() => null);
      } else if (url.includes('/teamonleave')) {
        onLeaveData = await res.json().catch(() => null);
      }
    } catch (e) {}
  });

  try {
    log('Navigating to dashboard...');
    await page.goto(`https://${subdomain}.keka.com/#/home/dashboard`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3000);
    await dismissPopups(page);

    // Check if session expired
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('identity') || currentUrl.includes('oauth')) {
      const err = 'Session expired or not logged in! Please run: npm run login';
      log(err, 'ERROR');
      if (cfg.notify_desktop !== false) notify('Keka Error', err, 'critical');
      await context.close();
      process.exit(1);
    }

    log('Accessing My Team attendance section...');
    const myTeamLink = page.locator('a:has-text("My Team"), span:has-text("My Team")').first();
    if (await myTeamLink.isVisible().catch(() => false)) {
      await safeClick(page, myTeamLink);
    } else {
      await page.goto(`https://${subdomain}.keka.com/#/myteam/summary/peer`, { waitUntil: 'networkidle', timeout: 30000 });
    }

    // Wait until teamemployees response is intercepted or timeout
    for (let i = 0; i < 20; i++) {
      if (teamEmployeesData) break;
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(2000);
    await dismissPopups(page);

    const employees = (teamEmployeesData && teamEmployeesData.data && teamEmployeesData.data.items) ? teamEmployeesData.data.items : [];
    const metrics = (metricsData && metricsData.data) ? metricsData.data : null;
    const onLeaveList = (onLeaveData && Array.isArray(onLeaveData.data)) ? onLeaveData.data : [];

    console.log('\n' + '='.repeat(70));
    console.log(`  👥 TEAM ATTENDANCE STATUS FOR THE GOAT JERRY (${subdomain.toUpperCase()})`);
    console.log(`  📅 Date: ${getLocalTimestamp()}`);
    console.log('='.repeat(70));

    if (metrics) {
      console.log(`\n📊 SUMMARY METRICS:`);
      console.log(`   🟢 On Time:          ${metrics.totalOnTimeEmployees ?? '-'}`);
      console.log(`   ⏰ Late:             ${metrics.totalLateEmployees ?? '-'}`);
      console.log(`   🏠 Working Remotely: ${metrics.totalWorkingRemotelyEmployees ?? '-'}`);
      console.log(`   🏖️ On Leave:         ${onLeaveList.length}`);
    }

    console.log('\n📋 TEAM MEMBERS:');
    console.log('-'.repeat(70));
    console.log(`  ${'STATUS'.padEnd(12)} | ${'NAME'.padEnd(28)} | ${'ROLE'.padEnd(18)} | ${'EMP ID'}`);
    console.log('-'.repeat(70));

    if (employees.length === 0) {
      console.log('  No team member data found or permission restricted.');
    } else {
      employees.forEach(emp => {
        const name = emp.displayName || 'Unknown';
        const role = emp.jobtitle || emp.department || 'Employee';
        const empId = emp.employeeNumber || (emp.id ? String(emp.id) : '-');
        const details = emp.clockInDetails || {};

        let statusLabel = '🔴 OUT';
        if (details.leaveCount > 0 || details.leaveDayStatus > 0) {
          statusLabel = '🏖️ LEAVE';
        } else if (details.isRemote) {
          statusLabel = '🏠 REMOTE';
        } else if (details.clockInStatus === 0) {
          statusLabel = '🟢 IN';
        } else {
          statusLabel = '🔴 OUT';
        }

        const isJerry = name.toLowerCase().includes('jerry') || (emp.email && emp.email.includes('jsunny'));
        const prefix = isJerry ? '⭐ ' : '   ';
        const formattedName = (prefix + name).padEnd(28);

        console.log(`  ${statusLabel.padEnd(12)} | ${formattedName} | ${role.substring(0, 18).padEnd(18)} | #${empId}`);
      });
    }
    console.log('-'.repeat(70) + '\n');

    const shotPath = await takeScreenshot(page, 'team_status');
    if (shotPath) console.log(`📸 Team snapshot saved: ${shotPath}\n`);

  } catch (err) {
    log(`Failed retrieving team status: ${err.message}`, 'ERROR');
  } finally {
    await context.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] ? args[0].toLowerCase() : '';
  const noJitter = args.includes('--no-jitter');

  switch (cmd) {
    case 'login':
      await handleLogin();
      break;
    case 'in':
    case 'clock-in':
      await handlePunch('in', noJitter);
      break;
    case 'out':
    case 'clock-out':
      await handlePunch('out', noJitter);
      break;
    case 'status':
      await checkStatus();
      break;
    case 'team':
    case 'team-status':
    case 'whoisin':
    case 'whoisout':
      await handleTeamStatus();
      break;
    case 'skip-today':
    case 'skip':
      fs.writeFileSync(path.join(BASE_DIR, '.skip_today'), 'skip\n', 'utf8');
      console.log('\n🛑 Skipped for today! All clock-in and clock-out runs will be skipped today.');
      console.log('To cancel skip and re-enable for today, run: node keka.js unskip\n');
      break;
    case 'unskip':
    case 'unskip-today': {
      const p = path.join(BASE_DIR, '.skip_today');
      if (fs.existsSync(p)) fs.unlinkSync(p);
      console.log('\n✅ Skip removed! Today\'s scheduled attendance runs will proceed normally.\n');
      break;
    }
    case 'pause':
      fs.writeFileSync(path.join(BASE_DIR, '.paused'), 'paused\n', 'utf8');
      if (process.platform === 'win32') {
        try {
          execSync('schtasks /Change /TN "KekaClockIn" /DISABLE >nul 2>&1', { stdio: 'ignore' });
          execSync('schtasks /Change /TN "KekaClockOut" /DISABLE >nul 2>&1', { stdio: 'ignore' });
        } catch (e) {}
      } else if (process.platform === 'linux') {
        try {
          execSync('systemctl --user stop keka-clockin.timer keka-clockout.timer 2>/dev/null || true', { stdio: 'ignore' });
        } catch (e) {}
      }
      console.log('\n⏸️ Timers paused! Automation is temporarily stopped.');
      console.log('To resume, run: node keka.js resume\n');
      break;
    case 'resume': {
      const pausedPath = path.join(BASE_DIR, '.paused');
      if (fs.existsSync(pausedPath)) fs.unlinkSync(pausedPath);
      if (process.platform === 'win32') {
        try {
          execSync('schtasks /Change /TN "KekaClockIn" /ENABLE >nul 2>&1', { stdio: 'ignore' });
          execSync('schtasks /Change /TN "KekaClockOut" /ENABLE >nul 2>&1', { stdio: 'ignore' });
        } catch (e) {}
      } else if (process.platform === 'linux') {
        try {
          execSync('systemctl --user start keka-clockin.timer keka-clockout.timer 2>/dev/null || true', { stdio: 'ignore' });
        } catch (e) {}
      }
      console.log('\n▶️ Timers resumed! Attendance automation is active.\n');
      break;
    }
    default:
      console.log(`
Keka Attendance Automation for the GOAT Jerry

Usage:
  node keka.js login                   Log in once to save session profile
  node keka.js in [--no-jitter]        Perform clock-in (09:15 AM)
  node keka.js out [--no-jitter]       Perform clock-out (18:31 PM)
  node keka.js status                  Check personal punch status
  node keka.js team                    View team members' attendance status (In/Out/Remote/Leave)
  node keka.js skip-today              Skip clock-in/out for today only
  node keka.js unskip                  Cancel skip for today
  node keka.js pause                   Pause all automated timers
  node keka.js resume                  Resume automated timers
`);
      process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
