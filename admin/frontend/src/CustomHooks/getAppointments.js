import { useEffect } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { serverUrl } from "../App";
import { setAppointmentData } from "../redux/appointmentSlice";

const useGetAppointments = () => {
  const dispatch = useDispatch();
  const { adminData } = useSelector((state) => state.admin);
  useEffect(() => {
    if (!adminData) return;
    const fetchAppointments = async () => {
      try {
        const result = await axios.get(serverUrl + "/api/appointment/getappointments", {
          withCredentials: true,
        });
        dispatch(setAppointmentData(result.data));
      } catch (error) {
        console.log(error);
      }
    };
    fetchAppointments();
  }, [adminData]);
};

export default useGetAppointments;
