'use strict';

const crypto = require('crypto');
const os = require('os');

// 固定盐值，保证同一机器同一用户每次派生相同密钥
const SALT = 'coding-db-mcp-v1';

/**
 * 派生加密密钥
 * 使用用户主目录 + 用户名作为种子，通过 PBKDF2 派生 256 位密钥。
 * 这不是为了抵抗高级攻击者（密钥材料在本机可获取），
 * 而是防止配置文件被意外泄露（如误提交到 git）时密码直接暴露。
 * @returns {Buffer} 32 字节（256 位）的加密密钥
 */
function deriveKey() {
  // 使用用户主目录 + 用户名作为密钥种子（本机唯一）
  const seed = `${os.homedir()}:${os.userInfo().username}`;
  return crypto.pbkdf2Sync(seed, SALT, 100000, 32, 'sha256');
}

/**
 * 加密密码
 * 使用 AES-256-GCM 算法加密明文密码，返回带前缀的加密字符串。
 * @param {string} plaintext - 明文密码
 * @returns {string} 加密后的字符串，格式: "enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */
function encryptPassword(plaintext) {
  const key = deriveKey();
  // GCM 推荐使用 12 字节 IV
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  // 加密明文
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // 获取认证标签（用于完整性校验）
  const authTag = cipher.getAuthTag().toString('hex');

  // 返回带版本前缀的加密格式
  return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * 解密密码
 * 解密带 "enc:v1:" 前缀的加密字符串，无前缀的字符串视为明文直接返回（兼容旧配置）。
 * @param {string} encryptedStr - 加密字符串或明文密码
 * @returns {string} 明文密码
 */
function decryptPassword(encryptedStr) {
  // 兼容明文密码：不以 "enc:v1:" 开头的字符串原样返回
  if (!encryptedStr.startsWith('enc:v1:')) {
    return encryptedStr;
  }

  // 解析加密格式各部分
  const parts = encryptedStr.split(':');
  // 格式: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
  const ivHex = parts[2];
  const authTagHex = parts[3];
  const cipherHex = parts[4];

  const key = deriveKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  // 设置认证标签用于完整性校验
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  // 解密密文
  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  deriveKey,
  encryptPassword,
  decryptPassword
};
