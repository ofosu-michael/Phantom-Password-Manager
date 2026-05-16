const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

const STORAGE_VERSION_KEY = "phantom_vault_version";
const CURRENT_VERSION = 2;

function buf2hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function hex2buf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
  return bytes.buffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(text: string, secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(secret, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text)
  );

  const result = {
    v: CURRENT_VERSION,
    s: buf2hex(salt),
    i: buf2hex(iv),
    c: buf2hex(encrypted),
  };

  return JSON.stringify(result);
}

export async function decrypt(ciphertext: string, secret: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(ciphertext);

    if (parsed.v === CURRENT_VERSION) {
      const salt = hex2buf(parsed.s);
      const iv = hex2buf(parsed.i);
      const data = hex2buf(parsed.c);
      const key = await deriveKey(secret, new Uint8Array(salt));

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        key,
        new Uint8Array(data)
      );

      return new TextDecoder().decode(decrypted);
    }

    return null;
  } catch {
    return null;
  }
}

export async function decryptLegacy(ciphertext: string, secret: string): Promise<string | null> {
  try {
    const CryptoJS = await import("crypto-js");
    const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    if (!originalText) return null;
    return originalText;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password)
  );
  return buf2hex(hashBuffer);
}

export function generateRandomPassword(
  length = 16,
  options = { numbers: true, symbols: true, uppercase: true }
): string {
  const charset = {
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    numbers: "0123456789",
    symbols: "!@#$%^&*()_+~`|}{[]:;?><,./-=",
  };

  let characters = charset.lowercase;
  if (options.uppercase) characters += charset.uppercase;
  if (options.numbers) characters += charset.numbers;
  if (options.symbols) characters += charset.symbols;

  const randomValues = crypto.getRandomValues(new Uint32Array(length));
  let password = "";
  for (let i = 0; i < length; i++) {
    password += characters.charAt(randomValues[i] % characters.length);
  }
  return password;
}

export function generateSecureId(): string {
  return crypto.randomUUID();
}

export function calculateTimeToCrack(password: string): { time: string; score: number } {
  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32;

  if (charsetSize === 0) return { time: "Instant", score: 0 };

  const entropy = password.length * Math.log2(charsetSize);

  const guessesPerSecond = 1e11;
  const totalSeconds = Math.pow(2, entropy) / guessesPerSecond;

  let timeString = "";
  let score = 0;

  if (totalSeconds < 1) {
    timeString = "Instant";
    score = 0;
  } else if (totalSeconds < 60) {
    timeString = `${Math.round(totalSeconds)} secs`;
    score = 1;
  } else if (totalSeconds < 3600) {
    timeString = `${Math.round(totalSeconds / 60)} mins`;
    score = 2;
  } else if (totalSeconds < 86400) {
    timeString = `${Math.round(totalSeconds / 3600)} hours`;
    score = 2;
  } else if (totalSeconds < 31536000) {
    timeString = `${Math.round(totalSeconds / 86400)} days`;
    score = 3;
  } else if (totalSeconds < 31536000 * 1000) {
    timeString = `${Math.round(totalSeconds / 31536000)} years`;
    score = 4;
  } else {
    timeString = "Centuries+";
    score = 5;
  }

  return { time: timeString, score };
}

export async function needsMigration(): Promise<boolean> {
  const version = localStorage.getItem(STORAGE_VERSION_KEY);
  if (!version) {
    const savedData = localStorage.getItem("phantom_vault_data");
    if (savedData) {
      try {
        JSON.parse(savedData);
        return false;
      } catch {
        return true;
      }
    }
    return false;
  }
  return parseInt(version, 10) < CURRENT_VERSION;
}

export async function migrateVault(masterPassword: string): Promise<boolean> {
  try {
    const savedData = localStorage.getItem("phantom_vault_data");
    if (!savedData) return false;

    const decrypted = await decryptLegacy(savedData, masterPassword);
    if (!decrypted) return false;

    const parsed = JSON.parse(decrypted);
    const encrypted = await encrypt(JSON.stringify(parsed), masterPassword);
    localStorage.setItem("phantom_vault_data", encrypted);
    localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_VERSION.toString());
    return true;
  } catch {
    return false;
  }
}
