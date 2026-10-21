import { useMemo, useRef, useState } from "react";

const granularities = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

const money = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const labelFor = (bucket, granularity) => {
  const d = new Date(bucket);
  if (granularity === "month") return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

// Compact bar chart, no chart-library dependency (none exists in this project). Single series
// (revenue), so no legend is needed - the section title already names it.
function RevenueChart({ points, granularity, onGranularityChange, loading }) {
  const containerRef = useRef(null);
  const [hover, setHover] = useState(null); // { index, x, y }

  const max = useMemo(() => Math.max(1, ...points.map((p) => p.revenue)), [points]);
  const width = 760;
  const height = 160;
  const gap = 6;
  const barWidth = points.length ? Math.min(28, (width - gap * (points.length - 1)) / points.length) : 0;

  const barX = (i) => i * (barWidth + gap);
  const barY = (revenue) => height - (revenue / max) * (height - 8);
  const barH = (revenue) => height - barY(revenue);

  // rounded top corners only, square bottom (bars are anchored to the baseline)
  const barPath = (x, y, w, h, r = 4) => {
    const radius = Math.min(r, h, w / 2);
    return `M${x},${y + radius} A${radius},${radius} 0 0 1 ${x + radius},${y}
            H${x + w - radius} A${radius},${radius} 0 0 1 ${x + w},${y + radius}
            V${y + h} H${x} Z`;
  };

  const showLabelAt = (i) => points.length <= 1 || i === 0 || i === points.length - 1 || i === Math.floor((points.length - 1) / 2);

  const handleMove = (e, i) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setHover({ index: i, x: e.clientX - bounds.left, y: e.clientY - bounds.top });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">Revenue Overview</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {granularities.map((g) => (
            <button
              key={g.value}
              onClick={() => onGranularityChange(g.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                granularity === g.value ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative">
        {loading ? (
          <div className="h-[160px] flex items-center justify-center text-sm text-gray-400">Loading chart...</div>
        ) : points.length === 0 ? (
          <div className="h-[160px] flex items-center justify-center text-sm text-gray-400">
            No captured payments in this range yet
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${Math.max(width, points.length * (barWidth + gap))} ${height}`}
              className="w-full h-[160px]"
              preserveAspectRatio="none"
              role="img"
              aria-label="Revenue over time"
            >
              {/* recessive baseline */}
              <line x1="0" y1={height} x2={points.length * (barWidth + gap)} y2={height} stroke="#e5e7eb" strokeWidth="1" />
              {points.map((p, i) => (
                <path
                  key={p.bucket}
                  d={barPath(barX(i), barY(p.revenue), barWidth, barH(p.revenue))}
                  fill={hover?.index === i ? "#047857" : "#10b981"}
                  onMouseMove={(e) => handleMove(e, i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }}
                />
              ))}
            </svg>
            <div className="flex text-[11px] text-gray-400 mt-1" style={{ gap: `${gap}px` }}>
              {points.map((p, i) => (
                <span key={p.bucket} style={{ width: `${barWidth}px` }} className="text-center shrink-0">
                  {showLabelAt(i) ? labelFor(p.bucket, granularity) : ""}
                </span>
              ))}
            </div>

            {hover && (
              <div
                className="absolute z-10 -translate-x-1/2 -translate-y-full bg-gray-900 text-white text-xs rounded-lg px-3 py-2 pointer-events-none shadow-lg"
                style={{ left: hover.x, top: hover.y - 10 }}
              >
                <div className="font-semibold">{money(points[hover.index].revenue)}</div>
                <div className="text-gray-300">{labelFor(points[hover.index].bucket, granularity)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default RevenueChart;
