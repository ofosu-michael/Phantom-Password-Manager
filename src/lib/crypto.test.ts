import { describe, it, expect } from "vitest";
import {
  generateRandomPassword,
  calculateTimeToCrack,
  generateSecureId,
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
} from "../lib/crypto";

describe("generateRandomPassword", () => {
  it("generates password with default length of 16", () => {
    const password = generateRandomPassword();
    expect(password.length).toBe(16);
  });

  it("generates password with custom length", () => {
    const password = generateRandomPassword(32);
    expect(password.length).toBe(32);
  });

  it("generates different passwords on each call", () => {
    const passwords = new Set();
    for (let i = 0; i < 10; i++) {
      passwords.add(generateRandomPassword(16));
    }
    expect(passwords.size).toBe(10);
  });

  it("includes lowercase letters by default", () => {
    const password = generateRandomPassword(100);
    expect(/[a-z]/.test(password)).toBe(true);
  });

  it("includes uppercase letters when enabled", () => {
    const password = generateRandomPassword(100, { uppercase: true, numbers: false, symbols: false });
    expect(/[A-Z]/.test(password)).toBe(true);
  });

  it("includes numbers when enabled", () => {
    const password = generateRandomPassword(100, { uppercase: false, numbers: true, symbols: false });
    expect(/[0-9]/.test(password)).toBe(true);
  });

  it("includes symbols when enabled", () => {
    const password = generateRandomPassword(100, { uppercase: false, numbers: false, symbols: true });
    expect(/[^a-zA-Z0-9]/.test(password)).toBe(true);
  });
});

describe("calculateTimeToCrack", () => {
  it("returns Instant for empty password", () => {
    const result = calculateTimeToCrack("");
    expect(result.time).toBe("Instant");
    expect(result.score).toBe(0);
  });

  it("returns low score for short password", () => {
    const result = calculateTimeToCrack("abc");
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("returns high score for strong password", () => {
    const result = calculateTimeToCrack("X9#mK2$pL5@nQ8!w");
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it("returns score 5 for very long password", () => {
    const result = calculateTimeToCrack("aB3$kL9@mN2#pQ5!rS8*tU1^vW4&xY7(zA0)");
    expect(result.score).toBe(5);
  });
});

describe("generateSecureId", () => {
  it("generates valid UUID format", () => {
    const id = generateSecureId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateSecureId());
    }
    expect(ids.size).toBe(100);
  });
});

describe("encrypt/decrypt round-trip", () => {
  it("encrypts and decrypts plaintext correctly", async () => {
    const plaintext = "my-secret-password-123";
    const secret = "master-password";
    const encrypted = await encrypt(plaintext, secret);
    const decrypted = await decrypt(encrypted, secret);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext each time (random salt/IV)", async () => {
    const plaintext = "same plaintext";
    const secret = "same-secret";
    const enc1 = await encrypt(plaintext, secret);
    const enc2 = await encrypt(plaintext, secret);
    expect(enc1).not.toBe(enc2);
    const dec1 = await decrypt(enc1, secret);
    const dec2 = await decrypt(enc2, secret);
    expect(dec1).toBe(plaintext);
    expect(dec2).toBe(plaintext);
  });

  it("returns null when decrypting with wrong password", async () => {
    const plaintext = "secret data";
    const encrypted = await encrypt(plaintext, "correct-password");
    const decrypted = await decrypt(encrypted, "wrong-password");
    expect(decrypted).toBeNull();
  });

  it("handles empty string", async () => {
    const encrypted = await encrypt("", "secret");
    const decrypted = await decrypt(encrypted, "secret");
    expect(decrypted).toBe("");
  });

  it("handles unicode content", async () => {
    const plaintext = "Hello 世界 🌍 مرحبا";
    const encrypted = await encrypt(plaintext, "secret");
    const decrypted = await decrypt(encrypted, "secret");
    expect(decrypted).toBe(plaintext);
  });

  it("handles very long content", async () => {
    const plaintext = "x".repeat(100_000);
    const encrypted = await encrypt(plaintext, "secret");
    const decrypted = await decrypt(encrypted, "secret");
    expect(decrypted).toBe(plaintext);
  });

  it("returns null for invalid JSON", async () => {
    const result = await decrypt("not-valid-json", "secret");
    expect(result).toBeNull();
  });

  it("returns null for valid JSON but wrong shape", async () => {
    const result = await decrypt(JSON.stringify({ foo: "bar" }), "secret");
    expect(result).toBeNull();
  });
});

describe("hashPassword/verifyPassword", () => {
  it("hashes and verifies password correctly", async () => {
    const password = "my-secure-password";
    const hash = await hashPassword(password);
    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct-password");
    const valid = await verifyPassword("wrong-password", hash);
    expect(valid).toBe(false);
  });

  it("produces different hashes for same password (random salt)", async () => {
    const hash1 = await hashPassword("password");
    const hash2 = await hashPassword("password");
    expect(hash1).not.toBe(hash2);
    const valid1 = await verifyPassword("password", hash1);
    const valid2 = await verifyPassword("password", hash2);
    expect(valid1).toBe(true);
    expect(valid2).toBe(true);
  });

  it("returns false for invalid hash JSON", async () => {
    const valid = await verifyPassword("password", "not-json");
    expect(valid).toBe(false);
  });

  it("returns false for hash with missing fields", async () => {
    const valid = await verifyPassword("password", JSON.stringify({ s: "abc" }));
    expect(valid).toBe(false);
  });
});
