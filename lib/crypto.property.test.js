'use strict';

const fc = require('fast-check');
const { encryptPassword, decryptPassword } = require('./crypto');

/**
 * 密码加密模块 - 属性测试
 * 使用 fast-check 验证加密模块的核心正确性属性
 *
 * Validates: Requirements 6.1, 6.2, 6.4, 6.6
 */

let passed = 0;
let failed = 0;

/**
 * 运行属性测试的辅助函数
 * @param {string} name - 测试名称
 * @param {Function} propertyFn - 返回 fc.Property 的函数
 */
function runProperty(name, propertyFn) {
  try {
    fc.assert(propertyFn(), { numRuns: 200 });
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('密码加密模块 - 属性测试\n');

// ============================================================
// Property 8: 密码加密往返一致性
// decryptPassword(encryptPassword(pwd)) === pwd
// **Validates: Requirements 6.1, 6.2**
// ============================================================
console.log('Property 8: 密码加密往返一致性');

runProperty(
  '任意字符串经加密后解密应等于原始值',
  () => fc.property(
    fc.string(),
    (pwd) => {
      const encrypted = encryptPassword(pwd);
      const decrypted = decryptPassword(encrypted);
      return decrypted === pwd;
    }
  )
);

runProperty(
  '包含特殊字符的密码加密后解密一致',
  () => fc.property(
    // 使用 array + constantFrom 模拟包含特殊字符的字符串生成
    fc.array(
      fc.constantFrom(
        '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
        '中', '文', '密', '码', '\n', '\t', ' ', ':', ';',
        'a', 'B', '1', '0', '-', '_', '.', '/', '\\'
      ),
      { minLength: 0, maxLength: 200 }
    ).map(arr => arr.join('')),
    (pwd) => {
      const encrypted = encryptPassword(pwd);
      const decrypted = decryptPassword(encrypted);
      return decrypted === pwd;
    }
  )
);

runProperty(
  '不同长度的密码加密后解密一致',
  () => fc.property(
    fc.integer({ min: 0, max: 1000 }),
    (len) => {
      // 生成指定长度的密码字符串
      const pwd = 'x'.repeat(len);
      const encrypted = encryptPassword(pwd);
      const decrypted = decryptPassword(encrypted);
      return decrypted === pwd;
    }
  )
);

// ============================================================
// Property 9: 加密后不含明文
// 加密结果不包含原始密码明文
// **Validates: Requirement 6.6**
// ============================================================
console.log('\nProperty 9: 加密后不含明文');

runProperty(
  '非空非hex密码加密后结果不包含原始明文',
  () => fc.property(
    // 生成至少包含一个非 hex 字符的字符串，避免纯 hex 字符串在输出中偶然出现
    fc.string({ minLength: 1 }).filter(s => /[^0-9a-f:]/.test(s)),
    (pwd) => {
      const encrypted = encryptPassword(pwd);
      // 去掉前缀 "enc:v1:" 后检查剩余部分（即 hex 编码的 iv:authTag:ciphertext）
      const payload = encrypted.substring('enc:v1:'.length);
      return !payload.includes(pwd);
    }
  )
);

runProperty(
  '较长密码加密后结果不包含原始明文',
  () => fc.property(
    // 长度 >= 3 的字符串，基本不可能在 hex 中偶然匹配
    fc.string({ minLength: 3, maxLength: 200 }).filter(s => /[^0-9a-f:]/.test(s)),
    (pwd) => {
      const encrypted = encryptPassword(pwd);
      const payload = encrypted.substring('enc:v1:'.length);
      return !payload.includes(pwd);
    }
  )
);

// ============================================================
// Property 10: 明文密码兼容
// 不以 `enc:v1:` 开头的字符串原样返回
// **Validates: Requirement 6.4**
// ============================================================
console.log('\nProperty 10: 明文密码兼容');

runProperty(
  '不以 "enc:v1:" 开头的字符串经 decryptPassword 原样返回',
  () => fc.property(
    // 生成不以 "enc:v1:" 开头的任意字符串
    fc.string().filter(s => !s.startsWith('enc:v1:')),
    (pwd) => {
      return decryptPassword(pwd) === pwd;
    }
  )
);

runProperty(
  '空字符串经 decryptPassword 原样返回',
  () => fc.property(
    fc.constant(''),
    (pwd) => {
      return decryptPassword(pwd) === pwd;
    }
  )
);

runProperty(
  '以 "enc:" 但非 "enc:v1:" 开头的字符串原样返回',
  () => fc.property(
    fc.tuple(
      // 生成非 "v1" 的版本号字符串
      fc.array(
        fc.constantFrom('v', '0', '1', '2', '3', 'a', 'b'),
        { minLength: 1, maxLength: 5 }
      ).map(arr => arr.join('')).filter(s => s !== 'v1'),
      fc.string()
    ),
    ([version, rest]) => {
      const pwd = `enc:${version}:${rest}`;
      // 确保不以 "enc:v1:" 开头
      if (pwd.startsWith('enc:v1:')) return true;
      return decryptPassword(pwd) === pwd;
    }
  )
);

// 输出测试结果
console.log(`\n属性测试结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  process.exit(1);
}
