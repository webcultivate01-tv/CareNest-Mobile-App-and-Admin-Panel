import { serverUrl } from "../App";

// photo is a relative path like "uploads/admins/Tejas Mehar/profile-1-123.jpg" (names can have spaces)
export const photoUrl = (photo) =>
  photo ? `${serverUrl}/${photo.split("/").map(encodeURIComponent).join("/")}` : null;

// round profile picture; falls back to initials when there is no photo
function Avatar({ name, photo, className = "w-10 h-10 text-sm" }) {
  const initials = (name || "Admin")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (photo) {
    return <img src={photoUrl(photo)} alt={name} className={`${className} rounded-full object-cover`} />;
  }
  return (
    <div
      className={`${className} rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold flex items-center justify-center`}
    >
      {initials}
    </div>
  );
}

export default Avatar;
