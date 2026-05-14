export async function checkPasswordBreach(password: string): Promise<number> {
  if (!password) return 0;
  
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await window.crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    
    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);
    
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!response.ok) return 0;
    
    const text = await response.text();
    const lines = text.split('\n');
    
    for (const line of lines) {
      const [lineSuffix, countStr] = line.split(':');
      if (lineSuffix.trim() === suffix) {
        return parseInt(countStr.trim(), 10);
      }
    }
    return 0;
  } catch (error) {
    console.error('Failed to check HIBP', error);
    return 0;
  }
}
