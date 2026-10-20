import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ClipLoader } from "react-spinners";
import { FiAward, FiBriefcase, FiClock, FiTrash2, FiUpload, FiUser } from "react-icons/fi";
import { serverUrl } from "../App";
import Avatar from "../components/Avatar";
import { Field, inputClass, primaryButton, secondaryButton, showError, showSuccess } from "../components/AdminUI";
import { BackLink, cardClass, useReplaceDoctor } from "../components/DoctorUI";
import { setDoctorData } from "../redux/doctorSlice";

const emptyForm = {
  name: "",
  specialty: "",
  qualifications: "",
  experienceYears: "",
  fee: "",
  appointmentDuration: 15,
  isAvailable: true,
};
const DURATIONS = [10, 15, 20, 30, 45, 60];

// same rules as the server (controllers/doctorController.js); the server checks again
const validate = (form) => {
  if (form.name.trim().length < 2) return "Enter the doctor's full name";
  if (!form.specialty.trim()) return "Specialization is required";
  if (form.fee === "" || Number(form.fee) < 0 || Number.isNaN(Number(form.fee))) return "Consultation fee must be 0 or more";
  if (form.experienceYears !== "" && (!Number.isInteger(Number(form.experienceYears)) || Number(form.experienceYears) < 0 || Number(form.experienceYears) > 80)) {
    return "Years of experience must be between 0 and 80";
  }
  const duration = Number(form.appointmentDuration);
  if (!Number.isInteger(duration) || duration < 5 || duration > 240) return "Appointment duration must be between 5 and 240 minutes";
  return null;
};

function DoctorForm() {
  const { doctorId } = useParams();
  const isEdit = Boolean(doctorId);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const replaceDoctor = useReplaceDoctor();
  const { doctorData } = useSelector((state) => state.doctor);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null); // saved photo path
  const [newPhoto, setNewPhoto] = useState(null); // chosen File
  const [preview, setPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState("");
  const [pageLoading, setPageLoading] = useState(isEdit);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!isEdit) return;
    const loadDoctor = async () => {
      try {
        const result = await axios.get(serverUrl + `/api/doctor/getdoctor/${doctorId}`, { withCredentials: true });
        const d = result.data;
        setForm({
          name: d.name,
          specialty: d.specialty,
          qualifications: d.qualifications || "",
          experienceYears: d.experienceYears || "",
          fee: Number(d.fee),
          appointmentDuration: d.appointmentDuration,
          isAvailable: d.isAvailable,
        });
        setPhoto(d.photo);
        setPageLoading(false);
      } catch (err) {
        showError(err);
        navigate("/doctors");
      }
    };
    loadDoctor();
  }, [doctorId]);

  useEffect(() => {
    if (!newPhoto) return setPreview(null);
    const url = URL.createObjectURL(newPhoto);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newPhoto]);

  const set = (field) => (e) => {
    setError("");
    setForm({ ...form, [field]: e.target.value });
  };

  const handleChoosePhoto = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file");
    if (file.size > 5 * 1024 * 1024) return setError("Image must be under 5 MB");
    setError("");
    setNewPhoto(file);
    setRemovePhoto(false);
  };

  const handleSaveDoctor = async (e) => {
    e.preventDefault();
    const problem = validate(form);
    if (problem) return setError(problem);

    setLoading(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, value));
      if (newPhoto) body.append("photo", newPhoto);
      if (removePhoto) body.append("removePhoto", "true");

      const url = isEdit ? `/api/doctor/editdoctor/${doctorId}` : "/api/doctor/create";
      const result = await axios.post(serverUrl + url, body, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (isEdit) {
        replaceDoctor(result.data.doctor);
        showSuccess("Doctor Updated Successfully");
        navigate(`/doctors/${doctorId}`);
      } else {
        dispatch(setDoctorData([result.data.doctor, ...doctorData]));
        showSuccess("Doctor Added — now set their weekly availability");
        navigate(`/doctors/${result.data.doctor.id}/availability`);
      }
    } catch (err) {
      showError(err);
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="py-24 flex justify-center">
        <ClipLoader size={34} color="#059669" />
      </div>
    );
  }

  const shownPhoto = removePhoto ? null : preview || photo;

  return (
    <div className="max-w-2xl">
      <BackLink to={isEdit ? `/doctors/${doctorId}` : "/doctors"} label={isEdit ? "Back to doctor" : "Back to doctors"} />
      <h1 className="text-2xl font-extrabold text-gray-900 mb-6">{isEdit ? "Edit Doctor" : "Add Doctor"}</h1>

      <form onSubmit={handleSaveDoctor} noValidate className={`${cardClass} p-5 sm:p-6 space-y-5`}>
        {/* photo */}
        <div className="flex items-center gap-4">
          {preview ? (
            <img src={preview} alt="New profile" className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <Avatar name={form.name || "Doctor"} photo={shownPhoto} className="w-20 h-20 text-2xl" />
          )}
          <div>
            <p className="text-sm font-semibold text-gray-800">Profile photo <span className="text-gray-400 font-normal">(optional)</span></p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button type="button" onClick={() => fileInput.current?.click()} className={`${secondaryButton} !h-9 !px-3`}>
                <FiUpload /> {shownPhoto ? "Change" : "Upload"}
              </button>
              {shownPhoto && (
                <button
                  type="button"
                  onClick={() => {
                    setNewPhoto(null);
                    setRemovePhoto(true);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  className={`${secondaryButton} !h-9 !px-3 text-red-600`}
                >
                  <FiTrash2 /> Remove
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">JPG, PNG or WebP, up to 5 MB.</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleChoosePhoto(e.target.files[0])}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Full name *" icon={<FiUser />}>
              <input className={inputClass} placeholder="Dr. Priya Sharma" value={form.name} onChange={set("name")} />
            </Field>
          </div>
          <Field label="Specialization *" icon={<FiBriefcase />}>
            <input className={inputClass} placeholder="Cardiology" value={form.specialty} onChange={set("specialty")} />
          </Field>
          <Field label="Qualifications" icon={<FiAward />}>
            <input className={inputClass} placeholder="MBBS, MD" value={form.qualifications} onChange={set("qualifications")} />
          </Field>
          <Field label="Years of experience" icon={<FiBriefcase />}>
            <input type="number" min="0" max="80" className={inputClass} placeholder="e.g. 8" value={form.experienceYears} onChange={set("experienceYears")} />
          </Field>
          <Field label="Consultation fee (₹) *" icon={<span className="font-semibold">₹</span>}>
            <input type="number" min="0" step="1" className={inputClass} placeholder="500" value={form.fee} onChange={set("fee")} />
          </Field>
          <Field label="Appointment duration *" icon={<FiClock />}>
            <select className={inputClass} value={form.appointmentDuration} onChange={set("appointmentDuration")}>
              {[...new Set([...DURATIONS, Number(form.appointmentDuration)])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </Field>
          <div>
            <span className="block text-xs font-semibold text-gray-600 mb-1.5">Doctor status</span>
            <div className="inline-flex p-1 rounded-xl bg-gray-100/80">
              {[
                { value: true, label: "Active" },
                { value: false, label: "Inactive" },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={form.isAvailable === option.value}
                  onClick={() => setForm({ ...form, isAvailable: option.value })}
                  className={`px-4 h-9 rounded-lg text-sm font-semibold transition ${
                    form.isAvailable === option.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isEdit && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
            A new fee or duration applies to new appointments only. Existing appointments keep the fee they were booked at.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => navigate(isEdit ? `/doctors/${doctorId}` : "/doctors")} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={loading} className={`${primaryButton} flex-1 sm:flex-none sm:min-w-40`}>
            {loading ? <ClipLoader size={18} color="white" /> : isEdit ? "Save Changes" : "Add Doctor"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default DoctorForm;
