import { BsCheck2, BsCheck2All } from "react-icons/bs";
import { FiAlertCircle, FiBell, FiClock, FiMail, FiMessageSquare, FiMinus } from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";

// Shared pieces of the Marketing pages (mirrors backend/config/marketing.js).

export const CHANNELS = [
  { key: "whatsapp", label: "WhatsApp", icon: <FaWhatsapp />, tint: "text-[#25D366]" },
  { key: "sms", label: "SMS", icon: <FiMessageSquare />, tint: "text-sky-600" },
  { key: "email", label: "Email", icon: <FiMail />, tint: "text-violet-600" },
  { key: "app", label: "App notification", icon: <FiBell />, tint: "text-emerald-600" },
];

// audience filter: patients with at least one appointment in this state
export const appointmentStatusOptions = [
  { value: "", label: "Any" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const channelOf =(key) => CHANNELS.find((c) => c.key === key) || { key, label: key, icon: null, tint: "" };

export const STATUS_INFO = {
  queued: { label: "Waiting to send", short: "Queued" },
  sending: { label: "Sending", short: "Sending" },
  sent: { label: "Sent", short: "Sent" },
  delivered: { label: "Delivered", short: "Delivered" },
  read: { label: "Read", short: "Read" },
  failed: { label: "Failed", short: "Failed" },
  skipped: { label: "Not sent", short: "Skipped" },
};

// WhatsApp-style ticks: clock -> one grey tick -> two grey ticks -> two blue ticks
const TICK_LOOKS = {
  queued: { icon: <FiClock />, color: "text-gray-400", small: true },
  sending: { icon: <FiClock />, color: "text-gray-400", small: true },
  sent: { icon: <BsCheck2 />, color: "text-gray-400" },
  delivered: { icon: <BsCheck2All />, color: "text-gray-400" },
  read: { icon: <BsCheck2All />, color: "text-[#34B7F1]" },
  failed: { icon: <FiAlertCircle />, color: "text-red-500", small: true },
  skipped: { icon: <FiMinus />, color: "text-gray-300", small: true },
};

export function MessageTicks({ status, size = "md" }) {
  const look = TICK_LOOKS[status] || TICK_LOOKS.skipped;
  const title = STATUS_INFO[status]?.label || status;
  const px = size === "sm" ? (look.small ? "text-[13px]" : "text-[16px]") : look.small ? "text-[15px]" : "text-[19px]";
  return (
    <span className={`inline-flex items-center leading-none ${px} ${look.color}`} title={title} aria-label={title}>
      {look.icon}
    </span>
  );
}

export function StatusPill({ status }) {
  const tone =
    status === "read"
      ? "bg-sky-50 text-sky-700"
      : status === "failed"
        ? "bg-red-50 text-red-600"
        : status === "skipped"
          ? "bg-gray-100 text-gray-500"
          : "bg-gray-50 text-gray-700";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${tone}`}>
      <MessageTicks status={status} size="sm" />
      {STATUS_INFO[status]?.short || status}
    </span>
  );
}

export function CampaignStatusBadge({ status }) {
  const looks = {
    scheduled: "bg-amber-50 text-amber-700 ring-amber-100",
    sending: "bg-sky-50 text-sky-700 ring-sky-100",
    completed: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    cancelled: "bg-gray-100 text-gray-500 ring-gray-200",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 capitalize ${looks[status] || looks.cancelled}`}>
      {status === "sending" && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />}
      {status}
    </span>
  );
}

export function ChannelChips({ channels }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {channels.map((key) => {
        const c = channelOf(key);
        return (
          <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 ring-1 ring-gray-200 text-xs font-medium text-gray-700">
            <span className={c.tint}>{c.icon}</span>
            {c.label}
          </span>
        );
      })}
    </span>
  );
}

// "1,204 sent ✓ · 980 delivered ✓✓ · 512 read ✓✓(blue) · 12 failed"
export function TickSummary({ counts, compact = false }) {
  if (!counts) return null;
  const items = [
    ["queued", counts.queued],
    ["sent", counts.sent],
    ["delivered", counts.delivered],
    ["read", counts.read],
    ["failed", counts.failed],
    ["skipped", counts.skipped],
  ].filter(([, n]) => n > 0);
  if (!items.length) return <span className="text-xs text-gray-400">No messages</span>;
  return (
    <span className={`inline-flex flex-wrap items-center ${compact ? "gap-x-3 gap-y-1" : "gap-x-4 gap-y-2"}`}>
      {items.map(([status, n]) => (
        <span key={status} className="inline-flex items-center gap-1 text-xs text-gray-600 tabular-nums" title={STATUS_INFO[status].label}>
          <MessageTicks status={status} />
          <span className="font-semibold text-gray-800">{n.toLocaleString()}</span>
          {!compact && <span className="text-gray-500">{STATUS_INFO[status].short.toLowerCase()}</span>}
        </span>
      ))}
    </span>
  );
}

// how far the messages that actually went out got (skipped ones never started)
export const reachedShare = (counts, status) => {
  const attempted = (counts?.total || 0) - (counts?.skipped || 0);
  if (!attempted) return 0;
  const reached = {
    sent: counts.sent + counts.delivered + counts.read,
    delivered: counts.delivered + counts.read,
    read: counts.read,
  }[status];
  return Math.round((reached / attempted) * 100);
};

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "-";

// legend shown under the tick tables
export function TickLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500">
      {["queued", "sent", "delivered", "read", "failed", "skipped"].map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <MessageTicks status={s} /> {STATUS_INFO[s].label}
        </span>
      ))}
      <span className="text-gray-400">Email has no "delivered" receipt: one tick when sent, blue when opened.</span>
    </div>
  );
}
