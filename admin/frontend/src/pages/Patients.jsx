import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { serverUrl } from "../App";
import { setPatientData } from "../redux/patientSlice";
import Modal from "../components/Modal";

const emptyForm = { name: "", email: "", phone: "", dob: "", address: "" };

// the date input works in YYYY-MM-DD, the server and table use DD/MM/YYYY
const toInputDate = (dob) => (dob ? dob.split("/").reverse().join("-") : "");
const toServerDate = (value) => (value ? value.split("-").reverse().join("/") : "");
const today = new Date().toISOString().split("T")[0];

function Patients() {
  const dispatch = useDispatch();
  const { patientData } = useSelector((state) => state.patient);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [loading1, setLoading1] = useState(null);
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [consent, setConsent] = useState("all");
  const [ageGroup, setAgeGroup] = useState("all");
  const [joinedFrom, setJoinedFrom] = useState("");
  const [joinedTo, setJoinedTo] = useState("");

  const ageOf = (dob) => {
    if (!dob) return null;
    const [d, m, y] = dob.split("/").map(Number);
    const now = new Date();
    let age = now.getFullYear() - y;
    if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
    return age;
  };
  const ageGroups = {
    child: ["Under 18", (a) => a < 18],
    adult: ["18 - 40", (a) => a >= 18 && a <= 40],
    middle: ["41 - 60", (a) => a >= 41 && a <= 60],
    senior: ["Over 60", (a) => a > 60],
  };

  const q = search.trim().toLowerCase();
  const filteredPatients = patientData.filter((p) => {
    if (
      q &&
      ![p.name, p.code, p.phone, p.email, p.address].some((v) => (v || "").toLowerCase().includes(q))
    ) {
      return false;
    }
    if (consent === "yes" && !p.marketingConsent) return false;
    if (consent === "no" && p.marketingConsent) return false;
    if (ageGroup !== "all") {
      const age = ageOf(p.dob);
      if (age === null || !ageGroups[ageGroup][1](age)) return false;
    }
    const joined = new Date(p.createdAt).toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
    if (joinedFrom && joined < joinedFrom) return false;
    if (joinedTo && joined > joinedTo) return false;
    return true;
  });
  const filtersOn = search || consent !== "all" || ageGroup !== "all" || joinedFrom || joinedTo;
  const clearFilters = () => {
    setSearch("");
    setConsent("all");
    setAgeGroup("all");
    setJoinedFrom("");
    setJoinedTo("");
  };
  const filterClass =
    "border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white";

  const handleOpenCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const handleOpenEdit = (patient) => {
    setEditId(patient.id);
    setForm({
      name: patient.name,
      email: patient.email || "",
      phone: patient.phone || "",
      dob: toInputDate(patient.dob),
      address: patient.address || "",
    });
    setShowModal(true);
  };

  const handleSavePatient = async (e) => {
    e.preventDefault();
    setLoading(true);
    const body = { ...form, dob: toServerDate(form.dob) };
    try {
      if (editId) {
        const result = await axios.post(serverUrl + `/api/patient/editpatient/${editId}`, body, {
          withCredentials: true,
        });
        dispatch(setPatientData(patientData.map((p) => (p.id === editId ? result.data.patient : p))));
      } else {
        const result = await axios.post(serverUrl + "/api/patient/create", body, {
          withCredentials: true,
        });
        dispatch(setPatientData([result.data.patient, ...patientData]));
      }
      setShowModal(false);
      setLoading(false);
      toast.success("Patient Saved Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      console.log(error);
      setLoading(false);
      toast.error(error.response?.data?.message || "Something went wrong", {
        position: "top-center",
        autoClose: 2000,
      });
    }
  };

  const handleRemovePatient = async (patientId) => {
    if (!window.confirm("Remove this patient? Their appointments will also be removed.")) return;
    setLoading1(patientId);
    try {
      await axios.delete(serverUrl + `/api/patient/remove/${patientId}`, { withCredentials: true });
      dispatch(setPatientData(patientData.filter((p) => p.id !== patientId)));
      setLoading1(null);
      toast.success("Patient Removed Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      console.log(error);
      setLoading1(null);
      toast.error(error.response?.data?.message || "Something went wrong", {
        position: "top-center",
        autoClose: 2000,
      });
    }
  };

  const inputClass =
    "w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Patients</h1>
        <button
          onClick={handleOpenCreate}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          + Add Patient
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <input
          className={`${filterClass} w-full sm:w-72`}
          placeholder="Search name, ID, mobile, email, address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={filterClass} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
          <option value="all">All ages</option>
          {Object.entries(ageGroups).map(([key, [label]]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select className={filterClass} value={consent} onChange={(e) => setConsent(e.target.value)}>
          <option value="all">Marketing: all</option>
          <option value="yes">Agreed to marketing</option>
          <option value="no">Not agreed</option>
        </select>
        <label className="text-xs text-gray-500">
          Joined from
          <input
            type="date"
            className={`${filterClass} block mt-1`}
            value={joinedFrom}
            max={joinedTo || undefined}
            onChange={(e) => setJoinedFrom(e.target.value)}
          />
        </label>
        <label className="text-xs text-gray-500">
          Joined to
          <input
            type="date"
            className={`${filterClass} block mt-1`}
            value={joinedTo}
            min={joinedFrom || undefined}
            onChange={(e) => setJoinedTo(e.target.value)}
          />
        </label>
        {filtersOn && (
          <button onClick={clearFilters} className="text-sm text-blue-600 hover:underline pb-2">
            Clear filters
          </button>
        )}
        <span className="text-sm text-gray-500 pb-2 ml-auto">
          {filteredPatients.length} of {patientData.length} patients
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">No</th>
              <th className="px-4 py-3">Patient ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Mobile Number</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Date of Birth</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map((patient, index) => (
              <tr
                key={patient.id}
                onClick={() => navigate(`/patients/${patient.id}`)}
                className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
              >
                <td className="px-4 py-3 tabular-nums text-gray-500">{index + 1}</td>
                <td className="px-4 py-3 tabular-nums">{patient.code || patient.id}</td>
                <td className="px-4 py-3 font-medium">{patient.name}</td>
                <td className="px-4 py-3">{patient.phone || "-"}</td>
                <td className="px-4 py-3">{patient.email || "-"}</td>
                <td className="px-4 py-3">{patient.dob || "-"}</td>
                <td className="px-4 py-3 max-w-xs truncate" title={patient.address || ""}>
                  {patient.address || "-"}
                </td>
                <td className="px-4 py-3">{new Date(patient.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right space-x-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleOpenEdit(patient)}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleRemovePatient(patient.id)}
                    disabled={loading1 === patient.id}
                    className="text-red-600 hover:underline"
                  >
                    {loading1 === patient.id ? <ClipLoader size={14} color="red" /> : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {filteredPatients.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  {patientData.length === 0 ? "No patients yet" : "No patients match these filters"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editId ? "Edit Patient" : "Add Patient"} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSavePatient} className="space-y-3">
            <input
              className={inputClass}
              placeholder="Full Name"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Mobile Number (10 digits)"
              type="tel"
              inputMode="numeric"
              required
              pattern="\d{10}"
              maxLength={10}
              title="Enter a 10 digit mobile number"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })}
            />
            <input
              className={inputClass}
              placeholder="Email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <label className="block text-xs text-gray-500">
              Date of Birth
              <input
                className={`${inputClass} mt-1 text-sm text-gray-900`}
                type="date"
                required
                min="1901-01-01"
                max={today}
                value={form.dob}
                onChange={(e) => setForm({ ...form, dob: e.target.value })}
              />
            </label>
            <textarea
              className={inputClass}
              placeholder="Address"
              rows={3}
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-10 flex items-center justify-center"
            >
              {loading ? <ClipLoader size={22} color="white" /> : "Save"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default Patients;
