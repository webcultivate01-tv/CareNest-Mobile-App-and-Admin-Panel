import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { FiArrowLeft, FiFileText, FiRefreshCw, FiSearch, FiXCircle } from "react-icons/fi";
import { serverUrl } from "../App";
import {
  CHANNELS,
  CampaignStatusBadge,
  ChannelChips,
  MessageTicks,
  STATUS_INFO,
  StatusPill,
  TickLegend,
  TickSummary,
  channelOf,
  formatDateTime,
  reachedShare,
} from "../components/MarketingUI";

// Marketing > one campaign: the message, the totals, and every patient's ticks (refreshed live).

const statusFilters = ["", "queued", "sent", "delivered", "read", "failed", "skipped"];

// the time of the furthest step the message reached
const latestTime = (m) => m.readAt || m.deliveredAt || m.sentAt || m.failedAt || null;

function StatCard({ label, value, sub, tone = "text-gray-900" }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function CampaignDetail() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => setPage(1), [channel, status, search]);

  const loadCampaign = async () => {
    try {
      const result = await axios.get(serverUrl + `/api/marketing/campaigns/${campaignId}`, { withCredentials: true });
      setCampaign(result.data);
    } catch (e) {
      if (e.response?.status === 404) setNotFound(true);
      else console.log(e);
    }
  };

  const loadMessages = async (quiet = false) => {
    if (!quiet) setListLoading(true);
    try {
      const params = { page, ...(channel && { channel }), ...(status && { status }), ...(search && { search }) };
      const result = await axios.get(serverUrl + `/api/marketing/campaigns/${campaignId}/messages`, { params, withCredentials: true });
      setMessages(result.data.messages);
      setTotal(result.data.total);
      setPageSize(result.data.pageSize);
    } catch (e) {
      console.log(e);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadCampaign();
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadMessages();
  }, [campaignId, page, channel, status, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // live ticks: fast while sending, slower afterwards (delivered / read receipts keep arriving)
  const live = campaign?.status === "sending" || campaign?.status === "scheduled";
  useEffect(() => {
    if (!campaign) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadCampaign();
      loadMessages(true);
    }, live ? 3000 : 10000);
    return () => clearInterval(timer);
  }, [campaign?.id, live, page, channel, status, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = async () => {
    const question =
      campaign.status === "scheduled"
        ? "Cancel this scheduled campaign? Nothing will be sent."
        : "Stop this campaign? Messages already sent stay sent; the rest are not sent.";
    if (!window.confirm(question)) return;
    setCancelling(true);
    try {
      const result = await axios.post(serverUrl + `/api/marketing/campaigns/${campaignId}/cancel`, {}, { withCredentials: true });
      setCampaign(result.data.campaign);
      loadMessages(true);
      toast.success("Campaign cancelled", { position: "top-center", autoClose: 1200 });
    } catch (e) {
      toast.error(e.response?.data?.message || "Something went wrong", { position: "top-center", autoClose: 2000 });
    } finally {
      setCancelling(false);
    }
  };

  if (notFound) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">This campaign does not exist.</p>
        <button onClick={() => navigate("/marketing/campaigns")} className="mt-3 text-emerald-700 font-medium hover:underline">
          Back to campaign history
        </button>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="py-20 flex justify-center">
        <ClipLoader size={32} color="#059669" />
      </div>
    );
  }

  const counts = campaign.counts;
  const attempted = counts.total - counts.skipped;
  const mediaUrl = campaign.mediaPath ? `${serverUrl}/${campaign.mediaPath}` : null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const inputClass = "border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white";

  return (
    <div>
      <button
        onClick={() => navigate("/marketing/campaigns")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3"
      >
        <FiArrowLeft /> Campaign history
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold break-words">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {campaign.status === "scheduled"
              ? `Scheduled for ${formatDateTime(campaign.scheduledAt)}`
              : `Started ${formatDateTime(campaign.startedAt || campaign.createdAt)}`}
            {campaign.completedAt && ` · finished ${formatDateTime(campaign.completedAt)}`}
            {campaign.cancelledAt && ` · cancelled ${formatDateTime(campaign.cancelledAt)}`}
            {campaign.createdByName && ` · by ${campaign.createdByName}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              loadCampaign();
              loadMessages();
            }}
            className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FiRefreshCw /> Refresh
          </button>
          {live && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-2 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
            >
              {cancelling ? <ClipLoader size={14} color="#dc2626" /> : <FiXCircle />} {campaign.status === "scheduled" ? "Cancel" : "Stop sending"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Patients" value={counts.patients.toLocaleString()} sub={`${counts.total.toLocaleString()} messages`} />
        <StatCard label="Sent ✓" value={`${reachedShare(counts, "sent")}%`} sub={`of ${attempted.toLocaleString()} sent out`} />
        <StatCard label="Delivered ✓✓" value={`${reachedShare(counts, "delivered")}%`} sub="WhatsApp, SMS, app" />
        <StatCard label="Read ✓✓" value={`${reachedShare(counts, "read")}%`} tone="text-sky-600" sub="opened by the patient" />
        <StatCard
          label="Failed / skipped"
          value={`${counts.failed.toLocaleString()} / ${counts.skipped.toLocaleString()}`}
          tone={counts.failed ? "text-red-600" : "text-gray-900"}
          sub="see the reason per patient"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 mb-5 items-start">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">By channel</h2>
          <div className="divide-y divide-gray-100">
            {campaign.byChannel.map((row) => {
              const c = channelOf(row.channel);
              return (
                <div key={row.channel} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="flex items-center gap-2 w-40 font-medium text-sm">
                    <span className={`text-lg ${c.tint}`}>{c.icon}</span>
                    {c.label}
                  </span>
                  <TickSummary counts={row.counts} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="font-semibold">Message</h2>
          <ChannelChips channels={campaign.channels} />
          {campaign.title && <p className="font-semibold text-gray-900 break-words">{campaign.title}</p>}
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{campaign.message}</p>
          {mediaUrl &&
            (campaign.mediaType?.startsWith("image/") ? (
              <a href={mediaUrl} target="_blank" rel="noreferrer">
                <img src={mediaUrl} alt="" className="rounded-lg max-h-48 w-full object-cover" />
              </a>
            ) : (
              <a href={mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-emerald-700 hover:underline">
                <FiFileText /> {campaign.mediaName || "Attachment"}
              </a>
            ))}
          {campaign.channels.includes("whatsapp") && (
            <p className="text-xs text-gray-500">
              WhatsApp:{" "}
              {campaign.whatsappMode === "template"
                ? `template "${campaign.whatsappTemplate}" (${campaign.whatsappLanguage})${
                    campaign.whatsappParams?.length ? ` with ${campaign.whatsappParams.map((p, i) => `{{${i + 1}}} = ${p}`).join(", ")}` : ""
                  }`
                : "free text"}
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
          <div className="flex flex-wrap gap-1.5">
            {[{ key: "", label: "All channels" }, ...CHANNELS.filter((c) => campaign.channels.includes(c.key))].map((c) => (
              <button
                key={c.key}
                onClick={() => setChannel(c.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  channel === c.key ? "bg-emerald-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            {statusFilters.map((s) => (
              <option key={s} value={s}>
                {s ? STATUS_INFO[s].label : "Any status"}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search patient, ID, number or email"
              className={`${inputClass} w-full pl-9`}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Sent to</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <ClipLoader size={24} color="#059669" />
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No messages match
                  </td>
                </tr>
              ) : (
                messages.map((m) => {
                  const c = channelOf(m.channel);
                  return (
                    <tr key={m.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <p className="font-medium">{m.recipientName || "Removed patient"}</p>
                        <p className="text-xs text-gray-500 tabular-nums">{m.recipientCode}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={c.tint}>{c.icon}</span> {c.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 break-all">{m.channel === "app" ? "App inbox" : m.address || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StatusPill status={m.status} />
                          {m.simulated && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5" title="Test mode - not really sent">
                              Test
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {latestTime(m) ? formatDateTime(latestTime(m)) : "-"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {m.error ? (
                          <span className={m.status === "failed" ? "text-red-600" : "text-gray-500"}>{m.error}</span>
                        ) : (
                          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-500">
                            {m.sentAt && (
                              <span className="inline-flex items-center gap-1" title={formatDateTime(m.sentAt)}>
                                <MessageTicks status="sent" size="sm" /> {new Date(m.sentAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                            {m.deliveredAt && (
                              <span className="inline-flex items-center gap-1" title={formatDateTime(m.deliveredAt)}>
                                <MessageTicks status="delivered" size="sm" />{" "}
                                {new Date(m.deliveredAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                            {m.readAt && (
                              <span className="inline-flex items-center gap-1" title={formatDateTime(m.readAt)}>
                                <MessageTicks status="read" size="sm" /> {new Date(m.readAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {total > pageSize && (
          <div className="flex items-center justify-between p-4 border-t border-gray-100 text-sm text-gray-600">
            <span>
              {((page - 1) * pageSize + 1).toLocaleString()}-{Math.min(total, page * pageSize).toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((n) => Math.max(1, n - 1))} disabled={page === 1} className="border border-gray-300 rounded-lg px-3 py-1.5 disabled:opacity-40">
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
                disabled={page === totalPages}
                className="border border-gray-300 rounded-lg px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <TickLegend />
      </div>
    </div>
  );
}

export default CampaignDetail;
