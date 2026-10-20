import { useEffect } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { serverUrl } from "../App";
import { setDoctorData, setDoctorStatus } from "../redux/doctorSlice";

// loads the doctors list (with each doctor's weekly schedule); `retry` can be called again from a page
export const fetchDoctors = async (dispatch) => {
  dispatch(setDoctorStatus("loading"));
  try {
    const result = await axios.get(serverUrl + "/api/doctor/getdoctors", {
      withCredentials: true,
    });
    dispatch(setDoctorData(result.data));
    dispatch(setDoctorStatus("ready"));
  } catch (error) {
    console.log(error);
    dispatch(setDoctorStatus("error"));
  }
};

const useGetDoctors = () => {
  const dispatch = useDispatch();
  const { adminData } = useSelector((state) => state.admin);
  useEffect(() => {
    if (!adminData) return;
    fetchDoctors(dispatch);
  }, [adminData]);
};

export default useGetDoctors;
