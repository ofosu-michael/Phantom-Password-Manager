import CryptoJS from 'crypto-js';

/**
 * Basic encryption helper for local storage.
 * Note: In a real production app, we would use more robust Argon2/PBKDF2 settings 
 * and WebCrypto APIs, but this demonstrates the flow with crypto-js.
 */

export const encrypt = (text: string, secret: string) => {
  return CryptoJS.AES.encrypt(text, secret).toString();
};

export const decrypt = (ciphertext: string, secret: string) => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    if (!originalText) return null;
    return originalText;
  } catch {
    return null;
  }
};

export const hashPassword = (password: string) => {
  return CryptoJS.SHA256(password).toString();
};

export const generateRandomPassword = (length = 16, options = { 
  numbers: true, 
  symbols: true, 
  uppercase: true 
}) => {
  const charset = {
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+~`|}{[]:;?><,./-='
  };

  let characters = charset.lowercase;
  if (options.uppercase) characters += charset.uppercase;
  if (options.numbers) characters += charset.numbers;
  if (options.symbols) characters += charset.symbols;

  let password = '';
  for (let i = 0; i < length; i++) {
    password += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return password;
};

export const calculateTimeToCrack = (password: string): { time: string, score: number } => {
  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32;

  if (charsetSize === 0) return { time: 'Instant', score: 0 };

  const entropy = password.length * Math.log2(charsetSize);
  
  // Assume 100 Billion guesses per second (10^11) in extreme offline attack
  const guessesPerSecond = 1e11;
  const totalSeconds = Math.pow(2, entropy) / guessesPerSecond;

  let timeString = '';
  let score = 0;

  if (totalSeconds < 1) { timeString = 'Instant'; score = 0; }
  else if (totalSeconds < 60) { timeString = `${Math.round(totalSeconds)} secs`; score = 1; }
  else if (totalSeconds < 3600) { timeString = `${Math.round(totalSeconds / 60)} mins`; score = 2; }
  else if (totalSeconds < 86400) { timeString = `${Math.round(totalSeconds / 3600)} hours`; score = 2; }
  else if (totalSeconds < 31536000) { timeString = `${Math.round(totalSeconds / 86400)} days`; score = 3; }
  else if (totalSeconds < 31536000 * 1000) { timeString = `${Math.round(totalSeconds / 31536000)} years`; score = 4; }
  else { timeString = `Centuries+`; score = 5; }

  return { time: timeString, score };
};
