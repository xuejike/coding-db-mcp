'use strict';

const { deriveKey, encryptPassword, decryptPassword } = require('./crypto');

/**
 * 简单测试运行器
 */
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
    console.error(`    期望: ${JSON.stringify(expected)}`);
    console.error(`    实际: ${JSON.stringify(actual)}`);
  }
}

console.log('密码加密模块测试\n');

// 测试 deriveKey
console.log('deriveKey:');
{
  const key = deriveKey();
  assert(Buffer.isBuffer(key), '返回 Buffer 类型');
  assertEqual(key.length, 32, '密钥长度为 32 字节（256 位）');

  // 多次调用应返回相同密钥（确定性派生）
  const key2 = deriveKey();
  assert(key.equals(key2), '多次调用返回相同密钥');
}

// 测试 encryptPassword
console.log('\nencryptPassword:');
{
  const plaintext = 'my-secret-password';
  const encrypted = encryptPassword(plaintext);

  assert(encrypted.startsWith('enc:v1:'), '加密结果以 "enc:v1:" 前缀开头');

  const parts = encrypted.split(':');
  assertEqual(parts.length, 5, '加密格式包含 5 个部分（enc:v1:iv:authTag:ciphertext）');

  // IV 应为 12 字节 = 24 hex 字符
  assertEqual(parts[2].length, 24, 'IV 长度为 24 hex 字符（12 字节）');

  // authTag 应为 16 字节 = 32 hex 字符
  assertEqual(parts[3].length, 32, 'authTag 长度为 32 hex 字符（16 字节）');

  // 加密结果不应包含原始明文
  assert(!encrypted.includes(plaintext), '加密结果不包含原始明文');

  // 每次加密应产生不同结果（因为随机 IV）
  const encrypted2 = encryptPassword(plaintext);
  assert(encrypted !== encrypted2, '相同明文每次加密产生不同结果');
}

// 测试 decryptPassword
console.log('\ndecryptPassword:');
{
  // 加密再解密应返回原始明文
  const plaintext = 'hello-world-123!@#';
  const encrypted = encryptPassword(plaintext);
  const decrypted = decryptPassword(encrypted);
  assertEqual(decrypted, plaintext, '加密后解密返回原始明文');

  // 明文兼容：无前缀的字符串直接返回
  const raw = 'plain-password';
  assertEqual(decryptPassword(raw), raw, '无 "enc:v1:" 前缀的字符串直接返回');

  // 空字符串
  assertEqual(decryptPassword(''), '', '空字符串直接返回');

  // 带 "enc:" 但不是 "enc:v1:" 的字符串
  const partial = 'enc:v2:something';
  assertEqual(decryptPassword(partial), partial, '非 "enc:v1:" 前缀的字符串直接返回');
}

// 测试各类密码的往返一致性
console.log('\n往返一致性:');
{
  const testCases = [
    '简单密码',
    '',  // 空密码
    'a',  // 单字符
    'password with spaces',
    '密码包含中文字符',
    '!@#$%^&*()_+-=[]{}|;:,.<>?',  // 特殊字符
    'a'.repeat(1000),  // 长密码
    'enc:v1:fake',  // 看起来像加密格式的密码
  ];

  for (const pwd of testCases) {
    const encrypted = encryptPassword(pwd);
    const decrypted = decryptPassword(encrypted);
    assertEqual(decrypted, pwd, `往返一致: "${pwd.substring(0, 30)}${pwd.length > 30 ? '...' : ''}"`);
  }
}

// 输出测试结果
console.log(`\n测试结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  process.exit(1);
}
