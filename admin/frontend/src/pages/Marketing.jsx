import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { FiCheckCircle, FiClock, FiFilter, FiRefreshCw, FiSearch, FiSend, FiSlash, FiSmartphone, FiX } from "react-icons/fi";
import { serverUrl } from "../App";
import { appointmentStatusOptions } from "../components/MarketingUI";

// Marketing > Audience: filter the patient list, pick patients, then compose one message for them.

const visitOptions = [
  { value: "", label: "Any" },
  { value: "within:30", label: "Visited in the last 30 days" },
  { value: "within:90", label: "Visited in the last 3 months" },
  { value: "within:180", label: "Visited in the last 6 months" },
  { value: "over:90", label: "Not visited for 3+ months" },
  { value: "over:180", label: "Not visited for 6+ months" },
  { value: "over:365", label: "Not visited for 1+ year" },
  { value: "never", label: "Never visited" },
];

const reachOptions = [
  { value: "", label: "Any" },
  { value: "phone", label: "Has mobile number" },
  { value: "email", label: "Has email" },
  { value: "app", label: "Uses the app" },
];

const consentOptions = [
  { value: "", label: "Any" },
  { value: "yes", label: "Agreed to marketing" },
  { value: "no", label: "Not agreed" },
];

const emptyFilters = {
  search: "",
  ageMin: "",
  ageMax: "",
  joinedFrom: "",
  joinedTo: "",
  visit: "",
  doctorId: "",
  specialty: "",
  appointmentStatus: "",
  reach: "",
  consent: "",
};

const PAGE_SIZE = 50;

const consentSourceLabel = {
  app: "in the app",
  staff: "by staff",
  unsubscribe_link: "via email unsubscribe",
  whatsapp_stop: "by replying STOP on WhatsApp",
};

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-";

function ConsentBadge({ patient }) {
  const how = consentSourceLabel[patient.marketingConsentSource];
  if (patient.marketingConsent) {
    return (
      <span
        title={how ? `Agreed ${how} on ${formatDate(patient.marketingConsentAt)}` : undefined}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold"
      >
        <FiCheckCircle /> Agreed
      </span>
    );
  }
  if (patient.marketingConsentSource) {
    return (
      <span
        title={how ? `Opted out ${how} on ${formatDate(patient.marketingConsentAt)}` : undefined}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-semibold"
      >
        <FiSlash /> Opted out
      </span>
    );
  }
  return <span className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">Not asked</span>;
}

function Marketing() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(emptyFilters);
  const [searchInput, setSearchInput] = useState("");
  const [patients, setPatients] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [limit, setLimit] = useState(5000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Map()); // id -> patient (kept across filter changes)
  const [page, setPage] = useState(1);
  const [doctors, setDoctors] = useState([]);
  const [channels, setChannels] = useState(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput.trim() })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    axios
      .get(serverUrl + "/api/marketing/doctors", { withCredentials: true })
      .then((r) => setDoctors(r.data))
      .catch((e) => console.log(e));
    axios
      .get(serverUrl + "/api/marketing/channels", { withCredentials: true })
      .then((r) => setChannels(r.data))
      .catch((e) => console.log(e));
  }, []);

  const loadAudience = async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ""));
      const result = await axios.get(serverUrl + "/api/marketing/audience", { params, withCredentials: true });
      setPatients(result.data.patients);
      setTruncated(result.data.truncated);
      setLimit(result.data.limit);
      setError("");
      // keep the selected rows' details fresh (consent may have changed)
      setSelected((prev) => {
        if (!prev.size) return prev;
        const next = new Map(prev);
        for (const p of result.data.patients) if (next.has(p.id)) next.set(p.id, p);
        return next;
      });
    } catch (e) {
      setError(e.response?.data?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    loadAudience();
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const specialties = useMemo(() => [...new Set(doctors.map((d) => d.specialty).filter(Boolean))].sort(), [doctors]);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const hasFilters = Object.entries(filters).some(([, v]) => v !== "") || searchInput !== "";
  const resetFilters = () => {
    setFilters(emptyFilters);
    setSearchInput("");
  };

  const totalPages = Math.max(1, Math.ceil(patients.length / PAGE_SIZE));
  const pageRows = patients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((p) => selected.has(p.id));
  const allMatchingSelected = patients.length > 0 && patients.every((p) => selected.has(p.id));
  const hiddenSelected = useMemo(() => {
    const visible = new Set(patients.map((p) => p.id));
    return [...selected.keys()].filter((id) => !visible.has(id)).length;
  }, [patients, selected]);

  const toggle = (patient) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(patient.id)) next.delete(patient.id);
      else next.set(patient.id, patient);
      return next;
    });

  const togglePage = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of pageRows) {
        if (allOnPageSelected) next.delete(p.id);
        else next.set(p.id, p);
      }
      return next;
    });

  const selectAllMatching = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of patients) next.set(p.id, p);
      return next;
    });

  const selectedList = [...selected.values()];
  const selectedConsented = selectedList.filter((p) => p.marketingConsent).length;
  const consentedCount = patients.filter((p) => p.marketingConsent).length;
  const appCount = patients.filter((p) => p.hasApp).length;

  const changeConsent = async (consent) => {
    const ids = selectedList.map((p) => p.id);
    const question = consent
      ? `Record that these ${ids.length} patient(s) AGREED to receive offers and health updates on WhatsApp, SMS and email?\n\nOnly do this if each patient really agreed (in person, by phone or on a form).`
      : `Record that these ${ids.length} patient(s) do NOT want marketing messages? They will be skipped by every campaign.`;
    if (!window.confirm(question)) return;
    setConsentBusy(true);
    try {
      const result = await axios.post(serverUrl + "/api/marketing/consent", { patientIds: ids, consent }, { withCredentials: true });
      toast.success(result.data.message, { position: "top-center", autoClose: 1500 });
      await loadAudience();
    } catch (e) {
      toast.error(e.response?.data?.message || "Something went wrong", { position: "top-center", autoClose: 2000 });
    } finally {
      setConsentBusy(false);
    }
  };

  const compose = () => {
    if (!selected.size) return;
    navigate("/marketing/new", { state: { patients: selectedList } });
  };

  const testModeChannels = channels
    ? [!channels.whatsapp.configured && "WhatsApp", !channels.sms.configured && "SMS"].filter(Boolean)
    : [];

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Marketing</h1>
          <p className="text-gray-500">Pick patients and send them a message on WhatsApp, SMS, email or the app.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate("/marketing/campaigns")}
            className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FiClock /> Campaign history
          </button>
          <button
            onClick={compose}
            disabled={!selected.size}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiSend /> Compose message{selected.size ? ` (${selected.size.toLocaleString()})` : ""}
          </button>
        </div>
      </div>

      {testModeChannels.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">{testModeChannels.join(" and ")} in test mode.</span> No real {testModeChannels.join(" / ")} messages
          are sent until the API keys are added to the backend <code className="font-mono">.env</code> - the ticks are simulated so you
          can try the flow.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, patient ID, phone or email"
              className={`${inputClass} pl-9`}
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FiFilter /> {showFilters ? "Hide filters" : "Show filters"}
          </button>
          <button
            onClick={loadAudience}
            className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FiRefreshCw /> Refresh
          </button>
          {hasFilters && (
            <button onClick={resetFilters} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
              <FiX /> Clear filters
            </button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <div>
              <span className={labelClass}>Age</span>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="150" placeholder="Min" value={filters.ageMin} onChange={setFilter("ageMin")} className={inputClass} />
                <span className="text-gray-400">-</span>
                <input type="number" min="0" max="150" placeholder="Max" value={filters.ageMax} onChange={setFilter("ageMax")} className={inputClass} />
              </div>
            </div>
            <div>
              <span className={labelClass}>Joined between</span>
              <div className="flex items-center gap-2">
                <input type="date" value={filters.joinedFrom} onChange={setFilter("joinedFrom")} className={inputClass} />
                <input type="date" value={filters.joinedTo} onChange={setFilter("joinedTo")} className={inputClass} />
              </div>
            </div>
            <label>
              <span className={labelClass}>Visits</span>
              <select value={filters.visit} onChange={setFilter("visit")} className={inputClass}>
                {visitOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>Saw doctor</span>
              <select value={filters.doctorId} onChange={setFilter("doctorId")} className={inputClass}>
                <option value="">Any doctor</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} - {d.specialty}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>Specialty</span>
              <select value={filters.specialty} onChange={setFilter("specialty")} className={inputClass}>
                <option value="">Any specialty</option>
                {specialties.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>Has an appointment that is</span>
              <select value={filters.appointmentStatus} onChange={setFilter("appointmentStatus")} className={inputClass}>
                {appointmentStatusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>Reachable by</span>
              <select value={filters.reach} onChange={setFilter("reach")} className={inputClass}>
                {reachOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelClass}>Marketing consent</span>
              <select value={filters.consent} onChange={setFilter("consent")} className={inputClass}>
                {consentOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{patients.length.toLocaleString()}</span> patients match
          <span className="text-gray-400"> · </span>
          {consentedCount.toLocaleString()} agreed to marketing
          <span className="text-gray-400"> · </span>
          {appCount.toLocaleString()} use the app
          {truncated && <span className="text-amber-700"> · showing the first {limit.toLocaleString()} - narrow the filters to see the rest</span>}
        </p>
        {patients.length > 0 && !allMatchingSelected && (
          <button onClick={selectAllMatching} className="text-sm font-medium text-emerald-700 hover:underline">
            Select all {patients.length.toLocaleString()} matching
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-[96px] z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <span className="font-semibold text-emerald-800">{selected.size.toLocaleString()} selected</span>
          <span className="text-emerald-700">
            {selectedConsented.toLocaleString()} can get WhatsApp / SMS / email
            {hiddenSelected > 0 && ` · ${hiddenSelected} not in the current list`}
          </span>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              onClick={() => changeConsent(true)}
              disabled={consentBusy}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              <FiCheckCircle /> Record consent
            </button>
            <button
              onClick={() => changeConsent(false)}
              disabled={consentBusy}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              <FiSlash /> Remove consent
            </button>
            <button
              onClick={() => setSelected(new Map())}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-white"
            >
              Clear selection
            </button>
            <button
              onClick={compose}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <FiSend /> Compose
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={togglePage}
                  disabled={!pageRows.length}
                  aria-label="Select this page"
                  className="w-4 h-4 accent-emerald-600"
                />
              </th>
              <th className="px-4 py-3">Patient ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3">Last visit</th>
              <th className="px-4 py-3">Visits</th>
              <th className="px-4 py-3">App</th>
              <th className="px-4 py-3">Consent</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center">
                  <ClipLoader size={24} color="#059669" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-red-600">
                  {error}
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  No patients match these filters
                </td>
              </tr>
            ) : (
              pageRows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => toggle(p)}
                  className={`border-t border-gray-100 cursor-pointer ${selected.has(p.id) ? "bg-emerald-50/50" : "hover:bg-gray-50"}`}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p)}
                      aria-label={`Select ${p.name}`}
                      className="w-4 h-4 accent-emerald-600"
                    />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.code || p.id}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">
                    <div>{p.phone || <span className="text-gray-400">No phone</span>}</div>
                    <div className="text-xs text-gray-500">{p.email || "No email"}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.age ?? "-"}</td>
                  <td className="px-4 py-3">{formatDate(p.lastVisit)}</td>
                  <td className="px-4 py-3 tabular-nums">{p.visits}</td>
                  <td className="px-4 py-3">
                    {p.hasApp ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                        <FiSmartphone /> Yes
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ConsentBadge patient={p} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <span>
            {((page - 1) * PAGE_SIZE + 1).toLocaleString()}-{Math.min(patients.length, page * PAGE_SIZE).toLocaleString()} of{" "}
            {patients.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((n) => Math.max(1, n - 1))}
              disabled={page === 1}
              className="border border-gray-300 rounded-lg px-3 py-1.5 disabled:opacity-40"
            >
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

      <p className="mt-4 text-xs text-gray-400">
        WhatsApp, SMS and email only go to patients who agreed to marketing. Patients agree in the app (Profile) or you record it here
        after they agree in person. App notifications reach every patient with the app.
      </p>
    </div>
  );
}

export default Marketing;
