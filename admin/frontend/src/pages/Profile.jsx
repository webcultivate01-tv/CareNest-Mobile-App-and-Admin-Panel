import { useRef, useState } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { serverUrl } from "../App";
import { setAdminData, setAdminListData } from "../redux/adminSlice";
import Avatar from "../components/Avatar";
import { roleLabel } from "../modules";

function Profile() {
  const dispatch = useDispatch();
  const { adminData, adminListData } = useSelector((state) => state.admin);
  const isAdmin = adminData?.role === "admin";
  const [form, setForm] = useState({ name: adminData?.name || "", email: adminData?.email || "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [loading1, setLoading1] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const fileInput = useRef(null);

  // keep the logged-in admin and the admins list in sync with the server's copy
  const saveAdmin = (admin) => {
    dispatch(setAdminData({ ...adminData, ...admin }));
    dispatch(setAdminListData(adminListData.map((a) => (a.id === admin.id ? { ...a, ...admin } : a))));
  };

  // upload (file chosen) or remove (no file) the profile photo
  const handlePhoto = async (file) => {
    setPhotoLoading(true);
    try {
      let result;
      if (file) {
        const body = new FormData();
        body.append("photo", file);
        result = await axios.post(serverUrl + "/api/admin/photo", body, { withCredentials: true });
      } else {
        result = await axios.delete(serverUrl + "/api/admin/photo", { withCredentials: true });
      }
      saveAdmin(result.data.admin);
      toast.success(result.data.message, { position: "top-center", autoClose: 1000 });
    } catch (error) {
      console.log(error);
      toast.error(error.response?.data?.message || "Something went wrong", {
        position: "top-center",
        autoClose: 2000,
      });
    }
    setPhotoLoading(false);
    if (fileInput.current) fileInput.current.value = ""; // allow picking the same file again
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await axios.post(serverUrl + "/api/admin/updateprofile", form, { withCredentials: true });
      saveAdmin(result.data.admin);
      setLoading(false);
      toast.success("Profile Updated Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      console.log(error);
      setLoading(false);
      toast.error(error.response?.data?.message || "Something went wrong", {
        position: "top-center",
        autoClose: 2000,
      });
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New passwords do not match", { position: "top-center", autoClose: 2000 });
      return;
    }
    setLoading1(true);
    try {
      await axios.post(
        serverUrl + "/api/admin/changepassword",
        isAdmin
          ? { newPassword: passwordForm.newPassword }
          : { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword },
        { withCredentials: true }
      );
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setLoading1(false);
      toast.success("Password Changed Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      console.log(error);
      setLoading1(false);
      toast.error(error.response?.data?.message || "Something went wrong", {
        position: "top-center",
        autoClose: 2000,
      });
    }
  };

  const inputClass =
    "w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div>
      <h1 className="text-2xl font-bold">Profile Management</h1>
      <p className="text-gray-500 mb-6">Update your account details and password.</p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={adminData?.name} photo={adminData?.photo} className="w-16 h-16 text-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold">{adminData?.name}</p>
          <p className="text-gray-500 text-sm">{adminData?.email}</p>
          <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-bold tracking-wide">
            {roleLabel(adminData?.role).toUpperCase()}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files[0] && handlePhoto(e.target.files[0])}
          />
          <button
            type="button"
            disabled={photoLoading}
            onClick={() => fileInput.current?.click()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            {photoLoading ? <ClipLoader size={16} color="white" /> : adminData?.photo ? "Change Photo" : "Upload Photo"}
          </button>
          {adminData?.photo && (
            <button
              type="button"
              disabled={photoLoading}
              onClick={() => handlePhoto(null)}
              className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleUpdateProfile} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold">Account Details</h2>
          <div>
            <label className={labelClass}>Name</label>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <button
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            {loading ? <ClipLoader size={16} color="white" /> : "Save Changes"}
          </button>
        </form>

        <form onSubmit={handleChangePassword} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Change Password</h2>
            {isAdmin && (
              <p className="text-sm text-gray-500">As the admin, you can set a new password without the current one.</p>
            )}
          </div>
          {!isAdmin && (
            <div>
              <label className={labelClass}>Current Password</label>
              <input
                type="password"
                className={inputClass}
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>New Password</label>
            <input
              type="password"
              className={inputClass}
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Confirm New Password</label>
            <input
              type="password"
              className={inputClass}
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
            />
          </div>
          <button
            disabled={loading1}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            {loading1 ? <ClipLoader size={16} color="white" /> : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Profile;
