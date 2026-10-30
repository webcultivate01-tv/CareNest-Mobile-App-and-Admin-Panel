import { useState } from "react";
import axios from "axios";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { FaArrowRight, FaEnvelope, FaEye, FaEyeSlash, FaLock, FaShieldAlt } from "react-icons/fa";
import { serverUrl } from "../App";
import { setAdminData } from "../redux/adminSlice";
import Logo from "../components/Logo";

const inputClass =
  "h-11 w-full rounded-xl border border-gray-200/80 bg-gray-50/70 pl-11 text-[15px] text-gray-800 placeholder-gray-400 outline-none transition-all duration-200 hover:border-gray-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10";

const iconClass =
  "absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-gray-400 transition-colors duration-200 group-focus-within:text-emerald-500";

function Login({ employee = false }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await axios.post(
        serverUrl + "/api/auth/login",
        { email, password, portal: employee ? "employee" : undefined },
        { withCredentials: true }
      );
      dispatch(setAdminData(result.data));
      navigate("/");
      setLoading(false);
      toast.success("Login Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      console.log(error);
      setLoading(false);
      toast.error(error.response?.data?.message || "Something went wrong", {
        position: "top-center",
        autoClose: 2000,
      });
    }
  };

  const handleForgotPassword = () => {
    toast.info("Please contact the CareNest system administrator to reset your password.", {
      position: "top-center",
      autoClose: 3000,
    });
  };

  return (
    <div className="font-display relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4fbf8] p-4 antialiased">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#10b98126_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]" />
      <div className="animate-pulse-soft pointer-events-none absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-emerald-300/40 blur-3xl" />
      <div className="animate-pulse-soft pointer-events-none absolute -bottom-48 -right-32 h-[32rem] w-[32rem] rounded-full bg-teal-300/35 blur-3xl [animation-delay:2s]" />
      <div className="pointer-events-none absolute right-[18%] top-[22%] h-44 w-44 rounded-full bg-cyan-200/40 blur-3xl" />

      <div className="relative w-full max-w-[26rem]">
        {/* Gradient hairline border */}
        <div className="animate-fade-up rounded-[28px] bg-gradient-to-b from-white via-emerald-100/70 to-teal-200/60 p-px shadow-[0_30px_80px_-20px_rgba(13,148,136,0.35),0_8px_24px_-12px_rgba(16,185,129,0.25)]">
          <form
            onSubmit={handleLogin}
            className="rounded-[27px] bg-white/80 px-8 py-7 backdrop-blur-2xl sm:px-10"
          >
            {/* Brand */}
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <div className="absolute inset-0 -z-10 scale-125 rounded-3xl bg-emerald-400/40 blur-xl" />
                <Logo size={54} className="drop-shadow-[0_10px_20px_rgba(16,185,129,0.35)]" />
              </div>
              <h1 className="mt-4 text-[26px] font-extrabold leading-none tracking-tight text-gray-900">
                Care
                <span className="bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent">
                  Nest
                </span>
              </h1>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {employee ? "Hospital Staff Portal" : "Hospital Admin Portal"}
              </span>
            </div>

            <div className="animate-fade-up mt-4 text-center [animation-delay:120ms]">
              <h2 className="text-lg font-semibold text-gray-800">{employee ? "Employee sign in" : "Welcome back"}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {employee ? "Sign in to open your staff panel" : "Sign in to manage your hospital"}
              </p>
            </div>

            {/* Fields */}
            <div className="animate-fade-up mt-5 space-y-4 [animation-delay:200ms]">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[13px] font-semibold text-gray-700">
                  Email address
                </label>
                <div className="group relative">
                  <FaEnvelope className={iconClass} />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder={employee ? "staff@carenest.com" : "admin@carenest.com"}
                    className={`${inputClass} pr-4`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-[13px] font-semibold text-gray-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[13px] font-semibold text-emerald-600 transition-colors hover:text-teal-700"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="group relative">
                  <FaLock className={iconClass} />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={`${inputClass} pr-12`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-all hover:bg-emerald-50 hover:text-emerald-600 active:scale-90"
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="animate-fade-up group relative mt-6 flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 font-semibold tracking-wide text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.7)] transition-all duration-300 [animation-delay:280ms] hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-10px_rgba(16,185,129,0.75)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-75 disabled:hover:translate-y-0"
            >
              <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-shimmer" />
              {loading ? (
                <ClipLoader size={22} color="white" />
              ) : (
                <>
                  Sign In
                  <FaArrowRight className="text-sm transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </button>

            {/* Trust note */}
            <div className="animate-fade-up mt-5 [animation-delay:360ms]">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
                <FaShieldAlt className="text-emerald-500/80" />
                <span>Secure access for authorized staff only</span>
              </div>
            </div>
          </form>
        </div>

        <p className="animate-fade-up mt-4 text-center text-xs text-gray-400 [animation-delay:440ms]">
          © {new Date().getFullYear()} CareNest Hospital · All rights reserved
        </p>
      </div>
    </div>
  );
}

export default Login;
