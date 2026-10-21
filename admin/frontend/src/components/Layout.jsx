import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import { toast } from "react-toastify";
import {
  FiBarChart2,
  FiBell,
  FiCalendar,
  FiCreditCard,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiSearch,
  FiShield,
  FiUser,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { FaUserMd } from "react-icons/fa";
import { serverUrl } from "../App";
import Avatar from "./Avatar";
import { setAdminData } from "../redux/adminSlice";
import Logo from "./Logo";

const formatNow = (date) =>
  `${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${date.toLocaleTimeString(
    "en-US",
    { hour: "2-digit", minute: "2-digit" }
  )}`;

function Layout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { adminData, adminListData } = useSelector((state) => state.admin);
  const { statsData } = useSelector((state) => state.dashboard);
  const { doctorData } = useSelector((state) => state.doctor);
  const { patientData } = useSelector((state) => state.patient);
  const [now, setNow] = useState(new Date());
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchRef = useRef(null);

  const pending = statsData?.pending || 0;

  const links = [
    { to: "/", label: "Dashboard", icon: <FiGrid />, end: true },
    { to: "/doctors", label: "Doctor Management", icon: <FaUserMd />, count: doctorData.length },
    { to: "/patients", label: "Patient Management", icon: <FiUsers />, count: patientData.length },
    { to: "/appointments", label: "Appointment Management", icon: <FiCalendar />, count: pending },
    { to: "/payments", label: "Payments Management", icon: <FiCreditCard /> },
    { to: "/admins", label: "Admin Management", icon: <FiShield />, count: adminListData.length },
    { to: "/reports", label: "Reports", icon: <FiBarChart2 /> },
    { to: "/profile", label: "Profile Management", icon: <FiUser /> },
  ];

  const matches = search.trim()
    ? links.filter((link) => link.label.toLowerCase().includes(search.trim().toLowerCase()))
    : [];

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const goTo = (to) => {
    navigate(to);
    setSearch("");
    searchRef.current?.blur();
  };

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
    <div className="min-h-screen flex bg-gray-50 font-display text-gray-900">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-gray-900/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-gray-200 flex flex-col transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-[88px] px-6 flex items-center gap-3 shrink-0">
          <Logo size={44} />
          <div className="leading-tight">
            <p className="text-lg font-extrabold tracking-wide text-gray-900">CARENEST</p>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-gray-500">ADMIN PANEL</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto p-2 rounded-lg text-gray-500 hover:bg-gray-100 lg:hidden"
            aria-label="Close menu"
          >
            <FiX />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 before:absolute before:-left-4 before:top-1 before:bottom-1 before:w-1 before:rounded-r-full before:bg-emerald-600"
                    : "text-gray-700 hover:bg-gray-50"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`text-lg shrink-0 ${isActive ? "text-emerald-600" : "text-gray-400"}`}>
                    {link.icon}
                  </span>
                  <span className="truncate">{link.label}</span>
                  {link.count > 0 && (
                    <span
                      className={`ml-auto min-w-6 h-6 px-1.5 rounded-md text-xs font-semibold flex items-center justify-center ${
                        isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {link.count}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-5 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium text-red-600 hover:bg-red-50"
          >
            <FiLogOut className="text-lg" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-[88px] bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-10 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden"
            aria-label="Open menu"
          >
            <FiMenu className="text-xl" />
          </button>

          <div className="hidden md:flex items-center gap-3 text-sm text-gray-600 shrink-0">
            <span className="flex items-center gap-2 font-medium text-gray-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Live
            </span>
            <span className="w-px h-4 bg-gray-300" />
            <span>{formatNow(now)}</span>
          </div>

          <div className="relative flex-1 max-w-md mx-auto">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) goTo(matches[0].to);
                if (e.key === "Escape") {
                  setSearch("");
                  e.currentTarget.blur();
                }
              }}
              placeholder="Search sections..."
              className="w-full h-11 pl-11 pr-16 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md border border-gray-200 bg-white text-[11px] text-gray-500 font-mono">
              Ctrl K
            </kbd>
            {search.trim() && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {matches.length ? (
                  matches.map((link) => (
                    <button
                      key={link.to}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => goTo(link.to)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      <span className="text-gray-400">{link.icon}</span>
                      {link.label}
                    </button>
                  ))
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-500">No sections found</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <button
              onClick={() => navigate("/appointments")}
              className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="Pending appointments"
            >
              <FiBell className="text-xl" />
              {pending > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center ring-2 ring-white">
                  {pending}
                </span>
              )}
            </button>
            <span className="hidden sm:block w-px h-8 bg-gray-200" />
            <div className="hidden sm:block text-right leading-tight">
              <p className="text-[15px] font-semibold text-gray-900">{adminData?.name || "Admin"}</p>
              <p className="text-xs text-gray-500">{adminData?.email}</p>
            </div>
            <Avatar name={adminData?.name} photo={adminData?.photo} />
            <span className="hidden sm:inline-block px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-bold tracking-wide">
              {adminData?.role === "admin" ? "ADMIN" : "SUB-ADMIN"}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
