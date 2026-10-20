import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import { toast } from "react-toastify";
import { FaCalendarCheck, FaHome, FaSignOutAlt, FaUserInjured, FaUserMd } from "react-icons/fa";
import { serverUrl } from "../App";
import { setAdminData } from "../redux/adminSlice";

const links = [
  { to: "/", label: "Dashboard", icon: <FaHome />, end: true },
  { to: "/doctors", label: "Doctors", icon: <FaUserMd /> },
  { to: "/patients", label: "Patients", icon: <FaUserInjured /> },
  { to: "/appointments", label: "Appointments", icon: <FaCalendarCheck /> },
];

function Layout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { adminData } = useSelector((state) => state.admin);

  const handleLogout = async () => {
    try {
      await axios.get(serverUrl + "/api/auth/logout", { withCredentials: true });
      dispatch(setAdminData(null));
      navigate("/login");
      toast.success("Logout Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      console.log(error);
      toast.error(error.response?.data?.message || "Something went wrong", {
        position: "top-center",
        autoClose: 2000,
      });
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-5 text-xl font-bold text-emerald-600">CareNest Admin</div>
        <nav className="flex-1 px-3 space-y-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-100"
                }`
              }
            >
              {link.icon}
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 truncate mb-2">{adminData?.email}</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
          >
            <FaSignOutAlt /> Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
