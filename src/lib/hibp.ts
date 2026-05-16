const CACHE_KEY = "phantom_hibp_cache";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_DELAY = 1500; // 1.5s between requests
const MAX_RETRIES = 3;

interface HibpCache {
  [hashPrefix: string]: {
    timestamp: number;
    results: Record<string, number>;
  };
}

let lastRequestTime = 0;

function getCache(): HibpCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function setCache(cache: HibpCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

function cleanCache(cache: HibpCache): HibpCache {
  const now = Date.now();
  const cleaned: HibpCache = {};
  for (const [prefix, entry] of Object.entries(cache)) {
    if (now - entry.timestamp < CACHE_TTL) {
      cleaned[prefix] = entry;
    }
  }
  return cleaned;
}

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY - elapsed));
  }
  lastRequestTime = Date.now();
}

export async function checkPasswordBreach(password: string): Promise<number> {
  if (!password) return 0;

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await window.crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);

    // Check cache first
    let cache = getCache();
    cache = cleanCache(cache);

    if (cache[prefix] && cache[prefix].results[suffix] !== undefined) {
      return cache[prefix].results[suffix];
    }

    // Rate limit before API call
    await rateLimit();

    // Fetch from HIBP with retries
    let response: Response | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        if (response.ok) break;
        if (response.status === 429) {
          await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
          continue;
        }
      } catch {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
        }
      }
    }

    if (!response || !response.ok) return 0;

    const text = await response.text();
    const lines = text.split("\n");

    let breachCount = 0;
    for (const line of lines) {
      const [lineSuffix, countStr] = line.split(":");
      cache[prefix] = cache[prefix] || { timestamp: Date.now(), results: {} };
      cache[prefix].results[lineSuffix.trim()] = parseInt(countStr.trim(), 10);

      if (lineSuffix.trim() === suffix) {
        breachCount = parseInt(countStr.trim(), 10);
      }
    }

    setCache(cache);
    return breachCount;
  } catch (error) {
    console.error("Failed to check HIBP", error);
    return 0;
  }
}

export function getHibpCacheInfo(): { cachedCount: number; oldestEntry: string | null } {
  const cache = getCache();
  const entries = Object.values(cache);
  const cachedCount = entries.reduce((sum, entry) => sum + Object.keys(entry.results).length, 0);
  let oldestEntry: string | null = null;

  if (entries.length > 0) {
    const oldest = entries.reduce((min, entry) => Math.min(min, entry.timestamp), Date.now());
    const days = Math.floor((Date.now() - oldest) / (1000 * 60 * 60 * 24));
    oldestEntry = days === 0 ? "Today" : `${days}d ago`;
  }

  return { cachedCount, oldestEntry };
}

export function clearHibpCache() {
  localStorage.removeItem(CACHE_KEY);
}
