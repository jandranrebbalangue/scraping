export const config = {
  url: "https://www.amazon.com/s?k=Headphones",
  browser: true,
  headless: true,
  follow: [],
  output: {
    file: "amazon.results.json",
    format: "json",
  },
};

function collectionLength(nodes) {
  if (!nodes) return 0;
  if (typeof nodes.length === "number") return nodes.length;
  if (typeof nodes.length === "function") return nodes.length();
  return 0;
}

function collectionGet(nodes, index) {
  if (!nodes) return null;
  if (typeof nodes.get === "function") return nodes.get(index);
  if (Array.isArray(nodes)) return nodes[index] || null;
  return null;
}

function textOf(node) {
  if (!node) return null;
  const value = node.text();
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function attrOf(node, name) {
  if (!node || !node.hasAttr(name)) return null;
  const value = node.attr(name);
  if (!value) return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

function parsePrice(value) {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "");
  const match = compact.match(/\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/);
  if (!match) return null;
  const dollars = match[1];
  const cents = (match[2] || "00").padEnd(2, "0");
  return `$${dollars}.${cents}`;
}

function normalizePrice(card) {
  const offscreenPrices = card.find(".a-price .a-offscreen");
  for (let i = 0; i < collectionLength(offscreenPrices); i += 1) {
    const parsed = parsePrice(textOf(collectionGet(offscreenPrices, i)));
    if (parsed) return parsed;
  }

  const wholeRaw = textOf(card.find(".a-price .a-price-whole").first());
  if (wholeRaw) {
    const whole = wholeRaw.replace(/[^\d,]/g, "");
    const fractionRaw = textOf(card.find(".a-price .a-price-fraction").first());
    const fraction = (fractionRaw || "00").replace(/\D/g, "").slice(0, 2).padEnd(2, "0");
    if (whole) return `$${whole}.${fraction}`;
  }

  return parsePrice(textOf(card));
}

function normalizeRating(value) {
  if (!value) return null;
  const match = value.match(/\d(?:\.\d)?\s*out of 5 stars/i);
  return match ? match[0] : value;
}

function normalizeReviewCount(value) {
  if (!value) return null;
  const cleaned = value.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();

  const withCommas = cleaned.match(/\b\d{1,3}(?:,\d{3})+\b/);
  if (withCommas) return withCommas[0];

  const compact = cleaned.match(/\b\d{3,}\b/);
  if (compact) return compact[0];

  const shorthand = cleaned.match(/(\d+(?:\.\d+)?)\s*([kKmM])\+?/);
  if (shorthand) {
    const valueNum = Number(shorthand[1]);
    const unit = shorthand[2].toLowerCase();
    const multiplier = unit === "m" ? 1000000 : 1000;
    const expanded = Math.round(valueNum * multiplier);
    return String(expanded).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  return null;
}

function findReviewCount(card) {
  const selectorCandidates = [
    "a[href*='customerReviews'] span.a-size-base",
    "a[href*='customerReviews'] span",
    "span.a-size-base.s-underline-text",
    "span[aria-label*='ratings']",
    "span[aria-label*='rating']",
  ];

  for (const selector of selectorCandidates) {
    const nodes = card.find(selector);
    for (let i = 0; i < collectionLength(nodes); i += 1) {
      const text = textOf(collectionGet(nodes, i));
      const parsed = normalizeReviewCount(text);
      if (parsed) return parsed;
    }
  }

  const ariaNodes = card.find("[aria-label]");
  for (let i = 0; i < collectionLength(ariaNodes); i += 1) {
    const node = collectionGet(ariaNodes, i);
    const aria = attrOf(node, "aria-label");
    if (!aria) continue;
    if (!/ratings?|reviews?/i.test(aria)) continue;
    const parsed = normalizeReviewCount(aria);
    if (parsed) return parsed;
  }

  return null;
}

export default function ({ doc }) {
  const cards = doc.find('div[data-component-type="s-search-result"][data-asin]');
  const out = [];
  const seen = new Set();

  for (let i = 0; i < collectionLength(cards); i += 1) {
    const card = collectionGet(cards, i);
    if (!card) continue;
    const asin = attrOf(card, "data-asin");
    if (!asin || seen.has(asin)) continue;
    seen.add(asin);

    const title =
      textOf(card.find("h2 a span").first()) ||
      textOf(card.find("h2 span").first());

    const avg_rating = normalizeRating(textOf(card.find("span.a-icon-alt").first()));

    const review_count = findReviewCount(card);
    const price = normalizePrice(card);
    if (!price || !review_count) continue;

    out.push({
      asin,
      avg_rating,
      price,
      review_count,
      title,
    });
  }

  return out;
}
