import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import { FiArrowLeft, FiRefreshCw, FiSend } from "react-icons/fi";
import { serverUrl } from "../App";
import { CampaignStatusBadge, ChannelChips, TickLegend, TickSummary, formatDateTime, reachedShare } from "../components/MarketingUI";

// Marketing > Campaign history: every campaign with its live tick counts.

function Campaigns() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await axios.get(serverUrl + "/api/marketing/campaigns", { withCredentials: true });
      setCampaigns(result.data);
      setError("");
    } catch (e) {
      setError(e.response?.data?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ticks keep moving after a campaign is sent (delivered / read receipts), so refresh while open
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && load(true), 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <button onClick={() => navigate("/marketing")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3">
        <FiArrowLeft /> Back to audience
      </button>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Campaign history</h1>
          <p className="text-gray-500">Every message sent from Marketing, with live delivery ticks.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FiRefreshCw /> Refresh
          </button>
          <button
            onClick={() => navigate("/marketing")}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            <FiSend /> New campaign
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Channels</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Patients</th>
              <th className="px-4 py-3">Delivery</th>
              <th className="px-4 py-3">Read</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <ClipLoader size={24} color="#059669" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-red-600">
                  {error}
                </td>
              </tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No campaigns yet - pick patients on the Marketing page to send the first one
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/marketing/campaigns/${c.id}`)}
                  className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">
                      {c.status === "scheduled" ? `Scheduled for ${formatDateTime(c.scheduledAt)}` : formatDateTime(c.startedAt || c.createdAt)}
                      {c.createdByName ? ` · by ${c.createdByName}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <ChannelChips channels={c.channels} />
                  </td>
                  <td className="px-4 py-3">
                    <CampaignStatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.counts.patients.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <TickSummary counts={c.counts} compact />
                  </td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-sky-700">{reachedShare(c.counts, "read")}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <TickLegend />
      </div>
    </div>
  );
}

export default Campaigns;
