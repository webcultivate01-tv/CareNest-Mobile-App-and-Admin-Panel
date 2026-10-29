import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { serverUrl } from "../App";
import { hasModule } from "../modules";

const REFRESH_MS = 5000;
const stateStyle = {
  in_consultation: { label: "In consultation", cls: "bg-emerald-50 text-emerald-700" },
  waiting: { label: "Waiting", cls: "bg-amber-50 text-amber-700" },
  booked: { label: "Not arrived", cls: "bg-gray-100 text-gray-600" },
  done: { label: "Done", cls: "bg-blue-50 text-blue-700" },
};
const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// Live queue: one card per doctor with patients today. Staff (or the doctor, signed in with the
// "Live Queue" module) check patients in, call the next one and mark each consultation complete.
// The board re-fetches every few seconds, so several screens stay in step.
function LiveQueue() {
  const [board, setBoard] = useState(null);
  const [busy, setBusy] = useState(null); // key of the button being processed
  const { adminData } = useSelector((state) => state.admin);
  const canViewPatient = hasModule(adminData, "patients");

  // patient name; opens the patient's detail page when this user has the Patients module
  const PatientName = ({ p, className = "" }) =>
    canViewPatient ? (
      <Link to={`/patients/${p.patientId}`} className={`hover:underline ${className}`}>
        {p.patientName}
      </Link>
    ) : (
      <span className={className}>{p.patientName}</span>
    );

  const load = useCallback(async () => {
    try {
      const result = await axios.get(serverUrl + "/api/queue/board", { withCredentials: true });
      setBoard(result.data);
    } catch (error) {
      console.log(error);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (key, path, body = {}) => {
    setBusy(key);
    try {
      const result = await axios.post(serverUrl + path, body, { withCredentials: true });
      toast.success(result.data.message, { position: "top-center", autoClose: 1000 });
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong", { position: "top-center", autoClose: 2000 });
      load();
    } finally {
      setBusy(null);
    }
  };

  if (!board) {
    return (
      <div className="flex justify-center mt-20">
        <ClipLoader size={40} color="#000" />
      </div>
    );
  }

  const Button = ({ id, onClick, className, children }) => (
    <button
      disabled={busy !== null}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs disabled:opacity-50 ${className}`}
    >
      {busy === id ? "..." : children}
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Live Queue</h1>
        <span className="text-sm text-gray-500 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Live · {board.date}
        </span>
      </div>

      {board.doctors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">
          No appointments today.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {board.doctors.map((doctor) => {
            const open = doctor.patients.filter((p) => p.queueState !== "done");
            return (
              <div key={doctor.doctorId} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{doctor.doctorName}</h2>
                    <p className="text-sm text-gray-500">{doctor.doctorSpecialty}</p>
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    {doctor.counts.waiting} waiting · {doctor.counts.booked} not arrived · {doctor.counts.done} done
                  </div>
                </div>

                <div className="mt-4 rounded-lg bg-emerald-50 p-3">
                  {doctor.nowServing ? (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-emerald-700">Now serving · Token {doctor.nowServing.token}</p>
                        <p className="font-medium">
                          <PatientName p={doctor.nowServing} />
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          id={`c${doctor.nowServing.id}`}
                          onClick={() => act(`c${doctor.nowServing.id}`, `/api/queue/complete/${doctor.nowServing.id}`)}
                          className="bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-100"
                        >
                          Complete
                        </Button>
                        <Button
                          id={`cn${doctor.nowServing.id}`}
                          onClick={() =>
                            act(`cn${doctor.nowServing.id}`, `/api/queue/complete/${doctor.nowServing.id}`, { callNext: true })
                          }
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          Complete & next
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-emerald-700">
                        {doctor.next ? `Next: ${doctor.next.patientName} (Token ${doctor.next.token})` : "Queue is empty"}
                      </p>
                      {doctor.next && (
                        <Button
                          id={`n${doctor.doctorId}`}
                          onClick={() => act(`n${doctor.doctorId}`, `/api/queue/callnext/${doctor.doctorId}`)}
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          Call next
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <ul className="mt-4 divide-y divide-gray-100">
                  {doctor.patients.map((p) => {
                    const style = stateStyle[p.queueState];
                    return (
                      <li key={p.id} className="flex items-center gap-3 py-2.5">
                        <span className="h-8 w-8 shrink-0 rounded-full bg-gray-100 text-sm font-semibold flex items-center justify-center">
                          {p.token}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${p.queueState === "done" ? "text-gray-400" : ""}`}>
                            <PatientName p={p} />
                          </p>
                          <p className="text-xs text-gray-500">
                            {timeOf(p.scheduledAt)} · {p.code}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${style.cls}`}>{style.label}</span>
                        {p.queueState === "in_consultation" && (
                          <Button
                            id={`c${p.id}`}
                            onClick={() => act(`c${p.id}`, `/api/queue/complete/${p.id}`)}
                            className="bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                          >
                            Mark completed
                          </Button>
                        )}
                        {p.queueState === "booked" && (
                          <Button
                            id={`i${p.id}`}
                            onClick={() => act(`i${p.id}`, `/api/queue/checkin/${p.id}`)}
                            className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                          >
                            Check in
                          </Button>
                        )}
                        {(p.queueState === "booked" || p.queueState === "waiting") && !doctor.nowServing && (
                          <Button
                            id={`s${p.id}`}
                            onClick={() => act(`s${p.id}`, `/api/queue/start/${p.id}`)}
                            className="bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                          >
                            Call in
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {open.length === 0 && <p className="mt-3 text-xs text-gray-400">All patients seen.</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LiveQueue;
