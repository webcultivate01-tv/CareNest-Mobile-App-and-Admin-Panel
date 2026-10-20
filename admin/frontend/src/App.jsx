import { Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { useSelector } from "react-redux";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Doctors from "./pages/Doctors";
import Patients from "./pages/Patients";
import Appointments from "./pages/Appointments";
import Layout from "./components/Layout";
import useGetCurrentAdmin from "./CustomHooks/getCurrentAdmin";
import useGetDoctors from "./CustomHooks/getDoctors";
import useGetPatients from "./CustomHooks/getPatients";
import useGetAppointments from "./CustomHooks/getAppointments";
import useGetStats from "./CustomHooks/getStats";

export const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

function App() {
  useGetCurrentAdmin();
  useGetDoctors();
  useGetPatients();
  useGetAppointments();
  useGetStats();

  const { adminData, authChecked } = useSelector((state) => state.admin);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ClipLoader size={50} color="#000" />
      </div>
    );
  }

  return (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={!adminData ? <Login /> : <Navigate to={"/"} />} />
        <Route element={adminData ? <Layout /> : <Navigate to={"/login"} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/doctors" element={<Doctors />} />
          <Route path="/patients" element={<Patients />} />
          <Route path="/appointments" element={<Appointments />} />
        </Route>
        <Route path="*" element={<Navigate to={"/"} />} />
      </Routes>
    </>
  );
}

export default App;
