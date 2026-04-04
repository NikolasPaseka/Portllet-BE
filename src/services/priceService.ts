const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';

async function fetchPrice(yahooSymbol: string): Promise<number | null> {
  try {
    const url = `${BASE_URL}${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Portllet/1.0)' },
    });

    if (!response.ok) {
      console.warn(`Yahoo Finance returned ${response.status} for ${yahooSymbol}`);
      return null;
    }

    const json = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
    const price = json.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price != null ? Number(price) : null;
  } catch (err) {
    console.error(`Failed to fetch price for ${yahooSymbol}:`, err);
    return null;
  }
}

export async function getStockPrice(ticker: string): Promise<number | null> {
  return fetchPrice(ticker);
}

export async function getCryptoPrice(symbol: string): Promise<number | null> {
  return fetchPrice(`${symbol.toUpperCase()}-USD`);
}

export async function getStockPrices(tickers: string[]): Promise<Record<string, number | null>> {
  const results = await Promise.all(
    tickers.map(async (t) => ({ key: t, price: await fetchPrice(t) }))
  );
  return Object.fromEntries(results.map((r) => [r.key, r.price]));
}

export async function getCryptoPrices(symbols: string[]): Promise<Record<string, number | null>> {
  const results = await Promise.all(
    symbols.map(async (s) => ({
      key: s.toUpperCase(),
      price: await fetchPrice(`${s.toUpperCase()}-USD`),
    }))
  );
  return Object.fromEntries(results.map((r) => [r.key, r.price]));
}
