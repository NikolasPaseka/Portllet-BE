import { config } from '../config.js';

let cachedRate = 25.0;
let cacheExpiry = Date.now();

export async function getUsdToCzkRate(): Promise<number> {
  if (Date.now() < cacheExpiry) {
    return cachedRate;
  }

  try {
    const apiKey = config.fxApiKey;
    const url = apiKey
    ? `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
    : `https://open.er-api.com/v6/latest/USD`;
    
    console.log(url);
    const response = await fetch(url);
    console.log('FX API response status:', response.status);
    if (!response.ok) throw new Error(`FX API returned ${response.status}`);

    const json = await response.json() as { rates?: Record<string, number> };
    const rate = json.rates?.CZK;
    console.log('FX API response JSON:', rate);
    if (rate) {
      cachedRate = rate;
      cacheExpiry = Date.now() + 60 * 60 * 1000;
      return cachedRate;
    }
  } catch (err) {
    console.error('Failed to fetch FX rate, using cached value:', err);
  }

  return cachedRate;
}

export function convertToCzk(amount: number, currency: string, usdToCzkRate: number): number {
  return currency.toUpperCase() === 'USD' ? amount * usdToCzkRate : amount;
}
