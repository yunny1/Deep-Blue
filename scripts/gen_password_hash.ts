// scripts/gen-password-hash.ts
//
// 密码哈希生成工具
//
// 用法（在项目根目录运行）：
//   pnpm tsx scripts/gen-password-hash.ts
//
// 此脚本会引导你输入 6 个账号的密码，生成对应的 bcrypt 哈希，
// 然后输出完整的 AUTH_USERS 环境变量值，直接粘贴到 Vercel 即可。
//
// 注意：此脚本只在本地运行，生成结果不包含明文密码。
//       生成后请妥善保管明文密码（如使用密码管理器）。

import bcrypt from 'bcryptjs';
import * as readline from 'readline';

const ACCOUNTS = [
  { username: 'admin',  role: '管理员' },
  { username: 'guest1', role: '访客 1' },
  { username: 'guest2', role: '访客 2' },
  { username: 'guest3', role: '访客 3' },
  { username: 'guest4', role: '访客 4' },
  { username: 'guest5', role: '访客 5' },
];

const SALT_ROUNDS = 10;

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  Deep Blue — 账号密码哈希生成工具');
  console.log('══════════════════════════════════════════════════\n');
  console.log('为每个账号输入密码（至少 12 位，建议包含大小写字母+数字+符号）\n');

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  const entries: string[] = [];

  for (const account of ACCOUNTS) {
    const password = await question(rl, `  ${account.role} (${account.username}) 的密码: `);

    if (password.length < 8) {
      console.error(`  ✗ 密码太短，请至少 8 位`);
      process.exit(1);
    }

    console.log(`  正在生成哈希…`);
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    entries.push(`${account.username}:${hash}`);
    console.log(`  ✓ ${account.username} 哈希生成完成\n`);
  }

  rl.close();

  const authUsers = entries.join(',');

  console.log('\n══════════════════════════════════════════════════');
  console.log('  生成完成！将以下内容添加到 Vercel 环境变量：');
  console.log('══════════════════════════════════════════════════\n');
  console.log('变量名：AUTH_USERS');
  console.log('变量值：');
  console.log(authUsers);
  console.log('\n──────────────────────────────────────────────────');
  console.log('同时请确认以下环境变量也已在 Vercel 配置：\n');
  console.log('  AUTH_SESSION_SECRET        （至少 64 位随机字符串）');
  console.log('  TENCENT_CAPTCHA_APP_ID     （腾讯云控制台 AppId）');
  console.log('  TENCENT_CAPTCHA_APP_SECRET （腾讯云控制台 SecretKey）');
  console.log('  NEXT_PUBLIC_TENCENT_CAPTCHA_APP_ID  （同 AppId，前端需要）\n');
  console.log('生成一个 AUTH_SESSION_SECRET 的命令：');
  console.log('  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  console.log('──────────────────────────────────────────────────\n');
}

main().catch(console.error);
