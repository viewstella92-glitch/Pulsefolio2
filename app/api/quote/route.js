import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();

  if (!/^[A-Z0-9.^=-]{1,15}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?range=1y&interval=1d&events=div%2Csplits`;

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 60 }
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Market data unavailable" }, { status: 502 });
    }

    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) return NextResponse.json({ error: "Ticker not found" }, { status: 404 });

    const meta = result.meta || {};
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const points = timestamps
      .map((ts, i) => ({ t: ts * 1000, v: closes[i] }))
      .filter((p) => Number.isFinite(p.v));

    const price = Number(meta.regularMarketPrice ?? points.at(-1)?.v);
    const previous = Number(meta.previousClose ?? points.at(-2)?.v ?? price);
    const change = price - previous;
    const changePct = previous ? (change / previous) * 100 : 0;

    return NextResponse.json({
      symbol,
      name: meta.longName || meta.shortName || symbol,
      currency: meta.currency || "USD",
      exchange: meta.exchangeName || "",
      price,
      previous,
      change,
      changePct,
      dayHigh: meta.regularMarketDayHigh ?? null,
      dayLow: meta.regularMarketDayLow ?? null,
      fiftyTwoHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoLow: meta.fiftyTwoWeekLow ?? null,
      marketCap: meta.marketCap ?? null,
      chart: points.slice(-90)
    });
  } catch {
    return NextResponse.json({ error: "Unable to load market data" }, { status: 500 });
  }
}