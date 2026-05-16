import { describe, it, expect } from "vitest";
import { generateRandomPassword, calculateTimeToCrack, generateSecureId } from "../lib/crypto";

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
