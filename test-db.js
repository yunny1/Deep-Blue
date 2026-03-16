const { Client } = require('pg');

// 测试三种不同的连接方式，找出哪个能通
const tests = [
  {
    name: 'Pooler端口5432',
    config: {
      host: 'aws-1-ap-southeast-1.pooler.supabase.com',
      port: 5432,
      user: 'postgres.kzebzuvnleqzusxqoivf',
      password: 'hurCam-kowpaq-6nefxa',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    }
  },
  {
    name: 'Pooler端口6543',
    config: {
      host: 'aws-1-ap-southeast-1.pooler.supabase.com',
      port: 6543,
      user: 'postgres.kzebzuvnleqzusxqoivf',
      password: 'hurCam-kowpaq-6nefxa',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    }
  },
  {
    name: '直连db地址',
    config: {
      host: 'db.kzebzuvnleqzusxqoivf.supabase.co',
      port: 5432,
      user: 'postgres',
      password: 'hurCam-kowpaq-6nefxa',
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    }
  }
];

async function runTests() {
  console.log('=== Deep Blue 数据库连接诊断 ===\n');
  for (const test of tests) {
    console.log(`测试: ${test.name}`);
    console.log(`  地址: ${test.config.host}:${test.config.port}`);
    console.log(`  用户: ${test.config.user}`);
    const client = new Client(test.config);
    try {
      await client.connect();
      const res = await client.query('SELECT version()');
      console.log(`  ✅ 成功! ${res.rows[0].version.slice(0, 50)}`);
      await client.end();
    } catch (e) {
      console.log(`  ❌ 失败: [${e.code || 'UNKNOWN'}] ${e.message}`);
    }
    console.log();
  }
}

runTests();
