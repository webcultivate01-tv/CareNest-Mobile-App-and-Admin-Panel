import { useState } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { serverUrl } from "../App";
import { setPatientData } from "../redux/patientSlice";
import Modal from "../components/Modal";

const emptyForm = { name: "", email: "", phone: "" };

function Patients() {
  const dispatch = useDispatch();
  const { patientData } = useSelector((state) => state.patient);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [loading1, setLoading1] = useState(null);

  const handleOpenCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const handleOpenEdit = (patient) => {
    setEditId(patient.id);
    setForm({ name: patient.name, email: patient.email || "", phone: patient.phone || "" });
    setShowModal(true);
  };

  const handleSavePatient = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editId) {
        const result = await axios.post(serverUrl + `/api/patient/editpatient/${editId}`, form, {
          withCredentials: true,
        });
        dispatch(setPatientData(patientData.map((p) => (p.id === editId ? result.data.patient : p))));
      } else {
        const result = await axios.post(serverUrl + "/api/patient/create", form, {
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {patientData.map((patient) => (
              <tr key={patient.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{patient.name}</td>
                <td className="px-4 py-3">{patient.email || "-"}</td>
                <td className="px-4 py-3">{patient.phone || "-"}</td>
                <td className="px-4 py-3">{new Date(patient.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right space-x-3">
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
            {patientData.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No patients yet
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
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
