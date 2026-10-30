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
import PatientDetail from "./pages/PatientDetail";
import Appointments from "./pages/Appointments";
import AppointmentDetail from "./pages/AppointmentDetail";
import AppointmentSlots from "./pages/AppointmentSlots";
import LiveQueue from "./pages/LiveQueue";
import Payments from "./pages/Payments";
import PaymentDetail from "./pages/PaymentDetail";
import Refunds from "./pages/Refunds";
import IssueRefund from "./pages/IssueRefund";
import Admins from "./pages/Admins";
import AdminDetail from "./pages/AdminDetail";
import Profile from "./pages/Profile";
import Reports from "./pages/Reports";
import Marketing from "./pages/Marketing";
import MarketingCompose from "./pages/MarketingCompose";
import Campaigns from "./pages/Campaigns";
import CampaignDetail from "./pages/CampaignDetail";
import Layout from "./components/Layout";
import useGetCurrentAdmin from "./CustomHooks/getCurrentAdmin";
import useGetDoctors from "./CustomHooks/getDoctors";
import useGetPatients from "./CustomHooks/getPatients";
import useGetAppointments from "./CustomHooks/getAppointments";
import useGetStats from "./CustomHooks/getStats";
import useGetAdmins from "./CustomHooks/getAdmins";
import { firstAllowedPath, hasModule } from "./modules";

export const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

// sends a sub-admin home when the admin has not given them this module (the API refuses it too)
function Guard({ module, children }) {
  const { adminData } = useSelector((state) => state.admin);
  return hasModule(adminData, module) ? children : <Navigate to={firstAllowedPath(adminData)} replace />;
}

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
        <Route path="/employee" element={!adminData ? <Login employee /> : <Navigate to={"/"} />} />
        <Route element={adminData ? <Layout /> : <Navigate to={"/login"} />}>
          <Route path="/" element={<Guard module="dashboard"><Dashboard /></Guard>} />
          <Route path="/doctors" element={<Guard module="doctors"><Doctors /></Guard>} />
          <Route path="/doctors/new" element={<Guard module="doctors"><DoctorForm /></Guard>} />
          <Route path="/doctors/:doctorId" element={<Guard module="doctors"><DoctorDetail /></Guard>} />
          <Route path="/doctors/:doctorId/edit" element={<Guard module="doctors"><DoctorForm /></Guard>} />
          <Route path="/doctors/:doctorId/availability" element={<Guard module="doctors"><DoctorAvailability /></Guard>} />
          <Route path="/patients" element={<Guard module="patients"><Patients /></Guard>} />
          <Route path="/patients/:patientId" element={<Guard module="patients"><PatientDetail /></Guard>} />
          <Route path="/appointments" element={<Guard module="appointments"><Appointments /></Guard>} />
          <Route path="/appointments/slots" element={<Guard module="appointments"><AppointmentSlots /></Guard>} />
          <Route path="/appointments/:appointmentId" element={<Guard module="appointments"><AppointmentDetail /></Guard>} />
          <Route path="/queue" element={<Guard module="queue"><LiveQueue /></Guard>} />
          <Route path="/payments" element={<Guard module="payments"><Payments /></Guard>} />
          <Route path="/payments/:paymentId" element={<Guard module="payments"><PaymentDetail /></Guard>} />
          <Route path="/refunds" element={<Guard module="refunds"><Refunds /></Guard>} />
          <Route path="/refunds/new" element={<Guard module="refunds"><IssueRefund /></Guard>} />
          <Route path="/admins" element={adminData?.role === "staff" ? <Navigate to={firstAllowedPath(adminData)} replace /> : <Admins />} />
          <Route path="/admins/:adminId" element={adminData?.role === "staff" ? <Navigate to={firstAllowedPath(adminData)} replace /> : <AdminDetail />} />
          <Route path="/reports" element={<Guard module="reports"><Reports /></Guard>} />
          <Route path="/marketing" element={<Guard module="marketing"><Marketing /></Guard>} />
          <Route path="/marketing/new" element={<Guard module="marketing"><MarketingCompose /></Guard>} />
          <Route path="/marketing/campaigns" element={<Guard module="marketing"><Campaigns /></Guard>} />
          <Route path="/marketing/campaigns/:campaignId" element={<Guard module="marketing"><CampaignDetail /></Guard>} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to={"/"} />} />
      </Routes>
    </>
  );
}

export default App;
