import { Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { useSelector } from "react-redux";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Doctors from "./pages/Doctors";
import DoctorForm from "./pages/DoctorForm";
import DoctorDetail from "./pages/DoctorDetail";
import DoctorAvailability from "./pages/DoctorAvailability";
import Patients from "./pages/Patients";
import Appointments from "./pages/Appointments";
import Payments from "./pages/Payments";
import PaymentDetail from "./pages/PaymentDetail";
import Refunds from "./pages/Refunds";
import IssueRefund from "./pages/IssueRefund";
import Admins from "./pages/Admins";
import AdminDetail from "./pages/AdminDetail";
import Profile from "./pages/Profile";
import Reports from "./pages/Reports";
import Layout from "./components/Layout";
import useGetCurrentAdmin from "./CustomHooks/getCurrentAdmin";
import useGetDoctors from "./CustomHooks/getDoctors";
import useGetPatients from "./CustomHooks/getPatients";
import useGetAppointments from "./CustomHooks/getAppointments";
import useGetStats from "./CustomHooks/getStats";
import useGetAdmins from "./CustomHooks/getAdmins";

export const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

function App() {
  useGetCurrentAdmin();
  useGetDoctors();
  useGetPatients();
  useGetAppointments();
  useGetStats();
  useGetAdmins();

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
          <Route path="/doctors/new" element={<DoctorForm />} />
          <Route path="/doctors/:doctorId" element={<DoctorDetail />} />
          <Route path="/doctors/:doctorId/edit" element={<DoctorForm />} />
          <Route path="/doctors/:doctorId/availability" element={<DoctorAvailability />} />
          <Route path="/patients" element={<Patients />} />
          <Route path="/appointments" element={<Appointments />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/payments/:paymentId" element={<PaymentDetail />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/refunds/new" element={<IssueRefund />} />
          <Route path="/admins" element={<Admins />} />
          <Route path="/admins/:adminId" element={<AdminDetail />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to={"/"} />} />
      </Routes>
    </>
  );
}

export default App;
