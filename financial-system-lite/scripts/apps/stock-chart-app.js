import { MODULE_ID } from "../data/wallet.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Read-only price-history viewer for a single stock. Opened by clicking a
 * stock's symbol/name in the player app's portfolio list. Renders the
 * stock's `history` array (written by Stocks.applyShift) as a hand-built
 * inline SVG line chart — no external charting library required, and no
 * dependency on anything shipping with core Foundry beyond ApplicationV2.
 */
export class StockChartApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "financial-system-lite-stock-chart-{id}",
    classes: ["financial-system-lite", "vendit-theme"],
    tag: "div",
    window: {
      title: "financial-system-lite.stock.chart.title",
      icon: "fa-solid fa-chart-line",
      resizable: true
    },
    position: { width: 460, height: 400 }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/parts/stock-chart.hbs`, scrollable: [""] }
  };

  /** @param {object} stock - a full stock record from Stocks.get(), including `history`. */
  constructor(stock, options = {}) {
    super({ ...options, id: `financial-system-lite-stock-chart-${stock.id}` });
    this.stock = stock;
  }

  get title() {
    return `${this.stock.symbol} — ${this.stock.name}`;
  }

  async _prepareContext(options) {
    const history = this.stock.history?.length
      ? this.stock.history
      : [{ t: Date.now(), price: this.stock.price }];

    const prices = history.map(p => p.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const first = prices[0];
    const last = prices[prices.length - 1];
    const changePercent = first ? (((last - first) / first) * 100).toFixed(1) : "0.0";

    return {
      symbol: this.stock.symbol,
      name: this.stock.name,
      currentPrice: this.stock.price,
      high,
      low,
      changePercent,
      changeClass: last >= first ? "positive" : "negative",
      hasEnoughData: history.length > 1,
      svgChart: this._buildChart(history, high, low)
    };
  }

  /**
   * Builds a self-contained inline SVG line chart from a price history array.
   * Uses the module's existing CSS classes (fsl-chart-*) for styling so it
   * automatically picks up the vendit-theme cyan/CRT look.
   */
  _buildChart(history, high, low) {
    const width = 400;
    const height = 200;
    const padX = 40;
    const padY = 16;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    // Guard against a flat/single-point history so we never divide by zero.
    const range = high - low || 1;

    const points = history.map((entry, i) => {
      const x = history.length > 1 ? padX + (i / (history.length - 1)) * innerW : padX + innerW / 2;
      const y = padY + innerH - ((entry.price - low) / range) * innerH;
      return { x, y, price: entry.price, t: entry.t };
    });

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const floorY = (padY + innerH).toFixed(1);
    const areaPath = points.length > 1
      ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${floorY} L${points[0].x.toFixed(1)},${floorY} Z`
      : "";

    const dots = points.map(p => {
      const date = new Date(p.t).toLocaleDateString();
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" class="fsl-chart-dot"><title>${date}: $${p.price}</title></circle>`;
    }).join("");

    // Three horizontal gridlines: top (high), middle, bottom (low), each labeled with a price.
    const gridLines = [0, 0.5, 1].map(f => {
      const y = padY + innerH * f;
      const price = Math.round(high - range * f);
      return `<line x1="${padX}" y1="${y.toFixed(1)}" x2="${width - padX}" y2="${y.toFixed(1)}" class="fsl-chart-grid" />` +
             `<text x="${(padX - 6).toFixed(1)}" y="${(y + 4).toFixed(1)}" class="fsl-chart-axis-label" text-anchor="end">$${price}</text>`;
    }).join("");

    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="fsl-chart-svg-inner" preserveAspectRatio="xMidYMid meet">` +
           gridLines +
           (areaPath ? `<path d="${areaPath}" class="fsl-chart-area" />` : "") +
           `<path d="${linePath}" class="fsl-chart-line" />` +
           dots +
           `</svg>`;
  }
}
