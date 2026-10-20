import { useEffect } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { serverUrl } from "../App";
import { setStatsData } from "../redux/dashboardSlice";

// re-fetches whenever the lists change so dashboard counts stay fresh
const useGetStats = () => {
  const dispatch = useDispatch();
  const { adminData } = useSelector((state) => state.admin);
  const { doctorData } = useSelector((state) => state.doctor);
  const { patientData } = useSelector((state) => state.patient);
  const { appointmentData } = useSelector((state) => state.appointment);
  useEffect(() => {
    if (!adminData) return;
    const fetchStats = async () => {
      try {
        const result = await axios.get(serverUrl + "/api/dashboard/getstats", {
          withCredentials: true,
        });
        dispatch(setStatsData(result.data));
      } catch (error) {
        console.log(error);
      }
    };
    fetchStats();
  }, [adminData, doctorData, patientData, appointmentData]);
};

export default useGetStats;
