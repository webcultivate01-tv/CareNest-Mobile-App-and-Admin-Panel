import { useState } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { serverUrl } from "../App";
import { setDoctorData } from "../redux/doctorSlice";
import Modal from "../components/Modal";

const emptyForm = {
  name: "",
  specialty: "",
  email: "",
  phone: "",
  experienceYears: 0,
  fee: 0,
  isAvailable: true,
};

function Doctors() {
  const dispatch = useDispatch();
  const { doctorData } = useSelector((state) => state.doctor);
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

  const handleOpenEdit = (doctor) => {
    setEditId(doctor.id);
    setForm({
      name: doctor.name,
      specialty: doctor.specialty,
      email: doctor.email || "",
      phone: doctor.phone || "",
      experienceYears: doctor.experienceYears,
      fee: doctor.fee,
      isAvailable: doctor.isAvailable,
    });
    setShowModal(true);
  };

  const handleSaveDoctor = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editId) {
        const result = await axios.post(serverUrl + `/api/doctor/editdoctor/${editId}`, form, {
          withCredentials: true,
        });
        dispatch(setDoctorData(doctorData.map((d) => (d.id === editId ? result.data.doctor : d))));
      } else {
        const result = await axios.post(serverUrl + "/api/doctor/create", form, {
          withCredentials: true,
        });
        dispatch(setDoctorData([result.data.doctor, ...doctorData]));
      }
      setShowModal(false);
      setLoading(false);
      toast.success("Doctor Saved Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      console.log(error);
      setLoading(false);
      toast.error(error.response?.data?.message || "Something went wrong", {
        position: "top-center",
        autoClose: 2000,
      });
    }
  };

  const handleRemoveDoctor = async (doctorId) => {
    if (!window.confirm("Remove this doctor? Their appointments will also be removed.")) return;
    setLoading1(doctorId);
    try {
      await axios.delete(serverUrl + `/api/doctor/remove/${doctorId}`, { withCredentials: true });
      dispatch(setDoctorData(doctorData.filter((d) => d.id !== doctorId)));
      setLoading1(null);
      toast.success("Doctor Removed Successfully", { position: "top-center", autoClose: 1000 });
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
        <h1 className="text-2xl font-bold">Doctors</h1>
        <button
          onClick={handleOpenCreate}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          + Add Doctor
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Specialty</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Exp.</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {doctorData.map((doctor) => (
              <tr key={doctor.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{doctor.name}</td>
                <td className="px-4 py-3">{doctor.specialty}</td>
                <td className="px-4 py-3">
                  {doctor.email || "-"}
                  <br />
                  <span className="text-gray-400">{doctor.phone}</span>
                </td>
                <td className="px-4 py-3">{doctor.experienceYears} yrs</td>
                <td className="px-4 py-3">₹{doctor.fee}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      doctor.isAvailable ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {doctor.isAvailable ? "Available" : "Unavailable"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button
                    onClick={() => handleOpenEdit(doctor)}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleRemoveDoctor(doctor.id)}
                    disabled={loading1 === doctor.id}
                    className="text-red-600 hover:underline"
                  >
                    {loading1 === doctor.id ? <ClipLoader size={14} color="red" /> : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {doctorData.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No doctors yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editId ? "Edit Doctor" : "Add Doctor"} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSaveDoctor} className="space-y-3">
            <input
              className={inputClass}
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Specialty"
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
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
            <div className="flex gap-3">
              <input
                type="number"
                min="0"
                className={inputClass}
                placeholder="Experience (years)"
                value={form.experienceYears}
                onChange={(e) => setForm({ ...form, experienceYears: e.target.value })}
              />
              <input
                type="number"
                min="0"
                className={inputClass}
                placeholder="Fee"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
              />
              Available
            </label>
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

export default Doctors;
