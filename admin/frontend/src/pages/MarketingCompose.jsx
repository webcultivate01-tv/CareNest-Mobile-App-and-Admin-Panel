import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { BsCheck2All } from "react-icons/bs";
import { FiArrowLeft, FiFileText, FiPaperclip, FiPlus, FiSend, FiTrash2, FiVideo, FiX } from "react-icons/fi";
import { serverUrl } from "../App";
import { CHANNELS } from "../components/MarketingUI";

// Marketing > Compose: one message for the patients picked on the Audience page.
// The rules here mirror backend/config/marketing.js (the server checks everything again).

const MEDIA_TYPES = {
  "image/jpeg": { kind: "image", max: 5 },
  "image/png": { kind: "image", max: 5 },
  "video/mp4": { kind: "video", max: 16 },
  "application/pdf": { kind: "document", max: 16 },
};

const LIMITS = { message: 4096, caption: 1024, sms: 1600, title: 150, name: 120 };

const PLACEHOLDERS = [
  { key: "{{firstName}}", label: "First name" },
  { key: "{{name}}", label: "Full name" },
  { key: "{{patientId}}", label: "Patient ID" },
];

const fill = (text, patient) =>
  String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const k = key.toLowerCase();
    if (k === "name") return (patient?.name || "").trim() || "there";
    if (k === "firstname") return (patient?.name || "").trim().split(/\s+/)[0] || "there";
    if (k === "patientid") return patient?.code || "";
    return match;
  });

// same idea as normalizePhone() on the server: is this a number we can message?
const isReachablePhone = (raw) => {
  if (!raw) return false;
  const text = String(raw).trim();
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+") || digits.startsWith("00")) return digits.replace(/^00/, "").length >= 8 && digits.length <= 15;
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("0")) || (digits.length === 12 && digits.startsWith("91"));
};
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ""));

const reachable = (patient, channel) => {
  if (channel === "app") return patient.hasApp;
  if (!patient.marketingConsent) return false;
  return channel === "email" ? isEmail(patient.email) : isReachablePhone(patient.phone);
};

const nowTime = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time
const toLocalInput = (date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

function MediaPreview({ media, url, className = "" }) {
  if (!media) return null;
  const kind = MEDIA_TYPES[media.type]?.kind;
  if (kind === "image") return <img src={url} alt="" className={`w-full object-cover ${className}`} />;
  return (
    <div className={`flex items-center gap-2 bg-black/5 px-3 py-2 text-xs text-gray-700 ${className}`}>
      {kind === "video" ? <FiVideo /> : <FiFileText />}
      <span className="truncate">{media.name}</span>
    </div>
  );
}

function PreviewCard({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-2">{title}</p>
      {children}
    </div>
  );
}

function MarketingCompose() {
  const navigate = useNavigate();
  const location = useLocation();
  const patients = location.state?.patients;
  const messageRef = useRef(null);

  const [name, setName] = useState("");
  const [channels, setChannels] = useState(["whatsapp"]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [media, setMedia] = useState(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [whatsappMode, setWhatsappMode] = useState("template");
  const [template, setTemplate] = useState("");
  const [language, setLanguage] = useState("en");
  const [params, setParams] = useState([]);
  const [when, setWhen] = useState("now");
  const [scheduledAt, setScheduledAt] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    axios
      .get(serverUrl + "/api/marketing/channels", { withCredentials: true })
      .then((r) => setStatus(r.data))
      .catch((e) => console.log(e));
  }, []);

  useEffect(() => () => mediaUrl && URL.revokeObjectURL(mediaUrl), [mediaUrl]);

  const counts = useMemo(() => {
    const out = {};
    for (const c of CHANNELS) out[c.key] = patients ? patients.filter((p) => reachable(p, c.key)).length : 0;
    return out;
  }, [patients]);

  // opened directly (or after a refresh): the selection lives on the Audience page
  if (!patients?.length) return <Navigate to="/marketing" replace />;

  const sample = patients[0];
  const has = (key) => channels.includes(key);
  const needsTitle = has("email") || has("app");
  const usesTemplate = has("whatsapp") && whatsappMode === "template";
  const totalMessages = channels.reduce((sum, key) => sum + counts[key], 0);

  const toggleChannel = (key) => setChannels((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));

  const insertPlaceholder = (text) => {
    const el = messageRef.current;
    if (!el) return setMessage((m) => m + text);
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + text + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const pickMedia = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const rule = MEDIA_TYPES[file.type];
    if (!rule) return toast.error("Choose a JPG or PNG image, an MP4 video or a PDF", { position: "top-center", autoClose: 2500 });
    if (file.size > rule.max * 1024 * 1024) {
      return toast.error(`This ${rule.kind} must be under ${rule.max} MB`, { position: "top-center", autoClose: 2500 });
    }
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setMedia(file);
    setMediaUrl(URL.createObjectURL(file));
  };

  const removeMedia = () => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setMedia(null);
    setMediaUrl("");
  };

  // the same checks as the server, so problems show before anything is uploaded
  const problem = (() => {
    if (!name.trim()) return "Give the campaign a name";
    if (!channels.length) return "Choose at least one channel";
    if (needsTitle && !title.trim()) return "Add a title (email subject / app notification title)";
    if (!message.trim()) return usesTemplate && channels.length === 1 ? "Add a note of what the template says (kept with the campaign)" : "Type the message";
    if (message.length > LIMITS.message) return `Message must be under ${LIMITS.message} characters`;
    if (has("sms") && message.length > LIMITS.sms) return `SMS can carry at most ${LIMITS.sms} characters`;
    if (has("whatsapp") && whatsappMode === "text" && media && message.length > LIMITS.caption) {
      return `With media, the WhatsApp caption can be at most ${LIMITS.caption} characters`;
    }
    if (usesTemplate) {
      if (!/^[a-z0-9_]+$/.test(template.trim())) return "WhatsApp template name: lowercase letters, numbers and _ only";
      if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language.trim())) return "WhatsApp template language looks wrong (e.g. en, en_US, hi)";
      if (params.some((p) => !p.trim())) return "Fill every WhatsApp template variable";
    }
    if (when === "later") {
      const at = new Date(scheduledAt);
      if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 60 * 1000) return "Pick a schedule time in the future";
    }
    if (!totalMessages) return "None of the selected patients can be reached on the chosen channels";
    return null;
  })();

  const handleSend = async () => {
    if (problem) return toast.error(problem, { position: "top-center", autoClose: 2500 });
    const lines = channels.map((key) => `${CHANNELS.find((c) => c.key === key).label}: ${counts[key]} patient(s)`);
    const whenText = when === "later" ? `on ${new Date(scheduledAt).toLocaleString("en-IN")}` : "now";
    if (!window.confirm(`Send "${name.trim()}" ${whenText}?\n\n${lines.join("\n")}\n\nPatients who can not be reached are skipped.`)) return;

    const form = new FormData();
    form.append("name", name.trim());
    form.append("channels", JSON.stringify(channels));
    form.append("title", needsTitle ? title.trim() : "");
    form.append("message", message);
    form.append("patientIds", JSON.stringify(patients.map((p) => p.id)));
    if (has("whatsapp")) {
      form.append("whatsappMode", whatsappMode);
      if (usesTemplate) {
        form.append("whatsappTemplate", template.trim());
        form.append("whatsappLanguage", language.trim());
        form.append("whatsappParams", JSON.stringify(params.map((p) => p.trim())));
      }
    }
    if (when === "later") form.append("scheduledAt", new Date(scheduledAt).toISOString());
    if (media) form.append("media", media);

    setSending(true);
    try {
      const result = await axios.post(serverUrl + "/api/marketing/campaigns", form, { withCredentials: true });
      toast.success(result.data.message, { position: "top-center", autoClose: 1500 });
      navigate(`/marketing/campaigns/${result.data.campaign.id}`, { replace: true });
    } catch (e) {
      setSending(false);
      toast.error(e.response?.data?.message || "Something went wrong", { position: "top-center", autoClose: 3000 });
    }
  };

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white";
  const labelClass = "block text-sm font-semibold text-gray-700 mb-1.5";
  const previewText = fill(message, sample);
  const mediaKind = media ? MEDIA_TYPES[media.type]?.kind : null;

  return (
    <div>
      <button onClick={() => navigate("/marketing")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3">
        <FiArrowLeft /> Back to audience
      </button>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Compose message</h1>
          <p className="text-gray-500">
            To {patients.length.toLocaleString()} selected patient{patients.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <label className="block">
              <span className={labelClass}>Campaign name</span>
              <input
                value={name}
                maxLength={LIMITS.name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Free diabetes check-up camp - November"
                className={inputClass}
              />
              <span className="block text-xs text-gray-400 mt-1">Only staff see this.</span>
            </label>

            <div>
              <span className={labelClass}>Send by</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CHANNELS.map((c) => {
                  const on = has(c.key);
                  const testMode = status && (c.key === "whatsapp" || c.key === "sms") && !status[c.key].configured;
                  const notSetUp = status && c.key === "email" && !status.email.configured;
                  return (
                    <button
                      type="button"
                      key={c.key}
                      onClick={() => toggleChannel(c.key)}
                      className={`text-left rounded-xl border p-3 transition-colors ${
                        on ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-100" : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input type="checkbox" readOnly checked={on} tabIndex={-1} className="w-4 h-4 accent-emerald-600 pointer-events-none" />
                        <span className={`text-lg ${c.tint}`}>{c.icon}</span>
                        <span className="font-semibold text-sm">{c.label}</span>
                        {testMode && <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">Test mode</span>}
                        {notSetUp && <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-red-700 bg-red-100 rounded px-1.5 py-0.5">Not set up</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5 pl-6">
                        {counts[c.key].toLocaleString()} of {patients.length.toLocaleString()} can receive it
                        {c.key === "app" ? " (have the app)" : " (agreed + valid contact)"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {needsTitle && (
              <label className="block">
                <span className={labelClass}>Title</span>
                <input
                  value={title}
                  maxLength={LIMITS.title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Free check-up this Sunday, {{firstName}}"
                  className={inputClass}
                />
                <span className="block text-xs text-gray-400 mt-1">Email subject and app notification title.</span>
              </label>
            )}

            <div>
              <div className="flex flex-wrap items-end justify-between gap-2 mb-1.5">
                <span className="text-sm font-semibold text-gray-700">
                  {usesTemplate && channels.length === 1 ? "Note of what the template says" : "Message"}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDERS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => insertPlaceholder(p.key)}
                      className="text-xs rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
                    >
                      + {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                ref={messageRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                maxLength={LIMITS.message}
                placeholder="Hi {{firstName}}, CareNest is holding a free health check-up camp this Sunday from 9 am to 1 pm..."
                className={`${inputClass} resize-y`}
              />
              <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-400 mt-1">
                <span>
                  {usesTemplate
                    ? "WhatsApp sends the approved template below; this text is used for the other channels."
                    : "{{firstName}} etc. are replaced for each patient."}
                </span>
                <span className={has("sms") && message.length > LIMITS.sms ? "text-red-600 font-semibold" : ""}>
                  {message.length.toLocaleString()} characters{has("sms") ? ` · SMS max ${LIMITS.sms}` : ""}
                </span>
              </div>
            </div>

            <div>
              <span className={labelClass}>Media (optional)</span>
              {media ? (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                  {mediaKind === "image" ? (
                    <img src={mediaUrl} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-2xl text-gray-500">
                      {mediaKind === "video" ? <FiVideo /> : <FiFileText />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{media.name}</p>
                    <p className="text-xs text-gray-500">{(media.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button type="button" onClick={removeMedia} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Remove media">
                    <FiTrash2 />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-5 text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                  <FiPaperclip /> Attach an image (JPG/PNG, 5 MB), video (MP4, 16 MB) or PDF (16 MB)
                  <input type="file" accept="image/jpeg,image/png,video/mp4,application/pdf" onChange={pickMedia} className="hidden" />
                </label>
              )}
              {media && has("sms") && <p className="text-xs text-amber-700 mt-1.5">SMS can not carry media - SMS patients get the text only.</p>}
              {media && usesTemplate && (
                <p className="text-xs text-gray-500 mt-1.5">WhatsApp sends this as the template's header - the template must have a {mediaKind} header.</p>
              )}
            </div>
          </div>

          {has("whatsapp") && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <h2 className="font-semibold">WhatsApp</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  WhatsApp only allows marketing to patients who have not messaged you in the last 24 hours through a template that Meta
                  has approved.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { value: "template", label: "Approved template", hint: "Recommended for marketing - reaches every opted-in patient." },
                  { value: "text", label: "Free text", hint: "Only reaches patients who messaged you in the last 24 hours." },
                ].map((o) => (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => setWhatsappMode(o.value)}
                    className={`text-left rounded-xl border p-3 ${
                      whatsappMode === o.value ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-100" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <input type="radio" readOnly checked={whatsappMode === o.value} tabIndex={-1} className="accent-emerald-600 pointer-events-none" />
                      {o.label}
                    </span>
                    <span className="block text-xs text-gray-500 mt-1 pl-5">{o.hint}</span>
                  </button>
                ))}
              </div>

              {whatsappMode === "template" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                    <label>
                      <span className="block text-xs font-semibold text-gray-500 mb-1">Template name (exactly as in Meta)</span>
                      <input value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="health_camp_invite" className={`${inputClass} font-mono`} />
                    </label>
                    <label>
                      <span className="block text-xs font-semibold text-gray-500 mb-1">Language code</span>
                      <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" className={`${inputClass} font-mono`} />
                    </label>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-gray-500 mb-1">Template variables {"{{1}}, {{2}}..."} in order</span>
                    <div className="space-y-2">
                      {params.map((value, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-12 text-xs font-mono text-gray-500">{`{{${i + 1}}}`}</span>
                          <input
                            value={value}
                            onChange={(e) => setParams((list) => list.map((p, j) => (j === i ? e.target.value : p)))}
                            placeholder={i === 0 ? "{{firstName}}" : "e.g. Sunday 9 am"}
                            className={inputClass}
                          />
                          <button
                            type="button"
                            onClick={() => setParams((list) => list.filter((_, j) => j !== i))}
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                            aria-label="Remove variable"
                          >
                            <FiX />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setParams((list) => [...list, ""])}
                        className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
                      >
                        <FiPlus /> Add variable
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Add exactly as many variables as the template body has. You can use {"{{firstName}}"}, {"{{name}}"} and{" "}
                      {"{{patientId}}"} inside them.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <span className={labelClass}>When</span>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="when" checked={when === "now"} onChange={() => setWhen("now")} className="accent-emerald-600" />
                Send now
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="when" checked={when === "later"} onChange={() => setWhen("later")} className="accent-emerald-600" />
                Schedule
              </label>
              {when === "later" && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  min={toLocalInput(new Date())}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {problem && <p className="text-sm text-gray-500 mr-auto">{problem}</p>}
            <button
              onClick={() => navigate("/marketing")}
              className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || Boolean(problem)}
              className="flex items-center justify-center gap-2 min-w-[150px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <ClipLoader size={18} color="white" /> : <><FiSend /> {when === "later" ? "Schedule" : "Send"} ({totalMessages.toLocaleString()})</>}
            </button>
          </div>
        </div>

        {/* Live previews, filled in for the first selected patient */}
        <div className="xl:sticky xl:top-[112px] space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold">Preview</p>
            <p className="text-xs text-gray-500">As {sample.name} will see it</p>
          </div>

          {!channels.length && <p className="text-sm text-gray-400 px-1">Choose a channel to see a preview.</p>}

          {has("whatsapp") && (
            <PreviewCard title="WhatsApp">
              <div className="rounded-xl bg-[#ECE5DD] p-3">
                <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-none bg-[#DCF8C6] shadow-sm overflow-hidden">
                  {usesTemplate ? (
                    <div className="p-2.5 text-sm text-gray-800">
                      <MediaPreview media={media} url={mediaUrl} className="rounded-md mb-2 max-h-40" />
                      <p className="text-xs text-gray-500 mb-1">
                        Template <span className="font-mono">{template || "template_name"}</span> ({language || "en"})
                      </p>
                      {params.length ? (
                        params.map((p, i) => (
                          <p key={i} className="text-xs">
                            <span className="font-mono text-gray-500">{`{{${i + 1}}}`}</span> = {fill(p, sample) || "…"}
                          </p>
                        ))
                      ) : (
                        <p className="text-xs text-gray-500">No variables</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <MediaPreview media={media} url={mediaUrl} className="max-h-48" />
                      <p className="px-2.5 pt-2 text-sm text-gray-800 whitespace-pre-wrap break-words">{previewText || "Your message…"}</p>
                    </>
                  )}
                  <p className="flex items-center justify-end gap-1 px-2.5 pb-1.5 text-[11px] text-gray-500">
                    {nowTime()} <BsCheck2All className="text-[15px] text-[#34B7F1]" />
                  </p>
                </div>
              </div>
            </PreviewCard>
          )}

          {has("sms") && (
            <PreviewCard title="SMS">
              <div className="rounded-xl bg-gray-100 p-3">
                <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-gray-800 shadow-sm whitespace-pre-wrap break-words">
                  {previewText || "Your message…"}
                </div>
              </div>
            </PreviewCard>
          )}

          {has("email") && (
            <PreviewCard title="Email">
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                <div className="bg-[#1E7F4F] px-4 py-3 text-white font-bold">CareNest</div>
                {mediaKind === "image" && <img src={mediaUrl} alt="" className="w-full max-h-48 object-cover" />}
                <div className="p-4">
                  <p className="font-semibold text-gray-900">{fill(title, sample) || "Title"}</p>
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words">{previewText || "Your message…"}</p>
                  {media && mediaKind !== "image" && <p className="mt-2 text-xs text-gray-500">Attached: {media.name}</p>}
                </div>
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-[11px] text-gray-400">Unsubscribe link added automatically</div>
              </div>
            </PreviewCard>
          )}

          {has("app") && (
            <PreviewCard title="App notification">
              <div className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <FiSend />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{fill(title, sample) || "Title"}</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap break-words line-clamp-4">{previewText || "Your message…"}</p>
                </div>
              </div>
            </PreviewCard>
          )}
        </div>
      </div>
    </div>
  );
}

export default MarketingCompose;
