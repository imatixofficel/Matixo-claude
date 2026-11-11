#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import { startServer } from '../src/server.js';
import { loadConfig, resetConfig, maskKey } from '../src/config.js';
import { launchClaude, envScript } from '../src/launcher.js';
import { launchSignal } from '../src/launchSignal.js';
import { VERSION, GITHUB_URL } from '../src/meta.js';

const program = new Command();
const banner = () => console.log(
  chalk.blue.bold('\n  M A T I X O  |  C L A U D E\n') +
  chalk.gray(`  Local AI gateway · به نام پروردگار · v${VERSION}\n  ${GITHUB_URL}\n`)
);

async function runServer({ openBrowser = false, port } = {}) {
  if (port !== undefined) {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error('Port must be between 1024 and 65535 / پورت باید بین 1024 تا 65535 باشد.');
    process.env.MATIXO_PORT = String(n); // فقط برای همین اجرا؛ در فایل تنظیمات ذخیره نمی‌شود
  }
  const spinner = ora('Starting Matixo… / در حال راه‌اندازی Matixo...').start();
  let started;
  try { started = await startServer(); }
  catch (err) {
    spinner.fail(err.code === 'EADDRINUSE'
      ? 'Port is already in use. Use --port or stop the other process. / پورت اشغال است؛ از --port استفاده کن یا برنامه دیگر را ببند.'
      : err.message);
    process.exit(1);
  }
  const { server, port: actual } = started;
  spinner.succeed(`Matixo → ${chalk.cyan(`http://127.0.0.1:${actual}`)}`);
  if (openBrowser) { try { await open(`http://127.0.0.1:${actual}`); } catch { console.log('Open the browser manually / مرورگر را به‌صورت دستی باز کن.'); } }
  const stop = () => { server.close(() => process.exit(0)); server.closeAllConnections?.(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return { server, port: actual };
}

program.name('matixo').description('Matixo|Claude — local gateway for Claude Code / درگاه محلی اتصال Claude Code به APIهای مختلف').version(VERSION);

program.command('start').description('Run the server only / فقط سرور پنل و پروکسی')
  .option('-p, --port <port>', 'port for this run / پورت برای همین اجرا')
  .action(async (opts) => { banner(); await runServer({ port: opts.port }); });

program.command('launch').description('Open the panel and run Claude Code on request / پنل را باز کن و Claude Code را اجرا کن')
  .allowUnknownOption(true).option('-p, --port <port>', 'port for this run / پورت برای همین اجرا')
  .argument('[args...]', 'extra args for Claude Code / آرگومان‌های اضافی برای Claude Code')
  .action(async (args, opts) => {
    banner();
    await runServer({ openBrowser: true, port: opts.port });
    console.log(chalk.gray('\n  Press “Run Claude Code” in the panel · Ctrl+C to quit.\n  در پنل روی «اجرای Claude Code» بزن · خروج: Ctrl+C\n'));
    let running = false;
    launchSignal.on('launch', () => {
      if (running) return;
      try {
        running = true;
        console.log(chalk.green('\n  Starting Claude Code… / در حال اجرای Claude Code...\n'));
        const child = launchClaude(args);
        child.on('exit', code => { running = false; console.log(chalk.gray(`\n  Claude Code exited (code ${code ?? '?'}) / بسته شد.`)); });
        child.on('error', () => { running = false; });
      } catch (e) { running = false; console.error(chalk.red(e.message)); }
    });
  });

program.command('config').description('Show settings (keys masked) / نمایش تنظیمات بدون افشای کلیدها').action(() => {
  banner();
  const c = loadConfig();
  const providers = Object.fromEntries(Object.entries(c.providers).map(([id, p]) => [id, { baseUrl: p.baseUrl, apiKey: maskKey(p.apiKey) }]));
  console.log(JSON.stringify({ ...c, authToken: '[local]', providers }, null, 2));
});

program.command('reset').description('Reset settings and delete API keys / بازنشانی تنظیمات و حذف کلیدها')
  .action(() => { resetConfig(); console.log(chalk.green('Matixo settings reset. / تنظیمات Matixo بازنشانی شد.')); });

program.command('env').description('Print env vars for Claude Code / چاپ متغیرهای محیطی')
  .option('-s, --shell <shell>', 'bash | powershell | cmd', 'bash')
  .action((opts) => {
    try { console.log(envScript(opts.shell)); }
    catch (e) { console.error(chalk.red(e.message)); process.exitCode = 1; }
  });

program.addHelpText('after', '\nExamples:\n  $ matixo\n  $ matixo launch\n  $ matixo start --port 4000\n  $ eval "$(matixo env)"            # bash/zsh\n  $ matixo env --shell powershell | Invoke-Expression\n');
program.action(async () => { banner(); await runServer({ openBrowser: true }); });
program.parseAsync(process.argv).catch(err => { console.error(chalk.red(err.message)); process.exit(1); });
